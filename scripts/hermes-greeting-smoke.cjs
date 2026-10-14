const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {HermesBackend}=require('../desktop/hermes-backend.cjs'),{HermesBridge}=require('../desktop/hermes-bridge.cjs'),{Runtime}=require('../desktop/runtime.cjs'),{Vault}=require('../desktop/vault.cjs');
const dir=fs.mkdtempSync(path.join(__dirname,'../work/hermes-greeting-'));
const config={...new Vault({}).read(path.join(process.env.APPDATA,'apollo-code/config.json'),{}),projectRoot:dir};
const report={ok:false,checks:[]};
const runtime=new Runtime({dataDir:path.join(dir,'runtime'),skillDir:path.join(dir,'skills'),getConfig:()=>config,approve:async()=>false,emit:()=>{}});
const backend=new HermesBackend({dataDir:path.join(dir,'hermes'),python:path.join(__dirname,'../work/hermes-python-0.8.0/python.exe'),getConfig:()=>config,getSettings:()=>({...runtime.settings(),responseMode:'json'})});
const bridge=new HermesBridge({dataDir:path.join(dir,'hermes'),getConfig:()=>config,runtime,backend,emit:()=>{}});
(async()=>{try{
 const started=Date.now();const result=await bridge.chat({chatId:'fresh-greeting',requestId:'greeting-test',messages:[{role:'user',content:'你好'}]},config,{mode:'agent',taskTimeoutMs:240000});
 assert.equal(result.ok,true,result.error);assert.doesNotMatch(result.content,/Hermes|Nous Research|\/help|档案|建档|profile|初始化|设置向导/i);
 report.reply=result.content;report.durationMs=Date.now()-started;report.checks.push('real first-ever greeting contains no Hermes self-introduction or profile offer');
 assert.equal(fs.readFileSync(path.join(backend.home,'SOUL.md'),'utf8'),'');report.checks.push('fresh native profile imposes no identity');report.ok=true;console.log(JSON.stringify(report));
}catch(error){report.error=error.message;console.error(error.message);process.exitCode=1;}finally{await bridge.close();await runtime.close();fs.writeFileSync(path.join(__dirname,'../work/hermes-greeting-report.json'),JSON.stringify(report,null,2));}})();
