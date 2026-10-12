const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const {registerRuntime}=require('../desktop/runtime-ipc.cjs');
const work=path.join(__dirname,'../work');fs.mkdirSync(work,{recursive:true});
const temp=fs.mkdtempSync(path.join(work,'activity-test-'));app.setPath('userData',temp);
let win,runtime,server;
app.whenReady().then(async()=>{
  try{
    const config={provider:'openai',baseUrl:'https://example.invalid/v1',model:'test-model',apiKey:'test-key',projectRoot:temp};
    runtime=registerRuntime({app,ipcMain,dialog:{showMessageBox:async()=>({response:1})},getWindow:()=>win,readConfig:()=>config,saveConfig:()=>{},skillDir:path.join(temp,'skills')});
    ipcMain.handle('config:get',()=>config);ipcMain.handle('project:get',()=>({root:temp,selected:true}));
    ipcMain.handle('chat:send',async(_,payload)=>{
      assert.ok(payload.messages.every(m=>!m.trace),'Trace must never enter model context');
      const event=value=>win.webContents.send('runtime:event',{...value,requestId:payload.requestId,time:Date.now()});
      event({type:'step',step:1});event({type:'tool',name:'read_file',callId:'read',status:'running',arguments:'{"path":"sample.ts","start":1,"end":10}'});
      await new Promise(r=>setTimeout(r,1500));
      event({type:'tool',name:'read_file',callId:'read',status:'done',durationMs:1500,preview:'1: export const sample = true;'});
      event({type:'delta',text:'Read sample.ts.'});return {ok:true,content:'Read sample.ts.'};
    });
    win=new BrowserWindow({show:false,width:1440,height:960,webPreferences:{preload:path.join(__dirname,'../desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    const js=code=>win.webContents.executeJavaScript(code).catch(error=>{console.error('JS failed:',code);throw error;}),wait=ms=>new Promise(r=>setTimeout(r,ms));
    await win.loadFile(path.join(__dirname,'../dist/index.html'));await wait(500);
    await js(`(()=>{const input=document.querySelector('.composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Read sample.ts');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait(100);await js("document.querySelector('.send').click()");await wait(400);
    assert.equal(await js("document.querySelector('.work-details').open"),false);
    assert.match(await js("document.querySelector('.work-details summary').textContent"),/工作中/);
    await js("document.querySelector('.work-details summary').click()");assert.equal(await js("document.querySelector('.work-details').open"),true);
    assert.match(await js("document.querySelector('.work-details').textContent"),/sample.ts/);
    await wait(1600);assert.match(await js("document.querySelector('.work-details summary').textContent"),/已完成/);
    assert.equal(await js("document.querySelector('.work-details').open"),false);
    await js("document.querySelector('.work-details summary').click()");
    await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');fs.writeFileSync(path.join(work,'activity-expanded-1440.png'),(await win.webContents.capturePage()).toPNG());
    await win.reload();await wait(500);await js("document.querySelector('.sidebar-recents button').click()");await wait(100);
    assert.equal(await js("document.querySelector('.work-details').open"),false);assert.match(await js("document.querySelector('.work-details').textContent"),/export const sample/);
    win.setSize(900,700);await js("document.querySelector('.theme-toggle').click()");await wait(800);await js("document.querySelector('.work-details summary').click()");await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');fs.writeFileSync(path.join(work,'activity-light-900.png'),(await win.webContents.capturePage()).toPNG());
    assert.equal(await js("document.querySelector('.messages').scrollWidth>document.querySelector('.messages').clientWidth"),false);
    server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html><body style="background:white;color:#222"><h1>Apollo Browser</h1><p>Live preview verified</p></body></html>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
    await runtime.browser.open('http://127.0.0.1:'+server.address().port);runtime.browser.window.hide();
    await js("Array.from(document.querySelectorAll('.sidebar nav button')).find(b=>b.textContent==='Automation').click()");await wait(2500);
    assert.ok(await js("document.querySelector('.browser-preview').naturalWidth>100"));
    assert.match(await js("document.querySelector('.browser-preview').src"),/^data:image\/png/);
    fs.writeFileSync(path.join(work,'browser-live-preview.png'),(await win.webContents.capturePage()).toPNG());
    await runtime.browser.close();await wait(2200);assert.equal(await js("!!document.querySelector('.browser-preview')"),false);
    console.log('PASS: collapsed live activity, elapsed time, tool detail, persisted trace, responsive light theme and real browser auto-preview');
    await runtime.close();await new Promise(r=>server.close(r));win.destroy();app.exit(0);
  }catch(error){console.error(error);await runtime?.close();server?.close();win?.destroy();app.exit(1);}
});
