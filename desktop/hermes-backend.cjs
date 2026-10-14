const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),{EventEmitter}=require('node:events');
const {HermesRpc}=require('./hermes-rpc.cjs'),connection=require('./connection.cjs'),{redact}=require('./economy.cjs');
class HermesBackend extends EventEmitter{
 constructor({dataDir,resourcesPath,getConfig,getSettings=()=>({}),onRequest,source,python,spawnProcess=spawn}){
  super();this.dir=dataDir;fs.mkdirSync(dataDir,{recursive:true});this.home=path.join(dataDir,'profile');this.runtime=path.join(dataDir,'dependencies');
  this.launcher=resourcesPath&&fs.existsSync(path.join(resourcesPath,'hermes-launch.py'))?path.join(resourcesPath,'hermes-launch.py'):path.join(__dirname,'hermes-launch.py');
  this.getConfig=getConfig;this.getSettings=getSettings;this.onRequest=onRequest;this.source=source||[path.join(resourcesPath||'','hermes-engine'),path.join(__dirname,'../vendor/hermes-engine')].find(p=>fs.existsSync(path.join(p,'apollo-engine-manifest.json')));
  const candidates=[path.join(resourcesPath||'','hermes-python/python.exe'),path.join(dataDir,'environment/Scripts/python.exe'),path.join(process.env.LOCALAPPDATA||dataDir,'ApolloCode/hermes-engine/21ede8a/venv/Scripts/python.exe')];
  this.python=python||candidates.find(p=>fs.existsSync(p))||candidates[1];this.spawnProcess=spawnProcess;this.epoch=0;
  this.state={status:'stopped',source:this.source||'',python:this.python,home:this.home};
  if(this.source){this.contract=JSON.parse(fs.readFileSync(path.join(this.source,'apps/shared/src/gateway-contract.openrpc.json'),'utf8'));this.manifest=JSON.parse(fs.readFileSync(path.join(this.source,'apollo-engine-manifest.json'),'utf8'));this.methods=new Set(this.contract.methods.map(m=>m.name));}
 }
 status(){return {...this.state,commit:this.manifest?.commit,methodCount:this.methods?.size||0};}
 update(next){this.state={...this.state,...next};this.emit('state',this.status());}
 prepare(config){
  fs.mkdirSync(this.home,{recursive:true});
  const file=path.join(this.home,'config.yaml');
  {
   const mode=connection.protocol(config),model={default:config.model,provider:config.provider==='anthropic'?'anthropic':'custom',base_url:config.baseUrl,api_mode:mode==='anthropic'?'anthropic_messages':mode==='responses'?'codex_responses':'chat_completions'};
   const value={model,streaming:{enabled:this.getSettings().responseMode!=='json'},terminal:{backend:'local',cwd:config.projectRoot||this.home},agent:{reasoning_effort:config.reasoningEffort==='auto'?'medium':config.reasoningEffort||'medium'},approvals:{mode:'manual'},shared_metrics:{enabled:false},display:{streaming:true},memory:{enabled:true}};
   const existing=fs.existsSync(file)?require('yaml').parse(fs.readFileSync(file,'utf8'))||{}:{};
   // Preserve native settings, but model transport follows the selected Apollo connection.
   const merged={...value,...existing,model,streaming:value.streaming,agent:{...value.agent,...existing.agent,reasoning_effort:value.agent.reasoning_effort,task_completion_guidance:false,parallel_tool_call_guidance:false,tool_use_enforcement:false,execution_guidance:false,coding_context:'off',stall_guards:false,intent_ack_continuation:false},onboarding:{...existing.onboarding,profile_build:'off'}};
   fs.writeFileSync(file+'.tmp',JSON.stringify(merged,null,2));fs.renameSync(file+'.tmp',file);
  }
 }
 identity(){const c=this.getConfig();return crypto.createHash('sha256').update(JSON.stringify([c.provider,c.baseUrl,c.apiKey,c.model,c.reasoningEffort,c.apiMode,this.getSettings().responseMode])).digest('hex');}
 async prepareEnvironment(){
  if(this.preparing)return this.preparing;
  if(fs.existsSync(this.python))return this.status();
  if(!this.source)throw new Error('Hermes 后端文件缺失，请重新安装 Apollo。');
  this.preparing=(async()=>{
   this.update({status:'preparing',error:'',progress:'正在准备独立运行环境…'});
   const {provision}=require('./hermes-environment.cjs');
   this.python=await provision({source:this.source,dataDir:this.dir,onProgress:progress=>this.update({progress})});
   fs.writeFileSync(path.join(this.dir,'python.json'),JSON.stringify({path:this.python}));
   this.update({status:'stopped',python:this.python,progress:''});return this.status();
  })().catch(error=>{this.update({status:'failed',error:error.message,progress:''});throw error;}).finally(()=>{this.preparing=null;});
  return this.preparing;
 }
 start(){if(this.starting)return this.starting;const identity=this.identity();if(this.rpc?.socket?.readyState===1&&identity===this.connectionIdentity)return Promise.resolve(this.status());this.starting=(async()=>{if(this.child)await this.stop();return this.launch(identity);})().finally(()=>{this.starting=null;});return this.starting;}
 async launch(identity){
  if(!this.source)throw new Error('Hermes 后端文件缺失，请重新安装 Apollo。');
  if(!fs.existsSync(this.python))await this.prepareEnvironment();
  const epoch=++this.epoch;this.connectionIdentity=identity;
  const config=this.getConfig();if(config.provider==='claude')throw new Error('Hermes 后端需要 API 或本地模型连接，请先选择该连接。');
  this.prepare(config);this.update({status:'starting',error:''});
  const token=crypto.randomBytes(32).toString('hex'),ready=path.join(this.dir,'ready-'+crypto.randomUUID()+'.json');this.token=token;
  const env={...process.env,HERMES_HOME:this.home,HERMES_RUNTIME_DIR:this.runtime,HERMES_DASHBOARD_SESSION_TOKEN:token,HERMES_DESKTOP:'1',HERMES_DESKTOP_READY_FILE:ready,HERMES_PARENT_PID:String(process.pid),HERMES_YOLO_MODE:'0',PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',PYTHONPATH:this.source};
  delete env.VIRTUAL_ENV;delete env.ELECTRON_RUN_AS_NODE;delete env.HERMES_PROFILE;delete env.HERMES_PARENT_START_MARKER;delete env.HERMES_PARENT_NONCE;
  // Model credentials travel only in the owned child environment, never argv or a plaintext copy.
  if(config.provider==='anthropic'){env.ANTHROPIC_API_KEY=config.apiKey;env.ANTHROPIC_BASE_URL=config.baseUrl;}else{env.OPENAI_API_KEY=config.apiKey||'ollama';env.OPENAI_BASE_URL=config.baseUrl;}
  const child=this.spawnProcess(this.python,['-B','-X','utf8',this.launcher,'serve','--host','127.0.0.1','--port','0','--isolated'],{cwd:this.source,env,windowsHide:true,stdio:['ignore','pipe','pipe']});this.child=child;
  let exitError,tail='';child.on('error',error=>{exitError=error;});
  const log=data=>{tail=(tail+redact(data.toString(),[config.apiKey,token])).slice(-12000);};child.stdout?.on('data',log);child.stderr?.on('data',log);
  child.once('exit',code=>{exitError=new Error('Hermes 后端已退出（'+code+'）。\n'+tail.slice(-2500));if(this.child===child){this.rpc?.close();this.update({status:'stopped',error:exitError.message});this.emit('disconnect');}});
  const deadline=Date.now()+120000;
  try{
   while(!fs.existsSync(ready)){if(epoch!==this.epoch)throw new Error('Hermes 启动已取消。');if(exitError)throw exitError;if(Date.now()>deadline)throw new Error('Hermes 启动超时。\n'+tail.slice(-2500));await new Promise(resolve=>setTimeout(resolve,100));}
   if(epoch!==this.epoch)throw new Error('Hermes 启动已取消。');
   const port=JSON.parse(fs.readFileSync(ready,'utf8')).port;if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Hermes 返回无效监听地址。');
   const rpc=new HermesRpc({onRequest:this.onRequest});this.rpc=rpc;
   rpc.on('event',event=>this.emit('event',event));rpc.on('disconnect',()=>{if(this.child===child)this.update({status:'disconnected',error:'Hermes 连接中断，请重新连接并核查当前任务状态。'});this.emit('disconnect');});
   await rpc.connect('ws://127.0.0.1:'+port+'/api/ws?token='+encodeURIComponent(token));
   await rpc.request('client.capabilities',{server_requests:true},15000);
   this.update({status:'ready',port,error:''});return this.status();
  }catch(error){if(epoch===this.epoch){await this.stop();this.update({status:'failed',error:redact(error.message,[config.apiKey,token])});}throw new Error(redact(error.message,[config.apiKey,token]));}
  finally{if(fs.existsSync(ready))fs.unlinkSync(ready);}
 }
 async request(method,params={},timeoutMs){if(!this.methods?.has(method))throw new Error('当前 Hermes 版本不支持这个操作。');if(JSON.stringify(params).length>2_000_000)throw new Error('操作参数过大。');await this.start();return this.rpc.request(method,params,timeoutMs);}
 async stop(){
  ++this.epoch;
  this.rpc?.close();this.rpc=null;const child=this.child;this.child=null;
  if(child&&child.exitCode===null){
   if(process.platform==='win32')await new Promise(resolve=>{const kill=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});kill.once('exit',resolve);kill.once('error',resolve);});
   else{child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,3000))]);if(child.exitCode===null)child.kill('SIGKILL');}
  }
  this.token=null;this.update({status:'stopped',port:undefined});
 }
}
module.exports={HermesBackend};
