const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerRuntime}=require('../desktop/runtime-ipc.cjs');
const work=path.join(__dirname,'../work');fs.mkdirSync(work,{recursive:true});
const temp=fs.mkdtempSync(path.join(work,'reliability-ui-'));app.setPath('userData',temp);
let win,runtime;
app.whenReady().then(async()=>{
  try{
    const config={provider:'openai',baseUrl:'https://example.invalid/v1',model:'test',apiKey:'fixture',projectRoot:temp};
    runtime=registerRuntime({app,ipcMain,dialog:{showMessageBox:async()=>({response:1})},getWindow:()=>win,readConfig:()=>config,saveConfig:()=>{},skillDir:path.join(temp,'skills')});
    ipcMain.handle('config:get',()=>config);ipcMain.handle('project:get',()=>({root:temp,selected:true}));
    let calls=0;
    ipcMain.handle('chat:send',async(_,payload)=>{
      assert.ok(payload.messages.every(m=>!m.trace&&!m.failure));calls++;
      const event=value=>win.webContents.send('runtime:event',{...value,requestId:payload.requestId,time:Date.now()});
      if(payload.resumeId){assert.equal(payload.resumeId,'saved-model-call');event({type:'delta',text:'Recovered answer.'});return {ok:true,content:'Recovered answer.'};}
      if(payload.messages.at(-1).content==='no tools failure')return {ok:false,error:'connection refused',failure:{code:'transport',message:'Service unavailable',retryable:true,provider:'openai',model:'test',completedOperations:0,recoveryId:'saved-model-call'}};
      event({type:'tool',name:'run_shell',callId:'shell',status:'running',arguments:'{"command":"test command"}'});
      event({type:'command_start',callId:'shell',backend:'local',cwd:temp,command:'test command'});
      for(let n=0;n<230;n++)event({type:'tool_output',callId:'shell',stream:'stdout',text:'ready '+n+'\n',snapshot:true});
      event({type:'tool_output',callId:'shell',stream:'stderr',text:'failure detail\n',snapshot:true});
      await new Promise(r=>setTimeout(r,500));
      event({type:'command_end',callId:'shell',code:7,durationMs:500});
      event({type:'tool',name:'run_shell',callId:'shell',status:'failed',durationMs:500,preview:'exit 7'});
      event({type:'delta',text:'Partial answer'});
      return {ok:false,error:'Stream ended',partial:'Partial answer',failure:{code:'incomplete_stream',message:'Stream ended before completion',retryable:true,partial:true,completedOperations:1,recoveryId:'saved-model-call',provider:'openai',model:'test',hint:'Resume the model call; completed commands are preserved.'}};
    });
    win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{preload:path.join(__dirname,'../desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    const js=code=>win.webContents.executeJavaScript(code),wait=ms=>new Promise(r=>setTimeout(r,ms));
    await win.loadFile(path.join(__dirname,'../dist/index.html'));await wait(350);
    async function send(text){await js(`(()=>{const input=document.querySelector('.composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait(80);await js("document.querySelector('.send').click()");}
    await send('run command');await wait(220);
    assert.match(await js("document.querySelector('.work-details').textContent"),/ready 229/);
    assert.equal(await js("document.querySelectorAll('.live-command-output').length"),2,'Snapshots do not accumulate in the timeline');
    await wait(650);
    assert.match(await js("document.querySelector('.markdown-body').textContent"),/Partial answer/);
    assert.match(await js("document.querySelector('.failure-card').textContent"),/回复未完成/);
    assert.equal(await js("document.querySelector('.work-details').open"),true);
    assert.match(await js("document.querySelector('.work-details').textContent"),/退出码: 7/);
    assert.equal(await js("document.querySelectorAll('.work-tool-row').length"),1,'High-volume output never evicts the tool start/end');
    for(let n=0;n<3;n++){
      assert.equal(await js("document.querySelector('.failure-card').getAttribute('role')"),'alert');
      assert.equal(await js("document.querySelector('.messages').scrollWidth>document.querySelector('.messages').clientWidth"),false);
      await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      fs.writeFileSync(path.join(work,'reliability-theme-'+n+'.png'),(await win.webContents.capturePage()).toPNG());
      await js("document.querySelector('.theme-toggle').click()");await wait(800);
    }
    await js("document.querySelector('.failure-actions button').click()");await wait(450);
    assert.match(await js("Array.from(document.querySelectorAll('.markdown-body')).at(-1).textContent"),/Recovered answer/);
    assert.equal(calls,2);
    await js("document.querySelector('.sidebar .new-chat-button').click()");await wait(100);await send('no tools failure');await wait(400);
    assert.ok(await js("!!document.querySelector('.failure-card')"),'A no-tool failure remains visible');
    assert.equal(await js("document.querySelector('.work-details').open"),true);
    await js("document.querySelector('.failure-actions button:nth-child(2)').click()");await wait(200);
    assert.ok(await js("!!Array.from(document.querySelectorAll('select')).find(s=>Array.from(s.options).some(o=>o.value==='system'))"),'Connection action opens saved providers and network transport');
    assert.equal(await js("Array.from(document.querySelectorAll('select')).find(s=>Array.from(s.options).some(o=>o.value==='json')).value"),'auto');
    await js("(()=>{const s=Array.from(document.querySelectorAll('select')).find(s=>Array.from(s.options).some(o=>o.value==='json'));s.value='json';s.dispatchEvent(new Event('change',{bubbles:true}));})()");await wait(250);
    assert.equal(runtime.settings().responseMode,'json','Response mode is saved by the real UI');
    console.log('PASS: real renderer, live bounded stdout/stderr, exit code, visible partial/no-tool failures, all three themes, exact model recovery and connection action');
    await runtime.close();win.destroy();app.exit(0);
  }catch(error){console.error(error);await runtime?.close();win?.destroy();app.exit(1);}
});
