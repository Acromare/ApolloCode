import React,{useState} from 'react';
import {AlertCircle} from 'lucide-react';
import {useLanguage} from './i18n';
import type {Failure,WorkTrace} from './runtime-types';
export function FailureCard({failure,trace,onRecover,onConnection}:{failure:Failure;trace?:WorkTrace;onRecover?:()=>void;onConnection?:()=>void}){
  const {language}=useLanguage(),zh=language==='zh-CN';const [copied,setCopied]=useState('');
  async function copy(){try{await navigator.clipboard.writeText(JSON.stringify({failure,requestId:trace?.events.find(e=>e.requestId)?.requestId,timings:trace?.events.filter(e=>['phase','attempt_end','first_text','first_event','connected'].includes(e.type))},null,2));setCopied(zh?'已复制':'Copied');}catch{setCopied(zh?'复制失败，请选取下方诊断':'Copy failed; select diagnostics below');}}
  return <div className="failure-card" role="alert"><strong><AlertCircle aria-hidden="true"/>{failure.partial?(zh?'回复未完成':'Response incomplete'):failure.code==='cancelled'?(zh?'任务已中断':'Task interrupted'):(zh?'任务失败':'Task failed')}</strong><p>{failure.message}</p><small>{failure.provider} / {failure.model} · {failure.code}{failure.status?' · HTTP '+failure.status:''} · {zh?'已完成操作 ':'Completed operations '}{failure.completedOperations||0}</small>{failure.hint&&<p>{failure.hint}</p>}<div className="failure-actions">{failure.recoveryId&&onRecover&&<button onClick={onRecover}>{zh?'恢复模型调用':'Resume model call'}</button>}{onConnection&&<button onClick={onConnection}>{zh?'检查连接 / 切换模型':'Connection / model'}</button>}<button onClick={()=>void copy()}>{copied||(zh?'复制诊断':'Copy diagnostics')}</button></div><details><summary>{zh?'诊断详情':'Diagnostics'}</summary><pre>{JSON.stringify(failure,null,2)}</pre></details></div>;
}
