import React,{useState} from 'react';
import {Plus,Save,Trash2} from 'lucide-react';
import type {WorkflowTemplate,WorkflowStep} from './operation-types';
import {useLanguage} from './i18n';
type Node=WorkflowStep&{id:string};
export function WorkflowEditor({template,onSaved,onClose}:{template?:WorkflowTemplate;onSaved:(t:WorkflowTemplate)=>void;onClose:()=>void}){
  const {t}=useLanguage();
  const [name,setName]=useState(template?.name||t('customWorkflow'));
  const [nodes,setNodes]=useState<Node[]>(()=>template?template.steps.map((s,i)=>({...s,id:s.id||'node'+(i+1),dependsOn:s.dependsOn||(i?['node'+i]:[]),when:s.when||'success'})):[{id:'node1',name:t('defaultNode'),kind:'model',mode:'plan',approval:false,prompt:'Inspect the task and project. Produce a concise plan.',status:'pending',output:'',dependsOn:[],when:'success'}]);
  const [active,setActive]=useState(nodes[0].id),[error,setError]=useState(''),[pending,setPending]=useState(false);
  const node=nodes.find(n=>n.id===active)!;
  const change=(patch:Partial<Node>)=>setNodes(items=>items.map(n=>n.id===active?{...n,...patch}:n));
  const levels=new Map<string,number>();
  const level=(id:string,visited=new Set<string>()):number=>{if(levels.has(id))return levels.get(id)!;if(visited.has(id))return 0;const next=new Set(visited).add(id);const deps=nodes.find(n=>n.id===id)?.dependsOn||[];const result=deps.length?Math.min(20,1+Math.max(...deps.map(dep=>level(dep,next)))):0;levels.set(id,result);return result;};
  const rows=new Map<number,number>();const positions=new Map(nodes.map(n=>{const column=level(n.id),row=rows.get(column)||0;rows.set(column,row+1);return [n.id,{x:column*180+12,y:row*80+12}];}));
  const width=(Math.max(...levels.values())+1)*180,height=Math.max(...rows.values())*80+20;
  async function save(){setPending(true);setError('');try{const result=await window.apollo.workflows.saveTemplate({id:template?.custom?template.id:'',name,steps:nodes});onSaved(result);}catch(e){setError((e as Error).message);}finally{setPending(false);}}
  return <section className="workflow-editor"><div className="management-toolbar"><h2>{t('nodeConnections')}</h2><button disabled={pending} onClick={onClose}>{t('close')}</button></div>
    <form className="editor-form" onSubmit={e=>{e.preventDefault();void save();}}><label>{t('workflowName')}<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
      <div className="workflow-graph"><svg width={width} height={height} role="group" aria-label={t('nodeConnections')}><defs><marker id="workflow-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7" fill="var(--muted)"/></marker></defs>
        {nodes.flatMap(n=>(n.dependsOn||[]).map(id=>{const from=positions.get(id),to=positions.get(n.id);return from&&to?<path key={id+'-'+n.id} d={`M${from.x+150} ${from.y+26} C${from.x+170} ${from.y+26}, ${to.x-20} ${to.y+26}, ${to.x} ${to.y+26}`} fill="none" stroke="var(--muted)" markerEnd="url(#workflow-arrow)"/>:null;}))}
        {nodes.map(n=>{const p=positions.get(n.id)!;return <g key={n.id} role="button" tabIndex={0} aria-label={n.name} aria-pressed={active===n.id} onClick={()=>setActive(n.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setActive(n.id);}}}><rect x={p.x} y={p.y} width={150} height={52} rx={6} fill={active===n.id?'var(--accent-bg)':'var(--surface)'} stroke={active===n.id?'var(--accent)':'var(--border)'}/><text x={p.x+12} y={p.y+21} fill="var(--text)" fontSize={13}>{n.name.slice(0,13)}</text><text x={p.x+12} y={p.y+40} fill="var(--muted)" fontSize={11}>{n.id} · {n.kind}</text></g>;})}
      </svg></div>
      <div className="management-toolbar"><button type="button" disabled={nodes.length>=20||pending} onClick={()=>{const id='node-'+crypto.randomUUID().slice(0,8);setNodes([...nodes,{id,name:t('nodeName'),kind:'model',mode:'agent',approval:true,prompt:'',status:'pending',output:'',dependsOn:[active],when:'success'}]);setActive(id);}}><Plus/>{t('addNode')}</button><button type="button" disabled={nodes.length<2||pending} onClick={()=>{const next=nodes.filter(n=>n.id!==active).map(n=>({...n,dependsOn:n.dependsOn?.filter(id=>id!==active)}));setNodes(next);setActive(next[0].id);}}><Trash2/>{t('deleteNode')}</button></div>
      <label>{t('nodeName')}<input required maxLength={100} value={node.name} onChange={e=>change({name:e.target.value})}/></label>
      <label>{t('nodeType')}<select value={node.kind} onChange={e=>change({kind:e.target.value,approval:true})}><option value="model">{t('modelTask')}</option><option value="test">{t('projectTest')}</option><option value="shell">{t('shellCommand')}</option></select></label>
      {node.kind==='model'&&<label>{t('nodeMode')}<select value={node.mode} onChange={e=>change({mode:e.target.value})}><option value="plan">{t('planReadOnly')}</option><option value="agent">{t('agentApproval')}</option></select></label>}
      {node.kind!=='test'&&<label>{node.kind==='shell'?t('command'):t('instruction')}<textarea required maxLength={12000} value={node.prompt} onChange={e=>change({prompt:e.target.value})}/></label>}
      <fieldset><legend>{t('waitForNodes')}</legend>{nodes.filter(n=>n.id!==active).map(n=><label key={n.id}><input type="checkbox" checked={node.dependsOn?.includes(n.id)||false} onChange={e=>change({dependsOn:e.target.checked?[...(node.dependsOn||[]),n.id]:(node.dependsOn||[]).filter(id=>id!==n.id)})}/>{n.name} · {n.id}</label>)}</fieldset>
      <label>{t('branchCondition')}<select value={node.when||'success'} onChange={e=>change({when:e.target.value as Node['when']})}><option value="success">{t('allDependencies')}</option><option value="failure">{t('anyFailure')}</option><option value="always">{t('alwaysRun')}</option></select></label>
      <label><input type="checkbox" checked={node.continueOnError||false} onChange={e=>change({continueOnError:e.target.checked})}/>{t('continueOnError')}</label>
      {error&&<p className="management-error" role="alert">{error}</p>}<button disabled={pending}><Save/>{pending?t('saving'):t('saveWorkflow')}</button>
    </form></section>;
}
