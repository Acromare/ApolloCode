const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {registerUpdates}=require('../desktop/updates.cjs');
const {fetchLatestRelease,isNewer,validateRelease,RELEASES}=require('../desktop/release-api.cjs');
function fixture(t,{packaged=true,dir,clock=()=>1000,language='zh-CN'}={}){
  if(!dir){dir=fs.mkdtempSync(path.join(os.tmpdir(),'apollo-notify-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));}
  const handlers=new Map(),dialogs=[],opened=[];let busy=false,response=1,info={version:'0.6.1',releaseNotes:'<p>修复连接</p><ul><li>新增通知</li></ul>'},show;
  const source={fetch:async()=>info||{version:'0.6.0'}};
  const manager=registerUpdates({app:{isPackaged:packaged,getVersion:()=> '0.6.0',getPath:()=>dir},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},dialog:{showMessageBox:async(_window,options)=>{dialogs.push(options);return show?await show():{response};}},getWindow:()=>({isDestroyed:()=>false,isVisible:()=>true}),isBusy:()=>busy,fetchRelease:()=>source.fetch(),getLanguage:async()=>language,openExternal:async url=>opened.push(url),now:clock,schedule:false});
  t.after(()=>manager.close());
  return {dir,handlers,source,manager,dialogs,opened,call:name=>handlers.get('update:'+name)(),busy:value=>{busy=value;},response:value=>{response=value;},info:value=>{info=value;},show:fn=>{show=fn;}};
}
test('new releases show notes and explicit browser download, with no install endpoint',async t=>{
  const f=fixture(t);assert.equal(f.handlers.has('update:install'),false);
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
test('release metadata cannot supply external URLs and invalid versions never become download URLs',async t=>{
  const f=fixture(t);f.info({version:'0.6.1',releaseUrl:'https://evil.invalid',releaseNotes:'<a href="https://evil.invalid">Update</a>'});await f.manager.check();await f.call('download');assert.equal(f.opened[0],'https://github.com/Acromare/ApolloCode/releases/tag/v0.6.1');f.info({version:'../../evil'});await f.manager.check();assert.equal(f.manager.state().status,'error');await f.call('download');assert.equal(f.opened[1],f.opened[0]);
});
test('current versions and network errors stay quiet; development never checks or downloads',async t=>{
  const f=fixture(t);f.info(null);await f.manager.check();assert.equal(f.manager.state().status,'current');assert.equal(f.dialogs.length,0);f.source.fetch=async()=>{throw Error('Network unavailable');};await f.manager.check();assert.equal(f.manager.state().status,'error');assert.equal(f.dialogs.length,0);await f.call('download');assert.deepEqual(f.opened,[RELEASES]);
  const dev=fixture(t,{packaged:false});dev.source.fetch=()=>assert.fail('Development should not check');await dev.call('check');await dev.call('download');assert.equal(dev.manager.state().status,'development');assert.equal(dev.opened.length,0);
});

const publicRelease=version=>({tag_name:'v'+version,draft:false,prerelease:false,body:'Release notes',assets:[{name:'Apollo-Code-Setup-'+version+'-x64.exe',size:123}]});
test('stable metadata requires a real installer and versions are compared numerically',()=>{
  assert.equal(validateRelease(publicRelease('0.7.0')).version,'0.7.0');
  assert.equal(isNewer('0.10.0','0.7.0'),true);assert.equal(isNewer('0.7.0','0.7.0'),false);assert.equal(isNewer('0.6.1','0.7.0'),false);
  for(const patch of [{prerelease:true},{draft:true},{tag_name:'v0.7.0-beta'},{assets:[]},{tag_name:'../../evil'}])assert.throws(()=>validateRelease({...publicRelease('0.7.0'),...patch}),{code:'UPDATE_METADATA'});
});
test('stalled Chromium request falls back without disabling certificate validation',async()=>{
  let aborted=false;
  const result=await fetchLatestRelease({electronFetch:(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));})),nodeFetch:async()=>publicRelease('0.7.0'),fallbackDelayMs:5,timeoutMs:100});
  assert.equal(result.version,'0.7.0');assert.equal(aborted,true);
});
test('two stalled transports are bounded, aborted, and a later retry can succeed',async()=>{
  let aborted=false;
  await assert.rejects(fetchLatestRelease({nodeFetch:(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));})),timeoutMs:15}),{code:'UPDATE_TIMEOUT'});
  assert.equal(aborted,true);assert.equal((await fetchLatestRelease({nodeFetch:async()=>publicRelease('0.7.0')})).version,'0.7.0');
});
test('rate limiting is exposed for a helpful localized recovery message',async()=>{
  await assert.rejects(fetchLatestRelease({nodeFetch:async()=>{throw Object.assign(Error('rate limited'),{code:'UPDATE_RATE_LIMIT'});}}),{code:'UPDATE_RATE_LIMIT'});
});
test('concurrent manual check waits for the active request and shows localized notification',async t=>{
  const f=fixture(t,{language:'en-US'});let resolve,count=0;f.source.fetch=()=>{count++;return new Promise(r=>{resolve=r;});};
  const a=f.manager.check(),b=f.call('check');assert.equal(f.manager.state().status,'checking');resolve({version:'0.7.0'});
  const results=await Promise.all([a,b]);assert.equal(count,1);assert.ok(results.every(s=>s.status==='available'));assert.equal(f.dialogs.length,1);assert.equal(f.dialogs[0].buttons[0],'Download update');
});
