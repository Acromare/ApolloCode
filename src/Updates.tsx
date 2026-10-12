import React,{useEffect,useState} from 'react';
import {Download,RefreshCw} from 'lucide-react';
const labels:Record<string,string>={idle:'尚未检查',development:'开发模式不检查更新',checking:'检查中',current:'已是最新版本',available:'有新版本',downloading:'下载中',downloaded:'下载完成',error:'检查或下载失败'};
export function Updates(){
  const [state,setState]=useState<Awaited<ReturnType<typeof window.apollo.updates.state>>|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let disposed=false;const load=()=>void window.apollo.updates.state().then(s=>{if(!disposed)setState(s);}).catch(()=>{});load();const timer=setInterval(load,1000);return()=>{disposed=true;clearInterval(timer);};},[]);
  async function act(kind:'check'|'download'|'install'){setBusy(true);setError('');try{await window.apollo.updates[kind]();setState(await window.apollo.updates.state());}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <section className="update-controls"><h2>软件更新</h2><p>{state?.version} · {labels[state?.status||'idle']}{state?.available?' · '+state.available:''}{state?.status==='downloading'?' '+(state.percent||0)+'%':''}</p><button disabled={busy||!state||['development','checking','downloading','downloaded'].includes(state.status)} onClick={()=>void act('check')}><RefreshCw size={16}/>检查更新</button>{state?.status==='available'&&<button disabled={busy} onClick={()=>void act('download')}><Download size={16}/>下载更新</button>}{state?.status==='downloaded'&&<button disabled={busy} onClick={()=>void act('install')}><RefreshCw size={16}/>重启安装</button>}{(error||state?.error)&&<p role="alert">{error||state?.error}</p>}</section>;
}
