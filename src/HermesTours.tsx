import React,{useEffect,useRef,useState} from 'react';
import {useLanguage} from './i18n';
type Step={selector?:string;title?:string;text?:string};
export function HermesTours(){
 const {language}=useLanguage(),zh=language==='zh-CN',steps=useRef<Step[]>([]),index=useRef(0),[step,setStep]=useState<Step|null>(null);
 function show(next:Step|null){setStep(next);const old=document.querySelector('.hermes-tour-target');old?.classList.remove('hermes-tour-target');if(!next?.selector)return Boolean(next);try{const target=document.querySelector(next.selector);target?.classList.add('hermes-tour-target');target?.scrollIntoView({block:'center'});return Boolean(target);}catch{return false;}}
 useEffect(()=>window.apollo.hermes.onRequest(question=>{
  if(question.method!=='tour')return;const p=question.params;let result:Record<string,unknown>;
  if(p.surface==='preview'){result={success:false,error:'请使用预览页面的标注工具。'};}
  else if(p.action==='targets'){result={success:true,targets:[{selector:'.composer',title:'输入任务'},{selector:'.engine-pill',title:'后端与能力中心'},{selector:'.sidebar',title:'功能导航'},{selector:'.model-pill',title:'选择模型'}].filter(target=>document.querySelector(target.selector))};}
  else if(p.action==='stop'){show(null);result={success:true};}
  else if(p.action==='show'){result={success:true,matched:show(p as Step)};}
  else if(p.action==='start'){steps.current=Array.isArray(p.steps)?p.steps as Step[]:[{selector:'.composer',title:zh?'输入任务':'Enter a task',text:zh?'在这里输入任务，按 Enter 发送。':'Type a task and press Enter.'},{selector:'.engine-pill',title:'Hermes',text:zh?'打开能力中心，管理技能、工具、插件和自动化。':'Open the capability center to manage skills, tools, plugins and automation.'}];index.current=0;result={success:true,matched:show(steps.current[0]),total:steps.current.length};}
  else if(p.action==='next'||p.action==='prev'){index.current=Math.max(0,Math.min(steps.current.length-1,index.current+(p.action==='next'?1:-1)));result={success:true,matched:show(steps.current[index.current]||null),step_index:index.current};}
  else result={success:false,error:'无法识别的引导操作。'};
  void window.apollo.hermes.answer(question.id,{value:JSON.stringify(result)}).catch(()=>{});
 }),[zh]);
 useEffect(()=>()=>{document.querySelector('.hermes-tour-target')?.classList.remove('hermes-tour-target');},[]);
 if(!step)return null;
 return <aside className='hermes-tour' aria-label={zh?'操作引导':'Guided tour'} role='status'><strong>{step.title||'Hermes'}</strong><p>{step.text}</p><div><button onClick={()=>{index.current=Math.max(0,index.current-1);show(steps.current[index.current]);}}>{zh?'上一步':'Previous'}</button><button onClick={()=>{index.current++;show(steps.current[index.current]||null);}}>{zh?'下一步':'Next'}</button><button onClick={()=>show(null)}>{zh?'关闭':'Close'}</button></div></aside>;
}
