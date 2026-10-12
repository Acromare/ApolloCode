const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {BrowserTools}=require('../desktop/browser-tools.cjs');
const {ComputerTools}=require('../desktop/computer-tools.cjs');
const {Vault}=require('../desktop/vault.cjs');
const work=path.join(__dirname,'../work');fs.mkdirSync(work,{recursive:true});const dir=fs.mkdtempSync(path.join(work,'visual-test-'));app.setPath('userData',dir);
let browser,server,native;
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
  try{
    const vault=new Vault(require('electron').safeStorage);const file=path.join(dir,'encrypted.json');fs.writeFileSync(file,JSON.stringify({apiKey:'native-vault-fixture'}));assert.equal(vault.read(file,{}).apiKey,'native-vault-fixture');assert.doesNotMatch(fs.readFileSync(file,'utf8'),/native-vault-fixture/);assert.equal(vault.read(file,{}).apiKey,'native-vault-fixture');
    server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(req.url==='/frame'?'<label>Frame input <input></label>':`<html><body style="margin:0;height:2400px"><canvas id="canvas" width="400" height="200" style="background:#ddd"></canvas><p id="result">ready</p><label>Name <input id="name"></label><label>Password <input type="password" id="password"></label><iframe src="/frame"></iframe><script>const canvas=document.getElementById('canvas');let down=false;canvas.addEventListener('mousedown',()=>down=true);canvas.addEventListener('mouseup',()=>{document.getElementById('result').textContent='canvas input verified';down=false});</script></body></html>`);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
    browser=new BrowserTools({BrowserWindow:class{constructor(options){return new BrowserWindow({...options,show:true});}},approve:async()=>true});
    const snapshot=await browser.open('http://127.0.0.1:'+server.address().port);assert.ok(snapshot.controls.some(c=>/Frame input/.test(c.name)),'Iframe controls must be included');
    console.log('VISUAL: browser loaded');let shot=await browser.screenshot();assert.match(shot.image,/^data:image\/png;base64,/);assert.ok(shot.width>400&&shot.height>200);console.log('VISUAL: browser screenshot captured');
    await browser.visual({operation:'drag',screenshotId:shot.screenshotId,x:40,y:40,toX:180,toY:100});assert.equal(await browser.wc().executeJavaScript("document.querySelector('#result').textContent"),'canvas input verified');
    await assert.rejects(browser.visual({operation:'click',screenshotId:shot.screenshotId,x:20,y:20}),/过期/);
    await browser.wc().executeJavaScript("document.querySelector('#name').focus()");shot=await browser.screenshot();await browser.visual({operation:'type',screenshotId:shot.screenshotId,text:'typed'});
    assert.equal(await browser.wc().executeJavaScript("document.querySelector('#name').value"),'typed');
    shot=await browser.screenshot();await browser.visual({operation:'key',screenshotId:shot.screenshotId,key:'CTRL+A'});shot=await browser.screenshot();await browser.visual({operation:'type',screenshotId:shot.screenshotId,text:'replaced'});assert.equal(await browser.wc().executeJavaScript("document.querySelector('#name').value"),'replaced');
    await browser.wc().executeJavaScript("document.querySelector('#password').focus()");shot=await browser.screenshot();await assert.rejects(browser.visual({operation:'type',screenshotId:shot.screenshotId,text:'secret'}),/密码/);
    shot=await browser.screenshot();await assert.rejects(browser.visual({operation:'click',screenshotId:shot.screenshotId,x:shot.width+1,y:20}),/超出/);
    console.log('VISUAL: browser actions verified');browser.close();
    native=spawn('powershell.exe',['-NoProfile','-STA','-File',path.join(__dirname,'native-fixture.ps1')],{windowsHide:true,env:{...process.env,APOLLO_VISUAL_TEST:'1'}});
    const target=await new Promise((resolve,reject)=>{let buffer='';const timer=setTimeout(()=>reject(new Error('Native fixture timed out')),10000);native.once('error',reject);native.stderr.on('data',chunk=>reject(new Error(chunk.toString())));native.stdout.on('data',chunk=>{buffer+=chunk;const line=buffer.split(/\r?\n/).find(l=>l.startsWith('{'));if(line){clearTimeout(timer);resolve(JSON.parse(line));}});});
    const computer=new ComputerTools(async()=>true);const initial=await computer.select(target.handle,target.pid);shot=await computer.screenshot();assert.ok(shot.width>300&&shot.height>150);assert.match(shot.image,/^data:image\/png;base64,/);
    fs.writeFileSync(path.join(work,'native-visual-preview.png'),Buffer.from(shot.image.split(',')[1],'base64'));
    // Coordinates are relative to the captured outer window (including the title bar).
    const input=initial.controls.find(c=>c.name==='ApolloInput').bounds,button=initial.controls.find(c=>c.name==='ApolloApply').bounds;
    await computer.visual({operation:'click',screenshotId:shot.screenshotId,x:Math.round(input.left+input.width/2-shot.left),y:Math.round(input.top+input.height/2-shot.top)});shot=await computer.screenshot();await computer.visual({operation:'type',screenshotId:shot.screenshotId,text:'pixel verified'});
    shot=await computer.screenshot();await computer.visual({operation:'click',screenshotId:shot.screenshotId,x:Math.round(button.left+button.width/2-shot.left),y:Math.round(button.top+button.height/2-shot.top)});
    const after=await computer.snapshot();assert.ok(after.controls.some(c=>c.name==='clicked pixel verified'),JSON.stringify(after));
    shot=await computer.screenshot();await assert.rejects(computer.visual({operation:'click',screenshotId:shot.screenshotId,x:-1,y:5}),/超出/);computer.revoke();await assert.rejects(computer.visual({operation:'click',screenshotId:shot.screenshotId,x:10,y:10}),/过期/);
    console.log('PASS: actual Windows DPAPI migration, browser vision/canvas drag/typing/hotkeys/iframe/password guard, and actual Windows screenshot/pixel click/Unicode typing/verification');
    native.kill();await new Promise(r=>server.close(r));app.exit(0);
  }catch(error){console.error(error);browser?.close();native?.kill();server?.close();app.exit(1);}
});
