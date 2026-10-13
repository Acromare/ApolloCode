const fs=require('node:fs'),path=require('node:path');
const {fetchLatestRelease,isNewer,RELEASES}=require('./release-api.cjs');
const DAY=24*60*60*1000;
function releaseNotes(value){
  const text=Array.isArray(value)?value.map(item=>item.note||'').join('\n'):String(value||'');
  return text.replace(/<br\s*\/?\s*>|<\/p>|<\/li>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim().slice(0,2500);
}
function registerUpdates({app,ipcMain,dialog,getWindow,isBusy,openExternal,fetchRelease=fetchLatestRelease,getLanguage=async()=> 'zh-CN',now=Date.now,schedule=true}){
  let state={status:app.isPackaged?'idle':'development',version:app.getVersion()},pending=null,showing=false;
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
    // Downloads stay reachable even when the release check is offline.
    await openExternal(state.releaseUrl||RELEASES);return {...state};
  }
  async function notify(force=false){
    if(!state.available||showing||(!force&&isBusy()))return;
    const window=getWindow();if(!window||window.isDestroyed?.()||(!force&&window.isVisible?.()===false))return;
    const version=state.available,url=state.releaseUrl,notes=state.releaseNotes;
    if(!force&&((shown.get(version)||0)>now()||(reminder.version===version&&reminder.remindAfter>now())))return;
    showing=true;
    try{
      const en=await getLanguage()==='en-US';
      const result=await dialog.showMessageBox(window,{type:'info',title:en?'Apollo Code update':'Apollo Code 版本更新',message:'Apollo Code '+version+(en?' is available':' 已发布'),detail:(en?'Current version: ':'当前版本：')+state.version+'\n\n'+(notes||(en?'A new release is ready. Open the release page to download the installer.':'新版本已发布，点击下载更新查看版本内容与安装包。'))+'\n\n'+(en?'Download opens your browser. Remind me later will notify you again in 24 hours.':'点击下载更新将打开浏览器。稍后提醒会在 24 小时后再次提示。'),buttons:en?['Download update','Remind me later']:['下载更新','稍后提醒'],defaultId:1,cancelId:1,noLink:true});
      shown.set(version,now()+DAY);snooze(version);
      if(result.response===0)await openExternal(url);
    }finally{showing=false;}
  }
  async function check(force=false){
    if(!app.isPackaged)return {...state};
    if(!pending){
      set({status:'checking',error:undefined,errorCode:undefined});
      pending=(async()=>{
        try{
          const info=await fetchRelease();
          if(isNewer(String(info.version),state.version))set({status:'available',available:info.version,releaseNotes:releaseNotes(info.releaseNotes),releaseUrl:'https://github.com/Acromare/ApolloCode/releases/tag/v'+info.version,error:undefined,errorCode:undefined});
          else set({status:'current',available:undefined,releaseNotes:undefined,releaseUrl:undefined,error:undefined,errorCode:undefined});
        }catch(error){set({status:'error',error:String(error.message).slice(0,500),errorCode:error.code||'UPDATE_NETWORK'});}
      })();
    }
    const request=pending;await request;if(pending===request)pending=null;
    try{await notify(force);}catch(error){set({error:String(error.message).slice(0,500),errorCode:'UPDATE_ACTION'});}
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
module.exports={registerUpdates,releaseNotes};
