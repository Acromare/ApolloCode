import React,{useEffect,useState} from 'react';
import {Download,RefreshCw} from 'lucide-react';
import {useLanguage} from './i18n';
const labels:Record<string,string>={idle:'updateIdle',development:'updateDevelopment',checking:'updateChecking',current:'updateCurrent',available:'updateAvailable',error:'updateError'};
const errors:Record<string,string>={UPDATE_TIMEOUT:'updateTimeout',UPDATE_NETWORK:'updateNetwork',UPDATE_RATE_LIMIT:'updateRateLimit',UPDATE_METADATA:'updateMetadata',UPDATE_ACTION:'updateAction'};
export function Updates(){
  const {t}=useLanguage();
  const [state,setState]=useState<Awaited<ReturnType<typeof window.apollo.updates.state>>|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let disposed=false;const load=()=>void window.apollo.updates.state().then(s=>{if(!disposed)setState(s);}).catch(()=>{});load();const timer=setInterval(load,1000);return()=>{disposed=true;clearInterval(timer);};},[]);
  async function act(kind:'check'|'download'){setBusy(true);setError('');try{await window.apollo.updates[kind]();setState(await window.apollo.updates.state());}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <section className="update-controls"><h2>{t('updateTitle')}</h2><p aria-live="polite">{state?.version} · {t(labels[state?.status||'idle'])}{state?.available?' · '+state.available:''}</p><p>{t('updateDescription')}</p><button disabled={busy||!state||['development','checking'].includes(state.status)} onClick={()=>void act('check')}><RefreshCw size={16}/>{t('checkUpdate')}</button><button disabled={!state||state.status==='development'} onClick={()=>void act('download')}><Download size={16}/>{t(state?.available?'downloadUpdate':'openDownloads')}</button>{state?.releaseNotes&&<p style={{whiteSpace:'pre-wrap'}}>{state.releaseNotes}</p>}{(error||state?.error)&&<p role="alert">{error||t(errors[state?.errorCode||'']||'updateNetwork')}</p>}</section>;
}
