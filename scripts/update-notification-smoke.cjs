// Real public feed check with an intercepted dialog/browser; never downloads or installs.
const {app,net}=require('electron');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fetchLatestRelease}=require('../desktop/release-api.cjs');const {registerUpdates}=require('../desktop/updates.cjs');
const root=path.resolve(__dirname,'../work/update-notification-qa');fs.mkdirSync(root,{recursive:true});app.setPath('userData',root);
let manager;const deadline=setTimeout(()=>{console.error('Update feed test timed out');app.exit(1);},60000);
app.whenReady().then(async()=>{
  const dialogs=[],opened=[];
  manager=registerUpdates({app:{isPackaged:true,getVersion:()=> '0.6.1',getPath:()=>root},fetchRelease:()=>fetchLatestRelease({electronFetch:net.fetch.bind(net)}),ipcMain:{handle:()=>{}},dialog:{showMessageBox:async(_window,options)=>{dialogs.push(options);return {response:0};}},getWindow:()=>({isVisible:()=>true}),isBusy:()=>false,openExternal:async url=>opened.push(url),schedule:false});
  const state=await manager.check(true);assert.equal(state.status,'available');assert.equal(dialogs.length,1);assert.ok(state.releaseNotes?.length);assert.ok(opened[0].startsWith('https://github.com/Acromare/ApolloCode/releases/tag/v'));
  const report={ok:true,source:'real public GitHub Releases API, production transport',currentVersion:'0.6.1',available:state.available,dialogTitle:dialogs[0].title,buttons:dialogs[0].buttons,releaseNotesPresent:true,downloadPage:opened[0],checks:['real public version detection','release notes converted to readable notification','explicit download action opens trusted release page'],scope:'Dialog and browser intercepted in isolated QA; no installer download, no installation, no paid model calls.'};
  fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}).then(()=>{clearTimeout(deadline);manager?.close();app.exit(0);}).catch(error=>{console.error(error);clearTimeout(deadline);manager?.close();app.exit(1);});
