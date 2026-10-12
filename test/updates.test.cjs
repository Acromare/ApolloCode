const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');
const {registerUpdates}=require('../desktop/updates.cjs');
function fixture(t,{packaged=true,dir,clock=()=>1000}={}){
  if(!dir){dir=fs.mkdtempSync(path.join(os.tmpdir(),'apollo-notify-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));}
  const handlers=new Map(),updater=new EventEmitter(),dialogs=[],opened=[];let busy=false,response=1,info={version:'0.6.1',releaseNotes:'<p>修复连接</p><ul><li>新增通知</li></ul>'},show;
  updater.setFeedURL=url=>updater.feed=url;
  updater.checkForUpdates=async()=>updater.emit(info?'update-available':'update-not-available',info);
  updater.downloadUpdate=()=>assert.fail('Must never download in background');updater.quitAndInstall=()=>assert.fail('Must never install');
  const manager=registerUpdates({app:{isPackaged:packaged,getVersion:()=> '0.6.0',getPath:()=>dir},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},dialog:{showMessageBox:async(_window,options)=>{dialogs.push(options);return show?await show():{response};}},getWindow:()=>({isDestroyed:()=>false,isVisible:()=>true}),isBusy:()=>busy,updater,openExternal:async url=>opened.push(url),now:clock,schedule:false});
  t.after(()=>manager.close());
  return {dir,handlers,updater,manager,dialogs,opened,call:name=>handlers.get('update:'+name)(),busy:value=>{busy=value;},response:value=>{response=value;},info:value=>{info=value;},show:fn=>{show=fn;}};
}
test('new releases show notes and explicit browser download, with no install endpoint',async t=>{
  const f=fixture(t);assert.equal(f.updater.feed.repo,'ApolloCode');assert.equal(f.updater.autoDownload,false);assert.equal(f.updater.autoInstallOnAppQuit,false);assert.equal(f.handlers.has('update:install'),false);
  f.response(0);await f.manager.check();assert.equal(f.manager.state().status,'available');assert.equal(f.dialogs.length,1);assert.match(f.dialogs[0].message,/0.6.1/);assert.match(f.dialogs[0].detail,/修复连接/);assert.doesNotMatch(f.dialogs[0].detail,/<p>/);assert.equal(f.dialogs[0].cancelId,1);assert.deepEqual(f.opened,['https://github.com/Acromare/ApolloCode/releases/tag/v0.6.1']);
});
test('later reminders persist across restart, expire after 24h and newer patches still notify',async t=>{
  let clock=1000;const f=fixture(t,{clock:()=>clock});await f.manager.check();await f.manager.check();assert.equal(f.dialogs.length,1);assert.equal(f.opened.length,0);
  const restarted=fixture(t,{dir:f.dir,clock:()=>clock});await restarted.manager.check();assert.equal(restarted.dialogs.length,0);
  clock+=24*60*60*1000+1;await restarted.manager.check();assert.equal(restarted.dialogs.length,1);
  restarted.info({version:'0.6.2'});await restarted.manager.check();assert.equal(restarted.dialogs.length,2);
});
test('automatic notifications wait for active tasks; manual checks can reopen snoozed notes',async t=>{
  const f=fixture(t);f.busy(true);await f.manager.check();assert.equal(f.dialogs.length,0);assert.equal(f.manager.state().status,'available');f.busy(false);await f.manager.notify();assert.equal(f.dialogs.length,1);await f.call('check');assert.equal(f.dialogs.length,2);await f.call('download');assert.equal(f.opened.length,1);
});
test('overlapping notification attempts show only one modal',async t=>{
  const f=fixture(t);let resolve;f.show(()=>new Promise(r=>{resolve=r;}));const check=f.manager.check();await new Promise(r=>setImmediate(r));await f.manager.notify(true);assert.equal(f.dialogs.length,1);resolve({response:1});await check;
});
test('release metadata cannot supply external URLs and invalid versions cannot download',async t=>{
  const f=fixture(t);f.info({version:'0.6.1',releaseUrl:'https://evil.invalid',releaseNotes:'<a href="https://evil.invalid">Update</a>'});await f.manager.check();await f.call('download');assert.equal(f.opened[0],'https://github.com/Acromare/ApolloCode/releases/tag/v0.6.1');f.info({version:'../../evil'});await f.manager.check();assert.equal(f.manager.state().status,'error');await assert.rejects(f.call('download'),/可用更新/);
});
test('current versions and network errors stay quiet; development never checks or downloads',async t=>{
  const f=fixture(t);f.info(null);await f.manager.check();assert.equal(f.manager.state().status,'current');assert.equal(f.dialogs.length,0);f.updater.checkForUpdates=async()=>{throw Error('Network unavailable');};await f.manager.check();assert.equal(f.manager.state().status,'error');assert.equal(f.dialogs.length,0);
  const dev=fixture(t,{packaged:false});dev.updater.checkForUpdates=()=>assert.fail('Development should not check');await dev.call('check');await dev.call('download');assert.equal(dev.manager.state().status,'development');assert.equal(dev.opened.length,0);
});
