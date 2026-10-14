const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {HermesBackend}=require('../desktop/hermes-backend.cjs'),{HermesBridge}=require('../desktop/hermes-bridge.cjs'),{Runtime}=require('../desktop/runtime.cjs'),{Vault}=require('../desktop/vault.cjs');
const dir=fs.mkdtempSync(path.join(__dirname,'../work/parallel-live-'));
const config={...new Vault({}).read(path.join(process.env.APPDATA,'apollo-code/config.json'),{}),projectRoot:dir};
const events=[],report={ok:false,model:config.model,reasoningEffort:config.reasoningEffort,checks:[]};
const runtime=new Runtime({dataDir:path.join(dir,'runtime'),skillDir:path.join(dir,'skills'),getConfig:()=>config,approve:async()=>false,emit:event=>events.push(event)});
const backend=new HermesBackend({dataDir:path.join(dir,'hermes'),python:path.join(__dirname,'../work/hermes-python-0.8.0/python.exe'),getConfig:()=>config,getSettings:()=>({...runtime.settings(),responseMode:'auto'})});
const bridge=new HermesBridge({dataDir:path.join(dir,'hermes'),getConfig:()=>config,runtime,backend,emit:()=>{}});
(async()=>{try{
 const started=Date.now();
 const ask=(chatId,label)=>bridge.chat({chatId,requestId:chatId,messages:[{role:'user',content:'只回复这三个字：'+label}]},config,{mode:'agent',taskTimeoutMs:240000});
 const a=ask('parallel-a','并行甲'),b=ask('parallel-b','并行乙');assert.equal(bridge.actives.size,2);
 const result=await Promise.all([a,b]);for(const [index,label] of ['并行甲','并行乙'].entries()){assert.equal(result[index].ok,true,result[index].error);assert.match(result[index].content,new RegExp(label));}
 report.durationMs=Date.now()-started;report.replies=result.map(r=>r.content);
 report.timings=Object.fromEntries(['parallel-a','parallel-b'].map(id=>[id,events.filter(e=>e.requestId===id&&['first_text','phase','done'].includes(e.type)).map(({type,name,status,durationMs})=>({type,name,status,durationMs}))]));
 assert.equal(new Set([...bridge.sessions.values()].map(s=>s.liveId)).size,2);
 assert.equal(bridge.actives.size,0);report.checks.push('two real model chats overlap with independent native sessions','responses stay in their originating chat','automatic streaming enabled without changing selected model or reasoning effort');
 const warmStarted=Date.now();const warm=await bridge.chat({chatId:'warm',requestId:'warm',messages:[{role:'user',content:'请用中文解释文件和文件夹的区别，约100字。'}]},config,{mode:'agent',taskTimeoutMs:240000});assert.equal(warm.ok,true,warm.error);
 report.warm={durationMs:Date.now()-warmStarted,reply:warm.content,timings:events.filter(e=>e.requestId==='warm'&&['first_text','phase','done'].includes(e.type)).map(({type,name,status,durationMs})=>({type,name,status,durationMs})),chunks:events.filter(e=>e.requestId==='warm'&&e.type==='delta').length};
 report.ok=true;console.log(JSON.stringify(report));
}catch(error){report.error=error.message;process.exitCode=1;console.error(error.message);}finally{await bridge.close();await runtime.close();fs.writeFileSync(path.join(__dirname,'../work/parallel-live-report.json'),JSON.stringify(report,null,2));}})();
