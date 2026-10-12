const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {registerUpdates}=require('../desktop/updates.cjs');
function fixture(packaged=true){
  const handlers=new Map(),updater=new EventEmitter();let installed=false,busy=false,allowed=true,downloads=0;
  updater.setFeedURL=url=>updater.feed=url;
  updater.checkForUpdates=async()=>updater.emit('update-available',{version:'0.6.0'});
  updater.downloadUpdate=async()=>{downloads++;updater.emit('download-progress',{percent:42});updater.emit('update-downloaded',{version:'0.6.0'});};
  updater.quitAndInstall=()=>{installed=true;};
  const manager=registerUpdates({app:{isPackaged:packaged,getVersion:()=> '0.5.0'},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},dialog:{showMessageBox:async()=>({response:allowed?1:0})},getWindow:()=>null,isBusy:()=>busy,updater});
  return {updater,manager,call:name=>handlers.get('update:'+name)(),busy:value=>{busy=value;},allow:value=>{allowed=value;},installed:()=>installed,downloads:()=>downloads};
}
test('GitHub updates require explicit download and idle installation approval',async()=>{
  const f=fixture();assert.equal(f.updater.feed.repo,'ApolloCode');assert.equal(f.updater.autoDownload,false);assert.equal(f.updater.autoInstallOnAppQuit,false);
  await f.call('check');assert.equal(f.manager.state().status,'available');assert.equal(f.downloads(),0);
  f.allow(false);await f.call('download');assert.equal(f.downloads(),0);
  f.allow(true);await f.call('download');assert.equal(f.manager.state().status,'downloaded');assert.equal(f.manager.state().percent,100);
  f.busy(true);await assert.rejects(f.call('install'),/Agent/);assert.equal(f.installed(),false);
  f.busy(false);f.allow(false);await f.call('install');assert.equal(f.installed(),false);
  f.allow(true);await f.call('install');assert.equal(f.installed(),true);
});
test('unpublished update feed errors are visible and development never downloads',async()=>{
  const f=fixture();f.updater.checkForUpdates=async()=>{throw new Error('No published release');};await f.call('check');assert.equal(f.manager.state().status,'error');assert.match(f.manager.state().error,/published/);
  const dev=fixture(false);await dev.call('check');await dev.call('download');assert.equal(dev.manager.state().status,'development');assert.equal(dev.downloads(),0);
});
