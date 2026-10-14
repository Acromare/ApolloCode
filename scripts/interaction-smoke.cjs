const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {registerRuntime}=require('../desktop/runtime-ipc.cjs');
const work=path.join(__dirname,'../work');fs.mkdirSync(work,{recursive:true});
const temp=fs.mkdtempSync(path.join(work,'interaction-'));app.setPath('userData',temp);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let win,runtime,release;
const reports=[];
app.whenReady().then(async()=>{
  try{
    let config={provider:'openai',baseUrl:'https://example.invalid/v1',model:'fixture-model',apiKey:'test-key',apiMode:'responses',reasoningEffort:'auto',projectRoot:temp};
    runtime=registerRuntime({app,ipcMain,dialog:{showMessageBox:async()=>({response:1})},getWindow:()=>win,readConfig:()=>config,saveConfig:next=>{config=next;},skillDir:path.join(temp,'skills')});
    ipcMain.handle('config:get',()=>config);
    ipcMain.handle('config:save',(_,next)=>{config={...config,...next};return {ok:true};});
    ipcMain.handle('project:get',()=>({root:temp,selected:true}));
    ipcMain.handle('connection:models',()=>({ok:true,models:['fixture-model','second-model','third-model']}));
    ipcMain.handle('chat:send',async(_,payload)=>{
      const event=e=>win.webContents.send('runtime:event',{...e,requestId:payload.requestId,time:Date.now()});
      let text='';
      for(let i=0;i<100;i++){
        text+='Line '+i+' continues the streamed answer.\n\n';
        event({type:'reasoning_summary',text:'Summary '+i+'. '});
        event({type:'delta',text:'Line '+i+' continues the streamed answer.\n\n'});
        await delay(8);
      }
      await new Promise(resolve=>{release=resolve;});
      return {ok:true,content:text};
    });
    win=new BrowserWindow({show:false,width:1440,height:960,webPreferences:{preload:path.join(__dirname,'../desktop/preload.cjs'),contextIsolation:true,sandbox:true,backgroundThrottling:false}});
    const errors=[];win.webContents.on('console-message',event=>{if(event.level>=3)errors.push(event.message);});
    win.webContents.debugger.attach('1.3');
    const js=code=>win.webContents.executeJavaScript(code);
    const until=async check=>{const end=Date.now()+10000;while(!await check()){if(Date.now()>end)throw new Error('Timed out waiting for interaction');await delay(40);}};
    const nav=async page=>{await js(`document.querySelector('.sidebar nav button[data-page="${page}"]').click()`);await delay(100);};
    const click=async selector=>{await js(`document.querySelector(${JSON.stringify(selector)}).click()`);await delay(160);};
    const key=async value=>{const keys={Home:['Home',36],End:['End',35],Return:['Enter',13],Escape:['Escape',27],Tab:['Tab',9],Down:['ArrowDown',40]};const [name,code]=keys[value];const event={key:name,code:name,windowsVirtualKeyCode:code};await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',...event});await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',...event});await delay(100);};
    const setInput=async(selector,value)=>{await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(80);};
    const capture=async name=>{await delay(180);fs.writeFileSync(path.join(work,name+'.png'),(await win.webContents.capturePage()).toPNG());};
    const inViewport=selector=>js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`);
    await win.loadFile(path.join(__dirname,'../dist/index.html'));await delay(400);
    await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
    console.log('Loaded interaction fixture');

    await click('.permission-picker');
    assert.equal(await js("document.activeElement.getAttribute('aria-checked')"),'true','Open focuses current mode');
    await key('Home');assert.match(await js('document.activeElement.textContent'),/Chat/,'Home focuses first option');await key('Return');
    await until(()=>Promise.resolve(runtime.settings().mode==='chat'));
    assert.equal(await js("document.activeElement.classList.contains('permission-picker')"),true,'Selection returns focus');
    await click('.permission-picker');await key('End');await key('Escape');
    assert.equal(runtime.settings().mode,'chat','Escape does not commit the focused option');
    assert.equal(await js("document.activeElement.classList.contains('permission-picker')"),true);
    await click('.permission-picker');await key('Tab');
    assert.equal(await js("!!document.querySelector('.choice-popover')"),false,'Tab closes the menu');
    assert.equal(await js("document.activeElement.classList.contains('effort-picker')"),true,'Tab follows composer order');
    await click('.effort-picker');await key('End');await key('Return');
    await until(()=>Promise.resolve(config.reasoningEffort==='xhigh'));
    await click('.model-pill');assert.equal(await js("document.activeElement.tagName"),'INPUT');
    await setInput('.model-menu-search input','second');await key('Down');await key('Return');
    await until(()=>Promise.resolve(config.model==='second-model'));
    console.log('Keyboard selection verified');
    assert.equal(await js("document.activeElement.classList.contains('model-pill')"),true);
    await win.reload();await delay(400);
    assert.match(await js("document.querySelector('.effort-picker').textContent"),/极高/);
    assert.match(await js("document.querySelector('.model-pill').textContent"),/second-model/);
    assert.match(await js("document.querySelector('.permission-picker').textContent"),/仅对话/);

    for(let i=0;i<6;i++){
      runtime.journal.start('task-'+i,'history',temp,'Review layout '+i);
      runtime.journal.finish('task-'+i,{status:'interrupted',text:'Stopped for review'});
    }
    for(const theme of ['dark','light','eclipse']){
      await js(`document.documentElement.dataset.theme='${theme}'`);
      for(const [width,height] of [[900,600],[1440,960],[1920,1080]]){
        win.setSize(width,height);await delay(160);await nav('Workspace');
        const layout=await js(`(()=>{const p=document.querySelector('.workspace-page'),tools=document.querySelector('.workspace-tools'),r=tools.getBoundingClientRect(),s=getComputedStyle(p);return {viewport:innerWidth,workspace:document.querySelector('.workspace').clientWidth,page:p.offsetWidth,available:p.clientWidth,content:r.width,left:r.left,right:r.right,padding:parseFloat(s.paddingLeft),overflow:p.scrollWidth>p.clientWidth}})()`);
        assert.equal(layout.page,layout.workspace,'Workspace scroller fills the available area');
        assert.ok(layout.content>=Math.min(960,layout.available-60)-2,JSON.stringify(layout));
        assert.equal(layout.overflow,false,'Workspace has no horizontal overflow');
        assert.ok(layout.left>=0&&layout.right<=layout.viewport);
        await capture(`interaction-workspace-${theme}-${width}`);reports.push({theme,width,height,...layout});
        await nav('Home');await click('.permission-picker');
        assert.ok(await inViewport('.choice-popover'),'Mode menu fits viewport');
        assert.equal(await js("document.querySelectorAll('.choice-popover [aria-checked=true]').length"),1);
        await capture(`interaction-mode-${theme}-${width}`);await key('Escape');
        await click('.effort-picker');assert.ok(await inViewport('.choice-popover'),'Effort menu fits viewport');await key('Escape');
        await click('.model-pill');assert.ok(await inViewport('.model-menu'),'Model menu fits viewport');
        await capture(`interaction-model-${theme}-${width}`);await key('Escape');
      }
    }
    win.setFullScreen(true);await delay(200);await nav('Workspace');
    assert.equal(await js("document.querySelector('.workspace-page').offsetWidth===document.querySelector('.workspace').clientWidth"),true);
    await capture('interaction-workspace-fullscreen');win.setFullScreen(false);win.setSize(900,700);
    await nav('Home');await click('.permission-picker');win.setSize(1440,960);await delay(160);
    assert.equal(await js("!!document.querySelector('.choice-popover')"),false,'Resizing closes an anchored menu');
    await click('.effort-picker');await nav('Workspace');
    assert.equal(await js("!!document.querySelector('.choice-popover')"),false,'Navigation leaves no detached portal');

    const history=Array.from({length:60},(_,i)=>({role:i%2?'assistant':'user',content:i%2?'### Completed answer '+i+'\n\n'+Array(8).fill('A paragraph already rendered in history.').join('\n\n'):'Question '+i}));
    await js(`localStorage.setItem('apollo-code-chats-v2',${JSON.stringify(JSON.stringify([{id:'history',title:'Long history',updated:Date.now(),messages:history}]))});location.reload()`);await delay(400);
    await click('.sidebar-recents button');
    await setInput('.composer textarea','Start streaming');await click('.send');
    await until(()=>js("!!document.querySelector('.runtime-stream p')"));
    assert.ok(await js("(()=>{const e=document.querySelector('.messages');return e.scrollHeight-e.scrollTop-e.clientHeight<3})()"),'Output follows when already at bottom');
    await js("document.querySelector('.messages').scrollTop=0");await delay(100);
    await setInput('.composer textarea','Draft while the model answers');await delay(500);
    assert.equal(await js("document.querySelector('.messages').scrollTop"),0,'Streaming and typing preserve reading position');
    await until(()=>Promise.resolve(!!release));
    await js("document.querySelector('.messages').scrollTop=100000");await delay(100);release();release=null;
    await until(()=>js("!document.querySelector('.run-controls')"));
    assert.ok(await js("(()=>{const e=document.querySelector('.messages');return e.scrollHeight-e.scrollTop-e.clientHeight<3})()"),'Completed answer stays at bottom');
    assert.match(await js("document.querySelector('.messages').textContent"),/Line 99/,'No final chunks lost');

    await nav('Home');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await click('.permission-picker');assert.equal(await js("document.querySelector('.choice-popover').getAnimations().length"),0);await key('Escape');
    assert.equal(errors.length,0,errors.join('\n'));
    fs.writeFileSync(path.join(work,'interaction-report.json'),JSON.stringify({ok:true,reports},null,2));
    console.log('PASS: keyboard selection/cancel/Tab focus, persisted mode/model/effort, 9 theme/size layouts, fullscreen workspace, anchored menus, navigation/resize cleanup, long-history streaming/reading position and reduced motion');
    await runtime.close();win.destroy();app.exit(0);
  }catch(error){console.error(error);release?.();await runtime?.close();win?.destroy();app.exit(1);}
});
