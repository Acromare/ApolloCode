import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowRight, ArrowUp, BookOpen, ChartNoAxesColumnIncreasing, ChevronDown, Compass, FileText, FolderOpen, Gauge, GitBranch, Lightbulb, MessageCircle, Minus, Paperclip, Pause, Play, Plus, Search, Settings2, ShieldCheck, Sparkles, Plug, Square, Sun, Moon, Home, X} from 'lucide-react';
import {Management} from './Management';
import {ProviderSettings} from './ProviderSettings';
import {ModelMenu} from './ModelMenu';
import {type Config,cachedModels,cacheModels,modelsFresh} from './model-config';
import {Operations} from './Operations';
import type {RuntimeState,RuntimeSettings,WorkTrace,AgentTask} from './runtime-types';
import {TaskJournal} from './TaskJournal';
import {Worktrees} from './Worktrees';
import {WorkDetails} from './WorkDetails';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import nightBackground from '../assets/night-background.webp';
import dayBackground from '../assets/day-background.webp';
import eclipseBackground from '../assets/eclipse-background.webp';
import brandIcon from '../assets/apollo-mark.png';
import {useTheme} from './theme';
import {useLanguage} from './i18n';
import './styles.css';
import './connection.css';
import './themes.css';
import './activity.css';
import './glass.css';

type Message = {role: 'user' | 'assistant'; content: string;trace?:WorkTrace};
type Chat = {id: string; title: string; updated: number; messages: Message[]; project?: string};
type Page = 'Home' | 'Chat' | 'Explore' | 'Library' | 'Workspace' | 'Skills' | 'MCP' | 'Settings' | 'Workflows' | 'Automation';
const storageKey = 'apollo-code-chats-v2';
const skills = [
  {id: 'plan', name: 'Write a plan', icon: FileText, instruction: 'Make a concise actionable plan. State assumptions only when needed. Use short numbered steps.'},
  {id: 'data', name: 'Analyze data', icon: ChartNoAxesColumnIncreasing, instruction: 'Analyze the supplied data. Give key findings, evidence, and caveats concisely. Never invent missing data.'},
  {id: 'solve', name: 'Create', icon: Lightbulb, instruction: 'Solve the problem directly. Show the essential reasoning and a practical next action.'},
  {id: 'ideas', name: 'Explore', icon: Compass, instruction: 'Generate a few distinct, practical ideas with brief tradeoffs. Avoid filler.'},
];
function loadChats(): Chat[] { try { const data = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(data) ? data : []; } catch { return []; } }

