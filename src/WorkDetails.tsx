import React,{useEffect,useState} from 'react';
import {Globe,ChevronRight,Pause, LoaderCircle,Check,AlertCircle,Terminal,FileText,ShieldCheck} from 'lucide-react';
import type {WorkTrace,RuntimeEvent} from './runtime-types';
import {useLanguage} from './i18n';
import {useWorkDisplay} from './work-display';
const names:Record<string,string>={read_file:'读取文件',list_files:'查看目录',apply_patch:'修改文件',create_personal_file:'创建文件',run_shell:'运行命令',run_tests:'运行测试',git_status:'查看 Git 状态',git_diff:'检查改动',lsp_inspect:'检查代码',delegate_tasks:'并行调查',summarize_history:'整理上下文',extract_memory:'提取记忆'};
const namesEn:Record<string,string>={read_file:'Read file',list_files:'List files',apply_patch:'Edit file',create_personal_file:'Create file',run_shell:'Run command',run_tests:'Run tests',git_status:'Git status',git_diff:'Inspect diff',lsp_inspect:'Inspect code',delegate_tasks:'Parallel investigation',summarize_history:'Summarize context',extract_memory:'Extract memory'};
const statuses:Record<string,string>={running:'执行中',done:'已完成',failed:'失败',interrupted:'已中断',waiting:'等待批准',approved:'已允许',rejected:'已拒绝'};
const statusesEn:Record<string,string>={running:'Running',done:'Done',failed:'Failed',interrupted:'Interrupted',waiting:'Waiting',approved:'Approved',rejected:'Rejected'};
function target(e:RuntimeEvent){try{const a=JSON.parse(e.arguments||'{}');return a.path||a.command||a.url||'';}catch{return '';}}
function title(e:RuntimeEvent,english=false){const label=(english?namesEn:names)[e.name||'']||e.name||(english?'Tool call':'执行工具');const detail=String(target(e)).split('\n')[0];return label+(detail?' · '+detail:'');}
export function WorkDetails({trace,openBrowser}:{trace:WorkTrace;openBrowser:()=>void}){
  const {language}=useLanguage();
  const {display}=useWorkDisplay();
  const [now,setNow]=useState(Date.now());
  const failureStatus=['failed','interrupted','done_with_errors'].includes(trace.status);
  const [expanded,setExpanded]=useState(display==='expanded'||failureStatus);
  useEffect(()=>{if(trace.ended)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[trace.ended]);
  useEffect(()=>{setExpanded(display==='expanded'||failureStatus);},[display,trace.status,trace.started,failureStatus]);
  const seconds=Math.max(0,Math.round(((trace.ended||now)-trace.started)/1000));
  const toolEvents=trace.events.filter(e=>e.type==='tool');
  const tools=toolEvents.filter(e=>e.status==='running');
  const active=[...tools].reverse().find(e=>!trace.events.some(v=>v.type==='tool'&&v.callId===e.callId&&v.status!=='running'));
  const approval=trace.events.filter(e=>e.type==='approval').at(-1);
  const waiting=trace.status==='running'&&approval?.status==='waiting';
  const labels=language==='zh-CN'?{working:'工作中',waiting:'等待你批准',processing:'正在处理任务',done:'已完成',ended:'已结束',seconds:'秒',ops:'项操作',commentary:'进度更新',reasoning:'模型思考摘要',args:'调用参数',result:'执行结果',failure:'失败原因',empty:'正在等待模型响应…',plain:'本次为文本回复，没有执行工具。'}:{working:'Working',waiting:'Waiting for approval',processing:'Processing',done:'Done',ended:'Ended',seconds:'s',ops:'operations',commentary:'Progress update',reasoning:'Reasoning summary',args:'Arguments',result:'Result',failure:'Failure reason',empty:'Waiting for the model…',plain:'Text response only; no tools were used.'};
  const firstText=trace.events.find(e=>e.type==='first_text')?.durationMs;
  const failed=trace.status==='failed'||trace.status==='done_with_errors'||trace.status==='interrupted';
  const hasDetails=toolEvents.length>0||failed||trace.events.some(e=>e.type==='commentary'||e.type==='reasoning_summary'||e.type==='approval');
  if(trace.status==='done'&&display==='hidden')return null;
  const live=['running','pausing','paused'].includes(trace.status);
  if(!live&&!hasDetails)return null;
  const inline=live&&!hasDetails;
  const latest=trace.events.at(-1),retry=[...trace.events].reverse().find(e=>e.type==='retrying'||e.type==='request_start');
  const retryText=retry?.type==='retrying'?(language==='zh-CN'?'正在恢复请求':'Retrying request')+' · '+Math.max(0,Math.ceil(((retry.time||now)+(retry.delayMs||0)-now)/1000))+'s':'';
  const summary=trace.status==='paused'?(language==='zh-CN'?'已暂停':'Paused'):trace.status==='pausing'?(language==='zh-CN'?'正在暂停 · 等待当前操作完成':'Pausing · finishing current operation'):trace.status==='running'?labels.working+' · '+(waiting?labels.waiting:active?title(active,language==='en-US'):retryText||labels.processing):trace.status==='done'?labels.done:trace.status==='done_with_errors'?(language==='zh-CN'?'回复已完成 · 有操作失败':'Answer completed · some operations failed'):trace.status==='interrupted'?(language==='zh-CN'?'已中断':'Interrupted'):(language==='zh-CN'?'任务失败':'Task failed');
  if(inline)return <div className="work-inline" role="status"><span className="work-summary-icon" aria-hidden="true">{trace.status==='paused'?<Pause/>:<LoaderCircle className="spin"/>}</span><span>{summary}</span><span className="work-duration">{seconds}{labels.seconds}</span></div>;
  return <details className={'work-details '+(failed?'work-failed':'')} open={expanded}><summary onClick={event=>{event.preventDefault();if(display!=='expanded')setExpanded(value=>!value);}}><span className="work-summary-icon" aria-hidden="true">{trace.status==='paused'?<Pause/>:trace.status==='running'||trace.status==='pausing'?<LoaderCircle className={waiting?'':'spin'}/>:trace.status==='done'?<Check/>:<AlertCircle/>}</span><span className="work-summary-text">{summary}</span><span className="work-duration">{seconds}{labels.seconds}{firstText!==undefined?' · '+(language==='zh-CN'?'首字 ':'First text ')+(firstText/1000).toFixed(1)+'s':''}{tools.length?' · '+tools.length+' '+labels.ops:''}</span><ChevronRight className="work-chevron" aria-hidden="true"/></summary>
    {trace.status==='running'&&latest?.type==='retrying'&&<p role="status">{retryText} · {latest.preview}</p>}
    {trace.events.filter(e=>e.type==='phase'&&e.status==='done'||e.type==='attempt_end'||e.type==='fallback').length>0&&<div className="work-phases">{trace.events.filter(e=>e.type==='phase'&&e.status==='done'||e.type==='attempt_end'||e.type==='fallback').map((e,i)=><small key={i}>{e.type==='fallback'?'↪ '+e.provider+' / '+e.model:e.name==='queue'?(language==='zh-CN'?'等待请求槽':'Request queue'):e.name==='preparing'?(language==='zh-CN'?'准备上下文':'Context'):e.name==='model'?(language==='zh-CN'?'模型回合':'Model turn'):(language==='zh-CN'?'请求尝试 ':'Attempt ')+e.attempt+' · '+e.status}{e.durationMs!==undefined?' '+(e.durationMs/1000).toFixed(1)+'s':''}</small>)}</div>}
    <ol>{trace.events.filter(e=>e.type==='tool'&&e.status==='running'||e.type==='commentary'||e.type==='reasoning_summary'||e.type==='approval'&&e.status==='waiting').map((e,i)=>{
      if(e.type==='commentary'||e.type==='reasoning_summary')return <li className="work-commentary" key={i}><small>{e.type==='reasoning_summary'?labels.reasoning:labels.commentary}</small><p>{e.text}</p></li>;
      const result=e.type==='tool'?trace.events.find(v=>v.type==='tool'&&v.callId===e.callId&&v.status!=='running'):trace.events.slice(trace.events.indexOf(e)+1).find(v=>v.type==='approval'&&v.name===e.name&&v.status!=='waiting');
      const status=result?.status||e.status||'';
      const output=trace.events.filter(v=>v.type==='tool_output'&&v.callId===e.callId),command=trace.events.find(v=>v.type==='command_start'&&v.callId===e.callId),exit=trace.events.find(v=>v.type==='command_end'&&v.callId===e.callId);
      return <li className={'work-tool-row '+status} key={e.callId||i}><details open={status==='failed'||status==='running'&&!!command}><summary><span className="work-row-icon" aria-hidden="true">{e.type==='approval'?<ShieldCheck/>:e.name==='run_shell'||e.name==='run_tests'?<Terminal/>:<FileText/>}</span><strong>{e.type==='approval'?(language==='zh-CN'?'操作审批':'Approval'):title(e,language==='en-US')}</strong><small>{(language==='en-US'?statusesEn:statuses)[status]||status}{result?.durationMs!==undefined?' · '+(result.durationMs/1000).toFixed(1)+'s':''}</small><ChevronRight aria-hidden="true"/></summary>
        {command&&<p className="command-location">{command.backend} · {command.cwd}</p>}{output.map(v=><div key={v.stream}><span className="work-code-label">{v.stream}</span><pre className="live-command-output" aria-live="off">{v.text}</pre></div>)}{exit&&<p>{language==='zh-CN'?'退出码':'Exit code'}: {exit.code??'—'}{exit.timedOut?' · '+(language==='zh-CN'?'命令超时':'Command timed out'):''}{exit.interrupted?' · '+(language==='zh-CN'?'已中断':'Interrupted'):''}</p>}
        {e.arguments&&<><span className="work-code-label">{labels.args}</span><pre>{e.arguments}</pre></>}{(result?.preview||e.preview)&&<><span className="work-code-label">{status==='failed'?labels.failure:labels.result}</span><pre>{result?.preview||e.preview}</pre></>}
        {e.name?.startsWith('browser_')&&<button onClick={openBrowser}><Globe/>{language==='en-US'?'Open browser':'查看浏览器'}</button>}
      </details></li>;
    })}</ol>
  </details>;
}
