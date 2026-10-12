import React,{useEffect,useState} from 'react';
import {Globe} from 'lucide-react';
import type {WorkTrace} from './runtime-types';

const statuses:Record<string,string>={running:'执行中',done:'完成',failed:'失败',interrupted:'已中断',waiting:'等待确认',approved:'已允许',rejected:'已拒绝'};
export function WorkDetails({trace,openBrowser}:{trace:WorkTrace;openBrowser:()=>void}){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{if(trace.ended)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[trace.ended]);
  const seconds=Math.max(0,Math.round(((trace.ended||now)-trace.started)/1000));
  return <details className="work-details"><summary>{trace.status==='running'?'工作中':trace.status==='done'?'已完成':statuses[trace.status]} · {seconds} 秒</summary>
    <ol>{trace.events.filter(e=>e.type==='tool'&&e.status==='running'||e.type==='step'||e.type==='approval'||e.type==='context').map((e,i)=>{
      const result=e.type==='tool'?trace.events.find(v=>v.type==='tool'&&v.callId===e.callId&&v.status!=='running'):undefined;
      return <li key={i}><div className="work-detail-heading"><time>{Math.max(0,Math.round(((e.time||trace.started)-trace.started)/1000))}s</time><strong>{e.type==='step'?'模型请求 '+e.step:e.type==='context'?'上下文准备':e.name}</strong><small>{statuses[result?.status||e.status||'']||''}{result?.durationMs!==undefined?' · '+(result.durationMs/1000).toFixed(1)+'s':''}</small></div>
        {e.type==='context'&&<p>约 {e.estimatedTokens} Token，省略 {e.omittedMessages} 条早期消息</p>}
        {e.arguments&&<pre>{e.arguments}</pre>}{(result?.preview||e.preview)&&<pre>{result?.preview||e.preview}</pre>}
        {e.name?.startsWith('browser_')&&<button title="查看内置浏览器" onClick={openBrowser}><Globe/>查看浏览器</button>}
      </li>;
    })}</ol>
  </details>;
}
