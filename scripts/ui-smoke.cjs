const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerRuntime}=require('../desktop/runtime-ipc.cjs');
const work=path.join(__dirname,'../work');fs.mkdirSync(work,{recursive:true});
const temp=fs.mkdtempSync(path.join(work,'ui-test-'));app.setPath('userData',temp);
let window,runtime,config={provider:'openai',baseUrl:'https://example.invalid/v1',model:'old-model',apiKey:'test-key',projectRoot:temp};
app.whenReady().then(async()=>{
  try{
    runtime=registerRuntime({app,ipcMain,dialog:{showMessageBox:async()=>({response:1})},getWindow:()=>window,readConfig:()=>config,saveConfig:next=>{config=next;},skillDir:path.join(temp,'skills')});
    ipcMain.handle('config:get',()=>config);ipcMain.handle('config:save',(_,next)=>{config=next;runtime.rememberProvider(next);return {ok:true};});
    ipcMain.handle('project:get',()=>({root:temp,selected:true}));
    ipcMain.handle('connection:models',()=>({ok:true,models:['available-a','available-b']}));
    window=new BrowserWindow({show:false,width:1440,height:860,webPreferences:{preload:path.join(__dirname,'../desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    const errors=[];window.webContents.on('console-message',event=>{if(event.level>=3)errors.push(event.message);});
    await window.loadFile(path.join(__dirname,'../dist/index.html'));
    const wait=()=>new Promise(resolve=>setTimeout(resolve,500));
    const clickNav=async label=>{await window.webContents.executeJavaScript("document.querySelector('.sidebar nav button[data-page=\\\""+label+"\\\"]').click()");await wait();await window.webContents.executeJavaScript("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");};
    await wait();await clickNav('Skills');
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
    await new Promise(resolve=>setTimeout(resolve,1000));
    assert.equal(await window.webContents.executeJavaScript("document.querySelector('.settings-dialog select[required]').value"),'available-a');
    await window.webContents.executeJavaScript("document.querySelector('.save').click()");await wait();assert.equal(config.model,'available-a');
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
    assert.equal(await window.webContents.executeJavaScript("document.querySelector('.settings-dialog h2').textContent"),'Models & providers');
    assert.equal(errors.length,0,'Renderer console errors: '+errors.join('\n'));
    console.log('PASS: skills enablement, MCP editor, settings controls, 1440/900 layouts, model discovery/save, Chinese/English navigation and persistent language');
    await runtime.close();window.destroy();app.exit(0);
  }catch(error){console.error(error);await runtime?.close();window?.destroy();app.exit(1);}
});

