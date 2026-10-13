const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerRuntime}=require('../desktop/runtime-ipc.cjs');
const work=path.join(__dirname,'../work');fs.mkdirSync(work,{recursive:true});
const temp=fs.mkdtempSync(path.join(work,'ui-test-'));app.setPath('userData',temp);
let modelFetches=0,connectionTests=0,modelsFail=false;
let window,runtime,config={provider:'openai',baseUrl:'https://example.invalid/v1',model:'old-model',apiKey:'test-key',projectRoot:temp};
app.whenReady().then(async()=>{
  try{
    runtime=registerRuntime({app,ipcMain,dialog:{showMessageBox:async()=>({response:1})},getWindow:()=>window,readConfig:()=>config,saveConfig:next=>{config=next;},skillDir:path.join(temp,'skills')});
    ipcMain.handle('config:get',()=>config);ipcMain.handle('config:save',(_,next)=>{config=next;runtime.rememberProvider(next);return {ok:true};});
    ipcMain.handle('project:get',()=>({root:temp,selected:true}));
    ipcMain.handle('connection:models',()=>{modelFetches++;return modelsFail?{ok:false,error:'offline'}:{ok:true,models:['available-a','available-b']};});
    ipcMain.handle('connection:test',()=>{connectionTests++;return {ok:true};});
    window=new BrowserWindow({show:false,width:1440,height:860,webPreferences:{preload:path.join(__dirname,'../desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    const errors=[];window.webContents.on('console-message',event=>{if(event.level>=3)errors.push(event.message);});
    await window.loadFile(path.join(__dirname,'../dist/index.html'));
    const wait=()=>new Promise(resolve=>setTimeout(resolve,500));
    const clickNav=async label=>{await window.webContents.executeJavaScript("document.querySelector('.sidebar nav button[data-page=\\\""+label+"\\\"]').click()");await wait();await window.webContents.executeJavaScript("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");};
    await wait();
    assert.ok(await window.webContents.executeJavaScript("!!document.querySelector('.home-intro')"),'Home is a separate landing page');
    await clickNav('Chat');assert.ok(await window.webContents.executeJavaScript("!!document.querySelector('.conversation-index')"),'Conversations have a separate index');
    await clickNav('Home');assert.ok(await window.webContents.executeJavaScript("!!document.querySelector('.home-intro')"),'Home returns without opening a chat');
    await clickNav('Skills');
    assert.ok(await window.webContents.executeJavaScript("document.querySelectorAll('.skill-row').length>=9"));
    await window.webContents.executeJavaScript("document.querySelector('.skill-row input').click()");await wait();
    assert.equal(runtime.settings().enabledSkills.length,runtime.skills.list().length-1);
    await clickNav('MCP');
    await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('.management-toolbar button')).find(b=>b.textContent.includes('添加')).click()");
    await wait();assert.ok(await window.webContents.executeJavaScript("!!document.querySelector('.editor-form input[type=url]')"));
    await clickNav('Workflows');fs.writeFileSync(path.join(work,'workflows-1440.png'),(await window.webContents.capturePage()).toPNG());assert.ok(await window.webContents.executeJavaScript("!!document.querySelector('.workflow-layout textarea')"));await clickNav('Automation');fs.writeFileSync(path.join(work,'automation-1440.png'),(await window.webContents.capturePage()).toPNG());assert.ok(await window.webContents.executeJavaScript("!!document.querySelector('.browser-address input')"));await clickNav('Settings');await wait();
    assert.ok(await window.webContents.executeJavaScript("document.querySelectorAll('.numeric-setting input').length===7"));
    for(const [width,height] of [[1440,860],[900,600]]){
      window.setSize(width,height);await wait();
      const overflow=await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.management-page input,.management-page select,.management-page button')).some(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.left<0||r.right>innerWidth);})`);
      assert.equal(overflow,false);
      fs.writeFileSync(path.join(work,'settings-'+width+'.png'),(await window.webContents.capturePage()).toPNG());
    }
    await window.webContents.executeJavaScript("document.querySelector('.model-picker-button').click()");
    await wait();
    assert.ok(await window.webContents.executeJavaScript("document.querySelector('.model-menu').textContent.includes('available-a')"));
    fs.writeFileSync(path.join(work,'model-menu-900.png'),(await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('.model-menu button')).find(b=>b.textContent==='available-a').click()");await wait();assert.equal(config.model,'available-a');
    await window.webContents.executeJavaScript("document.querySelector('.model-picker-button').click()");await wait();
    assert.equal(await window.webContents.executeJavaScript("!!document.querySelector('.settings-dialog')"),false);
    await window.webContents.executeJavaScript("document.querySelector('.model-menu-dismiss').click()");await wait();
    await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('.settings-tabs button')).find(b=>b.textContent.includes('供应商')).click()");await wait();
    assert.ok(await window.webContents.executeJavaScript("!!document.querySelector('.provider-settings input[list=provider-models]')"));
    await window.webContents.executeJavaScript("(()=>{const matching=Array.from(document.querySelectorAll('.provider-settings select')).find(s=>Array.from(s.options).some(o=>o.value==='xhigh'));matching.value='high';matching.dispatchEvent(new Event('change',{bubbles:true}));})()");await wait();
    await window.webContents.executeJavaScript("(()=>{const field=document.querySelector('.provider-settings input[list=provider-models]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'manual-model-id');field.dispatchEvent(new Event('input',{bubbles:true}));})()");await wait();
    assert.equal(config.model,'available-a','Draft fields must not change the active connection');
    await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('.connection-actions button')).find(b=>b.textContent.includes('获取')).click()");await wait();
    await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('.connection-actions button')).find(b=>b.textContent.includes('测试')).click()");await wait();
    assert.equal(connectionTests,1);assert.ok(await window.webContents.executeJavaScript("document.querySelector('.connection-status').textContent.includes('manual-model-id')"));
    fs.writeFileSync(path.join(work,'providers-dark-900.png'),(await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript("document.querySelector('.save').click()");await wait();assert.equal(config.model,'manual-model-id');
    assert.equal(config.reasoningEffort,'high');
    await window.webContents.executeJavaScript("document.querySelector('.settings-tabs button').click()");await wait();
    assert.equal(await window.webContents.executeJavaScript("document.querySelector('.settings-section select').value"),'zh-CN','Default interface language');
    await window.webContents.executeJavaScript("(()=>{const language=document.querySelector('.settings-section select');language.value='en-US';language.dispatchEvent(new Event('change',{bubbles:true}));})()");await wait();
    assert.equal(await window.webContents.executeJavaScript("document.querySelector('.management-page h1').textContent"),'Settings');
    assert.equal(await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('.sidebar nav button,.settings-tabs button,.settings-section h2')).some(el=>/[\\u4e00-\\u9fff]/.test(el.textContent))"),false,'Navigation and settings switch together');
    for(const [page,title] of [['MCP','MCP tools'],['Skills','Skills'],['Automation','Browser & desktop'],['Workflows','Workflows'],['Workspace','Workspace']]){
      await clickNav(page);assert.equal(await window.webContents.executeJavaScript("document.querySelector('main h1').textContent"),title);
    }
    await window.reload();await wait();await clickNav('Settings');
    assert.equal(await window.webContents.executeJavaScript("document.querySelector('.settings-section select').value"),'en-US','Language persists after reload');
    await window.webContents.executeJavaScript("document.querySelector('.model-picker-button').click()");await wait();
    await window.webContents.executeJavaScript("document.querySelector('.model-menu-dismiss').click()");await wait();
    await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('.settings-tabs button')).find(b=>b.textContent==='Models & providers').click()");await wait();
    assert.equal(await window.webContents.executeJavaScript("document.querySelector('.provider-settings h2').textContent"),'Models & providers');
    assert.equal(await window.webContents.executeJavaScript("/[\\u4e00-\\u9fff]/.test(document.querySelector('.provider-settings').textContent)"),false,'All provider settings labels switch to English');
    assert.equal(await window.webContents.executeJavaScript("!!document.querySelector('.settings-dialog')"),false,'Provider configuration is inline');
    await window.webContents.executeJavaScript("document.querySelector('.theme-toggle').click()");await wait();await wait();
    for(const [width,height] of [[1440,860],[900,600]]){
      window.setSize(width,height);await wait();
      assert.equal(await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('.provider-settings input,.provider-settings select,.provider-settings button')).some(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.left<0||r.right>innerWidth)})"),false,'Inline provider fields fit viewport');
      fs.writeFileSync(path.join(work,'providers-light-'+width+'.png'),(await window.webContents.capturePage()).toPNG());
    }
    const cachedFetches=modelFetches;
    for(const page of ['Home','Chat']){
      await clickNav(page);
      await window.webContents.executeJavaScript("document.querySelector('.model-pill').click()");await wait();
      assert.equal(await window.webContents.executeJavaScript("!!document.querySelector('.provider-settings,.settings-dialog')"),false,'Main chat only shows model choices');
      assert.equal(await window.webContents.executeJavaScript("(()=>{const r=document.querySelector('.model-menu').getBoundingClientRect();return r.top<0||r.bottom>innerHeight||r.left<0||r.right>innerWidth})()"),false,'Model menu fits viewport');
      await window.webContents.executeJavaScript("document.querySelector('.model-menu input').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))");
      assert.equal(await window.webContents.executeJavaScript("document.activeElement.getAttribute('role')"),'menuitemradio');
      await window.webContents.executeJavaScript("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await wait();
      assert.equal(await window.webContents.executeJavaScript("document.activeElement.className"),'model-pill','Escape restores focus');
    }
    assert.equal(modelFetches,cachedFetches,'Fresh model cache avoids a request on every opening');
    await window.webContents.executeJavaScript("document.querySelector('.model-pill').click()");await wait();
    await window.webContents.executeJavaScript("(()=>{const field=document.querySelector('.model-menu input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'custom-model');field.dispatchEvent(new Event('input',{bubbles:true}));})()");await wait();
    await window.webContents.executeJavaScript("document.querySelector('.model-menu input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");await wait();
    assert.equal(config.model,'custom-model','Model ID can be entered directly');
    await window.webContents.executeJavaScript("document.querySelector('.model-pill').click()");await wait();
    fs.writeFileSync(path.join(work,'model-menu-light-900.png'),(await window.webContents.capturePage()).toPNG());
    await window.webContents.executeJavaScript("document.querySelector('.model-menu-settings').click()");await wait();
    assert.ok(await window.webContents.executeJavaScript("!!document.querySelector('.provider-settings')"),'Model footer opens provider settings');
    await window.webContents.executeJavaScript("document.querySelector('.settings-tabs button').click()");await wait();
    await window.webContents.executeJavaScript("document.querySelector('.model-picker-button').click()");await wait();
    await window.webContents.executeJavaScript("document.querySelector('.model-menu-settings').click()");await wait();
    assert.ok(await window.webContents.executeJavaScript("!!document.querySelector('.provider-settings')"),'Repeated navigation returns to providers');
    modelsFail=true;
    await window.webContents.executeJavaScript("Object.keys(localStorage).filter(k=>k.startsWith('apollo-models:')).forEach(k=>{const v=JSON.parse(localStorage.getItem(k));v.time=0;localStorage.setItem(k,JSON.stringify(v));})");
    await clickNav('Home');
    await window.webContents.executeJavaScript("document.querySelector('.model-picker-button').click()");await wait();
    assert.ok(await window.webContents.executeJavaScript("document.querySelector('.model-menu').textContent.includes('Model list unavailable')"));
    assert.ok(await window.webContents.executeJavaScript("document.querySelector('.model-menu').textContent.includes('available-b')"),'Cached models survive discovery errors');
    assert.equal(errors.length,0,'Renderer console errors: '+errors.join('\n'));
    console.log('PASS: skills enablement, MCP editor, settings controls, 1440/900 layouts, model discovery/save, Chinese/English navigation and persistent language');
    await runtime.close();window.destroy();app.exit(0);
  }catch(error){console.error(error);await runtime?.close();window?.destroy();app.exit(1);}
});

