import React,{useEffect,useRef,useState} from 'react';
import {Search,Check,Settings2,LoaderCircle} from 'lucide-react';
import {useLanguage} from './i18n';
export function ModelMenu({models,current,loading,error,disabled,position,onChoose,onClose,onSettings}:{models:string[];current:string;loading:boolean;error:string;disabled:boolean;position:{top:number;left:number;above:boolean;maxHeight:number};onChoose:(model:string)=>Promise<void>;onClose:()=>void;onSettings:()=>void}){
  const {t}=useLanguage();
  const [query,setQuery]=useState('');
  const panel=useRef<HTMLDivElement>(null);
  const filtered=[...new Set([current,...models])].filter(Boolean).filter(model=>model.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(()=>{panel.current?.querySelector('input')?.focus();},[]);
  useEffect(()=>{window.addEventListener('resize',onClose);return()=>window.removeEventListener('resize',onClose);},[onClose]);
  function key(event:React.KeyboardEvent){
    if(event.key==='Escape'){event.preventDefault();onClose();return;}
    if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
    const buttons=Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('.model-menu-options button:not(:disabled)')||[]);
    if(!buttons.length)return;
    event.preventDefault();const at=buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[at<0?(event.key==='ArrowDown'?0:buttons.length-1):(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();
  }
  return <><div className="model-menu-dismiss" onClick={onClose}/><div ref={panel} className="model-menu" role="dialog" aria-label={t('chooseModel')} onKeyDown={key} style={{top:position.top,left:position.left,maxHeight:position.maxHeight,transform:position.above?'translateY(-100%)':undefined}}>
    <label className="model-menu-search"><Search aria-hidden="true"/><input aria-label={t('modelIdHint')} placeholder={t('modelIdHint')} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&query.trim()&&!disabled){e.preventDefault();void onChoose(filtered[0]||query.trim());}}}/></label>
    <div className="model-menu-options" role="menu" aria-label={t('chooseModel')}>{filtered.map(model=><button disabled={disabled} role="menuitemradio" aria-checked={model===current} key={model} onClick={()=>void onChoose(model)}><span>{model}</span>{model===current&&<Check aria-hidden="true"/>}</button>)}
      {!filtered.length&&<p className="model-menu-status">{t('noModels')}</p>}
      {query.trim()&&!models.includes(query.trim())&&query.trim()!==current&&<button disabled={disabled} role="menuitem" onClick={()=>void onChoose(query.trim())}><span>{t('useModelId')} · {query.trim()}</span></button>}
    </div>
    {loading&&<p className="model-menu-status" role="status"><LoaderCircle className="spin" aria-hidden="true"/>{t('loadingModels')}</p>}
    {error&&<p className="model-menu-status" role="status">{t('modelListUnavailable')}</p>}
    <button className="model-menu-settings" onClick={onSettings}><Settings2 aria-hidden="true"/>{t('modelProvider')}</button>
  </div></>;
}
