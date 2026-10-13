// Real public feed, real 10-second startup scheduler, native dialogs, isolated old-version adapter.
const {app,BrowserWindow,ipcMain,dialog,net}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=fs.mkdtempSync(path.resolve(__dirname,'../work/update-native-'));app.setPath('userData',root);
const packageRoot=path.resolve(process.env.APOLLO_QA_PACKAGE_ROOT||path.join(__dirname,'..'));
const {registerUpdates}=require(path.join(packageRoot,'desktop/updates.cjs'));
const {fetchLatestRelease}=require(path.join(packageRoot,'desktop/release-api.cjs'));
let window,manager;const opened=[];
const deadline=setTimeout(()=>{console.error('Native update QA timed out');app.exit(1);},90000);
function click(button,name){return new Promise((resolve,reject)=>{
  const child=spawn(process.env.APOLLO_QA_POWERSHELL||'powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'update-native-dialog.ps1'),'-TargetPid',String(process.pid),'-Screenshot',path.join(root,name),'-Button',button],{windowsHide:true});
  let output='',error='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>error+=v);child.once('error',reject);child.once('close',code=>code===0?resolve(JSON.parse(output.trim())):reject(Error(error||output||'Dialog automation failed')));
});}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  window=new BrowserWindow({width:1100,height:760,show:true,webPreferences:{sandbox:true,contextIsolation:true}});
  await window.loadFile(path.join(packageRoot,'dist/index.html'));
  const later=click('稍后提醒','startup-dialog.png');
  manager=registerUpdates({app:{isPackaged:true,getVersion:()=> '0.7.0',getPath:()=>root},ipcMain,dialog:{showMessageBox:async(w,options)=>{fs.writeFileSync(path.join(root,'dialog-options.json'),JSON.stringify(options,null,2));return dialog.showMessageBox(w,options);}},getWindow:()=>window,isBusy:()=>false,fetchRelease:()=>fetchLatestRelease({electronFetch:net.fetch.bind(net)}),openExternal:async url=>opened.push(url)});
  const startup=await later;
  for(let i=0;i<20&&!fs.existsSync(path.join(root,'update-notifications.json'));i++)await wait(100);
  assert.equal(manager.state().available,'0.7.1');assert.equal(manager.state().status,'available');
  const reminder=JSON.parse(fs.readFileSync(path.join(root,'update-notifications.json')));assert.equal(reminder.version,'0.7.1');assert.ok(reminder.remindAfter>Date.now()+23*60*60*1000);
  const download=click('下载更新','manual-dialog.png');await manager.check(true);const manual=await download;
  assert.deepEqual(opened,['https://github.com/Acromare/ApolloCode/releases/tag/v0.7.1']);
  const current=registerUpdates({app:{isPackaged:true,getVersion:()=> '0.7.1',getPath:()=>root},ipcMain:{handle:()=>{}},dialog:{showMessageBox:()=>{throw Error('Current version must not show an update dialog');}},getWindow:()=>window,isBusy:()=>false,fetchRelease:()=>fetchLatestRelease({electronFetch:net.fetch.bind(net)}),openExternal:async()=>{},schedule:false});
  assert.equal((await current.check(true)).status,'current');current.close();
  const report={ok:true,available:'0.7.1',adapterVersion:'0.7.0',source:packageRoot,checks:['public GitHub API','automatic startup schedule','native Windows dialog displayed','native remind-later button and persisted 24-hour reminder','manual check reopens native dialog','native download button selects public release page','0.7.1 detects itself as current'],startup,manual,downloadPage:opened[0],scope:'Packaged update modules in Electron QA with isolated old-version adapter. Native dialogs displayed and clicked via Windows UIA. Browser action intercepted; existing installed 0.7.0 and user settings unchanged.'};
  fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}).then(()=>{clearTimeout(deadline);manager?.close();window?.destroy();app.exit(0);}).catch(error=>{console.error(error,manager?.state());clearTimeout(deadline);manager?.close();window?.destroy();app.exit(1);});
