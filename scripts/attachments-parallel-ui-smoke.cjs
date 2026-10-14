const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerRuntime}=require('../desktop/runtime-ipc.cjs'),{registerHermes}=require('../desktop/hermes-ipc.cjs'),{storeUpload}=require('../desktop/attachments.cjs');
const root=fs.mkdtempSync(path.join(__dirname,'../work/attachments-ui-'));app.setPath('userData',root);
let win,runtime,bridge;const calls=[],payloads=[],report={ok:false,checks:[]};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{try{
 const config={provider:'openai',baseUrl:'https://example.invalid/v1',model:'fixture',apiKey:'fixture-key',apiMode:'responses',reasoningEffort:'medium',projectRoot:root};
 runtime=registerRuntime({app,ipcMain,dialog:{showMessageBox:async()=>({response:0})},getWindow:()=>win,readConfig:()=>config,saveConfig:()=>{},skillDir:path.join(root,'skills')});runtime.saveSettings({engine:'hermes',mode:'agent'});
 bridge=registerHermes({app,ipcMain,getWindow:()=>win,readConfig:()=>config,runtime});
 let next=0;bridge.backend.start=async()=>({status:'ready'});bridge.backend.stop=async()=>{};
 bridge.backend.request=async(method,params)=>{
  calls.push({method,params});if(method==='session.create')return {session_id:'fixture-'+(++next),stored_session_id:'stored-'+next};
  if(method==='pdf.attach'){const error=new Error('pdftoppm not installed');error.rpcCode=5028;throw error;}
  if(method==='file.attach')return {ref_text:'@file:'+JSON.stringify(params.path)};
  if(method==='prompt.submit')return {status:'streaming'};return {ok:true};
 };bridge.backend.rpc={request:(...args)=>bridge.backend.request(...args)};
 ipcMain.handle('config:get',()=>config);ipcMain.handle('project:get',()=>({root,selected:true}));
 ipcMain.handle('attachment:store',(_,file)=>storeUpload(path.join(root,'uploads'),file));
 ipcMain.handle('chat:send',(_,payload)=>{payloads.push(payload);return bridge.chat(payload,config,runtime.settings());});
 win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{preload:path.join(__dirname,'../desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 const js=code=>win.webContents.executeJavaScript(code);win.webContents.debugger.attach('1.3');
 const until=async check=>{const deadline=Date.now()+10000;while(!await check()){if(Date.now()>deadline)throw new Error('UI check timed out');await wait(40);}};
 const input=async text=>{await js(`(()=>{const e=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait(60);};
 await win.loadFile(path.join(__dirname,'../dist/index.html'));await wait(350);
 await input('第一对话');await js("document.querySelector('.send').click()");await until(()=>Promise.resolve(bridge.active?.sessionId));
 const first=bridge.active,firstId=first.chatId;
 await js("document.querySelector('.sidebar .new-chat-button').click()");await wait(100);assert.equal(await js("!!document.querySelector('.stop-run')"),false);assert.ok(bridge.actives.has(firstId));
 const files=[];for(const extension of ['go','rs','java','c','cpp','sh','sql','docx','xlsx','pptx','zip','pdf','unusual']){const file=path.join(root,'文件 '+extension+'.'+extension);fs.writeFileSync(file,'fixture '+extension);files.push(file);}
 await js("document.querySelector('input[type=file]').addEventListener('change',event=>window.fixtureFiles=Array.from(event.target.files),{capture:true,once:true})");
 const {root:doc}=await win.webContents.debugger.sendCommand('DOM.getDocument');const {nodeId}=await win.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:doc.nodeId,selector:'input[type=file]'});
 await win.webContents.debugger.sendCommand('DOM.setFileInputFiles',{nodeId,files});await until(async()=>await js("document.querySelectorAll('.attachment-chip').length")===13);
 await js("document.querySelectorAll('.attachment-chip').forEach(button=>button.click())");await wait(100);assert.equal(await js("document.querySelectorAll('.attachment-chip').length"),0);
 await js("(()=>{const data=new DataTransfer();for(const file of window.fixtureFiles)data.items.add(file);document.querySelector('.composer').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));})()");await until(async()=>await js("document.querySelectorAll('.attachment-chip').length")===13);
 report.checks.push('file picker and drag accept 13 mixed extensions together','attachments can be removed individually');
 await js("(()=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array([137,80,78,71])],'粘贴图片.png',{type:'image/png'}));document.querySelector('textarea').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));})()");await until(async()=>await js("document.querySelectorAll('.attachment-chip').length")===14);
 await input('第二对话');await js("document.querySelector('.send').click()");await until(()=>Promise.resolve(bridge.actives.size===2&&[...bridge.actives.values()].every(task=>task.sessionId)));
 const second=[...bridge.actives.values()].find(task=>task.chatId!==firstId);assert.equal(payloads[1].attachments.length,14);assert.ok(payloads[1].attachments.every(file=>fs.existsSync(file.path)));
 assert.equal(calls.filter(call=>call.method==='file.attach').length,13);assert.ok(calls.some(call=>call.method==='image.attach'));report.checks.push('clipboard image stages actual bytes through preload IPC','all attachments reach the bridge and PDF conversion failure falls back');
 bridge.event({type:'message.delta',session_id:first.sessionId,payload:{text:'仅属于第一对话'}});bridge.event({type:'message.delta',session_id:second.sessionId,payload:{text:'仅属于第二对话'}});await wait(150);
 assert.equal(await js("document.querySelector('.runtime-stream').textContent"),'仅属于第二对话');
 await js("[...document.querySelectorAll('.sidebar-recents button')].find(button=>button.title==='第一对话').click()");await wait(150);assert.equal(await js("document.querySelector('.runtime-stream').textContent"),'仅属于第一对话');
 await js("document.querySelector('.stop-run').click()");await until(()=>Promise.resolve(!bridge.actives.has(firstId)));assert.ok(bridge.actives.has(second.chatId));
 assert.equal(calls.find(call=>call.method==='session.interrupt').params.session_id,first.sessionId);
 await js("[...document.querySelectorAll('.sidebar-recents button')].find(button=>button.title==='第二对话').click()");await wait(150);assert.equal(await js("document.querySelector('.runtime-stream').textContent"),'仅属于第二对话');assert.equal(await js("!!document.querySelector('.stop-run')"),true);
 bridge.event({type:'message.complete',session_id:second.sessionId,payload:{status:'complete',text:'第二对话完成'}});await until(async()=>await js("!!document.querySelector('.stop-run')")===false);
 assert.match(await js("document.querySelector('.messages').textContent"),/第二对话完成/);assert.doesNotMatch(await js("document.querySelector('.messages').textContent"),/仅属于第一对话/);
 report.checks.push('switch and create chats while another task runs','streaming output stays in the right chat','stop affects only the selected chat','background completion preserves the selected chat state');
 for(const [width,height] of [[900,650],[1440,860]]){win.setSize(width,height);await wait(100);assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false);}
 await js("document.querySelector('.sidebar .new-chat-button').click()");await wait(200);assert.equal(await js("!!document.querySelector('.conversation-index')"),true);await js("(()=>{const data=new DataTransfer();for(const file of window.fixtureFiles)data.items.add(file);document.querySelector('.composer').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));})()");await until(async()=>await js("document.querySelectorAll('.attachment-chip').length")===13);
 win.showInactive();await wait(200);for(const theme of ['light','dark']){await js(`localStorage.setItem('apollo-code-theme','${theme}');document.documentElement.dataset.theme='${theme}'`);await wait(300);assert.equal(await js('document.documentElement.dataset.theme'),theme);fs.writeFileSync(path.join(__dirname,'../work/attachments-'+theme+'.png'),(await win.webContents.capturePage()).toPNG());}
 report.checks.push('attachment chips fit desktop minimum width and both themes');report.ok=true;console.log(JSON.stringify(report));
}catch(error){report.error=error.stack;console.error(error.stack);}finally{if(bridge)await bridge.close().catch(()=>{});if(runtime)await runtime.close().catch(()=>{});if(win&&!win.isDestroyed())win.destroy();fs.writeFileSync(path.join(__dirname,'../work/attachments-parallel-ui-report.json'),JSON.stringify(report,null,2));app.exit(report.ok?0:1);}});
