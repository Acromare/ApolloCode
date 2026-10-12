const repository={provider:'github',owner:'Acromare',repo:'ApolloCode'};
function registerUpdates({app,ipcMain,dialog,getWindow,isBusy,updater}){
  let state={status:app.isPackaged?'idle':'development',version:app.getVersion()},pending=false;
  const set=patch=>{state={...state,...patch};};
  if(app.isPackaged){
    updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowPrerelease=false;
    updater.setFeedURL(repository);
    updater.on('update-available',info=>set({status:'available',available:info.version,error:undefined}));
    updater.on('update-not-available',()=>set({status:'current',error:undefined}));
    updater.on('download-progress',info=>set({status:'downloading',percent:Math.round(info.percent)}));
    updater.on('update-downloaded',info=>set({status:'downloaded',available:info.version,percent:100}));
    updater.on('error',error=>set({status:'error',error:String(error.message).slice(0,500)}));
  }
  async function operation(kind){
    if(!app.isPackaged)return state;
    if(pending)throw new Error('更新操作正在进行。');
    if(kind==='download'&&state.status!=='available')throw new Error('请先检查可用更新。');
    pending=true;set({status:kind==='check'?'checking':'downloading',error:undefined});
    try{await (kind==='check'?updater.checkForUpdates():updater.downloadUpdate());}
    catch(error){set({status:'error',error:String(error.message).slice(0,500)});}
    finally{pending=false;}return {...state};
  }
  ipcMain.handle('update:state',()=>({...state}));
  ipcMain.handle('update:check',()=>operation('check'));
  ipcMain.handle('update:download',async()=>{
    if(!app.isPackaged)return state;
    const result=await dialog.showMessageBox(getWindow(),{type:'question',message:'下载 Apollo Code '+(state.available||'')+'？',detail:'来源：github.com/Acromare/ApolloCode Releases',buttons:['取消','下载'],defaultId:0,cancelId:0});
    return result.response===1?operation('download'):{...state};
  });
  ipcMain.handle('update:install',async()=>{
    if(state.status!=='downloaded')throw new Error('请先下载更新。');
    if(isBusy())throw new Error('请先停止当前 Agent 或工作流。');
    const result=await dialog.showMessageBox(getWindow(),{type:'question',message:'退出并安装更新？',buttons:['取消','安装'],defaultId:0,cancelId:0});
    if(result.response===1){if(isBusy())throw new Error('请先停止当前任务。');updater.quitAndInstall(false,true);}return {...state};
  });
  if(app.isPackaged){const timer=setTimeout(()=>void operation('check').catch(()=>{}),10000);timer.unref();}
  return {state:()=>({...state})};
}
module.exports={registerUpdates,repository};
