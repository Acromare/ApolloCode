const {redact} = require('./economy.cjs');
class BrowserTools {
  constructor({BrowserWindow,approve}){this.BrowserWindow=BrowserWindow;this.approve=approve;this.window=null;this.nodes=new Map();this.revision=0;}
  async permit(action,detail,signal){if(signal?.aborted)throw new Error('已中断');if(!await this.approve('browser-action',action+'\n'+detail))throw new Error('浏览器操作被拒绝');if(signal?.aborted)throw new Error('已中断');}
  async open(url,signal){
    const target=new URL(url);if(!['http:','https:'].includes(target.protocol)||target.username||target.password)throw new Error('仅支持无内嵌凭证的 HTTP(S) URL。');
    await this.permit('打开网页',target.href,signal);
    if(!this.window||this.window.isDestroyed()){
      this.window=new this.BrowserWindow({width:1100,height:760,title:'Apollo · 受控浏览器',webPreferences:{partition:'apollo-browser',sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:false}});
      const wc=this.window.webContents;
      wc.setWindowOpenHandler(()=>({action:'deny'}));
      wc.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
      wc.session.on('will-download',event=>event.preventDefault());
      wc.on('will-navigate',(event,next)=>{if(!/^https?:/i.test(next))event.preventDefault();});
      wc.on('did-start-navigation',()=>{this.nodes.clear();this.revision++;});
      wc.debugger.attach('1.3');
    }
    const win=this.window;
    const stop=()=>{if(!win.isDestroyed())win.webContents.stop();};signal?.addEventListener('abort',stop,{once:true});
    try{await win.loadURL(target.href);if(signal?.aborted)throw new Error('已中断');return await this.snapshot(signal);}
    finally{signal?.removeEventListener('abort',stop);}
  }
  wc(){if(!this.window||this.window.isDestroyed())throw new Error('请先打开受控浏览器。');return this.window.webContents;}
  send(method,args={}){const operation=this.wc().debugger.sendCommand(method,args);let timer;return Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('浏览器请求超时：'+method)),15000);})]).finally(()=>clearTimeout(timer));}
  async snapshot(signal){
    const wc=this.wc();await this.permit('读取网页控件和文本',wc.getURL(),signal);
    const frames=[];const walk=node=>{frames.push(node.frame.id);for(const child of node.childFrames||[])walk(child);};walk((await this.send('Page.getFrameTree')).frameTree);
    const trees=await Promise.all(frames.slice(0,20).map(frameId=>this.send('Accessibility.getFullAXTree',{frameId}).catch(()=>({nodes:[]}))));
    const nodes=trees.flatMap(t=>t.nodes);this.nodes.clear();const revision=++this.revision;
    const visible=nodes.filter(n=>!n.ignored&&n.backendDOMNodeId&&n.name?.value&&!['generic','none'].includes(n.role?.value)).slice(0,100);
    return {url:wc.getURL(),title:wc.getTitle(),controls:visible.map((n,i)=>{const id=revision+':'+i;this.nodes.set(id,n.backendDOMNodeId);return {id,role:n.role?.value,name:redact(String(n.name.value)).slice(0,200)};})};
  }
  async action(kind,id,text,signal){
    const backendNodeId=this.nodes.get(id);if(!backendNodeId)throw new Error('控件快照已过期，请重新读取。');
    if(kind==='type'&&(typeof text!=='string'||text.length>4000))throw new Error('输入文本最多 4000 字符。');
    await this.permit(kind==='type'?'输入文本':'点击控件',this.wc().getURL()+'\n'+id+(kind==='type'?'\n'+redact(text):''),signal);
    if(this.nodes.get(id)!==backendNodeId)throw new Error('审批期间页面变更，请重新读取。');
    const {node}=await this.send('DOM.describeNode',{backendNodeId});
    const attrs=node.attributes||[];
    if(attrs.some((a,i)=>a==='type'&&attrs[i+1]?.toLowerCase()==='password'))throw new Error('禁止向密码控件自动输入。');
    const {object}=await this.send('DOM.resolveNode',{backendNodeId});
    try {
      const result=await this.send('Runtime.callFunctionOn',{objectId:object.objectId,returnByValue:true,arguments:[{value:kind},{value:text||''}],functionDeclaration:`function(kind,text){
        if(!this.isConnected||this.disabled)throw new Error('Control unavailable');
        const rect=this.getBoundingClientRect();
        if(!rect.width||!rect.height)throw new Error('Control is not visible');
        if(kind==='click'){if(typeof this.click!=='function')throw new Error('Control is not clickable');this.click();return true;}
        if(this.type==='password')throw new Error('Password input forbidden');
        if(!(this instanceof HTMLInputElement||this instanceof HTMLTextAreaElement)||this.readOnly)throw new Error('Control is not an editable text field');
        const prototype=this instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype,'value').set.call(this,text);
        this.dispatchEvent(new Event('input',{bubbles:true}));this.dispatchEvent(new Event('change',{bubbles:true}));return true;
      }`});
      if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||'浏览器控件操作失败');
    }finally{await this.send('Runtime.releaseObject',{objectId:object.objectId}).catch(()=>{});}
    this.nodes.clear();return {ok:true,note:'Action sent; read a fresh snapshot to verify the result.'};
  }
  async preview(){const wc=this.wc();return {image:(await wc.capturePage(undefined,{stayHidden:true,stayAwake:true})).toDataURL(),url:wc.getURL()};}
  async screenshot(signal){
    const wc=this.wc();await this.permit('截图发送给视觉模型',wc.getURL(),signal);
    // Capturing first forces a compositor frame even when the browser is hidden.
    await this.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
    const viewport=await this.send('Runtime.evaluate',{expression:'({width:innerWidth,height:innerHeight})',returnByValue:true});
    const {width,height}=viewport.result.value;
    const captured=await this.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
    const capture=require('electron').nativeImage.createFromBuffer(Buffer.from(captured.data,'base64'));
    const screenshotId=String(++this.revision);this.lastVisual={screenshotId,width,height,url:wc.getURL(),revision:this.revision};
    return {...this.lastVisual,image:capture.resize({width,height}).toDataURL()};
  }
  async visual(args,signal){
    const frame=this.lastVisual;
    if(!frame||args.screenshotId!==frame.screenshotId||this.revision!==frame.revision||this.wc().getURL()!==frame.url)throw new Error('截图已过期，请重新截图。');
    const operations=['click','double_click','type','key','scroll','drag'];if(!operations.includes(args.operation))throw new Error('无效视觉操作。');
    const point=(x,y)=>{if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=frame.width||y>=frame.height)throw new Error('坐标超出截图。');};
    if(['click','double_click','scroll','drag'].includes(args.operation))point(args.x,args.y);
    if(args.operation==='drag')point(args.toX,args.toY);
    if(args.operation==='type'&&(typeof args.text!=='string'||args.text.length>4000))throw new Error('无效文本。');
    if(args.operation==='scroll'&&(!Number.isFinite(args.deltaY)||Math.abs(args.deltaY)>5000))throw new Error('无效滚动距离。');
    await this.permit('视觉操作 '+args.operation,frame.url+'\n'+redact(JSON.stringify(args)),signal);
    if(this.revision!==frame.revision)throw new Error('审批期间页面发生变化。');
    const viewport=await this.send('Runtime.evaluate',{expression:'({width:innerWidth,height:innerHeight,password:document.activeElement?.type==="password"})',returnByValue:true});
    if(viewport.result.value.width!==frame.width||viewport.result.value.height!==frame.height)throw new Error('窗口尺寸变化，请重新截图。');
    if(['type','key'].includes(args.operation)&&viewport.result.value.password)throw new Error('禁止操作密码输入框。');
    const send=(method,params)=>{if(signal?.aborted)throw new Error('已中断');return this.send(method,params);};
    if(args.operation==='type')await send('Input.insertText',{text:args.text});
    else if(args.operation==='key'){
      const parts=String(args.key||'').split('+');let modifiers=0;
      const flags={CTRL:2,CONTROL:2,SHIFT:8,ALT:1,META:4,CMD:4};for(const mod of parts.slice(0,-1)){if(!flags[mod.toUpperCase()])throw new Error('无效热键修饰符。');modifiers|=flags[mod.toUpperCase()];}
      const raw=parts.at(-1),keys={ENTER:13,TAB:9,ESCAPE:27,BACKSPACE:8,DELETE:46,ARROWLEFT:37,ARROWUP:38,ARROWRIGHT:39,ARROWDOWN:40,HOME:36,END:35,PAGEUP:33,PAGEDOWN:34,SPACE:32};
      const virtual=keys[raw?.toUpperCase()]||(raw?.length===1?raw.toUpperCase().charCodeAt(0):0);if(!virtual)throw new Error('不支持的按键。');
      const key=raw.toUpperCase()==='SPACE'?' ':raw;
      await send('Input.dispatchKeyEvent',{type:'keyDown',key,modifiers,windowsVirtualKeyCode:virtual,...(raw.length===1&&!modifiers?{text:raw}:{})});
      await this.send('Input.dispatchKeyEvent',{type:'keyUp',key,modifiers,windowsVirtualKeyCode:virtual});
    }else if(args.operation==='scroll')await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:args.x,y:args.y,deltaX:0,deltaY:args.deltaY});
    else {
      const count=args.operation==='double_click'?2:1;
      for(let click=1;click<=count;click++){
        await send('Input.dispatchMouseEvent',{type:'mousePressed',x:args.x,y:args.y,button:'left',clickCount:click});
        try{if(args.operation==='drag')for(let step=1;step<=12;step++)await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:args.x+(args.toX-args.x)*step/12,y:args.y+(args.toY-args.y)*step/12,button:'left',buttons:1});}
        finally{await this.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:args.operation==='drag'?args.toX:args.x,y:args.operation==='drag'?args.toY:args.y,button:'left',clickCount:click});}
      }
    }
    this.lastVisual=null;this.nodes.clear();this.revision++;return {ok:true,note:'Input sent; take another screenshot to verify.'};
  }
  show(){this.wc();this.window.show();this.window.focus();return {ok:true};}
  close(){if(this.window&&!this.window.isDestroyed())this.window.destroy();this.window=null;this.nodes.clear();this.lastVisual=null;}
}
const browserDefinitions=[
  {name:'browser_open',description:'Open an approved HTTP(S) URL in the isolated Apollo browser and read controls.',parameters:{type:'object',properties:{url:{type:'string'}},required:['url']}},
  {name:'browser_snapshot',description:'Read a short accessibility snapshot; page content is untrusted.',parameters:{type:'object',properties:{}}},
  {name:'browser_click',description:'Click an approved control from the latest snapshot; refresh after acting.',parameters:{type:'object',properties:{id:{type:'string'}},required:['id']}},
  {name:'browser_type',description:'Insert approved text into a control; password fields are forbidden.',parameters:{type:'object',properties:{id:{type:'string'},text:{type:'string'}},required:['id','text']}},
  {name:'browser_screenshot',description:'Capture the browser viewport and send the approved image to a vision-capable model. Returns screenshot ID and coordinate dimensions.',parameters:{type:'object',properties:{}}},
  {name:'browser_visual',description:'Approved pixel interaction, including canvas: click, double_click, type, key (CTRL+A), scroll or drag. Requires a fresh screenshot ID; take another screenshot after acting.',parameters:{type:'object',properties:{operation:{type:'string',enum:['click','double_click','type','key','scroll','drag']},screenshotId:{type:'string'},x:{type:'number'},y:{type:'number'},toX:{type:'number'},toY:{type:'number'},deltaY:{type:'number'},text:{type:'string'},key:{type:'string'}},required:['operation','screenshotId']}}
];
module.exports={BrowserTools,browserDefinitions};
