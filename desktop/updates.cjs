const fs=require('node:fs'),path=require('node:path');
const repository={provider:'github',owner:'Acromare',repo:'ApolloCode'};
const DAY=24*60*60*1000;
function releaseNotes(value){
  const text=Array.isArray(value)?value.map(item=>item.note||'').join('\n'):String(value||'');
  return text.replace(/<br\s*\/?\s*>|<\/p>|<\/li>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim().slice(0,2500);
}
function registerUpdates({app,ipcMain,dialog,getWindow,isBusy,updater,openExternal,now=Date.now,schedule=true}){
  let state={status:app.isPackaged?'idle':'development',version:app.getVersion()},pending=false,showing=false;
  const shown=new Map(),timers=[];
  const file=path.join(app.getPath('userData'),'update-notifications.json');
  let reminder={};try{reminder=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
  const set=patch=>{state={...state,...patch};};
  function snooze(version){
    reminder={version,remindAfter:now()+DAY};fs.mkdirSync(path.dirname(file),{recursive:true});
    const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(reminder));fs.renameSync(temp,file);
  }
  async function download(){
    if(!app.isPackaged)return {...state};
    if(state.status!=='available'||!state.releaseUrl)throw new Error('请先检查可用更新。');
    // URL is constructed locally, never accepted from release notes or IPC.
    await openExternal(state.releaseUrl);return {...state};
  }
  async function notify(force=false){
    if(state.status!=='available'||showing||(!force&&isBusy()))return;
    const window=getWindow();if(!window||window.isDestroyed?.()||(!force&&window.isVisible?.()===false))return;
    const version=state.available,url=state.releaseUrl,notes=state.releaseNotes;
    if(!force&&((shown.get(version)||0)>now()||(reminder.version===version&&reminder.remindAfter>now())))return;
    showing=true;shown.set(version,now()+DAY);
    try{
      const result=await dialog.showMessageBox(window,{type:'info',title:'Apollo Code 版本更新',message:'Apollo Code '+version+' 已发布',detail:'当前版本：'+state.version+'\n\n'+(notes||'新版本已发布，点击下载更新查看版本内容与安装包。')+'\n\n点击下载更新将打开浏览器。稍后提醒会在 24 小时后再次提示。',buttons:['下载更新','稍后提醒'],defaultId:1,cancelId:1,noLink:true});
      snooze(version);
      if(result.response===0)await openExternal(url);
    }finally{showing=false;}
  }
  if(app.isPackaged){
    updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowPrerelease=false;
    updater.setFeedURL(repository);
    updater.on('update-available',info=>{
      if(!/^\d+\.\d+\.\d+$/.test(String(info.version))){set({status:'error',error:'更新版本格式无效。'});return;}
      set({status:'available',available:info.version,releaseNotes:releaseNotes(info.releaseNotes),releaseUrl:'https://github.com/Acromare/ApolloCode/releases/tag/v'+info.version,error:undefined});
    });
    updater.on('update-not-available',()=>set({status:'current',available:undefined,releaseNotes:undefined,releaseUrl:undefined,error:undefined}));
    updater.on('error',error=>set({status:'error',error:String(error.message).slice(0,500)}));
  }
  async function check(force=false){
    if(!app.isPackaged)return {...state};
    if(pending)return {...state};
    pending=true;set({status:'checking',error:undefined});
    try{await updater.checkForUpdates();}
    catch(error){set({status:'error',error:String(error.message).slice(0,500)});}
    finally{pending=false;}
    try{await notify(force);}catch(error){set({error:String(error.message).slice(0,500)});}
    return {...state};
  }
  ipcMain.handle('update:state',()=>({...state}));
  ipcMain.handle('update:check',()=>check(true));
  ipcMain.handle('update:download',()=>download());
  if(app.isPackaged&&schedule){
    timers.push(setTimeout(()=>void check(),10000),setInterval(()=>void check(),6*60*60*1000),setInterval(()=>void notify().catch(()=>{}),60000));
    for(const timer of timers)timer.unref();
  }
  const close=()=>{for(const timer of timers)clearTimeout(timer);};app.once?.('before-quit',close);
  return {state:()=>({...state}),check,notify,close};
}
module.exports={registerUpdates,repository,releaseNotes};
