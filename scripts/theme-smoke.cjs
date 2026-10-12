const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerRuntime}=require('../desktop/runtime-ipc.cjs');
const work=path.join(__dirname,'../work');fs.mkdirSync(work,{recursive:true});
const temp=fs.mkdtempSync(path.join(work,'theme-test-'));app.setPath('userData',temp);
let window,runtime,config={provider:'openai',baseUrl:'https://example.invalid/v1',model:'test-model',apiKey:'test-key',projectRoot:temp};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  try{
    runtime=registerRuntime({app,ipcMain,dialog:{showMessageBox:async()=>({response:1})},getWindow:()=>window,readConfig:()=>config,saveConfig:next=>{config=next;},skillDir:path.join(temp,'skills')});
    ipcMain.handle('config:get',()=>config);ipcMain.handle('project:get',()=>({root:temp,selected:true}));
    window=new BrowserWindow({show:false,width:1440,height:960,webPreferences:{preload:path.join(__dirname,'../desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    const errors=[];window.webContents.on('console-message',e=>{if(e.level>=3)errors.push(e.message);});
    const js=source=>window.webContents.executeJavaScript(source).catch(error=>{console.error('JS failed:',source);throw error;});
    const settled=async()=>{await delay(800);await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');};
    const capture=async name=>{await settled();fs.writeFileSync(path.join(work,name+'.png'),(await window.webContents.capturePage()).toPNG());};
    await window.loadFile(path.join(__dirname,'../dist/index.html'));await settled();
    assert.equal(await js('document.documentElement.dataset.theme'),'dark');
    const inputTokens=runtime.usage().requests;
    await capture('theme-dark-1440');
    await js("document.querySelector('.theme-toggle').click()");
    for(let i=0;i<30&&await js('document.documentElement.dataset.theme')!=='light';i++)await delay(50);
    assert.equal(await js('document.documentElement.dataset.theme'),'light');
    assert.ok(await js("document.documentElement.getAnimations({subtree:true}).length>0"),'Theme reveal animation must be active');
    fs.writeFileSync(path.join(work,'theme-transition.png'),(await window.webContents.capturePage()).toPNG());
    await capture('theme-light-1440');
    const activeTheme=()=>js('document.documentElement.dataset.theme');
    const contrast=await js(`(()=>{const rgb=s=>s.match(/[0-9.]+/g).slice(0,3).map(Number);const lum=s=>rgb(s).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);const el=document.querySelector('.sidebar');const cs=getComputedStyle(el);const a=lum(cs.color),b=lum(cs.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)})()`);
    assert.ok(contrast>=4.5,'Daytime sidebar contrast');
    for(const [width,height] of [[1440,960],[900,600],[600,820]]){
      window.setSize(width,height);await settled();
      assert.equal(await js("document.querySelector('.shell').scrollWidth>innerWidth"),false);
      assert.equal(await js("document.querySelector('.home-intro').getBoundingClientRect().bottom>document.querySelector('.composer').getBoundingClientRect().top"),false);
      const outside=await js("Array.from(document.querySelectorAll('.quick-actions button,.top-actions button')).some(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth})");assert.equal(outside,false);
      await capture('theme-light-'+width);
      await js("document.querySelector('.theme-toggle').click()");await settled();await capture('theme-dark-'+width);
      await js("document.querySelector('.theme-toggle').click()");await settled();
    }
    window.setSize(1440,960);
    const nav=async label=>{await js("Array.from(document.querySelectorAll('.sidebar nav button')).find(b=>b.textContent==='"+label+"').click()");await settled();};
    for(const label of ['Skills','MCP','Workflows','Automation','Settings']){
      await nav(label);assert.equal(await activeTheme(),'light');
      const color=await js("getComputedStyle(document.querySelector('.management-page')).color");assert.equal(color,'rgb(41, 46, 57)');
      await capture('theme-light-'+label.toLowerCase());
    }
    await window.reload();await settled();assert.equal(await activeTheme(),'light');
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await js("document.querySelector('.theme-toggle').click()");await delay(50);
    assert.equal(await activeTheme(),'dark');assert.equal(await js('document.documentElement.getAnimations({subtree:true}).length'),0);
    assert.equal(runtime.usage().requests,inputTokens,'Theme changes must not call a model');
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('PASS: animated theme reveal, dark/light artwork, 1440/900/600 layouts, all management pages, persistent preference, reduced motion and zero model requests');
    await runtime.close();window.destroy();app.exit(0);
  }catch(error){console.error(error);await runtime?.close();window?.destroy();app.exit(1);}
});
