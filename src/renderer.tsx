import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowRight, ArrowUp, BookOpen, ChartNoAxesColumnIncreasing, Compass, FileText, FolderOpen, GitBranch, Lightbulb, MessageCircle, Minus, Paperclip, Play, Search, Settings2, ShieldCheck, Sparkles, Plug, Square, Sun, Moon, Home, X} from 'lucide-react';
import {Management} from './Management';
import {Operations} from './Operations';
import type {RuntimeState,RuntimeSettings,WorkTrace} from './runtime-types';
import {WorkDetails} from './WorkDetails';
import nightBackground from '../assets/night-background.webp';
import dayBackground from '../assets/day-background.webp';
import brandIcon from '../assets/star-mark.png';
import {useTheme} from './theme';
import './styles.css';
import './connection.css';
import './themes.css';

type Message = {role: 'user' | 'assistant'; content: string;trace?:WorkTrace};
type Chat = {id: string; title: string; updated: number; messages: Message[]};
type Page = 'Chat' | 'Explore' | 'Library' | 'Workspace' | 'Skills' | 'MCP' | 'Settings' | 'Workflows' | 'Automation';
type Provider = 'openai' | 'anthropic' | 'claude' | 'ollama';
type Config = {provider: Provider; baseUrl: string; model: string; apiKey: string};
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
    if(event.type!=='delta'&&event.type!=='usage'&&event.type!=='done'&&traceRef.current){traceRef.current={...traceRef.current,events:[...traceRef.current.events,{...event,time:event.time||Date.now()}].slice(-200)};setTrace(traceRef.current);}
    if(event.type==='delta')setStreamText(text=>text+(event.text||''));
    if(event.type==='tool')setProgress((event.status==='running'?'正在执行：':'已完成：')+event.name);
    if(event.rollbackId)setRollbackId(event.rollbackId);
    if(event.type==='step')setProgress('模型步骤 '+event.step);
    if(event.type==='context')setProgress('上下文约 '+event.estimatedTokens+' Token · 省略 '+event.omittedMessages+' 条早期消息');
    if(event.type==='usage'&&event.alert)setNotice('累计预估费用已达到设置阈值。');
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
          setSaved(false); setConnectionStatus('已获取 ' + models.length + ' 个模型');
        } else setSettingsError(result.error || '服务商未返回可用模型，请检查账户授权或联系服务商。');
      }).catch(error => {if (!disposed) setSettingsError(String(error));}).finally(() => {if (!disposed) setLoadingModels(false);});
    }, 700);
    return () => {disposed = true; clearTimeout(timer); setLoadingModels(false);};
  }, [settingsOpen, config.provider, config.baseUrl, config.apiKey]);
  const input = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const active = chats.find(c => c.id === activeId);
  const recent = [...chats].filter(c => c.title.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.updated - a.updated);
  const skill = skills.find(s => s.id === skillId);
  const runtimeSkill=runtimeState?.skills.find(s=>s.id===skillId);
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(chats)); }, [chats]);
  useEffect(() => { void window.apollo.getConfig().then(c => setConfig({provider: c.provider || 'openai', baseUrl: c.baseUrl || 'https://api.openai.com/v1', model: c.model || '', apiKey: c.apiKey || ''})); }, []);
  useEffect(() => { void window.apollo.getProject().then(p => setProject(p.root || '')); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({behavior: 'smooth'}); }, [active?.messages.length, busy]);
  function newChat() { if(busy){setNotice('请先中断当前任务。');return;}setActiveId(null); setPage('Chat'); setValue(''); setAttachment(null); setSkillId(null); input.current?.focus(); }
  function openChat(id: string) { if(busy){setNotice('请先中断当前任务。');return;}setActiveId(id); setPage('Chat'); setSearchOpen(false); setValue(''); setSkillId(null); }
  function selectSkill(id: string) { setSkillId(id); setPage('Chat'); setTimeout(() => input.current?.focus(), 0); }
  function updateReply(id: string, content: string,work?:WorkTrace) { setChats(current => current.map(c => c.id === id ? {...c, updated: Date.now(), messages: [...c.messages, {role: 'assistant', content,trace:work}]} : c)); }
  async function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    if (selected.size > 100_000) { setNotice('文件超过 100 KB，请选择更小的文本文件。'); return; }
    if (!/\.(txt|md|csv|json|js|jsx|ts|tsx|py|html|css|xml|yaml|yml|log)$/i.test(selected.name)) { setNotice('目前仅支持文本与代码文件。'); return; }
    setAttachment({name: selected.name, content: await selected.text()});
    setNotice('');
  }
  async function submit() {
    const text = value.trim();
    if ((!text && !attachment) || busy) return;
    const content = [text, attachment ? `文件 ${attachment.name}:\n${attachment.content}` : ''].filter(Boolean).join('\n\n');
    const id = activeId || crypto.randomUUID();
    const messages: Message[] = [...(active?.messages || []), {role: 'user', content}];
    setChats(current => activeId ? current.map(c => c.id === id ? {...c, updated: Date.now(), messages} : c) : [{id, title: (text || attachment?.name || 'New chat').slice(0, 42), updated: Date.now(), messages}, ...current]);
    setActiveId(id); setValue(''); setAttachment(null); setBusy(true); setNotice('');setStreamText('');setProgress('连接模型…');requestId.current=crypto.randomUUID();busyChat.current=id;
    traceRef.current={started:Date.now(),status:'running',events:[]};setTrace(traceRef.current);
    const finish=(status:WorkTrace['status'])=>({...traceRef.current!,ended:Date.now(),status});
    try {
      const result = await window.apollo.chat({messages:messages.map(({role,content})=>({role,content})), instruction: skill?.instruction || '',skillId:runtimeSkill?.id,requestId:requestId.current});
      updateReply(id, result.ok ? result.content || '' : result.error || '请求失败。',finish(result.ok?'done':result.error?.includes('中断')?'interrupted':'failed'));
    } catch (error) { updateReply(id, `请求失败：${(error as Error).message}`,finish('failed')); }
    finally { setBusy(false);setStreamText('');setProgress('');void refreshRuntime().catch(()=>{}); }
  }
  function composer(compact = false) {
    return <div className={compact ? 'entry compact' : 'entry'}>
      <div className="composer-mode"><label>模式 <select disabled={busy||!runtimeState} value={runtimeState?.settings.mode||'chat'} onChange={e=>{void window.apollo.runtime.saveSettings({mode:e.target.value as RuntimeSettings['mode']}).then(()=>refreshRuntime()).catch(error=>setNotice(String(error)));}}><option value="chat">Chat</option><option value="plan">Plan</option><option value="agent">Agent</option><option value="yolo">YOLO</option></select></label><span>{runtimeState?.settings.contextTokens||8192} 上下文预算 · {runtimeState?.settings.maxOutputTokens||768} 输出上限</span></div>
      <div className="composer">
        {!compact && <img className="mark brand-icon" src={brandIcon} alt=""/>}
        <textarea ref={compact ? undefined : input} rows={2} placeholder="Ask ApolloCode anything..." value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => {if (e.key === 'Enter' && !e.shiftKey) {e.preventDefault(); void submit();}}} disabled={busy}/>
        <input ref={file} type="file" hidden onChange={e => void chooseFile(e)}/>
        <button title="Attach text file" aria-label="Attach text file" onClick={() => file.current?.click()}><Paperclip/></button>
        <button title="Model settings" aria-label="Model settings" onClick={() => setSettingsOpen(true)}><Settings2/></button>
        {busy?<button className="stop-run" title="中断任务" aria-label="中断任务" onClick={()=>void window.apollo.runtime.cancel()}><Square/></button>:<button className="send" title="Send" aria-label="Send" disabled={!value.trim() && !attachment} onClick={() => void submit()}><ArrowUp/></button>}
      </div>
      <div className="chips">{(skill||runtimeSkill) && <button className="chip" onClick={() => setSkillId(null)}>{skill?.name||runtimeSkill?.name}<X size={14}/></button>}{attachment && <button className="chip" onClick={() => setAttachment(null)}>{attachment.name}<X size={14}/></button>}</div>
      {notice && <p className="notice">{notice}</p>}
    </div>;
  }
  async function chooseProject() { const result = await window.apollo.chooseProject(); if (result.ok && result.root) { setProject(result.root); setWorkOutput('项目已锁定到：' + result.root); } }
  async function workspaceAction(action: 'status' | 'diff' | 'test') { try { const result = action === 'status' ? await window.apollo.gitStatus() : action === 'diff' ? await window.apollo.gitDiff() : await window.apollo.runTests(); setWorkOutput(result.output || (result.ok ? '完成' : '操作失败')); } catch (error) { setWorkOutput(String(error)); } }
  return <div className="shell">
    <div className="dragbar"/>
    <div className="window-controls"><button title="Minimize" onClick={() => void window.apollo.minimize()}><Minus/></button><button title="Maximize" onClick={() => void window.apollo.maximize()}><Square/></button><button title="Close" onClick={() => void window.apollo.close()}><X/></button></div>
    <aside className="sidebar"><button className="brand" onClick={newChat}><img className="brand-icon" src={brandIcon} alt=""/>ApolloCode</button><button className="new-chat-button" onClick={newChat} title="New chat"><MessageCircle/>New Chat</button><nav>
      {([['Chat', Home], ['Explore', Compass], ['Workspace', FolderOpen], ['Workflows', GitBranch], ['Automation', Compass], ['Skills', Sparkles], ['MCP', Plug], ['Library', BookOpen], ['Settings', Settings2]] as const).map(([name, Icon]) => <button key={name} title={name==='Chat'?'Home':name} className={page === name ? 'active' : ''} onClick={() => {setPage(name);if(['Skills','MCP','Settings'].includes(name))void refreshRuntime().catch(e=>setNotice(String(e)));}}><Icon/>{name==='Chat'?'Home':name}</button>)}
    </nav><section className="sidebar-recents"><h2>RECENT</h2>{recent.slice(0,5).map(c=><button key={c.id} className={activeId===c.id?'active':''} onClick={()=>openChat(c.id)} title={c.title}><MessageCircle/><span>{c.title}</span></button>)}{!recent.length&&<p>No recent chats</p>}</section><div className="sidebar-footer"><img src={brandIcon} alt=""/><p>YOUR IDEAS<br/>SHAPE TOMORROW</p></div></aside>
    <main className="workspace">
      <div className="top-actions"><button className="theme-toggle" title={theme==='dark'?'切换日间主题':'切换夜间主题'} aria-label={theme==='dark'?'切换日间主题':'切换夜间主题'} disabled={switching} onClick={e=>void toggle(e.currentTarget)}>{theme==='dark'?<Sun/>:<Moon/>}</button><button title="Search chats" onClick={() => setSearchOpen(true)}><Search/></button><button className="model-picker-button" title="选择模型与供应商" onClick={() => setSettingsOpen(true)}><Settings2/><span>{config.provider === 'claude' ? 'Claude Code' : config.model || '选择模型'}</span></button></div>
      {page === 'Chat' && !active && <div className="welcome"><div className="home-art" style={{backgroundImage:`url(${theme==='dark'?nightBackground:dayBackground})`}} aria-hidden="true"/><header className="home-intro"><h1>ApolloCode</h1><p className="home-motto">EXPLORE · THINK · CREATE</p><p className="home-prompt">Ask anything, explore infinite possibilities.</p></header><div className="welcome-entry">{composer()}<div className="quick-actions">{skills.map(s => <button key={s.id} className={skillId === s.id ? 'selected' : ''} onClick={() => selectSkill(s.id)}><s.icon/><span><strong>{s.name}</strong><small>{s.id==='plan'?'Turn your ideas into steps':s.id==='data'?'Get insights from data':s.id==='solve'?'Build something new':'Discover the unknown'}</small></span><ArrowRight/></button>)}</div></div></div>}
      {page === 'Chat' && active && <div className="conversation"><header><button onClick={newChat}>New chat</button><strong>{active.title}</strong></header><div className="messages">{active.messages.map((m, i) => <div className={`message ${m.role}`} key={i}><span>{m.role === 'user' ? 'You' : '✶ ApolloCode'}</span>{m.trace&&<WorkDetails trace={m.trace} openBrowser={()=>setPage('Automation')}/>}<p>{m.content}</p></div>)}{busy && busyChat.current===active.id && <div className="message assistant"><span>✶ ApolloCode</span>{trace&&<WorkDetails trace={trace} openBrowser={()=>setPage('Automation')}/>}<p className="runtime-stream">{streamText}</p></div>}<div ref={bottom}/></div>{composer(true)}</div>}
      {page === 'Explore' && <section className="content-page"><small>DISCOVER</small><h1>Explore possibilities</h1><div className="explore-grid">{skills.map(s => <button key={s.id} onClick={() => selectSkill(s.id)}><s.icon/><strong>{s.name}</strong><ArrowRight/></button>)}</div></section>}
      {(['Skills','MCP','Settings'] as Page[]).includes(page)&&<Management view={page as 'Skills'|'MCP'|'Settings'} state={runtimeState} refresh={refreshRuntime} useSkill={selectSkill} providerChanged={async()=>{const c=await window.apollo.getConfig();setConfig({provider:c.provider||'openai',baseUrl:c.baseUrl||'',model:c.model||'',apiKey:c.apiKey||''});}} openProviders={()=>setSettingsOpen(true)}/>}
      {(page==='Workflows'||page==='Automation')&&<Operations view={page} state={runtimeState} refresh={refreshRuntime}/>}
      {page === 'Library' && <section className="content-page"><small>YOUR WORK</small><h1>Library</h1>{recent.length ? <div className="library-list">{recent.map(c => <button key={c.id} onClick={() => openChat(c.id)}><MessageCircle/><span>{c.title}</span><ArrowRight/></button>)}</div> : <p>Your conversations will appear here.</p>}</section>}
      {page === 'Workspace' && <section className="content-page workspace-page"><small>LOCAL PROJECT</small><h1>Workspace</h1><div className="workspace-tools"><div><strong>{project || 'No project selected'}</strong><button onClick={() => void chooseProject()}><FolderOpen/>Choose project</button></div><div><ShieldCheck/><span>Project tools are restricted to this folder (not an OS sandbox). Operations are recorded in <code>.apollocode/audit.log</code>.</span></div><div className="tool-actions"><button onClick={() => void workspaceAction('status')}><GitBranch/>Git status</button><button onClick={() => void workspaceAction('diff')}><FileText/>View diff</button><button onClick={() => void workspaceAction('test')}><Play/>Run tests</button></div><pre>{workOutput || 'Select a project to inspect its Git state, review changes, or run tests.'}</pre><label className="patch-label">Paste a unified Git patch for review<textarea value={pendingPatch} onChange={e => setPendingPatch(e.target.value)} placeholder="diff --git a/file b/file ..."/></label><button className="apply-patch" disabled={!pendingPatch.trim()} onClick={() => void window.apollo.applyPatch(pendingPatch).then(r => {setWorkOutput(r.output || (r.ok ? 'Patch applied' : 'Patch rejected')); if (r.ok) {setPendingPatch('');setRollbackId(r.rollbackId||null);}}).catch(e => setWorkOutput(String(e)))}>Apply approved patch</button>{rollbackId&&<button onClick={()=>void window.apollo.runtime.rollback(rollbackId).then(()=>{setRollbackId(null);setWorkOutput('已回滚');}).catch(e=>setWorkOutput(String(e)))}>回滚上次补丁</button>}</div></section>}
    </main>
    {searchOpen && <div className="modal-cover" onMouseDown={() => setSearchOpen(false)}><div className="search-dialog" onMouseDown={e => e.stopPropagation()}><div className="search-line"><Search/><input autoFocus placeholder="Search chats" value={query} onChange={e => setQuery(e.target.value)}/><button onClick={() => setSearchOpen(false)}><X/></button></div>{recent.map(c => <button className="search-result" key={c.id} onClick={() => openChat(c.id)}>{c.title}<ArrowRight/></button>)}</div></div>}
    {settingsOpen && <div className="modal-cover" onMouseDown={() => setSettingsOpen(false)}><form className="settings-dialog" onMouseDown={e => e.stopPropagation()} onSubmit={e => {e.preventDefault(); setSettingsError(''); void window.apollo.saveConfig(config).then(() => {setSaved(true); setSettingsOpen(false);}).catch(err => setSettingsError(String(err)));}}><header><h2>模型与供应商</h2><button type="button" onClick={() => setSettingsOpen(false)}><X/></button></header>
      <details className="provider-details" open={!config.baseUrl || (config.provider !== 'claude' && config.provider !== 'ollama' && !config.apiKey)}><summary>供应商连接 · {config.provider === 'claude' ? 'Claude Code' : config.provider === 'ollama' ? 'Ollama' : config.provider === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容'}</summary>
      <label>Provider<select value={config.provider} onChange={e => {const provider = e.target.value as Provider; setSaved(false); setConfig({...config, provider, baseUrl: provider === 'anthropic' ? 'https://api.anthropic.com/v1' : provider === 'ollama' ? 'http://localhost:11434/v1' : provider === 'openai' ? 'https://api.openai.com/v1' : '', model: provider === 'claude' ? '' : config.model});}}><option value="openai">OpenAI-compatible / DeepSeek</option><option value="anthropic">Anthropic API</option><option value="ollama">Local Ollama</option><option value="claude">Claude Code CLI</option></select></label>
      {config.provider === 'claude' ? <p className="settings-note">Uses the installed Claude Code CLI and its existing login. Optional model name below.</p> : <label>API URL<input value={config.baseUrl} onChange={e => {setSaved(false); setConfig({...config, baseUrl: e.target.value});}} placeholder={config.provider === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1'} required/></label>}
      {config.provider !== 'claude' && config.provider !== 'ollama' && <label>API key<input type="password" value={config.apiKey} onChange={e => {setSaved(false); setConfig({...config, apiKey: e.target.value});}} placeholder="API key" required/></label>}
      </details>
      {config.provider !== 'claude' && <label>模型<select value={availableModels.includes(config.model) ? config.model : ''} disabled={loadingModels || !availableModels.length} required onChange={e => {setSaved(false); setConnectionStatus(''); setConfig({...config, model: e.target.value});}}><option value="" disabled>{loadingModels ? '正在获取模型…' : availableModels.length ? '选择模型' : '尚未获取模型'}</option>{availableModels.map(model => <option key={model} value={model}>{model}</option>)}</select></label>}
      {config.provider !== 'claude' && <div className="connection-actions"><button type="button" disabled={checkingConnection} onClick={() => {setCheckingConnection(true); setSettingsError(''); void window.apollo.getModels(config).then(r => {setAvailableModels(r.models || []); if (r.ok) setConnectionStatus('可用模型：' + (r.models?.length || 0)); else {setConnectionStatus(''); setSettingsError(r.error || '获取失败');}}).catch(e => setSettingsError(String(e))).finally(() => setCheckingConnection(false));}}><Search/>获取模型</button><button type="button" disabled={checkingConnection || !config.model.trim()} onClick={() => {setCheckingConnection(true); setSettingsError(''); setConnectionStatus(''); void window.apollo.testConnection(config).then(r => {if(r.ok) setConnectionStatus('连接成功 · ' + config.model); else setSettingsError(r.error || '连接失败');}).catch(e => setSettingsError(String(e))).finally(() => setCheckingConnection(false));}}><Play/>{checkingConnection ? '请求中…' : '测试连接'}</button></div>}
      {connectionStatus && <p className="connection-status" role="status">{connectionStatus}</p>}{settingsError && <p className="notice" role="alert">{settingsError}</p>}<button className="save" disabled={config.provider !== 'claude' && (loadingModels || !availableModels.includes(config.model))} type="submit">使用此模型</button>
    </form></div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
