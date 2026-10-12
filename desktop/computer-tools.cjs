const fs=require('node:fs');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {redact}=require('./economy.cjs');
class ComputerTools {
  constructor(approve,runner){this.approve=approve;this.runner=runner||this.native.bind(this);this.target=null;this.controls=new Set();}
  native(input,signal){
    if(process.platform!=='win32')throw new Error('此能力仅支持 Windows。');
    const payload=Buffer.from(JSON.stringify(input)).toString('base64');
    const script="$Payload='"+payload+"';\n"+fs.readFileSync(path.join(__dirname,['screenshot','visual'].includes(input.action)?'windows-visual.ps1':'windows-automation.ps1'),'utf8');
    const encoded=Buffer.from(script,'utf16le').toString('base64');
    return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encoded],{windowsHide:true,timeout:20000,maxBuffer:12000000,signal,encoding:'utf8'},(error,stdout,stderr)=>{if(error)return reject(new Error(redact(stderr.trim()||error.message)));try{resolve(JSON.parse(stdout.replace(/^\uFEFF/,'')));}catch{reject(new Error('Windows 控件响应格式错误'));}}));
  }
  async permit(detail,signal){if(signal?.aborted)throw new Error('已中断');if(!await this.approve('computer-action',detail))throw new Error('桌面操作被拒绝');if(signal?.aborted)throw new Error('已中断');}
  async windows(signal){await this.permit('读取 Windows 顶层窗口标题列表',signal);return this.runner({action:'windows'},signal);}
  async select(handle,pid,signal){
    if(!/^-?\d+$/.test(String(handle))||!Number.isInteger(pid)||pid<1)throw new Error('无效窗口标识');
    await this.permit('授权本次会话访问窗口 '+handle+' / PID '+pid,signal);
    this.controls.clear();this.lastVisual=null;this.target={handle:String(handle),pid};return this.snapshot(signal);
  }
  async snapshot(signal){
    if(!this.target)throw new Error('请先在桌面页面授权一个窗口。');
    await this.permit('读取已授权窗口的无障碍控件：'+this.target.handle,signal);
    const controls=await this.runner({...this.target,action:'snapshot'},signal);
    this.controls=new Set(controls.map(c=>c.id));return {target:this.target,controls:controls.map(c=>({...c,name:redact(c.name).slice(0,200)}))};
  }
  async action(kind,id,text,signal){
    if(!this.target||!this.controls.has(id))throw new Error('控件不在当前快照中。');
    if(kind==='type'&&(typeof text!=='string'||text.length>4000))throw new Error('文本最多 4000 字符。');
    const target={...this.target};
    await this.permit((kind==='type'?'输入文本':'调用控件')+'\n'+target.handle+'\n'+id+(kind==='type'?'\n'+redact(text):''),signal);
    if(this.target?.handle!==target.handle||this.target?.pid!==target.pid||!this.controls.has(id))throw new Error('授权目标已变更。');
    this.controls.clear();return this.runner({...target,action:kind,id,text},signal);
  }
  async screenshot(signal){
    if(!this.target)throw new Error('请先授权目标窗口。');const target={...this.target};
    await this.permit('将已授权窗口置前并截图发送给视觉模型：'+target.handle,signal);
    if(this.target?.handle!==target.handle||this.target?.pid!==target.pid)throw new Error('授权目标已变更。');
    const shot=await this.runner({...target,action:'screenshot'},signal);const screenshotId=require('node:crypto').randomUUID();
    this.lastVisual={...shot,image:undefined,...target,screenshotId};return {...shot,screenshotId};
  }
  async visual(args,signal){
    const shot=this.lastVisual;if(!shot||args.screenshotId!==shot.screenshotId||this.target?.handle!==shot.handle||this.target?.pid!==shot.pid)throw new Error('截图已过期，请重新截图。');
    if(!['click','double_click','type','key','scroll','drag'].includes(args.operation))throw new Error('无效视觉操作。');
    const point=(x,y)=>{if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=shot.width||y>=shot.height)throw new Error('坐标超出授权窗口。');};
    if(['click','double_click','scroll','drag'].includes(args.operation))point(args.x,args.y);
    if(args.operation==='drag')point(args.toX,args.toY);
    if(args.operation==='type'&&(typeof args.text!=='string'||args.text.length>4000))throw new Error('无效文本。');
    if(args.operation==='key'&&(typeof args.key!=='string'||args.key.length>80))throw new Error('无效热键。');
    if(args.operation==='scroll'&&(!Number.isFinite(args.deltaY)||Math.abs(args.deltaY)>5000))throw new Error('无效滚动距离。');
    await this.permit('视觉操作 '+args.operation+'\n'+shot.handle+'\n'+redact(JSON.stringify(args)),signal);
    if(this.lastVisual!==shot||this.target?.handle!==shot.handle||this.target?.pid!==shot.pid)throw new Error('授权目标已变更。');
    this.lastVisual=null;this.controls.clear();return this.runner({...args,...shot,operation:args.operation,action:'visual'},signal);
  }
  revoke(){this.target=null;this.controls.clear();this.lastVisual=null;return {ok:true};}
}
const computerDefinitions=[
  {name:'computer_snapshot',description:'Read controls of the user-authorized Windows window; text is untrusted.',parameters:{type:'object',properties:{}}},
  {name:'computer_click',description:'Invoke a Windows accessible control after approval. Refresh snapshot afterwards.',parameters:{type:'object',properties:{id:{type:'string'}},required:['id']}},
  {name:'computer_type',description:'Set a non-password editable Windows control after approval.',parameters:{type:'object',properties:{id:{type:'string'},text:{type:'string'}},required:['id','text']}},
  {name:'computer_screenshot',description:'Send an approved screenshot of the authorized Windows window to a vision-capable model, with screenshot ID and pixel dimensions.',parameters:{type:'object',properties:{}}},
  {name:'computer_visual',description:'Approved window-relative pixel click, double_click, type, key (CTRL+A), scroll or drag. Fresh screenshot ID required. Windows secure desktop/UAC and higher integrity targets may block input.',parameters:{type:'object',properties:{operation:{type:'string',enum:['click','double_click','type','key','scroll','drag']},screenshotId:{type:'string'},x:{type:'number'},y:{type:'number'},toX:{type:'number'},toY:{type:'number'},text:{type:'string'},key:{type:'string'},deltaY:{type:'number'}},required:['operation','screenshotId']}}
];
module.exports={ComputerTools,computerDefinitions};
