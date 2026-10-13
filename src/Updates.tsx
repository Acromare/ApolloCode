import React,{useEffect,useState} from 'react';
import {Download,RefreshCw} from 'lucide-react';
import {useLanguage} from './i18n';
const labels:Record<string,string>={idle:'尚未检查',development:'开发模式不检查更新',checking:'检查中',current:'已是最新版本',available:'有新版本',error:'检查失败'};
export function Updates(){
  const {t}=useLanguage();
  const [state,setState]=useState<Awaited<ReturnType<typeof window.apollo.updates.state>>|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let disposed=false;const load=()=>void window.apollo.updates.state().then(s=>{if(!disposed)setState(s);}).catch(()=>{});load();const timer=setInterval(load,1000);return()=>{disposed=true;clearInterval(timer);};},[]);
  async function act(kind:'check'|'download'){setBusy(true);setError('');try{await window.apollo.updates[kind]();setState(await window.apollo.updates.state());}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <section className="update-controls"><h2>{t('updateTitle')}</h2><p>{state?.version} · {labels[state?.status||'idle']}{state?.available?' · '+state.available:''}</p><p>{t('updateDescription')}</p><button disabled={busy||!state||['development','checking'].includes(state.status)} onClick={()=>void act('check')}><RefreshCw size={16}/>{t('checkUpdate')}</button>{state?.status==='available'&&<><button disabled={busy} onClick={()=>void act('download')}><Download size={16}/>{t('downloadUpdate')}</button>{state.releaseNotes&&<p style={{whiteSpace:'pre-wrap'}}>{state.releaseNotes}</p>}</>}{(error||state?.error)&&<p role="alert">{error||state?.error}</p>}</section>;
}
