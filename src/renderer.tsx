import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowRight, ArrowUp, BookOpen, ChartNoAxesColumnIncreasing, ChevronDown, Compass, FileText, FolderOpen, GitBranch, Lightbulb, MessageCircle, Minus, Paperclip, Play, Plus, Search, Settings2, ShieldCheck, Sparkles, Plug, Square, Sun, Moon, Home, X} from 'lucide-react';
import {Management} from './Management';
import {Operations} from './Operations';
import type {RuntimeState,RuntimeSettings,WorkTrace} from './runtime-types';
import {WorkDetails} from './WorkDetails';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import nightBackground from '../assets/night-background.webp';
import dayBackground from '../assets/day-background.webp';
import brandIcon from '../assets/apollo-mark.png';
import {useTheme} from './theme';
import {useLanguage} from './i18n';
import './styles.css';
import './connection.css';
import './themes.css';
import './activity.css';

type Message = {role: 'user' | 'assistant'; content: string;trace?:WorkTrace};
type Chat = {id: string; title: string; updated: number; messages: Message[]};
type Page = 'Chat' | 'Explore' | 'Library' | 'Workspace' | 'Skills' | 'MCP' | 'Settings' | 'Workflows' | 'Automation';
type Provider = 'openai' | 'anthropic' | 'claude' | 'ollama';
type Config = {provider: Provider; baseUrl: string; model: string; apiKey: string;apiMode?:'auto'|'chat'|'responses'};
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
  useEffect(()=>{for(const src of [nightBackground,dayBackground]){const image=new Image();image.src=src;}},[]);
  const [page, setPage] = useState<Page>('Chat');
  const [chats, setChats] = useState<Chat[]>(loadChats);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [runtimeState,setRuntimeState]=useState<RuntimeState|null>(null);
  const [streamText,setStreamText]=useState('');
  const [progress,setProgress]=useState('');
  const [trace,setTrace]=useState<WorkTrace|null>(null);
  const traceRef=useRef<WorkTrace|null>(null);
  const requestId=useRef('');
  const busyChat=useRef('');
  async function refreshRuntime(){setRuntimeState(await window.apollo.runtime.state());}
  useEffect(()=>{void refreshRuntime().catch(e=>setNotice(String(e)));return window.apollo.runtime.onEvent(event=>{
    if(event.requestId!==requestId.current)return;
    if(event.type!=='delta'&&event.type!=='usage'&&event.type!=='done'&&traceRef.current){
      const events=[...traceRef.current.events],last=events.at(-1);
      if(event.type==='reasoning_summary'&&last?.type==='reasoning_summary')events[events.length-1]={...last,text:(last.text||'')+(event.text||'')};else events.push({...event,time:event.time||Date.now()});
      traceRef.current={...traceRef.current,events:events.slice(-200)};setTrace(traceRef.current);
    }
    if(event.type==='delta')setStreamText(text=>text+(event.text||''));
    if(event.type==='commentary')setStreamText('');
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [notice, setNotice] = useState('');
  const [project, setProject] = useState('');
  const [workOutput, setWorkOutput] = useState('');
  const [pendingPatch, setPendingPatch] = useState('');
  const [rollbackId,setRollbackId]=useState<string|null>(null);
  const [config, setConfig] = useState<Config>({provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', apiKey: ''});
  useEffect(() => {setAvailableModels([]); setConnectionStatus('');}, [config.provider, config.baseUrl, config.apiKey]);
  useEffect(() => {
    if (!settingsOpen || config.provider === 'claude' || !config.baseUrl.trim() || (config.provider !== 'ollama' && !config.apiKey.trim())) return;
    let disposed = false;
    const timer = setTimeout(() => {
      setLoadingModels(true); setSettingsError('');
      void window.apollo.getModels(config).then(result => {
        if (disposed) return;
        const models = result.models || [];
        setAvailableModels(models);
        if (result.ok && models.length) {
          setConfig(current => ({...current, model: models.includes(current.model) ? current.model : models[0]}));
          setSaved(false); setConnectionStatus(t('availableModels') + models.length);
        } else setSettingsError(result.error || t('providerNoModels'));
      }).catch(error => {if (!disposed) setSettingsError(String(error));}).finally(() => {if (!disposed) setLoadingModels(false);});
    }, 700);
    return () => {disposed = true; clearTimeout(timer); setLoadingModels(false);};
  }, [settingsOpen, config.provider, config.baseUrl, config.apiKey]);
  const input = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {if(input.current)resizeComposer(input.current);}, [value, activeId, page]);
  const active = chats.find(c => c.id === activeId);
  const recent = [...chats].filter(c => c.title.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.updated - a.updated);
  const skill = skills.find(s => s.id === skillId);
  const runtimeSkill=runtimeState?.skills.find(s=>s.id===skillId);
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(chats)); }, [chats]);
  useEffect(() => { void window.apollo.getConfig().then(c => setConfig({provider: c.provider || 'openai', baseUrl: c.baseUrl || 'https://api.openai.com/v1', model: c.model || '', apiKey: c.apiKey || '',apiMode:c.apiMode||'auto'})); }, []);
  useEffect(() => { void window.apollo.getProject().then(p => setProject(p.root || '')); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({behavior: 'smooth'}); }, [active?.messages.length, busy]);
  function newChat() { if(busy){setNotice(t('pleaseStop'));return;}setActiveId(null); setPage('Chat'); setValue(''); setAttachment(null); setSkillId(null); input.current?.focus(); }
  function openChat(id: string) { if(busy){setNotice(t('pleaseStop'));return;}setActiveId(id); setPage('Chat'); setSearchOpen(false); setValue(''); setSkillId(null); }
  function selectSkill(id: string) { setSkillId(id); setPage('Chat'); setTimeout(() => input.current?.focus(), 0); }
  function updateReply(id: string, content: string,work?:WorkTrace) { setChats(current => current.map(c => c.id === id ? {...c, updated: Date.now(), messages: [...c.messages, {role: 'assistant', content,trace:work}]} : c)); }
  async function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    await acceptFile(selected);
  }
  async function acceptFile(selected: File) {
    if(busy)return;
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
    if ((!text && !attachment) || busy) return;
    const content = [text, attachment ? `${t('fileLabel')}${attachment.name}:\n${attachment.content}` : ''].filter(Boolean).join('\n\n');
    const id = activeId || crypto.randomUUID();
    const messages: Message[] = [...(active?.messages || []), {role: 'user', content}];
    setChats(current => activeId ? current.map(c => c.id === id ? {...c, updated: Date.now(), messages} : c) : [{id, title: (text || attachment?.name || t('newChatTitle')).slice(0, 42), updated: Date.now(), messages}, ...current]);
    setActiveId(id); setValue(''); setAttachment(null); setBusy(true); setNotice('');setStreamText('');setProgress(t('connectModel'));requestId.current=crypto.randomUUID();busyChat.current=id;
    traceRef.current={started:Date.now(),status:'running',model:config.model,mode:runtimeState?.settings.mode,events:[]};setTrace(traceRef.current);
    const finish=(status:WorkTrace['status'])=>({...traceRef.current!,ended:Date.now(),status});
    try {
      const result = await window.apollo.chat({messages:messages.map(({role,content})=>({role,content})), instruction: skill?.instruction || '',skillId:runtimeSkill?.id,requestId:requestId.current});
      updateReply(id, result.ok ? result.content || '' : result.error || t('requestFailed'),finish(result.ok?'done':result.error?.includes('中断')?'interrupted':'failed'));
    } catch (error) { updateReply(id, `${t('failedPrefix')}${(error as Error).message}`,finish('failed')); }
    finally { setBusy(false);setStreamText('');setProgress('');void refreshRuntime().catch(()=>{}); }
  }
  function composer(compact = false) {
    const mode=runtimeState?.settings.mode||'agent';
    const modeText=mode==='chat'?t('chatOnly'):mode==='plan'?t('readOnly'):mode==='yolo'?t('automatic'):t('agentApproval');
    return <div className={compact ? 'entry compact' : 'entry'}>
      <div className="composer" onDragOver={e=>{e.preventDefault();e.currentTarget.classList.add('dragging');}} onDragLeave={e=>e.currentTarget.classList.remove('dragging')} onDrop={e=>{e.preventDefault();e.currentTarget.classList.remove('dragging');const dropped=e.dataTransfer.files?.[0];if(dropped)void acceptFile(dropped);}}>
        <div className="composer-editor">
          <textarea ref={input} rows={1} placeholder={t('ask')} aria-label={t('ask')} value={value} onChange={e=>{setValue(e.target.value);resizeComposer(e.currentTarget);}} onFocus={e=>resizeComposer(e.currentTarget)} onPaste={e=>{const pasted=e.clipboardData.files?.[0];if(pasted){e.preventDefault();void acceptFile(pasted);}}} onKeyDown={e=>{if(e.nativeEvent.isComposing||e.nativeEvent.keyCode===229)return;if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void submit();return;}if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void submit();}}} disabled={busy}/>
          {!value&&!attachment&&<span className="composer-drop-hint">{t('dropFile')}</span>}
        </div>
        <input ref={file} type="file" hidden onChange={e=>void chooseFile(e)}/>
        <div className="composer-toolbar">
          <div className="composer-toolbar-left">
            <button className="icon-button attach-button" title={t('attach')} aria-label={t('attach')} onClick={()=>file.current?.click()}><Plus/></button>
            <label className={`permission-picker permission-${mode}`} title={t('mode')}><ShieldCheck/><span>{modeText}</span><ChevronDown/><select aria-label={t('mode')} disabled={busy||!runtimeState} value={mode} onChange={e=>{void window.apollo.runtime.saveSettings({mode:e.target.value as RuntimeSettings['mode']}).then(()=>refreshRuntime()).catch(error=>setNotice(String(error)));}}><option value="chat">{t('chat')}</option><option value="plan">{t('plan')}</option><option value="agent">{t('agent')}</option><option value="yolo">{t('yolo')}</option></select></label>
            {project&&<span className="workspace-pill" title={project}><FolderOpen/>{project.split(/[\\/]/).at(-1)}</span>}
          </div>
          <div className="composer-toolbar-right">
            <button className="model-pill" title={t('modelSettings')} aria-label={t('modelSettings')} onClick={()=>setSettingsOpen(true)}><span>{config.provider==='claude'?'Claude Code':config.model||t('modelSettings')}</span><ChevronDown/></button>
            {busy?<button className="send stop-run" title={t('stop')} aria-label={t('stop')} onClick={()=>void window.apollo.runtime.cancel()}><Square/></button>:<button className="send" title={t('send')} aria-label={t('send')} disabled={!value.trim()&&!attachment} onClick={()=>void submit()}><ArrowUp/></button>}
          </div>
        </div>
      </div>
      <div className="composer-meta"><span>{runtimeState?.settings.mode==='chat'?t('chatHint'):t('keyboardHint')}</span>{runtimeState?.settings.mode==='chat'&&<button type="button" onClick={()=>void window.apollo.runtime.saveSettings({mode:'agent'}).then(refreshRuntime).catch(e=>setNotice(String(e)))}>{t('switchAgent')}</button>}{project?null:<span>{t('noProjectTools')}</span>}</div>
      <div className="chips">{(skill||runtimeSkill) && <button className="chip" onClick={() => setSkillId(null)}>{skill?.name||runtimeSkill?.name}<X size={14}/></button>}{attachment && <button className="chip" onClick={() => setAttachment(null)}>{attachment.name}<X size={14}/></button>}</div>
      {notice && <p className="notice">{notice}</p>}
    </div>;
  }
  async function chooseProject() { const result = await window.apollo.chooseProject(); if (result.ok && result.root) { setProject(result.root); setWorkOutput(t('selectedProject') + result.root); } }
  async function workspaceAction(action: 'status' | 'diff' | 'test') { try { const result = action === 'status' ? await window.apollo.gitStatus() : action === 'diff' ? await window.apollo.gitDiff() : await window.apollo.runTests(); setWorkOutput(result.output || (result.ok ? t('operationComplete') : t('operationFailed'))); } catch (error) { setWorkOutput(String(error)); } }
  return <div className="shell">
    <div className="dragbar"/>
    <div className="window-controls"><button title="Minimize" onClick={() => void window.apollo.minimize()}><Minus/></button><button title="Maximize" onClick={() => void window.apollo.maximize()}><Square/></button><button title="Close" onClick={() => void window.apollo.close()}><X/></button></div>
    <aside className="sidebar"><button className="brand" onClick={newChat}><img className="brand-icon" src={brandIcon} alt=""/>ApolloCode</button><button className="new-chat-button" onClick={newChat} title={t('newChat')}><MessageCircle/>{t('newChat')}</button><nav>
      {([['Chat', Home, 'home'], ['Explore', Compass, 'explore'], ['Workspace', FolderOpen, 'workspace'], ['Workflows', GitBranch, 'workflows'], ['Automation', Compass, 'automation'], ['Skills', Sparkles, 'skills'], ['MCP', Plug, 'mcp'], ['Library', BookOpen, 'library'], ['Settings', Settings2, 'settings']] as const).map(([name, Icon, label]) => <button data-page={name} key={name} title={t(label)} className={page === name ? 'active' : ''} onClick={() => {setPage(name);if(['Skills','MCP','Settings'].includes(name))void refreshRuntime().catch(e=>setNotice(String(e)));}}><Icon/>{t(label)}</button>)}
    </nav><section className="sidebar-recents"><h2>{t('recent')}</h2>{recent.slice(0,5).map(c=><button key={c.id} className={activeId===c.id?'active':''} onClick={()=>openChat(c.id)} title={c.title}><MessageCircle/><span>{c.title}</span></button>)}{!recent.length&&<p>{t('noRecent')}</p>}</section><div className="sidebar-footer"><img src={brandIcon} alt=""/><p>{language==='zh-CN'?'让想法成形':'SHAPE IDEAS'}<br/>{language==='zh-CN'?'从这里开始':'START HERE'}</p></div></aside>
    <main className="workspace">
      <div className="top-actions"><button className="theme-toggle" title={theme==='dark'?t('themeDay'):t('themeNight')} aria-label={theme==='dark'?t('themeDay'):t('themeNight')} disabled={switching} onClick={e=>void toggle(e.currentTarget)}>{theme==='dark'?<Sun/>:<Moon/>}</button><button title={t('searchChats')} aria-label={t('searchChats')} onClick={() => setSearchOpen(true)}><Search/></button><button className="model-picker-button" title={t('modelSettings')} onClick={() => setSettingsOpen(true)}><Settings2/><span>{config.provider === 'claude' ? 'Claude Code' : config.model || t('modelSettings')}</span></button></div>
      {page === 'Chat' && !active && <div className="welcome"><div className="home-art" style={{backgroundImage:`url(${theme==='dark'?nightBackground:dayBackground})`}} aria-hidden="true"/><header className="home-intro"><h1>ApolloCode</h1><p className="home-motto">{t('motto')}</p><p className="home-prompt">{t('askAnything')}</p></header><div className="welcome-entry">{composer()}<div className="quick-actions">{skills.map(s => <button key={s.id} className={skillId === s.id ? 'selected' : ''} onClick={() => selectSkill(s.id)}><s.icon/><span><strong>{t(s.id==='plan'?'writePlan':s.id==='data'?'analyzeData':s.id==='solve'?'create':'ideas')}</strong><small>{t(s.id==='plan'?'build':s.id==='data'?'insights':s.id==='solve'?'buildSomething':'discoverUnknown')}</small></span><ArrowRight/></button>)}</div></div></div>}
      {page === 'Chat' && active && <div className="conversation"><header><button onClick={newChat}>{t('newChatButton')}</button><strong>{active.title}</strong></header><div className="messages">{active.messages.map((m, i) => <div className={`message ${m.role}`} key={i}><span>{m.role === 'user' ? t('you') : `✶ ${t('apollo')}`}</span>{m.trace&&<WorkDetails trace={m.trace} openBrowser={()=>setPage('Automation')}/>}<div className={m.role==='assistant'?'markdown-body':''}>{m.role==='assistant'?<Markdown remarkPlugins={[remarkGfm]}>{m.content}</Markdown>:<p>{m.content}</p>}</div></div>)}{busy && busyChat.current===active.id && <div className="message assistant"><span>✶ {t('apollo')}</span>{trace&&<WorkDetails trace={trace} openBrowser={()=>setPage('Automation')}/>}<div className="markdown-body runtime-stream"><Markdown remarkPlugins={[remarkGfm]}>{streamText||'_'}</Markdown></div></div>}<div ref={bottom}/></div>{composer(true)}</div>}
      {page === 'Explore' && <section className="content-page"><small>{t('discoverLabel')}</small><h1>{t('explorePossibilities')}</h1><div className="explore-grid">{skills.map(s => <button key={s.id} onClick={() => selectSkill(s.id)}><s.icon/><strong>{s.name}</strong><ArrowRight/></button>)}</div></section>}
      {(['Skills','MCP','Settings'] as Page[]).includes(page)&&<Management view={page as 'Skills'|'MCP'|'Settings'} state={runtimeState} refresh={refreshRuntime} useSkill={selectSkill} providerChanged={async()=>{const c=await window.apollo.getConfig();setConfig({provider:c.provider||'openai',baseUrl:c.baseUrl||'',model:c.model||'',apiKey:c.apiKey||'',apiMode:c.apiMode||'auto'});}} openProviders={()=>setSettingsOpen(true)}/>}
      {(page==='Workflows'||page==='Automation')&&<Operations view={page} state={runtimeState} refresh={refreshRuntime}/>}
      {page === 'Library' && <section className="content-page"><small>{t('yourWorkLabel')}</small><h1>{t('library')}</h1>{recent.length ? <div className="library-list">{recent.map(c => <button key={c.id} onClick={() => openChat(c.id)}><MessageCircle/><span>{c.title}</span><ArrowRight/></button>)}</div> : <p>{t('conversationsAppear')}</p>}</section>}
      {page === 'Workspace' && <section className="content-page workspace-page"><small>{t('localProject')}</small><h1>{t('workspace')}</h1><div className="workspace-tools"><div><strong>{project || t('projectNone')}</strong><button onClick={() => void chooseProject()}><FolderOpen/>{t('selectProject')}</button></div><div><ShieldCheck/><span>{t('projectTools')}</span></div><div className="tool-actions"><button onClick={() => void workspaceAction('status')}><GitBranch/>{t('gitStatus')}</button><button onClick={() => void workspaceAction('diff')}><FileText/>{t('viewDiff')}</button><button onClick={() => void workspaceAction('test')}><Play/>{t('runTests')}</button></div><pre>{workOutput || t('selectProjectHint')}</pre><label className="patch-label">{t('pastePatch')}<textarea value={pendingPatch} onChange={e => setPendingPatch(e.target.value)} placeholder="diff --git a/file b/file ..."/></label><button className="apply-patch" disabled={!pendingPatch.trim()} onClick={() => void window.apollo.applyPatch(pendingPatch).then(r => {setWorkOutput(r.output || (r.ok ? t('patchApplied') : t('patchRejected'))); if (r.ok) {setPendingPatch('');setRollbackId(r.rollbackId||null);}}).catch(e => setWorkOutput(String(e)))}>{t('applyPatch')}</button>{rollbackId&&<button onClick={()=>void window.apollo.runtime.rollback(rollbackId).then(()=>{setRollbackId(null);setWorkOutput(t('rolledBack'));}).catch(e=>setWorkOutput(String(e)))}>{t('rollbackLastPatch')}</button>}</div></section>}
    </main>
    {searchOpen && <div className="modal-cover" onMouseDown={() => setSearchOpen(false)}><div className="search-dialog" onMouseDown={e => e.stopPropagation()}><div className="search-line"><Search/><input autoFocus placeholder={t('searchChatsPlaceholder')} value={query} onChange={e => setQuery(e.target.value)}/><button onClick={() => setSearchOpen(false)}><X/></button></div>{recent.map(c => <button className="search-result" key={c.id} onClick={() => openChat(c.id)}>{c.title}<ArrowRight/></button>)}</div></div>}
    {settingsOpen && <div className="modal-cover" onMouseDown={() => setSettingsOpen(false)}><form className="settings-dialog" onMouseDown={e => e.stopPropagation()} onSubmit={e => {e.preventDefault(); setSettingsError(''); void window.apollo.saveConfig(config).then(() => {setSaved(true); setSettingsOpen(false);}).catch(err => setSettingsError(String(err)));}}><header><h2>{t('modelProvider')}</h2><button type="button" onClick={() => setSettingsOpen(false)}><X/></button></header>
      <details className="provider-details" open={!config.baseUrl || (config.provider !== 'claude' && config.provider !== 'ollama' && !config.apiKey)}><summary>{t('providerConnection')} · {config.provider === 'claude' ? 'Claude Code' : config.provider === 'ollama' ? 'Ollama' : config.provider === 'anthropic' ? 'Anthropic' : 'OpenAI-compatible'}</summary>
      <label>{t('provider')}<select value={config.provider} onChange={e => {const provider = e.target.value as Provider; setSaved(false); setConfig({...config, provider, baseUrl: provider === 'anthropic' ? 'https://api.anthropic.com/v1' : provider === 'ollama' ? 'http://localhost:11434/v1' : provider === 'openai' ? 'https://api.openai.com/v1' : '', model: provider === 'claude' ? '' : config.model});}}><option value="openai">OpenAI-compatible / DeepSeek</option><option value="anthropic">Anthropic API</option><option value="ollama">Local Ollama</option><option value="claude">Claude Code CLI</option></select></label>
      {config.provider === 'claude' ? <p className="settings-note">{t('claudeNote')}</p> : <label>{t('apiUrl')}<input value={config.baseUrl} onChange={e => {setSaved(false); setConfig({...config, baseUrl: e.target.value});}} placeholder={config.provider === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1'} required/></label>}
      {config.provider !== 'claude' && config.provider !== 'ollama' && <label>{t('apiKey')}<input type="password" value={config.apiKey} onChange={e => {setSaved(false); setConfig({...config, apiKey: e.target.value});}} placeholder={t('apiKey')} required/></label>}
      {config.provider==='openai'&&<label>{t('protocol')}<select value={config.apiMode||'auto'} onChange={e=>{setSaved(false);setConnectionStatus('');setConfig({...config,apiMode:e.target.value as Config['apiMode']});}}><option value="auto">{t('autoSelect')}</option><option value="responses">{t('responses')}</option><option value="chat">{t('chatCompletions')}</option></select></label>}
      </details>
      {config.provider !== 'claude' && <label>{t('model')}<select value={availableModels.includes(config.model) ? config.model : ''} disabled={loadingModels || !availableModels.length} required onChange={e => {setSaved(false); setConnectionStatus(''); setConfig({...config, model: e.target.value});}}><option value="" disabled>{loadingModels ? t('loadingModels') : availableModels.length ? t('chooseModel') : t('noModels')}</option>{availableModels.map(model => <option key={model} value={model}>{model}</option>)}</select></label>}
      {config.provider !== 'claude' && <div className="connection-actions"><button type="button" disabled={checkingConnection} onClick={() => {setCheckingConnection(true); setSettingsError(''); void window.apollo.getModels(config).then(r => {setAvailableModels(r.models || []); if (r.ok) setConnectionStatus(t('availableModels') + (r.models?.length || 0)); else {setConnectionStatus(''); setSettingsError(r.error || t('fetchFailed'));}}).catch(e => setSettingsError(String(e))).finally(() => setCheckingConnection(false));}}><Search/>{t('getModels')}</button><button type="button" disabled={checkingConnection || !config.model.trim()} onClick={() => {setCheckingConnection(true); setSettingsError(''); setConnectionStatus(''); void window.apollo.testConnection(config).then(r => {if(r.ok) setConnectionStatus(t('connectionSuccess') + config.model); else setSettingsError(r.error || t('connectionFailed'));}).catch(e => setSettingsError(String(e))).finally(() => setCheckingConnection(false));}}><Play/>{checkingConnection ? t('requesting') : t('testConnection')}</button></div>}
      {connectionStatus && <p className="connection-status" role="status">{connectionStatus}</p>}{settingsError && <p className="notice" role="alert">{settingsError}</p>}<button className="save" disabled={config.provider !== 'claude' && (loadingModels || !availableModels.includes(config.model))} type="submit">{t('useModel')}</button>
    </form></div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
