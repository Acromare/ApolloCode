import React,{useEffect,useState} from 'react';
import {RefreshCw,MessageCircle} from 'lucide-react';
import type {AgentTask} from './runtime-types';
import {useLanguage} from './i18n';
export function TaskJournal({project,openTask}:{project:string;openTask:(task:AgentTask)=>void}){
  const {t}=useLanguage();
  const [tasks,setTasks]=useState<AgentTask[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  async function refresh(){setLoading(true);setError('');try{setTasks((await window.apollo.runtime.journal()).tasks);}catch(e){setError(String(e));}finally{setLoading(false);}}
  useEffect(()=>{void refresh();},[project]);
  return <section className="task-journal"><header><div><h2>{t('taskJournal')}</h2><p>{t('taskJournalHelp')}</p></div><button disabled={loading} onClick={()=>void refresh()} title={t('refresh')} aria-label={t('refresh')}><RefreshCw/></button></header>{error&&<p role="alert">{error}</p>}{!tasks.length&&<p>{t('noTasks')}</p>}<div className="task-cards">{tasks.map(task=><article key={task.id}><div className="task-heading"><strong>{task.title}</strong><span className={`task-status task-${task.status}`}>{t('taskState'+task.status)}</span></div><small>{new Date(task.updated).toLocaleString()} · {t('taskRounds')} {task.step}</small>{!!task.plan.length&&<ul>{task.plan.map((p,i)=><li key={i}><span>{t('planState'+p.status)}</span>{p.text}</li>)}</ul>}{task.nextAction&&<p><b>{t('nextAction')}</b> {task.nextAction}</p>}{task.blockers&&<p className="task-blocker"><b>{t('blockers')}</b> {task.blockers}</p>}{task.status==='interrupted'&&<p>{t('taskInterruptedHelp')}</p>}{task.lastTool&&<details><summary>{t('lastOperation')}: {task.lastTool.name}</summary><pre>{task.lastTool.preview}</pre></details>}<button onClick={()=>openTask(task)}><MessageCircle/>{t('openTaskChat')}</button></article>)}</div></section>;
}
