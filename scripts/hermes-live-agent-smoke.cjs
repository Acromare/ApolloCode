const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {HermesBridge}=require('../desktop/hermes-bridge.cjs'),{Runtime}=require('../desktop/runtime.cjs'),{Vault}=require('../desktop/vault.cjs');
const dir=fs.mkdtempSync(path.join(__dirname,'../work/hermes-live-')),project=path.join(dir,'project');fs.mkdirSync(project);
const fact='HERMES_VERIFIED_'+require('node:crypto').randomBytes(6).toString('hex');fs.writeFileSync(path.join(project,'fact.txt'),fact);
const saved=new Vault({}).read(path.join(process.env.APPDATA,'apollo-code/config.json'),{}),config={...saved,projectRoot:project};
const events=[],report={scope:'Live pinned Hermes via Apollo bridge, isolated state and project; no external messaging or paid media.',tasks:[]};
const runtime=new Runtime({dataDir:path.join(dir,'apollo'),skillDir:path.join(dir,'skills'),getConfig:()=>config,approve:async()=>true,emit:e=>{events.push(e);if(['tool','failure','done'].includes(e.type))console.log('EVENT',e.type,e.name||'',e.status||'');}});
const bridge=new HermesBridge({dataDir:path.join(dir,'hermes'),getConfig:()=>config,runtime,emit:()=>{},onRequest:async(method)=>method==='approval'?{choice:'once'}:{value:''}});
(async()=>{
 try{
  for(const [index,prompt] of ['Reply with exactly HERMES_OK. Do not use tools.','Use read_file to read fact.txt in the current project, then reply with its exact contents. Do not use any other tools.'].entries()){
   const started=Date.now(),result=await bridge.chat({chatId:'hermes-acceptance',requestId:'hermes-'+index,messages:[{role:'user',content:prompt}]},config,{...runtime.settings(),mode:'agent',taskTimeoutMs:240000});
   const verified=result.ok&&(index===0?result.content.includes('HERMES_OK'):result.content.includes(fact)&&events.some(e=>e.type==='tool'&&e.name==='read_file'&&e.status==='done'));
   report.tasks.push({index:index+1,ok:result.ok,verified,durationMs:Date.now()-started,error:result.error,failure:result.failure});console.log('RESULT',JSON.stringify(report.tasks.at(-1)));
   fs.writeFileSync(path.join(__dirname,'../work/hermes-live-agent-report.json'),JSON.stringify(report,null,2));if(!verified)break;
  }
  report.ok=report.tasks.length===2&&report.tasks.every(t=>t.verified);assert.ok(report.ok);
 }catch(error){report.error=error.message;process.exitCode=1;}
 finally{await bridge.close();await runtime.close();report.events=events;fs.writeFileSync(path.join(__dirname,'../work/hermes-live-agent-report.json'),JSON.stringify(report,null,2));}
})();
