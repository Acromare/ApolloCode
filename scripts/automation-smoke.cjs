const {app,BrowserWindow}=require('electron');
const http=require('node:http');
const assert=require('node:assert/strict');
const {BrowserTools}=require('../desktop/browser-tools.cjs');
const {ComputerTools}=require('../desktop/computer-tools.cjs');
let browser,server;
app.whenReady().then(async()=>{
  try {
    server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html><body><label>Name <input id="name"></label><button id="apply" onclick="document.getElementById(\'result\').textContent=document.getElementById(\'name\').value">Apply</button><p id="result"></p><label>Password <input type="password"></label></body></html>');});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    let approved=true;
    browser=new BrowserTools({BrowserWindow:class {constructor(options){return new BrowserWindow({...options,show:false});}},approve:async()=>approved});
    const url='http://127.0.0.1:'+server.address().port;
    let snapshot=await browser.open(url);
    const input=snapshot.controls.find(c=>c.role==='textbox'&&c.name==='Name '||c.role==='textbox'&&c.name==='Name');assert.ok(input,JSON.stringify(snapshot));
    await browser.action('type',input.id,'verified input');
    await assert.rejects(browser.action('type',input.id,'stale'),/过期/);
    snapshot=await browser.snapshot();const button=snapshot.controls.find(c=>c.role==='button'&&c.name==='Apply');assert.ok(button);
    await browser.action('click',button.id);await new Promise(r=>setTimeout(r,150));
    assert.equal(await browser.wc().executeJavaScript("document.getElementById('result').textContent"),'verified input');
    snapshot=await browser.snapshot();const password=snapshot.controls.find(c=>c.role==='textbox'&&(c.name==='Password'||c.name==='Password '));
    assert.ok(password);await assert.rejects(browser.action('type',password.id,'secret'),/密码/);
    approved=false;await assert.rejects(browser.open(url),/被拒绝/);
    const computer=new ComputerTools(async()=>true);const windows=await computer.windows();assert.ok(Array.isArray(windows));
    console.log('PASS: real Electron browser open/snapshot/type/click, password block, stale ID and approval rejection; native Windows UIA lists '+windows.length+' windows');
    browser.close();await new Promise(resolve=>server.close(resolve));app.exit(0);
  }catch(error){console.error(error);browser?.close();server?.close();app.exit(1);}
});
