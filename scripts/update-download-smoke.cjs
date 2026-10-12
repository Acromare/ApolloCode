// Exercises the real updater using an isolated 0.5.0 app adapter. Never installs.
const {app}=require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {NsisUpdater}=require('electron-updater');
const {ElectronHttpExecutor}=require('electron-updater/out/electronHttpExecutor');
const publicFeed=process.argv.includes('--public');
const root=path.resolve(__dirname,'../work',publicFeed?'update-public-060':'update-local-060');
fs.mkdirSync(root,{recursive:true});app.setPath('userData',path.join(root,'electron'));
let server;
app.whenReady().then(async()=>{
  fs.mkdirSync(path.join(root,'userdata'),{recursive:true});
  const config=path.join(root,'app-update.yml');fs.writeFileSync(config,'updaterCacheDirName: apollo-isolated-update-qa\n');
  const adapter={version:'0.5.0',name:'Apollo isolated update QA',isPackaged:true,userDataPath:path.join(root,'userdata'),baseCachePath:path.join(root,'cache'),appUpdateConfigPath:config,whenReady:()=>app.whenReady(),onQuit:()=>{},quit:()=>{throw new Error('Installation forbidden in QA');},relaunch:()=>{throw new Error('Relaunch forbidden in QA');}};
  const updater=new NsisUpdater(undefined,adapter);updater.httpExecutor=new ElectronHttpExecutor();updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.disableDifferentialDownload=true;updater.disableWebInstaller=true;updater.logger={info:()=>{},warn:console.warn,error:console.error};
  const build=path.resolve(__dirname,'../release-0.6.0-final');
  if(publicFeed)updater.setFeedURL({provider:'github',owner:'Acromare',repo:'ApolloCode'});
  else{
    server=http.createServer((req,res)=>{const name=path.basename(new URL(req.url,'http://localhost').pathname);if(!['latest.yml','Apollo-Code-Setup-0.6.0-x64.exe','Apollo-Code-Setup-0.6.0-x64.exe.blockmap'].includes(name)){res.writeHead(404);res.end();return;}const file=path.join(build,name);res.setHeader('Content-Length',fs.statSync(file).size);fs.createReadStream(file).pipe(res);});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));updater.setFeedURL({provider:'generic',url:`http://127.0.0.1:${server.address().port}`});
  }
  let available=false,downloaded=false;updater.on('update-available',()=>available=true);updater.on('update-downloaded',()=>downloaded=true);
  const checked=await updater.checkForUpdates();assert.equal(checked.updateInfo.version,'0.6.0');assert.ok(available);
  const files=await updater.downloadUpdate();assert.ok(downloaded);assert.equal(files.length,1);
  const hash=file=>crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64');
  assert.equal(hash(files[0]),hash(path.join(build,'Apollo-Code-Setup-0.6.0-x64.exe')));
  const report={ok:true,from:'0.5.0',to:'0.6.0',source:publicFeed?'public GitHub Releases':'local real release feed',checks:['real NsisUpdater version detection','actual installer download','updater hash validation','independent SHA512 matches built installer'],installationVerified:false,scope:'Isolated version adapter; no installed user application or registry changed.'};
  fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}).then(()=>{server?.close();app.exit(0);}).catch(error=>{console.error(error);server?.close();app.exit(1);});