function App() {
  const {theme,switching,toggle}=useTheme();
  const {language,t}=useLanguage();
  useEffect(()=>{for(const src of [nightBackground,dayBackground,eclipseBackground]){const image=new Image();image.src=src;}},[]);
  const [page, setPage] = useState<Page>('Home');
  const [chats, setChats] = useState<Chat[]>(loadChats);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [runStatus,setRunStatus]=useState<'running'|'pausing'|'paused'>('running');
  const [runtimeState,setRuntimeState]=useState<RuntimeState|null>(null);
  const [streamText,setStreamText]=useState('');
  const [progress,setProgress]=useState('');
  const [trace,setTrace]=useState<WorkTrace|null>(null);
  const traceRef=useRef<WorkTrace|null>(null);
  const requestId=useRef('');
  const busyChat=useRef('');
  const streamQueue=useRef('');
  const streamFrame=useRef<number|null>(null);
  async function refreshRuntime(){setRuntimeState(await window.apollo.runtime.state());}
  useEffect(()=>{void refreshRuntime().catch(e=>setNotice(String(e)));return window.apollo.runtime.onEvent(event=>{
    if(event.type==='schedule'){setNotice(`${event.name || t('schedules')} · ${t('scheduleState'+event.status)}`);return;}
    if(event.requestId!==requestId.current)return;
    if(event.type==='control'&&['running','pausing','paused'].includes(event.status||'')){
      const status=event.status as 'running'|'pausing'|'paused';setRunStatus(status);
      if(traceRef.current)traceRef.current={...traceRef.current,status};
    }
    if(event.type!=='delta'&&event.type!=='usage'&&event.type!=='done'&&traceRef.current){
      const events=[...traceRef.current.events],last=events.at(-1);
      if(event.type==='reasoning_summary'&&last?.type==='reasoning_summary')events[events.length-1]={...last,text:(last.text||'')+(event.text||'')};else events.push({...event,time:event.time||Date.now()});
      traceRef.current={...traceRef.current,events:events.slice(-200)};setTrace(traceRef.current);
    }
    if(event.type==='delta'){
      streamQueue.current+=event.text||'';
      if(streamFrame.current===null)streamFrame.current=requestAnimationFrame(()=>{const chunk=streamQueue.current;streamQueue.current='';streamFrame.current=null;setStreamText(text=>text+chunk);});
    }
    if(event.type==='commentary'){streamQueue.current='';if(streamFrame.current!==null)cancelAnimationFrame(streamFrame.current);streamFrame.current=null;setStreamText('');}
    if(event.type==='tool')setProgress((event.status==='running'?t('toolRunning'):t('toolFinished'))+event.name);
    if(event.rollbackId)setRollbackId(event.rollbackId);
    if(event.type==='step')setProgress(t('modelStep')+event.step);
    if(event.type==='context')setProgress(t('contextApprox')+event.estimatedTokens+t('contextOmitted')+event.omittedMessages+t('contextMessages'));
    if(event.type==='usage'&&event.alert)setNotice(t('costReached'));
  });},[]);
  const [skillId, setSkillId] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<{name: string; content: string} | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [modelMenuOpen,setModelMenuOpen]=useState(false);
  const [modelMenuLoading,setModelMenuLoading]=useState(false),[modelMenuError,setModelMenuError]=useState('');
  const [settingsSection,setSettingsSection]=useState('economy');
  const modelMenuTrigger=useRef<HTMLButtonElement|null>(null);
  const modelRequest=useRef(0);
  useEffect(()=>{setModelMenuOpen(false);modelRequest.current++;},[page]);
  const [modelMenuAt,setModelMenuAt]=useState({top:60,left:0,above:false,maxHeight:440});
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [project, setProject] = useState('');
  const [workOutput, setWorkOutput] = useState('');
  const [pendingPatch, setPendingPatch] = useState('');
  const [rollbackId,setRollbackId]=useState<string|null>(null);
  const [config, setConfig] = useState<Config>({provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', apiKey: ''});
  useEffect(() => {setAvailableModels(cachedModels(config));}, [config.provider, config.baseUrl, config.apiKey]);
  const input = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {if(input.current)resizeComposer(input.current);}, [value, activeId, page]);
  const active = chats.find(c => c.id === activeId);
  const recent = [...chats].filter(c => c.title.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.updated - a.updated);
  const projectChats = project ? recent.filter(c => c.project === project) : [];
  const skill = skills.find(s => s.id === skillId);
  const runtimeSkill=runtimeState?.skills.find(s=>s.id===skillId);
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(chats)); }, [chats]);
  useEffect(()=>{if(!runtimeState?.settings.historyRecall)return;let disposed=false;const timer=setTimeout(()=>{void window.apollo.runtime.syncHistory(chats.map(c=>({...c,messages:c.messages.map(({role,content})=>({role,content}))}))).catch(e=>{if(!disposed)setNotice(String(e));});},300);return()=>{disposed=true;clearTimeout(timer);};},[chats,runtimeState?.settings.historyRecall]);
  useEffect(() => { void window.apollo.getConfig().then(c => setConfig({provider: c.provider || 'openai', baseUrl: c.baseUrl || 'https://api.openai.com/v1', model: c.model || '', apiKey: c.apiKey || '',apiMode:c.apiMode||'auto',reasoningEffort:c.reasoningEffort||'auto'})); }, []);
  useEffect(() => { void window.apollo.getProject().then(p => setProject(p.root || '')); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({behavior: 'smooth'}); }, [active?.messages.length, busy]);
  function newChat() { if(busy){setNotice(t('pleaseStop'));return;}setActiveId(null); setPage('Chat'); setValue(''); setAttachment(null); setSkillId(null); input.current?.focus(); }
  function openChat(id: string) { if(busy){setNotice(t('pleaseStop'));return;}setActiveId(id); setPage('Chat'); setSearchOpen(false); setValue(''); setSkillId(null); }
  function openTask(task:AgentTask){if(busy){setNotice(t('pleaseStop'));return;}if(task.chatId&&chats.some(c=>c.id===task.chatId))openChat(task.chatId);else{newChat();setValue(t('resumeTaskPrompt')+'\n'+task.title+'\n'+task.nextAction);} }
  function selectSkill(id: string) { setSkillId(id); setPage('Chat'); setTimeout(() => input.current?.focus(), 0); }
  function updateReply(id: string, content: string,work?:WorkTrace) { setChats(current => current.map(c => c.id === id ? {...c, updated: Date.now(), messages: [...c.messages, {role: 'assistant', content,trace:work}]} : c)); }
  async function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    await acceptFile(selected);
  }
  async function acceptFile(selected: File) {
    if(busy){setNotice(t('steerTextOnly'));return;}
    if (selected.size > 100_000) { setNotice(t('fileTooLarge')); return; }
    if (!/\.(txt|md|csv|json|js|jsx|ts|tsx|py|html|css|xml|yaml|yml|log)$/i.test(selected.name)) { setNotice(t('textOnly')); return; }
    try{setAttachment({name: selected.name, content: await selected.text()});setNotice('');}
    catch(error){setNotice(String(error));}
  }
  function resizeComposer(target: HTMLTextAreaElement) {
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 190)}px`;
  }
  async function submit() {
    const text = value.trim();
    if(busy){
      if(!text||config.provider==='claude')return;
      try{await window.apollo.runtime.control('steer',requestId.current,text);setValue('');setNotice(t('steerQueued'));setChats(current=>current.map(c=>c.id===busyChat.current?{...c,updated:Date.now(),messages:[...c.messages,{role:'user',content:text}]}:c));}
      catch(error){setNotice(String(error));}return;
    }
    if (!text && !attachment) return;
    const content = [text, attachment ? `${t('fileLabel')}${attachment.name}:\n${attachment.content}` : ''].filter(Boolean).join('\n\n');
    const id = activeId || crypto.randomUUID();
    const messages: Message[] = [...(active?.messages || []), {role: 'user', content}];
    setChats(current => activeId ? current.map(c => c.id === id ? {...c, updated: Date.now(), messages} : c) : [{id, title: (text || attachment?.name || t('newChatTitle')).slice(0, 42), updated: Date.now(), messages, project: project || undefined}, ...current]);
    setActiveId(id); setPage('Chat'); setValue(''); setAttachment(null); setBusy(true);setRunStatus('running'); setNotice('');streamQueue.current='';if(streamFrame.current!==null)cancelAnimationFrame(streamFrame.current);streamFrame.current=null;setStreamText('');setProgress(t('connectModel'));requestId.current=crypto.randomUUID();busyChat.current=id;
    traceRef.current={started:Date.now(),status:'running',model:config.model,mode:runtimeState?.settings.mode,events:[]};setTrace(traceRef.current);
    const finish=(status:WorkTrace['status'])=>({...traceRef.current!,ended:Date.now(),status});
    try {
      const result = await window.apollo.chat({messages:messages.map(({role,content})=>({role,content})), instruction: skill?.instruction || '',skillId:runtimeSkill?.id,requestId:requestId.current,chatId:id});
      updateReply(id, result.ok ? result.content || '' : result.error || t('requestFailed'),finish(result.ok?'done':result.error?.includes('中断')?'interrupted':'failed'));
    } catch (error) { updateReply(id, `${t('failedPrefix')}${(error as Error).message}`,finish('failed')); }
    finally { setBusy(false);streamQueue.current='';if(streamFrame.current!==null)cancelAnimationFrame(streamFrame.current);streamFrame.current=null;setStreamText('');setProgress('');void refreshRuntime().catch(()=>{}); }
  }
  function composer(compact = false) {
    const mode=runtimeState?.settings.mode||'agent';
    const modeText=mode==='chat'?t('chatOnly'):mode==='plan'?t('readOnly'):mode==='yolo'?t('automatic'):t('agentApproval');
    return <div className={compact ? 'entry compact' : 'entry'}>
      <div className="composer" onDragOver={e=>{e.preventDefault();e.currentTarget.classList.add('dragging');}} onDragLeave={e=>e.currentTarget.classList.remove('dragging')} onDrop={e=>{e.preventDefault();e.currentTarget.classList.remove('dragging');const dropped=e.dataTransfer.files?.[0];if(dropped)void acceptFile(dropped);}}>
        <div className="composer-editor">
          <textarea ref={input} rows={1} placeholder={t(busy?'steerPlaceholder':'ask')} aria-label={t(busy?'steerPlaceholder':'ask')} value={value} onChange={e=>{setValue(e.target.value);resizeComposer(e.currentTarget);}} onFocus={e=>resizeComposer(e.currentTarget)} onPaste={e=>{const pasted=e.clipboardData.files?.[0];if(pasted){e.preventDefault();void acceptFile(pasted);}}} onKeyDown={e=>{if(e.nativeEvent.isComposing||e.nativeEvent.keyCode===229)return;if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void submit();return;}if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void submit();}}} disabled={busy&&config.provider==='claude'}/>
          {!value&&!attachment&&<span className="composer-drop-hint">{t(busy?'steerHint':'dropFile')}</span>}
        </div>
        <input ref={file} type="file" hidden onChange={e=>void chooseFile(e)}/>
        <div className="composer-toolbar">
          <div className="composer-toolbar-left">
            <button className="icon-button attach-button" title={t('attach')} aria-label={t('attach')} disabled={busy} onClick={()=>file.current?.click()}><Plus/></button>
            <label className={`permission-picker permission-${mode}`} title={t('mode')}><ShieldCheck/><span>{modeText}</span><ChevronDown/><select aria-label={t('mode')} disabled={busy||!runtimeState} value={mode} onChange={e=>{void window.apollo.runtime.saveSettings({mode:e.target.value as RuntimeSettings['mode']}).then(()=>refreshRuntime()).catch(error=>setNotice(String(error)));}}><option value="chat">{t('chat')}</option><option value="plan">{t('plan')}</option><option value="agent">{t('agent')}</option><option value="yolo">{t('yolo')}</option></select></label>
            {project&&<span className="workspace-pill" title={project}><FolderOpen/>{project.split(/[\\/]/).at(-1)}</span>}
          </div>
          <div className="composer-toolbar-right">
            {config.provider==='openai'&&(config.apiMode==='auto'||config.apiMode==='responses')&&<label className="effort-picker" title={t('reasoningEffort')+' · '+t(config.reasoningEffort==='xhigh'?'effortXhigh':config.reasoningEffort==='high'?'effortHigh':config.reasoningEffort==='medium'?'effortMedium':config.reasoningEffort==='low'?'effortLow':'autoSelect')}><Gauge/><select aria-label={t('reasoningEffort')} disabled={busy} value={config.reasoningEffort||'auto'} onChange={e=>void chooseEffort(e.target.value as Config['reasoningEffort'])}><option value="auto">{t('autoSelect')}</option><option value="low">{t('effortLow')}</option><option value="medium">{t('effortMedium')}</option><option value="high">{t('effortHigh')}</option><option value="xhigh">{t('effortXhigh')}</option></select></label>}
            <button className="model-pill" title={t('chooseModel')} aria-label={t('chooseModel')} onClick={openModelMenu}><span>{config.provider==='claude'?'Claude Code':config.model||t('modelSettings')}</span><ChevronDown/></button>
            {busy&&<div className="run-controls" data-state={runStatus}>{config.provider!=='claude'&&<button className="pause-run" disabled={runStatus==='pausing'} title={t(runStatus==='paused'?'resumeTask':runStatus==='pausing'?'pausingTask':'pauseTask')} aria-label={t(runStatus==='paused'?'resumeTask':runStatus==='pausing'?'pausingTask':'pauseTask')} onClick={()=>void window.apollo.runtime.control(runStatus==='paused'?'resume':'pause',requestId.current).catch(e=>setNotice(String(e)))}>{runStatus==='paused'?<Play/>:<Pause/>}</button>}<button className="stop-run" title={t('stop')} aria-label={t('stop')} onClick={()=>void window.apollo.runtime.cancel()}><Square/></button></div>}
            {(!busy||config.provider!=='claude')&&<button className="send" title={t(busy?'steerSend':'send')} aria-label={t(busy?'steerSend':'send')} disabled={!value.trim()&&!(!busy&&attachment)} onClick={()=>void submit()}><ArrowUp/></button>}
          </div>
        </div>
      </div>
      {busy&&<div className={'run-status '+runStatus} role="status"><span className="status-dot"/>{t(runStatus==='paused'?'pausedTask':runStatus==='pausing'?'pausingTask':'runningTask')}<small>{t(runStatus==='paused'?'pausedHelp':'pauseHelp')}</small></div>}
      <div className="composer-meta"><span>{runtimeState?.settings.mode==='chat'?t('chatHint'):t('keyboardHint')}</span>{runtimeState?.settings.mode==='chat'&&<button type="button" onClick={()=>void window.apollo.runtime.saveSettings({mode:'agent'}).then(refreshRuntime).catch(e=>setNotice(String(e)))}>{t('switchAgent')}</button>}{project?null:<span>{t('noProjectTools')}</span>}</div>
      <div className="chips">{(skill||runtimeSkill) && <button className="chip" onClick={() => setSkillId(null)}>{skill?.name||runtimeSkill?.name}<X size={14}/></button>}{attachment && <button className="chip" onClick={() => setAttachment(null)}>{attachment.name}<X size={14}/></button>}</div>
      {notice && <p className="notice">{notice}</p>}
    </div>;
  }
  async function chooseProject() { const result = await window.apollo.chooseProject(); if (result.ok && result.root) { setProject(result.root); setWorkOutput(t('selectedProject') + result.root); } }
  async function chooseModel(model:string){
    const next={...config,model:model.trim()};if(!next.model||busy)return;
    try{await window.apollo.saveConfig(next);setConfig(next);closeModelMenu();setNotice('');}catch(error){setNotice(String(error));}
  }
  async function chooseEffort(effort:Config['reasoningEffort']){
    const next={...config,reasoningEffort:effort};
    try{await window.apollo.saveConfig(next);setConfig(next);setNotice('');}catch(error){setNotice(String(error));}
  }
  function openModelMenu(event:React.MouseEvent<HTMLButtonElement>){
    modelMenuTrigger.current=event.currentTarget;
    const rect=event.currentTarget.getBoundingClientRect(),width=Math.min(340,window.innerWidth-24),height=440;
    const belowSpace=window.innerHeight-rect.bottom-18,aboveSpace=rect.top-18;
    const above=belowSpace<height&&aboveSpace>belowSpace;
    setModelMenuAt({left:Math.max(12,Math.min(rect.right-width,window.innerWidth-width-12)),top:above?rect.top-6:rect.bottom+6,above,maxHeight:Math.min(height,above?aboveSpace:belowSpace)});
    setAvailableModels(cachedModels(config));setModelMenuOpen(true);setModelMenuError('');
    const request=++modelRequest.current;setModelMenuLoading(false);
    if(!modelsFresh(config)&&config.provider!=='claude'&&config.baseUrl&&(config.provider==='ollama'||config.apiKey)){
      setModelMenuLoading(true);
      void window.apollo.getModels(config).then(result=>{if(request!==modelRequest.current)return;if(result.ok){const models=result.models||[];cacheModels(config,models);setAvailableModels(models);}else setModelMenuError(result.error||t('fetchFailed'));}).catch(error=>{if(request===modelRequest.current)setModelMenuError(String(error));}).finally(()=>{if(request===modelRequest.current)setModelMenuLoading(false);});
    }
  }
  function closeModelMenu(){setModelMenuOpen(false);modelRequest.current++;modelMenuTrigger.current?.focus();}
  async function workspaceAction(action: 'status' | 'diff' | 'test') { try { const result = action === 'status' ? await window.apollo.gitStatus() : action === 'diff' ? await window.apollo.gitDiff() : await window.apollo.runTests(); setWorkOutput(result.output || (result.ok ? t('operationComplete') : t('operationFailed'))); } catch (error) { setWorkOutput(String(error)); } }
  return <div className="shell">
    <div className="dragbar"/>
    <div className="window-controls"><button title="Minimize" onClick={() => void window.apollo.minimize()}><Minus/></button><button title="Maximize" onClick={() => void window.apollo.maximize()}><Square/></button><button title="Close" onClick={() => void window.apollo.close()}><X/></button></div>
    <aside className="sidebar"><button className="brand" onClick={()=>{setActiveId(null);setPage('Home')}}><img className="brand-icon" src={brandIcon} alt=""/>ApolloCode</button>
      <button className="new-chat-button" onClick={newChat} title={t('newChat')}><MessageCircle/>{t('newChat')}</button>
      <div className="sidebar-scroll">
      <div className="sidebar-group"><h2>{t('conversations')}</h2><nav>
        {([['Home', Home, 'home'], ['Chat', MessageCircle, 'conversations']] as const).map(([name, Icon, label]) => <button data-page={name} key={name} title={t(label)} className={page === name ? 'active' : ''} onClick={() => {setPage(name);if(name==='Home')setActiveId(null);}}><Icon/>{t(label)}</button>)}
      </nav></div>
      <div className="sidebar-group"><h2>{t('projects')}</h2><nav>
        {([['Workspace', FolderOpen, 'workspace'], ['Workflows', GitBranch, 'workflows']] as const).map(([name, Icon, label]) => <button data-page={name} key={name} title={t(label)} className={page === name ? 'active' : ''} onClick={() => setPage(name)}><Icon/>{t(label)}</button>)}
      </nav></div>
      <div className="sidebar-group"><h2>{t('explore')}</h2><nav>
        {([['Explore', Compass, 'explore'], ['Automation', Compass, 'automation'], ['Skills', Sparkles, 'skills'], ['MCP', Plug, 'mcp'], ['Library', BookOpen, 'library']] as const).map(([name, Icon, label]) => <button data-page={name} key={name} title={t(label)} className={page === name ? 'active' : ''} onClick={() => {setPage(name);if(['Skills','MCP'].includes(name))void refreshRuntime().catch(e=>setNotice(String(e)));}}><Icon/>{t(label)}</button>)}
      </nav></div>
      <section className="sidebar-recents"><h2>{t('recent')}</h2>{recent.slice(0,5).map(c=><button key={c.id} className={page==='Chat'&&activeId===c.id?'active':''} aria-current={page==='Chat'&&activeId===c.id?'page':undefined} onClick={()=>openChat(c.id)} title={c.title}><MessageCircle/><span>{c.title}</span></button>)}{!recent.length&&<p>{t('noRecent')}</p>}</section>
      {project&&<section className="sidebar-recents project-recents"><h2>{t('projectChats')}</h2>{projectChats.slice(0,4).map(c=><button key={c.id} className={page==='Chat'&&activeId===c.id?'active':''} onClick={()=>openChat(c.id)} title={c.title}><FolderOpen/><span>{c.title}</span></button>)}{!projectChats.length&&<p>{t('noProjectChats')}</p>}</section>}
      </div>
      <div className="sidebar-group sidebar-settings"><nav><button data-page="Settings" title={t('settings')} aria-current={page==='Settings'?'page':undefined} className={page === 'Settings' ? 'active' : ''} onClick={() => {setSettingsSection('economy');setPage('Settings');void refreshRuntime().catch(e=>setNotice(String(e)));}}><Settings2/>{t('settings')}</button></nav></div>
      <div className="sidebar-footer"><img src={brandIcon} alt=""/><p>{language==='zh-CN'?'让想法成形':'SHAPE IDEAS'}<br/>{language==='zh-CN'?'从这里开始':'START HERE'}</p></div></aside>
    <main className="workspace">
      <div className="top-actions"><button className="theme-toggle" title={t(theme==='dark'?'themeDay':theme==='light'?'themeEclipse':'themeNight')} aria-label={t(theme==='dark'?'themeDay':theme==='light'?'themeEclipse':'themeNight')} disabled={switching} onClick={e=>void toggle(e.currentTarget)}>{theme==='dark'?<Sun/>:theme==='light'?<Sparkles/>:<Moon/>}</button><button title={t('searchChats')} aria-label={t('searchChats')} onClick={() => setSearchOpen(true)}><Search/></button><button className="model-picker-button" title={t('chooseModel')} onClick={openModelMenu}><span>{config.provider === 'claude' ? 'Claude Code' : config.model || t('modelSettings')}</span><ChevronDown size={14}/></button></div>
      {page === 'Home' && <div className="welcome"><div className="home-art" style={{backgroundImage:`url(${theme==='dark'?nightBackground:theme==='light'?dayBackground:eclipseBackground})`}} aria-hidden="true"/><header className="home-intro"><h1>{theme==='eclipse'?<>ApolloCode <span className="nyx-title">× Nyx</span></>:<>ApolloCode</>}</h1><p className="home-motto">{t('motto')}</p><p className="home-prompt">{t(theme==='eclipse'?'eclipseMotto':'askAnything')}</p></header><div className="welcome-entry">{composer()}<div className="quick-actions">{skills.map(s => <button key={s.id} className={skillId === s.id ? 'selected' : ''} onClick={() => selectSkill(s.id)}><s.icon/><span><strong>{t(s.id==='plan'?'writePlan':s.id==='data'?'analyzeData':s.id==='solve'?'create':'ideas')}</strong><small>{t(s.id==='plan'?'build':s.id==='data'?'insights':s.id==='solve'?'buildSomething':'discoverUnknown')}</small></span><ArrowRight/></button>)}</div></div></div>}
      {page === 'Chat' && !active && <section className="conversation-index"><header><div><small>{t('conversations')}</small><h1>{t('recent')}</h1></div><button onClick={newChat}><Plus/>{t('newChat')}</button></header>{recent.length?<div className="conversation-list">{recent.map(c=><button key={c.id} onClick={()=>openChat(c.id)}><MessageCircle/><span><strong>{c.title}</strong><small>{c.project||t('conversations')}</small></span><ArrowRight/></button>)}</div>:<p>{t('noRecent')}</p>}{composer(true)}</section>}
      {page === 'Chat' && active && <div className="conversation"><header><button onClick={newChat}>{t('newChatButton')}</button><strong>{active.title}</strong></header><div className="messages">{active.messages.map((m, i) => <div className={`message ${m.role}`} key={i}><span>{m.role === 'user' ? t('you') : `✶ ${t('apollo')}`}</span>{m.trace&&<WorkDetails trace={m.trace} openBrowser={()=>setPage('Automation')}/>}<div className={m.role==='assistant'?'markdown-body':''}>{m.role==='assistant'?<Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown>:<p>{m.content}</p>}</div></div>)}{busy && busyChat.current===active.id && <div className="message assistant"><span>✶ {t('apollo')}</span>{trace&&<WorkDetails trace={trace} openBrowser={()=>setPage('Automation')}/>}<div className="markdown-body runtime-stream"><Markdown remarkPlugins={[remarkGfm]}>{streamText||''}</Markdown></div></div>}<div ref={bottom}/></div>{composer(true)}</div>}
      {page === 'Explore' && <section className="content-page"><small>{t('discoverLabel')}</small><h1>{t('explorePossibilities')}</h1><div className="explore-grid">{skills.map(s => <button key={s.id} onClick={() => selectSkill(s.id)}><s.icon/><strong>{s.name}</strong><ArrowRight/></button>)}</div></section>}
      {(['Skills','MCP','Settings'] as Page[]).includes(page)&&<Management view={page as 'Skills'|'MCP'|'Settings'} state={runtimeState} refresh={refreshRuntime} useSkill={selectSkill} providerChanged={async()=>{const c=await window.apollo.getConfig();setConfig({provider:c.provider||'openai',baseUrl:c.baseUrl||'',model:c.model||'',apiKey:c.apiKey||'',apiMode:c.apiMode||'auto',reasoningEffort:c.reasoningEffort||'auto'});}} initialSection={settingsSection} onSectionChange={setSettingsSection} providerSettings={<ProviderSettings current={config} onSaved={async next=>{setConfig(next);await refreshRuntime();}}/>}/>}
      {(page==='Workflows'||page==='Automation')&&<Operations view={page} state={runtimeState} refresh={refreshRuntime}/>}
      {page === 'Library' && <section className="content-page"><small>{t('yourWorkLabel')}</small><h1>{t('library')}</h1>{recent.length ? <div className="library-list">{recent.map(c => <button key={c.id} onClick={() => openChat(c.id)}><MessageCircle/><span>{c.title}</span><ArrowRight/></button>)}</div> : <p>{t('conversationsAppear')}</p>}</section>}
      {page === 'Workspace' && <section className="content-page workspace-page"><small>{t('localProject')}</small><h1>{t('workspace')}</h1><div className="workspace-tools"><div><strong>{project || t('projectNone')}</strong><button onClick={() => void chooseProject()}><FolderOpen/>{t('selectProject')}</button></div><div><ShieldCheck/><span>{t('projectTools')}</span></div><div className="tool-actions"><button onClick={() => void workspaceAction('status')}><GitBranch/>{t('gitStatus')}</button><button onClick={() => void workspaceAction('diff')}><FileText/>{t('viewDiff')}</button><button onClick={() => void workspaceAction('test')}><Play/>{t('runTests')}</button></div><pre>{workOutput || t('selectProjectHint')}</pre><label className="patch-label">{t('pastePatch')}<textarea value={pendingPatch} onChange={e => setPendingPatch(e.target.value)} placeholder="diff --git a/file b/file ..."/></label><button className="apply-patch" disabled={!pendingPatch.trim()} onClick={() => void window.apollo.applyPatch(pendingPatch).then(r => {setWorkOutput(r.output || (r.ok ? t('patchApplied') : t('patchRejected'))); if (r.ok) {setPendingPatch('');setRollbackId(r.rollbackId||null);}}).catch(e => setWorkOutput(String(e)))}>{t('applyPatch')}</button>{rollbackId&&<button onClick={()=>void window.apollo.runtime.rollback(rollbackId).then(()=>{setRollbackId(null);setWorkOutput(t('rolledBack'));}).catch(e=>setWorkOutput(String(e)))}>{t('rollbackLastPatch')}</button>}</div><TaskJournal project={project} openTask={openTask}/><Worktrees project={project}/></section>}
    </main>
    {searchOpen && <div className="modal-cover" onMouseDown={() => setSearchOpen(false)}><div className="search-dialog" onMouseDown={e => e.stopPropagation()}><div className="search-line"><Search/><input autoFocus placeholder={t('searchChatsPlaceholder')} value={query} onChange={e => setQuery(e.target.value)}/><button onClick={() => setSearchOpen(false)}><X/></button></div>{recent.map(c => <button className="search-result" key={c.id} onClick={() => openChat(c.id)}>{c.title}<ArrowRight/></button>)}</div></div>}
    {modelMenuOpen&&<ModelMenu models={config.provider==='claude'?['Claude Code']:availableModels} current={config.provider==='claude'?'Claude Code':config.model} loading={modelMenuLoading} error={modelMenuError} disabled={busy||config.provider==='claude'} position={modelMenuAt} onChoose={chooseModel} onClose={closeModelMenu} onSettings={()=>{closeModelMenu();setSettingsSection('providers');setPage('Settings');void refreshRuntime().catch(e=>setNotice(String(e)));}}/>}

  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
