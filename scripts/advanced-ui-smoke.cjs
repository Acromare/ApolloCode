const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerRuntime}=require('../desktop/runtime-ipc.cjs');
const work=path.join(__dirname,'../work'),temp=fs.mkdtempSync(path.join(work,'advanced-ui-'));app.setPath('userData',temp);
let win,runtime,release,firstStarted=false,turns=0;const bodies=[],approvals=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  try{
    const config={provider:'openai',baseUrl:'https://example.invalid/v1',model:'test-model',apiKey:'test-key',apiMode:'auto',projectRoot:temp};
    fs.writeFileSync(path.join(temp,'sample.txt'),'original\r\n');
    runtime=registerRuntime({app,ipcMain,dialog:{showMessageBox:async(_,o)=>{approvals.push(o.detail);return {response:1};}},getWindow:()=>win,readConfig:()=>config,saveConfig:()=>{},skillDir:path.join(temp,'skills')});
    runtime.fetcher=async(_,options)=>{
      const body=JSON.parse(options.body);bodies.push(body);turns++;let delta;
      if(turns===1){firstStarted=true;await new Promise(r=>release=r);delta={tool_calls:[{index:0,id:'edit',function:{name:'apply_patch',arguments:JSON.stringify({patch:'*** Begin Patch\n*** Update File: sample.txt\n@@\n-original\n+verified\n*** End Patch'})}}]};}
      else delta={content:'Verified completion'};
      return new Response('data: '+JSON.stringify({choices:[{delta}]})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
    };
    ipcMain.handle('config:get',()=>config);ipcMain.handle('project:get',()=>({root:temp,selected:true}));ipcMain.handle('chat:send',(_,payload)=>runtime.chat(payload));
    win=new BrowserWindow({show:false,width:1440,height:960,webPreferences:{preload:path.join(__dirname,'../desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    const errors=[];win.webContents.on('console-message',e=>{if(e.level>=3)errors.push(e.message);});
    const js=code=>win.webContents.executeJavaScript(code).catch(error=>{console.error('JS failed:',code);throw error;});
    const until=async check=>{const end=Date.now()+10000;while(!await check()){if(Date.now()>end)throw new Error('Timed out waiting for UI');await delay(50);}};
    const nav=async page=>{await js(`document.querySelector('.sidebar nav button[data-page="${page}"]').click()`);await delay(150);};
    const input=async(selector,value)=>{await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(80);};
    const button=async text=>js(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(text)}).click()`);
    const capture=async name=>{await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await delay(800);fs.writeFileSync(path.join(work,name+'.png'),(await win.webContents.capturePage()).toPNG());};
    await win.loadFile(path.join(__dirname,'../dist/index.html'));await delay(500);
    await js("document.querySelector('.theme-toggle').click()");await until(()=>js("document.documentElement.dataset.theme==='light'&&!document.querySelector('.theme-toggle').disabled"));await js("document.querySelector('.theme-toggle').click()");await until(()=>js("document.documentElement.dataset.theme==='eclipse'&&!document.querySelector('.theme-toggle').disabled"));
    assert.ok(await js("document.querySelector('.effort-picker').getBoundingClientRect().width>40"),'Reasoning control stays visible');
    assert.ok(await js("document.querySelector('.model-pill').getBoundingClientRect().width>80"),'Model name stays visible');
    await capture('glass-home-acceptance');
    await input('.composer textarea','Edit sample');await js("document.querySelector('.send').click()");await until(()=>firstStarted);
    assert.equal(await js("document.querySelector('.composer textarea').disabled"),false);
    await js("document.querySelector('.pause-run').click()");await until(()=>js("document.querySelector('.run-controls').dataset.state==='pausing'"));release();
    await until(()=>js("document.querySelector('.run-controls').dataset.state==='paused'"));
    assert.equal(fs.readFileSync(path.join(temp,'sample.txt'),'utf8'),'original\r\n','Pause blocks pending file mutation');
    await capture('glass-paused-acceptance');
    await input('.composer textarea','Check the result before finishing');await js("document.querySelector('.send').click()");await delay(100);
    assert.equal(await js("document.querySelector('.run-controls').dataset.state"),'paused','Steering does not silently resume');
    await js("document.querySelector('.pause-run').click()");await until(()=>js("!document.querySelector('.run-controls')"));
    assert.equal(fs.readFileSync(path.join(temp,'sample.txt'),'utf8'),'verified\r\n','Mutation preserves Windows line endings');
    const messages=bodies[1].messages,tool=messages.findIndex(m=>m.role==='tool'),steer=messages.findIndex(m=>m.content==='Check the result before finishing');assert.ok(tool>=0&&steer>tool);
    assert.match(await js("document.querySelector('.messages').textContent"),/Verified completion/);
    await runtime.saveSettings({historyRecall:true});runtime.journal.sync([{id:'fts',title:'日月同辉',project:temp,messages:[{role:'user',content:'透明毛玻璃输入框'}]}]);assert.equal(runtime.journal.search('毛玻璃输入框',temp).engine,'sqlite-fts5-trigram');
    await nav('Automation');await button('定时任务');await delay(150);await button('新建定时任务');await delay(100);
    await input('.editor-form input','UI schedule');await input('.editor-form textarea','Inspect only');await button('保存');await until(()=>js("!!document.querySelector('.schedule-card')"));
    assert.equal(runtime.scheduler.state().jobs[0].enabled,false);
    await button('立即执行');await until(()=>js("!!document.querySelector('.schedule-result')"));assert.match(await js("document.querySelector('.schedule-result').textContent"),/Verified completion/);assert.ok(approvals.some(p=>p.includes('UI schedule')));
    await nav('Home');assert.match(await js("document.querySelector('.notice').textContent"),/UI schedule/,'Schedule result reaches main UI');
    await nav('Settings');await button('执行');await delay(100);assert.ok(await js("!!document.querySelector('.settings-content select')"));
    await nav('Workspace');assert.match(await js("document.querySelector('.workspace-page').textContent"),/子任务工作树/);
    assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: Electron pause/resume, steering ordering, CRLF patch, FTS5, scheduler form/approval/results/global notice, execution settings and worktree review entry');
    await runtime.close();win.destroy();app.exit(0);
  }catch(error){console.error(error);release?.();await runtime?.close();win?.destroy();app.exit(1);}
});
