const crypto=require('node:crypto');
const {CronExpressionParser}=require('cron-parser');
const {redact}=require('./economy.cjs');
function profile(config){return crypto.createHash('sha256').update(JSON.stringify([config.provider,config.baseUrl,config.model,config.apiKey,config.projectRoot||'',config.apiMode,config.reasoningEffort])).digest('hex');}
function nextTime(job,now){
  if(job.kind==='once'){const time=Date.parse(job.at);if(!Number.isFinite(time))throw new Error('Invalid date');return time;}
  if(job.kind==='interval'){if(!Number.isInteger(job.minutes)||job.minutes<1||job.minutes>525600)throw new Error('Interval must be 1–525600 minutes');return now+job.minutes*60000;}
  if(job.kind!=='cron'||typeof job.cron!=='string'||job.cron.trim().split(/\s+/).length!==5)throw new Error('Cron requires five fields');
  return CronExpressionParser.parse(job.cron,{currentDate:new Date(now),tz:job.timezone||'Asia/Shanghai'}).next().getTime();
}
class Scheduler{
  constructor(runtime,{now=()=>Date.now(),notify=()=>{},autoStart=true}={}){
    this.runtime=runtime;this.now=now;this.notify=notify;this.busy=false;this.closed=false;this.jobs=runtime.read('schedule.json',[]);this.runs=runtime.read('schedule-runs.json',[]);
    for(const run of this.runs)if(run.status==='running'){run.status='interrupted';run.result='Application closed. This run will not be replayed.';run.ended=now();}
    this.persist();if(autoStart){this.timer=setInterval(()=>void this.tick(),1000);this.timer.unref?.();}
  }
  persist(){this.runtime.write('schedule.json',this.jobs);this.runtime.write('schedule-runs.json',this.runs);}
  state(){return {jobs:this.jobs.map(({profileId,...job})=>job),runs:this.runs};}
  save(input){
    if(this.jobs.length>=50&&!this.jobs.some(j=>j.id===input.id))throw new Error('At most 50 schedules');
    const old=input.id?this.jobs.find(j=>j.id===input.id):null;if(input.id&&!old)throw new Error('Schedule not found');if(old&&this.runningId===old.id)throw new Error('Stop this run before editing');
    if(typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>12000)throw new Error('Task must contain 1–12000 characters');
    const config=this.runtime.getConfig();if(!config.model||config.provider==='claude')throw new Error('Connect an API model first');
    const job={id:old?.id||crypto.randomUUID(),name:String(input.name||'Scheduled task').slice(0,100),prompt:redact(input.prompt,[config.apiKey]),kind:input.kind,at:input.at,minutes:Number(input.minutes),cron:input.cron,timezone:String(input.timezone||'Asia/Shanghai'),mode:input.mode==='agent'?'agent':'plan',projectRoot:config.projectRoot||'',model:config.model,profileId:profile(config),enabled:false,created:old?.created||this.now()};
    job.next=nextTime(job,this.now());if(job.next<=this.now())throw new Error('Choose a future time');
    this.jobs=[job,...this.jobs.filter(j=>j.id!==job.id)];this.persist();return job.id;
  }
  async enable(id,enabled){
    const job=this.jobs.find(j=>j.id===id);if(!job)throw new Error('Schedule not found');
    if(enabled){if(profile(this.runtime.getConfig())!==job.profileId)throw new Error('Reconnect the saved model/project before enabling');if(!await this.runtime.approve('schedule-enable',job.name+'\n'+job.prompt+'\n'+job.mode+' · '+job.model+' · '+job.projectRoot))return {ok:false};if(this.closed||!this.jobs.includes(job))return {ok:false};if(profile(this.runtime.getConfig())!==job.profileId)throw new Error('Configuration changed during approval');job.next=nextTime(job,this.now());if(job.next<=this.now())throw new Error('Edit the task to choose a future time');}
    job.enabled=enabled===true;this.persist();return {ok:true};
  }
  remove(id){if(this.runningId===id)throw new Error('Stop this run first');this.jobs=this.jobs.filter(j=>j.id!==id);this.persist();return {ok:true};}
  async tick(){
    if(this.closed||this.busy)return;
    const now=this.now();const due=this.jobs.find(j=>j.enabled&&j.next<=now);if(!due)return;
    if(now-due.next>120000){this.skip(due,'missed');return;}
    if(this.runtime.running||this.runtime.workflowBusy)return;
    if(profile(this.runtime.getConfig())!==due.profileId){due.enabled=false;this.skip(due,'profile-changed');return;}
    await this.execute(due,due.next);
  }
  skip(job,status){const time=job.next;this.advance(job);this.runs=[{id:crypto.randomUUID(),jobId:job.id,name:job.name,status,scheduled:time,ended:this.now(),result:'No model or tool actions were performed.'},...this.runs].slice(0,100);this.persist();this.notify({type:'schedule',status,jobId:job.id,name:job.name});}
  advance(job){if(job.kind==='once')job.enabled=false;else job.next=nextTime(job,this.now());}
  async runNow(id){const job=this.jobs.find(j=>j.id===id);if(!job)throw new Error('Schedule not found');if(this.busy||this.runtime.running||this.runtime.workflowBusy)throw new Error('Another task is running');if(profile(this.runtime.getConfig())!==job.profileId)throw new Error('Reconnect the saved model/project first');if(!await this.runtime.approve('schedule-run',job.name+'\n'+job.prompt))return {ok:false};if(!this.jobs.includes(job)||profile(this.runtime.getConfig())!==job.profileId)throw new Error('Configuration changed during approval');return this.execute(job,this.now(),true);}
  async execute(job,slot,manual=false){
    if(this.busy||this.closed||this.runtime.running||this.runtime.workflowBusy)throw new Error('Another task is running');
    const id=job.id+':'+(manual?'manual:'+crypto.randomUUID():slot);if(this.runs.some(r=>r.id===id))return {ok:false};
    this.busy=true;this.runningId=job.id;if(!manual)this.advance(job);
    const run={id,jobId:job.id,name:job.name,status:'running',scheduled:slot,started:this.now(),result:''};this.runs=[run,...this.runs].slice(0,100);this.persist();
    try{const result=await this.runtime.chat({requestId:'schedule:'+id,messages:[{role:'user',content:job.prompt}]},{...this.runtime.settings(),mode:job.mode,autoMemory:false,parallelAgents:false,browserEnabled:false,computerEnabled:false,historyRecall:false});run.status=result.ok?'done':result.error?.includes('中断')?'interrupted':'failed';run.result=redact(result.content||result.error||'',[this.runtime.getConfig().apiKey]).slice(0,20000);return result;}
    catch(error){run.status='failed';run.result=redact(error.message,[this.runtime.getConfig().apiKey]);return {ok:false,error:run.result};}
    finally{run.ended=this.now();this.persist();this.busy=false;this.runningId=null;this.notify({type:'schedule',status:run.status,jobId:job.id,name:job.name});}
  }
  close(){this.closed=true;clearInterval(this.timer);if(this.busy)this.runtime.cancel();}
}
module.exports={Scheduler,nextTime,profile};
