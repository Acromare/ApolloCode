const fs=require('node:fs'),path=require('node:path');
const {HermesBackend}=require('../desktop/hermes-backend.cjs'),{Vault}=require('../desktop/vault.cjs');
const dir=fs.mkdtempSync(path.join(__dirname,'../work/hermes-bridge-smoke-'));
const config=new Vault({}).read(path.join(process.env.APPDATA,'apollo-code/config.json'),{});
const backend=new HermesBackend({dataDir:dir,getConfig:()=>config,onRequest:async(method)=>method==='approval'?{choice:'deny'}:{value:''}});
const report={scope:'Real pinned Hermes backend in an isolated profile; no external messaging, paid media generation or plugin installation.',checks:[]};
backend.on('event',event=>{report.eventTypes=[...new Set([...(report.eventTypes||[]),event.type])];});
(async()=>{
 try{
  report.backend=await backend.start();console.log('READY',JSON.stringify(report.backend));
  for(const [method,params] of [['ping',{}],['gateway.capabilities',{}],['profiles.list',{}],['skills.manage',{action:'list'}],['plugins.list',{}],['toolsets.list',{}],['cron.manage',{action:'list'}],['mcp.servers.list',{}]]){
   try{const result=await backend.request(method,params,30000);report.checks.push({method,ok:true,resultShape:Object.keys(result||{})});console.log('PASS',method);}catch(error){report.checks.push({method,ok:false,error:error.message});console.log('FAIL',method,error.message);}
  }
 }catch(error){report.error=error.message;console.error('FAILED',error.message);process.exitCode=1;}
 finally{await backend.stop();report.ok=!report.error&&report.checks.every(c=>c.ok);fs.writeFileSync(path.join(__dirname,'../work/hermes-backend-smoke-report.json'),JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;}
})();
