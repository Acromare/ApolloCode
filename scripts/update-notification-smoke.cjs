// Real public feed check with an intercepted dialog/browser; never downloads or installs.
const {app}=require('electron');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {NsisUpdater}=require('electron-updater');const {ElectronHttpExecutor}=require('electron-updater/out/electronHttpExecutor');const {registerUpdates}=require('../desktop/updates.cjs');
const root=path.resolve(__dirname,'../work/update-notification-qa');fs.mkdirSync(root,{recursive:true});app.setPath('userData',root);
let manager;const deadline=setTimeout(()=>{console.error('Update feed test timed out');app.exit(1);},60000);
app.whenReady().then(async()=>{
  const adapter={version:'0.5.0',name:'Apollo notification QA',isPackaged:true,userDataPath:root,baseCachePath:root,appUpdateConfigPath:path.join(root,'unused.yml'),whenReady:()=>app.whenReady(),onQuit:()=>{},quit:()=>assert.fail('Must not quit'),relaunch:()=>assert.fail('Must not relaunch')};
  const updater=new NsisUpdater(undefined,adapter);updater.httpExecutor=new ElectronHttpExecutor();updater.logger=null;
  const dialogs=[],opened=[];
  manager=registerUpdates({app:{isPackaged:true,getVersion:()=>adapter.version,getPath:()=>root},updater,ipcMain:{handle:()=>{}},dialog:{showMessageBox:async(_window,options)=>{dialogs.push(options);return {response:0};}},getWindow:()=>({isVisible:()=>true}),isBusy:()=>false,openExternal:async url=>opened.push(url),schedule:false});
  const state=await manager.check(true);assert.equal(state.status,'available');assert.equal(dialogs.length,1);assert.ok(state.releaseNotes?.length);assert.ok(opened[0].startsWith('https://github.com/Acromare/ApolloCode/releases/tag/v'));
  const report={ok:true,source:'real public GitHub Releases',currentVersion:adapter.version,available:state.available,dialogTitle:dialogs[0].title,buttons:dialogs[0].buttons,releaseNotesPresent:true,downloadPage:opened[0],checks:['real public version detection','release notes converted to readable notification','explicit download action opens trusted release page'],scope:'Dialog and browser intercepted in isolated QA; no installer download, no installation, no paid model calls.'};
  fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}).then(()=>{clearTimeout(deadline);manager?.close();app.exit(0);}).catch(error=>{console.error(error);clearTimeout(deadline);manager?.close();app.exit(1);});
