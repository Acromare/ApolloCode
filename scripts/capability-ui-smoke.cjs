const {app,BrowserWindow,ipcMain}=require('electron');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerRuntime}=require('../desktop/runtime-ipc.cjs');const work=path.join(__dirname,'../work');fs.mkdirSync(work,{recursive:true});const dir=fs.mkdtempSync(path.join(work,'capability-ui-'));app.setPath('userData',dir);
let win,runtime;
app.whenReady().then(async()=>{
  try{
    const config={provider:'openai',baseUrl:'https://example.invalid/v1',model:'fixture',apiKey:'fixture',projectRoot:dir,apiMode:'auto'};
    runtime=registerRuntime({app,ipcMain,dialog:{showMessageBox:async()=>({response:1})},getWindow:()=>win,readConfig:()=>config,saveConfig:()=>{},skillDir:path.join(dir,'skills')});
    ipcMain.handle('config:get',()=>config);ipcMain.handle('project:get',()=>({root:dir,selected:true}));ipcMain.handle('connection:models',()=>({ok:true,models:['fixture']}));
    win=new BrowserWindow({show:false,width:1440,height:960,webPreferences:{preload:path.join(__dirname,'../desktop/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    const js=code=>win.webContents.executeJavaScript(code),wait=ms=>new Promise(r=>setTimeout(r,ms));
    await win.loadFile(path.join(__dirname,'../dist/index.html'));await wait(500);
    const nav=async name=>{await js(`Array.from(document.querySelectorAll('.sidebar nav button')).find(b=>b.textContent==='${name}').click()`);await wait(150);};
    await nav('Workflows');await js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('新建节点图')).click()");await wait(100);
    await js("Array.from(document.querySelectorAll('.workflow-editor button')).find(b=>b.textContent.includes('添加节点')).click()");await wait(100);
    assert.equal(await js("document.querySelectorAll('.workflow-graph g[role=button]').length"),2);
    await js(`(()=>{const area=document.querySelector('.workflow-editor textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(area,'Inspect the project read-only.');area.dispatchEvent(new Event('input',{bubbles:true}));})()`);await wait(100);
    fs.writeFileSync(path.join(work,'workflow-node-editor.png'),(await win.webContents.capturePage()).toPNG());
    await js("document.querySelector('.workflow-editor form').requestSubmit()");await wait(300);
    assert.equal(runtime.workflows.state().templates.filter(t=>t.custom).length,1);assert.equal(runtime.workflows.state().templates.find(t=>t.custom).steps.length,2);
    await nav('Settings');await js("Array.from(document.querySelectorAll('.settings-tabs button')).find(b=>b.textContent==='记忆').click()");await wait(100);
    assert.equal(await js("document.querySelectorAll('input[type=checkbox]').length"),3);
    await js("Array.from(document.querySelectorAll('label')).find(l=>l.textContent.includes('任务结束后提取')).querySelector('input').click()");await wait(200);assert.equal(runtime.settings().autoMemory,true);
    await js("document.querySelector('.model-picker-button').click()");await wait(100);
    assert.equal(await js("Array.from(document.querySelectorAll('.settings-dialog option')).some(o=>o.value==='responses')"),true);
    await win.reload();await wait(500);await nav('Workflows');assert.ok(await js("Array.from(document.querySelectorAll('.workflow-detail option')).some(o=>o.textContent==='自定义工作流')"));
    console.log('PASS: node graph editing/connections/save/reload, memory settings persistence, and API protocol control in actual Electron UI');await runtime.close();win.destroy();app.exit(0);
  }catch(error){console.error(error);await runtime?.close();win?.destroy();app.exit(1);}
});
