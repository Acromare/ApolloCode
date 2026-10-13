import React,{useEffect,useState} from 'react';
import {FolderOpen,GitBranch,RefreshCw,FileText} from 'lucide-react';
import {useLanguage} from './i18n';
type Tree=Awaited<ReturnType<Window['apollo']['worktrees']['list']>>[number];
export function Worktrees({project}:{project:string}){
  const {t}=useLanguage();const [trees,setTrees]=useState<Tree[]>([]),[error,setError]=useState(''),[diff,setDiff]=useState(''),[busy,setBusy]=useState(false);
  async function refresh(){setBusy(true);try{setTrees(await window.apollo.worktrees.list());setError('');}catch(e){setError(String(e));}finally{setBusy(false);}}
  useEffect(()=>{setDiff('');void refresh();},[project]);
  return <section className="task-journal"><header><div><h2>{t('worktreeTitle')}</h2><p>{t('worktreeHelp')}</p></div><button disabled={busy} onClick={()=>void refresh()} aria-label={t('refresh')}><RefreshCw/></button></header>{error&&<p role="alert">{error}</p>}{!trees.length&&<p>{t('noWorktrees')}</p>}<div className="task-cards">{trees.map(tree=><article key={tree.id}><div className="task-heading"><strong>{tree.task}</strong><span>{t('taskState'+tree.status)}</span></div><p><GitBranch size={14}/> {tree.branch}</p><small>{tree.directory}</small><div className="tool-actions"><button onClick={()=>void window.apollo.worktrees.open(tree.id).catch(e=>setError(String(e)))}><FolderOpen/>{t('openFolder')}</button><button disabled={busy} onClick={()=>{setBusy(true);void window.apollo.worktrees.diff(tree.id).then(r=>setDiff(r.output)).catch(e=>setError(String(e))).finally(()=>setBusy(false));}}><FileText/>{t('viewDiff')}</button></div></article>)}</div>{diff&&<details open><summary>{t('viewDiff')}</summary><pre>{diff}</pre></details>}</section>;
}
