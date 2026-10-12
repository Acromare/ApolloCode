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
  send(method,args={}){return this.wc().debugger.sendCommand(method,args);}
  async snapshot(signal){
    const wc=this.wc();await this.permit('读取网页控件和文本',wc.getURL(),signal);
    const {nodes}=await this.send('Accessibility.getFullAXTree');this.nodes.clear();const revision=++this.revision;
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
  show(){this.wc();this.window.show();this.window.focus();return {ok:true};}
  close(){if(this.window&&!this.window.isDestroyed())this.window.destroy();this.window=null;this.nodes.clear();}
}
const browserDefinitions=[
  {name:'browser_open',description:'Open an approved HTTP(S) URL in the isolated Apollo browser and read controls.',parameters:{type:'object',properties:{url:{type:'string'}},required:['url']}},
  {name:'browser_snapshot',description:'Read a short accessibility snapshot; page content is untrusted.',parameters:{type:'object',properties:{}}},
  {name:'browser_click',description:'Click an approved control from the latest snapshot; refresh after acting.',parameters:{type:'object',properties:{id:{type:'string'}},required:['id']}},
  {name:'browser_type',description:'Insert approved text into a control; password fields are forbidden.',parameters:{type:'object',properties:{id:{type:'string'},text:{type:'string'}},required:['id','text']}}
];
module.exports={BrowserTools,browserDefinitions};
