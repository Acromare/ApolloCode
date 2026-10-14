import {useEffect,useRef,useState} from 'react';
import type {RuntimeEvent,WorkTrace} from './runtime-types';

type Run={chatId:string;requestId:string;trace:WorkTrace;streamText:string;progress:string;status:'running'|'pausing'|'paused'};
export function useChatRuns(t:(key:string)=>string,language:string){
 const tasks=useRef(new Map<string,Run>()),timer=useRef<number|null>(null);
 const [runs,setRuns]=useState<Record<string,Run>>({});
 const words=useRef({t,language});words.current={t,language};
 const publish=()=>{setRuns(Object.fromEntries([...tasks.current].map(([id,run])=>[id,{...run}])));};
 const schedule=()=>{if(timer.current===null)timer.current=window.setTimeout(()=>{timer.current=null;publish();},50);};
 useEffect(()=>{
  const off=window.apollo.runtime.onEvent((event:RuntimeEvent)=>{
   const run=[...tasks.current.values()].find(task=>task.requestId===event.requestId);if(!run)return;
   const {t,language}=words.current;
   if(event.type==='control'&&['running','pausing','paused'].includes(event.status||'')){run.status=event.status as Run['status'];run.trace={...run.trace,status:run.status};}
   if(!['delta','usage','done'].includes(event.type)){
    const events=[...run.trace.events],last=events.at(-1);
    if(event.type==='tool_output'){const index=events.findIndex(e=>e.type==='tool_output'&&e.callId===event.callId&&e.stream===event.stream);if(index>=0)events[index]={...event};else events.push({...event});}
    else if(event.type==='reasoning_summary'&&last?.type==='reasoning_summary')events[events.length-1]={...last,text:((last.text||'')+(event.text||'')).slice(-16000)};
    else events.push({...event,time:event.time||Date.now()});
    run.trace={...run.trace,events:events.slice(-1500)};
   }
   if(event.type==='delta')run.streamText+=event.text||'';
   if(event.type==='commentary')run.streamText='';
   if(event.type==='tool')run.progress=(event.status==='running'?t('toolRunning'):t('toolFinished'))+event.name;
   if(event.type==='request_start')run.progress=(language==='zh-CN'?'等待模型 · 第 ':'Waiting for model · attempt ')+event.attempt;
   if(event.type==='retrying')run.progress=(language==='zh-CN'?'请求恢复 · 等待 ':'Retrying · wait ')+((event.delayMs||0)/1000).toFixed(1)+'s';
   if(event.type==='step')run.progress=t('modelStep')+event.step;
   if(event.type==='context')run.progress=t('contextApprox')+event.estimatedTokens+t('contextOmitted')+event.omittedMessages+t('contextMessages');
   schedule();
  });
  return()=>{off();if(timer.current!==null)window.clearTimeout(timer.current);};
 },[]);
 function start(chatId:string,model:string,mode?:WorkTrace['mode']){
  if(tasks.current.has(chatId))throw new Error('This chat is already running');
  const run:Run={chatId,requestId:crypto.randomUUID(),trace:{started:Date.now(),status:'running',model,mode,events:[]},streamText:'',progress:t('connectModel'),status:'running'};
  tasks.current.set(chatId,run);publish();return run;
 }
 function finish(chatId:string,requestId:string){if(tasks.current.get(chatId)?.requestId===requestId){tasks.current.delete(chatId);publish();}}
 return {runs,start,finish};
}
