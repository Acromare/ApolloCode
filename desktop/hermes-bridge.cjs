const fs=require('node:fs'),path=require('node:path');
const {HermesBackend}=require('./hermes-backend.cjs'),{translate,turnResult}=require('./hermes-events.cjs'),{redact}=require('./economy.cjs');
const {sanitize}=require('./hermes-sanitize.cjs');
class HermesBridge{
 constructor({dataDir,resourcesPath,getConfig,emit,onRequest,clientRequest,backend,runtime}){
  this.dir=dataDir;fs.mkdirSync(dataDir,{recursive:true});this.getConfig=getConfig;this.emit=emit;this.runtime=runtime;this.onRequest=onRequest;this.requests=new Map();this.sessions=new Map();this.actives=new Map();
  this.file=path.join(dataDir,'sessions.json');try{this.stored=JSON.parse(fs.readFileSync(this.file,'utf8'));}catch{this.stored={};}
  this.clientRequest=clientRequest;this.buffers=new Map();
  this.backend=backend||new HermesBackend({dataDir,resourcesPath,getConfig,getSettings:()=>runtime.settings(),onRequest:(...args)=>this.ask(...args)});
  this.backend.on('event',e=>this.event(e));this.backend.on('state',state=>{if(state.status!=='ready')this.sessions.clear();this.emit('hermes:state',state);});this.backend.on('disconnect',()=>{this.sessions.clear();this.failActive('Hermes 连接中断。请核查已执行的操作后恢复会话。','hermes_disconnected');this.dismissRequests();});
 }
 get active(){return this.actives.values().next().value||null;}
 findActive(requestId){return [...this.actives.values()].find(task=>task.requestId===requestId);}
 activeSession(sessionId){return [...this.actives.values()].find(task=>task.sessionId===sessionId);}
 status(){return {...this.backend.status(),sessionCount:Object.keys(this.stored).length,liveSessions:[...this.sessions].map(([chatId,s])=>({chatId,sessionId:s.liveId,storedId:s.storedId,title:s.info?.title||chatId,model:s.info?.model,approvalMode:s.info?.approval_mode,yolo:s.info?.yolo}))};}
 catalog(){return this.backend.contract;}
 persist(){fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.stored,null,2));fs.renameSync(this.file+'.tmp',this.file);}
 async session(chatId,config,messages=[]){
  const identity=JSON.stringify([config.model,config.provider,config.reasoningEffort,config.projectRoot]);
  if(this.sessions.has(chatId)&&this.sessions.get(chatId).identity===identity)return this.sessions.get(chatId);
  const previous=this.sessions.get(chatId);if(previous){await this.backend.request('session.close',{session_id:previous.liveId});this.sessions.delete(chatId);}
  const stored=this.stored[chatId];
  const result=stored?await this.backend.request('session.resume',{session_id:stored.storedId,source:'desktop',eager_build:true}):await this.backend.request('session.create',{source:'desktop',cwd:config.projectRoot||this.backend.home,cwd_explicit:Boolean(config.projectRoot),messages:messages.slice(0,-1),model:config.model,provider:config.provider==='anthropic'?'anthropic':'custom',reasoning_effort:config.reasoningEffort==='auto'?'medium':config.reasoningEffort||'medium',idempotency_key:'apollo-'+chatId});
  const current={liveId:result.session_id,storedId:result.stored_session_id||stored?.storedId||result.session_id,identity,info:result.info||{}};
  if(stored){
   if(config.projectRoot)await this.backend.request('session.cwd.set',{session_id:current.liveId,cwd:config.projectRoot});
   if(stored.model!==config.model||stored.provider!==config.provider||stored.effort!==config.reasoningEffort){
    if(!/^[\w./:@+-]+$/.test(config.model))throw new Error('模型名称包含不支持的字符。');
    await this.backend.request('slash.exec',{session_id:current.liveId,command:'/model '+config.model+' --provider '+(config.provider==='anthropic'?'anthropic':'custom')+' --reasoning '+(config.reasoningEffort==='auto'?'medium':config.reasoningEffort||'medium')+' --session'});
   }
  }
  this.sessions.set(chatId,current);this.stored[chatId]={storedId:current.storedId,project:config.projectRoot||'',model:config.model,provider:config.provider,effort:config.reasoningEffort};this.persist();return current;
 }
 async chat(payload,config,settings){
  if(this.actives.has(payload.chatId))throw new Error('该对话正在执行任务，请追加指令或停止任务。');
  if(!payload.chatId)throw new Error('缺少对话标识。');
  const prompt=payload.messages?.filter(m=>m.role==='user').at(-1)?.content||'';
  if(!prompt.trim())throw new Error('请输入消息。');
  if(settings.mode==='chat'||settings.mode==='plan')return {ok:false,error:'Hermes 使用自身的工具与审批策略。请切换到 Agent 后运行，或选择 Apollo 原生后端使用 Chat / Plan。',failure:{code:'hermes_mode',message:'Hermes 需要 Agent 模式。',retryable:false}};
  let resolve,reject;const completion=new Promise((ok,no)=>{resolve=ok;reject=no;});completion.catch(()=>{});
  const controller=new AbortController();this.runtime.running ||= controller;
  const active={chatId:payload.chatId,title:prompt.slice(0,60),requestId:payload.requestId,partial:'',toolFailures:0,toolIds:new Map(),output:new Map(),resolve,reject,controller,started:Date.now(),sessionId:null};this.actives.set(payload.chatId,active);
  const timer=setTimeout(()=>{if(this.actives.get(active.chatId)!==active)return;this.failActive('Hermes 任务达到总时间预算。','task_timeout',active);void this.cancel(active.requestId).catch(()=>{});},settings.taskTimeoutMs||900000);
  this.runtime.activeRequestId=active.requestId;
  this.runtime.stats.hermesTasks=(this.runtime.stats.hermesTasks||0)+1;this.runtime.stats.tasks++;
  this.activity({type:'phase',name:'hermes_start',status:'running'},active);
  try{
   await this.backend.start();if(controller.signal.aborted)return await completion;const session=await this.session(payload.chatId,config,payload.messages);active.sessionId=session.liveId;active.baseline=session.info?.usage||{};
   if(controller.signal.aborted)return await completion;
   await this.backend.request('config.set',{session_id:session.liveId,key:'yolo',value:settings.mode==='yolo'?'on':'off',scope:'session'});
   if(controller.signal.aborted)return await completion;
   this.activity({type:'phase',name:'hermes_start',status:'done',durationMs:Date.now()-active.started},active);
   this.activity({type:'request_start',attempt:1,provider:'Hermes',model:config.model},active);
   const attachmentRefs=[];
   for(const attachment of (payload.attachments||[])){
    if(controller.signal.aborted)return await completion;
    const file=require('./attachments.cjs').localFile(attachment);
    const ext=path.extname(attachment.path).toLowerCase();
    const method=/^\.(png|jpg|jpeg|webp|gif|bmp)$/.test(ext)?'image.attach':ext==='.pdf'?'pdf.attach':'file.attach';
    let attached;
    try{attached=await this.backend.request(method,{session_id:session.liveId,path:file.path},120000);}
    catch(error){
     // Missing PDF converters or unsupported image codecs must not reject the file.
     if(method==='file.attach'||![4016,5027,5028].includes(error.rpcCode))throw error;
     attached=await this.backend.request('file.attach',{session_id:session.liveId,path:file.path},120000);
    }
    if(attached.ref_text)attachmentRefs.push(attached.ref_text);
   }
   if(prompt.startsWith('/')&&!attachmentRefs.length&&!(payload.attachments||[]).length){
    await this.slash(session.liveId,prompt,active);
   }else{
    const skill=payload.skillId?this.runtime.skills.load(payload.skillId):'';
    const result=await this.backend.request('prompt.submit',{session_id:session.liveId,text:[payload.instruction,skill,prompt,...attachmentRefs].filter(Boolean).join('\n\n'),surface:'desktop'},120000);
    if(result?.status==='busy')throw new Error('该 Hermes 会话仍在执行，请先核查状态。');
   }
   const result=await completion;
   if(result.ok)this.runtime.stats.successfulTasks++;else if(result.outcome==='interrupted')this.runtime.stats.cancelledTasks++;else this.runtime.stats.failedTasks++;
   return result;
  }catch(error){if(controller.signal.aborted&&active.settled)return await completion;active.settledStatus='failed';this.runtime.stats.failedTasks++;const message=redact(error.message,[config.apiKey]);const failure={code:'hermes_backend',layer:'transport',message,retryable:true,hint:'重新连接后在同一聊天中继续，已执行的操作保存在 Hermes 会话中。'};this.activity({type:'failure',failure},active);return {ok:false,error:message,partial:redact(active.partial,[config.apiKey]),failure,outcome:'failed'};}
  finally{clearTimeout(timer);if(active.stopping)await active.stopping.catch(()=>{});if(active.sessionId)this.dismissRequests(active.sessionId);if(this.actives.get(active.chatId)===active)this.actives.delete(active.chatId);if(this.runtime.running===controller)this.runtime.running=this.active?.controller||null;if(this.runtime.activeRequestId===active.requestId)this.runtime.activeRequestId=this.active?.requestId||null;this.runtime.stats.lastDurationMs=Date.now()-active.started;this.runtime.write('usage.json',this.runtime.stats);this.activity({type:'done',status:active.settledStatus||'done',durationMs:Date.now()-active.started},active);}
 }
 async slash(sessionId,command,active,depth=0){
  if(depth>5)throw new Error('快捷命令循环引用。');let result;
  try{result=await this.backend.request('slash.exec',{session_id:sessionId,command},120000);}
  catch(error){if(error.rpcCode!==4018)throw error;const [name,...args]=command.slice(1).split(' ');result=await this.backend.request('command.dispatch',{session_id:sessionId,name,arg:args.join(' ')});}
  if(result?.type==='alias')return this.slash(sessionId,result.target,active,depth+1);
  if(['send','skill'].includes(result?.type)){await this.backend.request('prompt.submit',{session_id:sessionId,text:result.message||'',surface:'desktop'});return;}
  if(['running','started','submitted','streaming'].includes(result?.status))return;
  active.settled=true;active.settledStatus='done';active.resolve({ok:true,content:[result?.output,result?.display,result?.notice,result?.warning].filter(Boolean).join('\n')||'命令已完成。',outcome:'done',...(result?.type==='prefill'?{prefill:result.message}:{})});
 }
 activity(event,active=this.active){if(active)this.runtime.emit({...event,requestId:active.requestId,time:Date.now()});}
 event(event){
  // Keep every native event available to capability panels. This feed is bounded in the UI.
  if(['reasoning.delta','thinking.delta'].includes(event.type))return;
  event=sanitize(event,[this.getConfig().apiKey,this.backend.token]);this.emit('hermes:event',event);
  if(event.type==='request.cancel'){const id=event.payload?.id||event.payload?.request_id;this.dismissRequest(id);}
  if(event.type==='approval.cancelled')for(const id of event.payload?.request_ids||[])this.dismissRequest(id);
  if(event.type==='session.info'){
   for(const [chatId,s] of this.sessions)if(s.liveId===event.session_id){s.info=event.payload||{};const storedId=s.info.stored_session_id;if(storedId&&storedId!==s.storedId){s.storedId=storedId;this.stored[chatId].storedId=storedId;this.persist();}}
   this.emit('hermes:state',this.status());
  }
  if(event.type==='agent.terminal.output'){const key=event.session_id||'';this.buffers.set(key,((this.buffers.get(key)||'')+(event.payload?.chunk||'')).slice(-100000));while(this.buffers.size>32)this.buffers.delete(this.buffers.keys().next().value);}
  const active=this.activeSession(event.session_id);if(!active||active.settled)return;
  const translated=translate(event);if(translated){
   if(translated.type==='delta'){active.partial+=translated.text;if(!active.firstText){active.firstText=true;this.activity({type:'first_text',durationMs:Date.now()-active.started},active);}}
   if(translated.type==='tool'){if(translated.status==='running')active.toolIds.set(translated.callId,translated.name);else{if(translated.status==='failed')active.toolFailures++;this.runtime.stats.tools++;}}
   if(translated.type==='tool_output'){
    const key=translated.callId+':'+translated.stream,text=((active.output.get(key)||'')+translated.text).slice(-64000);active.output.set(key,text);translated.text=text;translated.snapshot=true;
    if(!active.toolIds.has(translated.callId)){active.toolIds.set(translated.callId,translated.name);this.activity({type:'tool',callId:translated.callId,name:translated.name,status:'running'},active);}
   }
   if(event.type==='terminal.close')this.activity({type:'tool',callId:'process:'+event.payload.process_id,name:'terminal',status:'done'},active);
   this.activity(translated,active);
  }
  if(event.type==='message.complete'){
   const usage=event.payload?.usage;if(usage){for(const key of ['input','output'])this.runtime.stats[key]+=Math.max(0,(usage[key]||0)-(active.baseline[key]||0));this.runtime.stats.cost+=Math.max(0,(usage.cost_usd||0)-(active.baseline.cost_usd||0));this.runtime.stats.modelCalls+=Math.max(0,(usage.calls||0)-(active.baseline.calls||0));}
   const result=turnResult(event.payload||{},active.partial,active.toolFailures);active.settled=true;active.settledStatus=result.outcome;
   if(!result.ok)this.activity({type:'failure',failure:result.failure});active.resolve(result);
  }
 }
 failActive(message,code,task){
  for(const active of task?[task]:[...this.actives.values()])if(!active.settled){active.settled=true;const outcome=code==='cancelled'?'interrupted':'failed';active.settledStatus=outcome;const failure={code,layer:'transport',message,retryable:code!=='cancelled',hint:'在同一聊天中继续可保留已执行的操作。'};this.activity({type:'failure',failure},active);active.resolve({ok:false,error:message,partial:active.partial,failure,outcome});}
 }
 async cancel(requestId){
  const tasks=requestId?[this.findActive(requestId)].filter(Boolean):[...this.actives.values()];
  await Promise.all(tasks.map(async active=>{
   if(active.stopping)return active.stopping;
   active.controller.abort();
   active.stopping=(async()=>{if(active.sessionId){try{await this.backend.rpc.request('session.interrupt',{session_id:active.sessionId},15000);}catch(error){if(this.actives.size===1)await this.backend.stop();else throw new Error('未确认该对话已停止，请检查会话状态。');}}})();
   this.failActive(active.sessionId?'任务已中断。':'任务启动已取消。','cancelled',active);
   if(active.sessionId)this.dismissRequests(active.sessionId);
   await active.stopping;
  }));return {ok:true};
 }
 async control(action,requestId,text){const active=this.findActive(requestId);if(!active)throw new Error('任务已结束。');if(!active.sessionId)throw new Error('Hermes 正在启动，请稍候或停止任务。');if(action==='steer')return this.backend.request('session.steer',{session_id:active.sessionId,text});throw new Error('当前 Hermes 普通回合不支持暂停；可停止任务，或在能力中心控制 Goal / Loop。');}
 async ask(method,params,id){
  if(this.clientRequest){const response=await this.clientRequest(method,params);if(response!==undefined)return response;}
  if(this.onRequest)return this.onRequest(method,params,id);
  if(method==='approval')this.activity({type:'approval',name:params.tool_name||'Hermes',status:'waiting',preview:redact(params.command||params.description,[this.getConfig().apiKey,this.backend.token])},this.activeSession(params.session_id));
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.requests.delete(id);this.emit('hermes:request:cancel',{id});reject(new Error('等待用户响应超时。'));},300000);
   this.requests.set(id,{resolve,reject,timer,method,name:params.tool_name||'Hermes',sessionId:params.session_id,requestId:params.request_id});
   const task=this.activeSession(params.session_id),session=task&&this.sessions.get(task.chatId);
   this.emit('hermes:request',{id,method,params:sanitize({...params,chat_title:session?.info?.title||task?.title||''},[this.getConfig().apiKey,this.backend.token])});
  });
 }
 answer(id,result){const request=this.requests.get(id);if(!request)throw new Error('该请求已经结束。');clearTimeout(request.timer);this.requests.delete(id);if(request.method==='approval')this.activity({type:'approval',name:request.name,status:result.choice==='deny'?'rejected':'approved'},this.activeSession(request.sessionId));request.resolve(result);return {ok:true};}
 dismissRequest(id){if(!id)return;const key=this.requests.has(id)?id:[...this.requests].find(([,r])=>r.requestId===id)?.[0];const request=this.requests.get(key);if(!request)return;clearTimeout(request.timer);this.requests.delete(key);request.reject(new Error('后端已取消请求。'));this.emit('hermes:request:cancel',{id:key});}
 dismissRequests(sessionId){for(const [id,r] of [...this.requests])if(sessionId===undefined||r.sessionId===sessionId)this.dismissRequest(id);}
 async close(){if(this.active)await this.cancel().catch(()=>{});this.dismissRequests();this.sessions.clear();await this.backend.stop();}
}
module.exports={HermesBridge};
