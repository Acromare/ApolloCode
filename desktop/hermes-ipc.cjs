const path=require('node:path'),fs=require('node:fs');
const {HermesBridge}=require('./hermes-bridge.cjs');
function registerHermes({app,ipcMain,getWindow,readConfig,runtime}){
 const send=(channel,payload)=>{const win=getWindow();if(win&&!win.isDestroyed())win.webContents.send(channel,payload);};
 let desktop;
 const bridge=new HermesBridge({dataDir:path.join(app.getPath('userData'),'hermes'),resourcesPath:process.resourcesPath,getConfig:readConfig,runtime,emit:send,clientRequest:(...args)=>desktop.request(...args)});
 desktop=new (require('./hermes-desktop.cjs').HermesDesktop)({runtime,getWindow,getConfig:readConfig,getBridge:()=>bridge});
 bridge.backend.on('event',event=>{void desktop.handleEvent(event).catch(()=>{});});
 const checked=fn=>(event,...args)=>{const win=getWindow();if(!win||event.sender!==win.webContents)throw new Error('无效应用请求。');return fn(...args);};
 ipcMain.handle('hermes:state',checked(()=>bridge.status()));
 ipcMain.handle('hermes:catalog',checked(()=>bridge.catalog()));
 ipcMain.handle('hermes:open-url',checked(async value=>{const url=new URL(String(value));if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('授权页面地址无效。');await require('electron').shell.openExternal(url.href);return {ok:true};}));
 ipcMain.handle('hermes:prepare',checked(async()=>{if(runtime.running)throw new Error('请先结束当前任务。');return bridge.backend.prepareEnvironment();}));
 ipcMain.handle('hermes:session',checked(async()=>{if(runtime.running)throw new Error('请先结束当前任务。');await bridge.backend.start();const session=await bridge.session('apollo-management',readConfig());return {sessionId:session.liveId,state:bridge.status()};}));
 ipcMain.handle('hermes:start',checked(async()=>{if(runtime.running)throw new Error('请先结束当前任务。');return bridge.backend.start();}));
 ipcMain.handle('hermes:stop',checked(async()=>{if(bridge.active)throw new Error('请先停止当前任务。');await bridge.close();return bridge.status();}));
 ipcMain.handle('hermes:use',checked(async enabled=>{if(runtime.running)throw new Error('请先结束当前任务。');if(enabled)await bridge.backend.start();await runtime.saveSettings({engine:enabled?'hermes':'apollo',...(enabled?{mode:'agent'}:{})});return {ok:true};}));
 ipcMain.handle('hermes:python',checked(async()=>{if(runtime.running)throw new Error('请先结束当前任务。');const {dialog}=require('electron');const result=await dialog.showOpenDialog(getWindow(),{title:'选择 Hermes 环境的 Python',properties:['openFile'],filters:[{name:'Python',extensions:process.platform==='win32'?['exe']:['*']}]});if(result.canceled)return bridge.status();const file=path.resolve(result.filePaths[0]);if(!/^python(?:w|3(?:\.\d+)?)?(?:\.exe)?$/i.test(path.basename(file)))throw new Error('请选择 Python 可执行文件。');await bridge.close();bridge.backend.python=file;bridge.backend.update({python:file});fs.writeFileSync(path.join(bridge.dir,'python.json'),JSON.stringify({path:file}));return bridge.status();}));
 const savedPython=path.join(bridge.dir,'python.json');if(fs.existsSync(savedPython)){try{const file=JSON.parse(fs.readFileSync(savedPython,'utf8')).path;if(typeof file==='string'&&fs.existsSync(file)&&!app.isPackaged){bridge.backend.python=file;bridge.backend.update({python:file});}}catch{}}
 ipcMain.handle('hermes:rpc',checked(async(method,params)=>{
  params=params||{};
  if(bridge.activeSession(params.session_id)&&!['session.history','session.events.since','session.control.snapshot','subagent.list','process.list','config.get'].includes(method))throw new Error('请先结束当前任务再修改会话。');
  return bridge.backend.request(method,params||{});
 }));
 ipcMain.handle('hermes:answer',checked((id,result)=>bridge.answer(id,result)));
 const cancel=runtime.cancel.bind(runtime),control=runtime.control.bind(runtime),close=runtime.close.bind(runtime);
 runtime.cancel=requestId=>bridge.active?bridge.cancel(requestId):cancel(requestId);runtime.control=(...args)=>bridge.active?bridge.control(...args):control(...args);runtime.close=async()=>{await bridge.close();await close();};
 return bridge;
}
module.exports={registerHermes};
