const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {registerRuntime}=require('../desktop/runtime-ipc.cjs');
const temp=fs.mkdtempSync(path.join(__dirname,'../work/docs-ui-'));app.setPath('userData',temp);
let win,runtime;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  try{
    const config={provider:'openai',baseUrl:'https://example.invalid/v1',model:'自选模型',apiKey:'',apiMode:'auto',projectRoot:''};
    runtime=registerRuntime({app,ipcMain,dialog:{showMessageBox:async()=>({response:0})},getWindow:()=>win,readConfig:()=>config,saveConfig:()=>{},skillDir:path.join(temp,'skills')});
    runtime.fetcher=async()=>{throw Error('Documentation capture must not call a model');};
    ipcMain.handle('config:get',()=>config);ipcMain.handle('project:get',()=>({root:'',selected:false}));
    win=new BrowserWindow({show:false,width:1440,height:960,webPreferences:{preload:path.join(__dirname,'../desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    await win.loadFile(path.join(__dirname,'../dist/index.html'));
    const js=s=>win.webContents.executeJavaScript(s);
    for(const theme of ['light','eclipse']){
      await js("document.querySelector('.theme-toggle').click()");
      const end=Date.now()+10000;
      while(!await js(`document.documentElement.dataset.theme==='${theme}'&&!document.querySelector('.theme-toggle').disabled`)){if(Date.now()>end)throw Error('Theme did not settle');await delay(50);}
    }
    await delay(800);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const out=path.join(__dirname,'../assets/screenshots');fs.mkdirSync(out,{recursive:true});
    fs.writeFileSync(path.join(out,'home-0.7.2.png'),(await win.webContents.capturePage()).toPNG());
    await runtime.close();win.destroy();app.exit(0);
  }catch(e){console.error(e);await runtime?.close();win?.destroy();app.exit(1);}
});
