const {execFile}=require('node:child_process'),path=require('node:path');
const {sanitize}=require('./hermes-sanitize.cjs');
function range(text,params={}){const lines=String(text).split('\n'),count=Math.max(1,Math.min(2000,params.count||40)),start=Math.max(0,Math.min(lines.length,params.start??Math.max(0,lines.length-count))),end=Math.min(lines.length,start+count);return {total_lines:lines.length,start,end,viewport_rows:count,cursor_row:lines.length-1,text:lines.slice(start,end).join('\n')};}
class HermesDesktop{
 constructor({runtime,getWindow,getConfig,getBridge}){Object.assign(this,{runtime,getWindow,getConfig,getBridge});this.pendingPreview=Promise.resolve();}
 async handleEvent(event){
  if(event.type==='preview.open'){
   const url=event.payload?.url||'';
   this.pendingPreview=this.runtime.browser.open(url,this.runtime.running?.signal).then(()=>{this.previewError=null;},error=>{this.previewError=error.message;});await this.pendingPreview;
  }
  if(event.type==='preview.close')this.runtime.browser.close();
 }
 async request(method,params){
  const signal=this.runtime.running?.signal;
  const finish=value=>({value:JSON.stringify(sanitize(value,[this.getConfig().apiKey,this.getBridge().backend.token]))});
  try{
   if(method==='terminal.read')return finish(range(this.getBridge().buffers.get(params.session_id)||'',params));
   if(method==='window.read'){
    if(process.platform!=='win32')return finish({error:'当前平台无法枚举窗口。',platform:process.platform});
    const win=this.getWindow();if(!win||win.isDestroyed())return finish({error:'Apollo 窗口已关闭。',platform:'win32'});
    const buffer=win.getNativeWindowHandle(),handle=buffer.length===8?buffer.readBigUInt64LE().toString():String(buffer.readUInt32LE());
    const value=await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'windows-window-below.ps1'),'-Handle',handle],{windowsHide:true,timeout:15000,encoding:'utf8'},(error,stdout)=>{if(error)return reject(new Error('无法读取窗口信息。'));try{resolve(JSON.parse(stdout.replace(/^\uFEFF/,'')));}catch{reject(new Error('窗口信息格式无效。'));}}));return finish(value);
   }
   if(method==='preview.read'){
    await this.pendingPreview;if(this.previewError)throw new Error(this.previewError);
    const browser=this.runtime.browser,wc=browser.wc();await browser.permit('读取预览网页的文本',wc.getURL(),signal);
    const result=await browser.send('Runtime.evaluate',{expression:'({text:document.body?.innerText||"",title:document.title,url:location.href})',returnByValue:true});
    return finish({...result.result.value,...range(result.result.value.text,params)});
   }
   if(method==='preview.act'){
    await this.pendingPreview;if(this.previewError)throw new Error(this.previewError);
    const browser=this.runtime.browser,action=params.action;
    if(action==='elements')return finish(await browser.snapshot(signal));
    if(action==='strobe')return finish(await browser.screenshot(signal));
    let ref=params.ref;
    if(params.selector){const {root}=await browser.send('DOM.getDocument');const {nodeId}=await browser.send('DOM.querySelector',{nodeId:root.nodeId,selector:params.selector});if(!nodeId)throw new Error('预览页面未找到目标控件。');const {node}=await browser.send('DOM.describeNode',{nodeId});ref='hermes-selector:'+node.backendNodeId;browser.nodes.set(ref,node.backendDOMNodeId||node.backendNodeId);}
    if(['click','type'].includes(action)){const result=await browser.action(action,ref,params.text,signal);if(params.submit)await this.request('preview.act',{...params,action:'press',key:'Enter',submit:false});return finish(result);}
    await browser.permit('预览操作 '+action,browser.wc().getURL(),signal);
    if(['back','forward','reload'].includes(action)){const wc=browser.wc();if(action==='reload')wc.reload();else if(action==='back'&&wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();else if(action==='forward'&&wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();return finish({success:true});}
    if(action==='press'){const frame=await browser.screenshot(signal);return finish(await browser.visual({operation:'key',screenshotId:frame.screenshotId,key:params.key},signal));}
    if(action==='scroll'){const frame=await browser.screenshot(signal);return finish(await browser.visual({operation:'scroll',screenshotId:frame.screenshotId,x:Math.floor(frame.width/2),y:Math.floor(frame.height/2),deltaY:params.to==='top'?-5000:params.to==='bottom'?5000:Math.max(-5000,Math.min(5000,params.amount||500))},signal));}
    if(action==='hover'){const nodeId=browser.nodes.get(ref);if(!nodeId)throw new Error('控件已过期，请重新读取。');const {model}=await browser.send('DOM.getBoxModel',{backendNodeId:nodeId});const box=model.content;await browser.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:(box[0]+box[4])/2,y:(box[1]+box[5])/2});return finish({success:true});}
    if(['pin','hold','unpin'].includes(action)){
     if(action==='unpin'&&!ref){await browser.send('Runtime.evaluate',{expression:'document.querySelectorAll("[data-apollo-annotation]").forEach(e=>{e.style.outline=e.dataset.apolloOldOutline||"";e.removeAttribute("data-apollo-annotation")})'});return finish({success:true});}
     let object;
     if(action==='hold'){const result=await browser.send('Runtime.evaluate',{expression:'document.body'});object=result.result;}
     else{const backendNodeId=browser.nodes.get(ref);if(!backendNodeId)throw new Error('控件已过期，请重新读取。');({object}=await browser.send('DOM.resolveNode',{backendNodeId}));}
     try{const result=await browser.send('Runtime.callFunctionOn',{objectId:object.objectId,returnByValue:true,arguments:[{value:action}],functionDeclaration:'function(action){if(!this.isConnected)return false;if(action==="unpin"){this.style.outline=this.dataset.apolloOldOutline||"";delete this.dataset.apolloAnnotation;}else{if(!this.dataset.apolloAnnotation)this.dataset.apolloOldOutline=this.style.outline;this.dataset.apolloAnnotation="true";this.style.outline="3px solid #5b8ff9";}return true;}'});return finish({success:result.result.value===true});}finally{await browser.send('Runtime.releaseObject',{objectId:object.objectId}).catch(()=>{});}
    }
    return finish({error:'此预览操作不可用。',action});
   }
  }catch(error){return finish({success:false,error:error.message});}
  return undefined;
 }
}
module.exports={HermesDesktop,range};
