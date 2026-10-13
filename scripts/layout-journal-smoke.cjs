const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerRuntime}=require('../desktop/runtime-ipc.cjs');
const work=path.join(__dirname,'../work'),temp=fs.mkdtempSync(path.join(work,'layout-journal-'));app.setPath('userData',temp);
let win,runtime;const reports=[];
app.whenReady().then(async()=>{
 try{
  const config={provider:'openai',baseUrl:'https://example.invalid/v1',model:'fixture-model',apiKey:'test-key',projectRoot:temp};
  const approvals=[];
  runtime=registerRuntime({app,ipcMain,dialog:{showMessageBox:async(_,options)=>{approvals.push(options);return {response:0};}},getWindow:()=>win,readConfig:()=>config,saveConfig:()=>{},skillDir:path.join(temp,'skills')});
  ipcMain.handle('config:get',()=>config);ipcMain.handle('project:get',()=>({root:temp,selected:true}));ipcMain.handle('connection:models',()=>({ok:true,models:['fixture-model']}));
  win=new BrowserWindow({show:false,width:1440,height:860,webPreferences:{preload:path.join(__dirname,'../desktop/preload.cjs'),contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  const js=s=>win.webContents.executeJavaScript(s),wait=()=>new Promise(r=>setTimeout(r,250));
  await win.loadFile(path.join(__dirname,'../dist/index.html'));await wait();
  const chats=Array.from({length:9},(_,i)=>({id:'chat-'+i,title:'Real feedback chat '+i,updated:Date.now()-i,project:temp,messages:[{role:'user',content:'Remember database SQLite for the project.'},{role:'assistant',content:'Recorded choice.'}]}));
  await js('localStorage.setItem("apollo-code-chats-v2",'+JSON.stringify(JSON.stringify(chats))+');location.reload()');await wait();
  const nav=async name=>{await js(`document.querySelector('.sidebar nav button[data-page="${name}"]').click()`);await wait();};
  for(const theme of ['dark','light']){
   await js(`document.documentElement.dataset.theme='${theme}'`);
   for(const [width,height] of [[900,600],[1440,860],[1920,1080]]){
    win.setSize(width,height);await wait();
    await js("document.querySelector('.sidebar-recents button').click()");await wait();
    assert.equal(await js("document.querySelectorAll('.sidebar-recents button.active').length"),2,'Current chat selected in recent/project lists');
    await nav('Settings');
    assert.equal(await js("document.querySelectorAll('.sidebar-recents button.active').length"),0,'Settings clears chat selection styling');
    const geometry=await js(`(()=>{const a=document.querySelector('.sidebar-settings').getBoundingClientRect(),s=document.querySelector('.sidebar-scroll'),b=s.getBoundingClientRect(),h=document.querySelector('.management-page>header').getBoundingClientRect();return {top:a.top,bottom:a.bottom,scrollBottom:b.bottom,headingTop:h.top,viewport:innerHeight,overflow:s.scrollHeight>s.clientHeight}})()`);
    assert.ok(geometry.top>=geometry.viewport-130,JSON.stringify(geometry));assert.ok(geometry.bottom<=geometry.viewport,JSON.stringify(geometry));assert.ok(geometry.scrollBottom<=geometry.top+1,JSON.stringify(geometry));assert.ok(geometry.headingTop>=86,JSON.stringify(geometry));
    await js("document.querySelector('.sidebar-scroll').scrollTop=10000");await wait();
    assert.equal(await js("document.querySelector('.sidebar-settings').getBoundingClientRect().top"),geometry.top,'Settings stays fixed when history scrolls');
    fs.writeFileSync(path.join(work,`acceptance-settings-${theme}-${width}.png`),(await win.webContents.capturePage()).toPNG());reports.push({theme,width,height,...geometry});
    await js("document.querySelector('.model-picker-button').click()");await wait();await nav('Chat');assert.equal(await js("!!document.querySelector('.model-menu')"),false,'No stale model menu after navigation');
   }
   win.setFullScreen(true);await wait();await nav('Settings');
   assert.equal(win.isFullScreen(),true,'Native fullscreen enabled');
   const fullscreen=await js(`(()=>{const a=document.querySelector('.sidebar-settings').getBoundingClientRect(),b=document.querySelector('.sidebar-scroll').getBoundingClientRect(),h=document.querySelector('.management-page>header').getBoundingClientRect();return {top:a.top,bottom:a.bottom,scrollBottom:b.bottom,headingTop:h.top,viewport:innerHeight}})()`);
   assert.ok(fullscreen.top>=fullscreen.viewport-130&&fullscreen.bottom<=fullscreen.viewport&&fullscreen.scrollBottom<=fullscreen.top+1&&fullscreen.headingTop>=86,JSON.stringify(fullscreen));
   reports.push({theme,fullscreen:true,...fullscreen});win.setFullScreen(false);await wait();
  }
  await nav('Settings');await js("Array.from(document.querySelectorAll('[role=tablist] button')).find(b=>b.textContent==='记忆').click()");await wait();
  const checkbox="Array.from(document.querySelectorAll('.settings-content label')).find(l=>l.textContent.includes('允许 Agent')).querySelector('input')";
  await js(checkbox+'.click()');await new Promise(r=>setTimeout(r,650));assert.equal(runtime.settings().historyRecall,true);assert.equal(runtime.journal.history.length,9);
  await js("Array.from(document.querySelectorAll('.history-controls button')).find(b=>b.textContent.includes('清除')).click()");await wait();assert.equal(runtime.settings().historyRecall,false);assert.equal(runtime.journal.history.length,0);
  runtime.journal.start('interrupted','chat-0',temp,'Continue project work');runtime.journal.update('interrupted',{nextAction:'Verify files before tests',plan:[{text:'Inspect code',status:'done'}]});runtime.journal.finish('interrupted',{status:'interrupted',text:'Stopped'});
  await nav('Workspace');assert.ok(await js("document.querySelector('.task-cards').textContent.includes('Verify files before tests')"));await js("document.querySelector('.task-cards article button').click()");await wait();assert.ok(await js("!!document.querySelector('.conversation')"));assert.equal(runtime.running,null,'Opening task does not execute it');
  runtime.executionMode='yolo';const rejected=await runtime.invoke('learn_skill',{name:'reject-procedure',description:'Test',body:'Verified procedure'},new AbortController().signal,{...runtime.settings(),mode:'yolo'});runtime.executionMode=null;
  assert.equal(rejected.ok,false);assert.equal(approvals.length,1,'YOLO still shows real approval dialog for learned skills');
  fs.writeFileSync(path.join(work,'layout-journal-report.json'),JSON.stringify({ok:true,reports,checks:['fixed settings footer','independent history scroll','exclusive selection','settings top clearance','navigation closes popup','history enable/sync/clear','open interrupted task without replay','YOLO skill approval']},null,2));
  console.log('PASS: 6 desktop theme/size layouts and 2 native fullscreen layouts; history controls, task recovery and native skill approval');
  await runtime.close();win.destroy();app.exit(0);
 }catch(error){console.error(error);await runtime?.close();win?.destroy();app.exit(1);}
});
