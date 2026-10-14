import React,{useEffect,useMemo,useState} from 'react';
import {Play,Square,Search,Plug,RefreshCw} from 'lucide-react';
import {useLanguage} from './i18n';
import type {HermesCatalog,HermesState,HermesEvent,HermesMethod} from './hermes-types';
import {HermesFields,initialValues} from './HermesFields';
import './hermes.css';
const domains:Record<string,string>={agents:'后台代理',approval:'审批',billing:'计费',bot_relay:'机器人协作',browser:'浏览器',clarify:'补充提问',cli:'命令',client:'连接',clipboard:'剪贴板',command:'命令',commands:'命令目录',complete:'输入补全',config:'设置',connection:'连接授权',connectors:'连接服务',cron:'定时任务',delegation:'子任务',diagnostics:'诊断',display:'Bot 屏幕',file:'文件附件',free_tier:'免费额度',gateway:'运行能力',groups:'协作组',handoff:'交接',i18n:'语言',image:'图片',input:'输入',insights:'使用分析',learning:'学习记录',llm:'辅助模型',mcp:'MCP',message:'消息',model:'模型',onboarding:'引导',paste:'粘贴',pdf:'PDF',pet:'宠物',ping:'连接检查',plugins:'插件',preview:'预览',process:'后台进程',profiles:'配置档',project:'项目',projects:'项目管理',prompt:'任务',reload:'重新加载',request:'交互',rollback:'检查点与恢复',session:'会话',setup:'环境检查',shared_metrics:'统计与隐私',shell:'终端',skills:'技能',slash:'快捷命令',spawn_tree:'代理关系',subagent:'子代理',subscription:'订阅',system:'系统',terminal:'终端',tools:'工具',toolsets:'工具集',usage:'用量',vault:'凭据库',verification:'验证',voice:'语音',wake:'唤醒词'};
const actions:Record<string,string>={list:'列表',get:'查看',state:'状态',status:'状态',create:'创建',remove:'移除',delete:'删除',update:'更新',set:'设置',configure:'配置',show:'查看',manage:'管理',catalog:'目录',options:'选项',start:'启动',stop:'停止',close:'关闭',resume:'继续',interrupt:'停止任务',steer:'追加指令',history:'历史',usage:'用量',branch:'分支',archive:'归档',compress:'压缩',save:'保存',exec:'执行',submit:'提交',generate:'生成',attach:'添加附件',detach:'移除附件',record:'录音',toggle:'开关',tts:'朗读',respond:'回答',answer:'回答',read:'读取',unlock:'解锁',lock:'锁定',sources:'来源',reload:'重新加载'};
function label(method:HermesMethod,zh:boolean){if(!zh)return method.name.replace(/[._]/g,' ');const parts=method.name.split('.');return (domains[parts[0]]||parts[0])+' · '+parts.slice(1).map(p=>actions[p]||p.replace(/_/g,' ')).join(' · ');}
const shortcuts:{title:string;en:string;method:string;params:Record<string,unknown>}[]=[
 {title:'技能',en:'Skills',method:'skills.manage',params:{action:'list'}},
 {title:'插件',en:'Plugins',method:'plugins.manage',params:{action:'list'}},
 {title:'工具集',en:'Tools',method:'tools.list',params:{}},
 {title:'MCP 连接',en:'MCP servers',method:'mcp.servers.list',params:{}},
 {title:'服务连接',en:'Connected services',method:'connectors.list',params:{}},
 {title:'定时任务',en:'Scheduled tasks',method:'cron.manage',params:{action:'list',include_disabled:true}},
 {title:'会话与历史',en:'Sessions',method:'session.list',params:{}},
 {title:'子代理',en:'Subagents',method:'subagent.list',params:{}},
 {title:'记忆与学习',en:'Memory and learning',method:'learning.frames',params:{frames:1}},
 {title:'模型',en:'Models',method:'model.options',params:{}},
 {title:'用量',en:'Usage',method:'usage.bars',params:{}},
 {title:'浏览器',en:'Browser',method:'browser.manage',params:{action:'status'}},
 {title:'语音',en:'Voice',method:'voice.toggle',params:{action:'status'}},
 {title:'凭据库',en:'Vault',method:'vault.list',params:{}},
 {title:'运行能力',en:'Capabilities',method:'gateway.capabilities',params:{}},
];
const stateLabels:Record<string,string>={stopped:'未连接',starting:'正在启动',preparing:'正在准备环境',ready:'已连接',failed:'连接失败',disconnected:'连接中断'};
export function HermesCenter({busy,refresh}:{busy:boolean;refresh:()=>Promise<void>}){
 const {language}=useLanguage(),zh=language==='zh-CN';
 const [state,setState]=useState<HermesState|null>(null),[catalog,setCatalog]=useState<HermesCatalog|null>(null),[query,setQuery]=useState(''),[domain,setDomain]=useState('skills'),[selected,setSelected]=useState('skills.manage');
 const [values,setValues]=useState<Record<string,unknown>>({}),[result,setResult]=useState<unknown>(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[events,setEvents]=useState<HermesEvent[]>([]),[sessionId,setSessionId]=useState(''),[preset,setPreset]=useState<Record<string,unknown>>({}),[advanced,setAdvanced]=useState(false);
 useEffect(()=>{void Promise.all([window.apollo.hermes.state(),window.apollo.hermes.catalog()]).then(([s,c])=>{setState(s);setCatalog(c);}).catch(e=>setError(e.message));const a=window.apollo.hermes.onState(setState),b=window.apollo.hermes.onEvent(e=>setEvents(old=>[...old,e].slice(-100)));return()=>{a();b();};},[]);
 const method=catalog?.methods.find(m=>m.name===selected),schema=method?.params[0]?.schema||{},schemas=catalog?.components.schemas||{};
 useEffect(()=>{if(method){setValues({...initialValues(schema,schemas),...preset});}},[selected,catalog,preset]);
 const groups=useMemo(()=>[...new Set(catalog?.methods.map(m=>m.name.split('.')[0])||[])].sort(),[catalog]);
 const methods=catalog?.methods.filter(m=>query?(label(m,zh)+' '+m.summary+' '+m.name).toLowerCase().includes(query.toLowerCase()):m.name.split('.')[0]===domain)||[];
 function params(name:string,params:Record<string,unknown>){const m=catalog?.methods.find(m=>m.name===name),s=m?.params[0]?.schema;const resolved=s?.$ref?schemas[s.$ref.split('/').at(-1)||'']:s;if(sessionId&&resolved?.properties?.session_id&&!params.session_id)return {...params,session_id:sessionId};return params;}
 async function act(action:()=>Promise<unknown>){setPending(true);setError('');try{const value=await action();if(value&&typeof value==='object'&&'error' in value&&typeof value.error==='string'&&value.error)throw new Error(value.error);setResult(value);setState(await window.apollo.hermes.state());await refresh();}catch(e){setError((e as Error).message);}finally{setPending(false);}}
 async function quick(item:typeof shortcuts[number]){setSelected(item.method);setDomain(item.method.split('.')[0]);setPreset(item.params);await act(()=>window.apollo.hermes.rpc(item.method,params(item.method,item.params)));}
 return <section className='management-page hermes-center'><header><div><span className='eyebrow'>Hermes</span><h1>{zh?'Hermes 能力中心':'Hermes capabilities'}</h1></div><span className='save-status' role='status'>{zh?stateLabels[state?.status||'']||'正在检查':state?.status||'Checking'}</span></header>
  <p className='setting-help'>{zh?'技能、记忆、插件、工具、自动化和会话使用 Hermes 原生实现，保存在 Apollo 的独立数据目录。先连接后端，再选择要管理的功能。':'Skills, memory, plugins, tools, automation and sessions use the original Hermes implementation and an independent data directory. Connect to manage your capabilities.'}</p>
  {error&&<p className='management-error' role='alert'>{error}</p>}{state?.error&&!error&&<p className='management-error' role='alert'>{state.error}</p>}{state?.progress&&<p role='status'>{state.progress}</p>}
  <div className='hermes-connect'><button disabled={busy||pending} onClick={()=>void act(()=>window.apollo.hermes.use(true))}><Plug aria-hidden='true'/>{zh?'使用 Hermes 执行任务':'Use Hermes for tasks'}</button><button disabled={busy||pending} onClick={()=>void act(()=>window.apollo.hermes.use(false))}>{zh?'使用 Apollo 原生后端':'Use Apollo backend'}</button><button disabled={busy||pending} onClick={()=>void act(()=>window.apollo.hermes.start())}><Play aria-hidden='true'/>{zh?'连接':'Connect'}</button><button disabled={busy||pending} onClick={()=>void act(()=>window.apollo.hermes.stop())}><Square aria-hidden='true'/>{zh?'停止后端':'Stop backend'}</button></div>
  <div className='hermes-session'><label>{zh?'当前管理会话':'Management session'}<select aria-label={zh?'当前管理会话':'Management session'} value={sessionId} onChange={e=>setSessionId(e.target.value)}><option value=''>{zh?'配置档级操作':'Profile operations'}</option>{state?.liveSessions?.map(s=><option key={s.sessionId} value={s.sessionId}>{s.title} · {s.model}</option>)}</select></label><button disabled={busy||pending||state?.status!=='ready'} onClick={()=>void act(async()=>{const result=await window.apollo.hermes.session();setSessionId(result.sessionId);return result.state;})}>{zh?'新建管理会话':'Create management session'}</button></div>
  <div className='hermes-shortcuts'>{shortcuts.filter(item=>catalog?.methods.some(m=>m.name===item.method)).map(item=><button disabled={busy||pending||state?.status!=='ready'} key={item.method} onClick={()=>void quick(item)}>{zh?item.title:item.en}</button>)}</div>
  {result!==null&&<div className='hermes-result' role='status'><strong>{zh?'操作结果':'Result'}</strong><HermesResult result={result} zh={zh}/></div>}
  <details open={advanced} onToggle={e=>setAdvanced(e.currentTarget.open)}><summary>{zh?'全部操作与高级设置':'All operations and advanced settings'} · {catalog?.methods.length||0}</summary>
  <div className='hermes-search'><Search aria-hidden='true'/><input aria-label={zh?'搜索全部能力':'Search all capabilities'} placeholder={zh?'搜索全部能力':'Search all capabilities'} value={query} onChange={e=>setQuery(e.target.value)}/></div>
  <div className='hermes-workbench'><nav aria-label={zh?'能力分类':'Capability categories'}>{groups.map(group=><button key={group} aria-current={domain===group?'page':undefined} className={domain===group?'active':''} onClick={()=>{setDomain(group);setQuery('');setPreset({});const first=catalog?.methods.find(m=>m.name.startsWith(group+'.')||m.name===group);if(first)setSelected(first.name);}}>{zh?domains[group]||group:group}</button>)}</nav><div className='hermes-actions'><label>{zh?'操作':'Operation'}<select value={selected} onChange={e=>{setSelected(e.target.value);setPreset({});}}>{!methods.some(m=>m.name===selected)&&method&&<option value={selected}>{label(method,zh)}</option>}{methods.map(m=><option key={m.name} value={m.name}>{label(m,zh)}</option>)}</select></label>
  {method&&<form key={method.name} onSubmit={e=>{e.preventDefault();void act(()=>window.apollo.hermes.rpc(method.name,params(method.name,values)));}}><HermesFields schema={schema} schemas={schemas} values={values} setValues={setValues} zh={zh}/><button disabled={busy||pending||state?.status!=='ready'} type='submit'><RefreshCw aria-hidden='true'/>{pending?(zh?'处理中…':'Working…'):(zh?'执行所选操作':'Run selected operation')}</button><details><summary>{zh?'接口说明':'Operation details'}</summary><p>{method.summary}</p><code>{method.name}</code></details></form>}
  </div></div></details>
  <details><summary>{zh?'运行环境':'Runtime environment'}</summary><p>{state?.methodCount||0} {zh?'个操作接口':'operations'} · {state?.commit?.slice(0,12)}</p><p>{state?.python}</p><p>{state?.home}</p><div className='hermes-connect'><button disabled={busy||pending} onClick={()=>void act(()=>window.apollo.hermes.prepare())}>{zh?'准备运行环境':'Prepare runtime'}</button><button disabled={busy||pending} onClick={()=>void act(()=>window.apollo.hermes.choosePython())}>{zh?'选择其他 Python 环境':'Choose another Python'}</button></div></details>
  <details className='hermes-native-events'><summary>{zh?'后端活动':'Backend activity'} · {events.length}</summary>{events.map((event,index)=><div key={index}><strong>{event.type}</strong><pre>{JSON.stringify(event.payload,null,2)}</pre></div>)}</details>
 </section>;
}
function HermesResult({result,zh}:{result:unknown;zh:boolean}){
 if(result&&typeof result==='object'&&'skills' in result&&result.skills&&typeof result.skills==='object')return <div className='hermes-list'>{Object.entries(result.skills).map(([category,names])=><div key={category}><strong>{category}</strong><p>{Array.isArray(names)?names.join(' · '):String(names)}</p></div>)}</div>;
 if(result&&typeof result==='object'){
  const entries=Object.entries(result),list=entries.find(([key,value])=>['jobs','servers','sessions','subagents','toolsets','items','results','agents','plugins'].includes(key)&&Array.isArray(value));
  if(list){const rows=list[1] as Record<string,unknown>[];return <><p>{rows.length} {zh?'项':'items'}</p><ul className='hermes-list'>{rows.map((row,index)=><li key={index}><strong>{String(row.name||row.title||row.id||row.session_id||index+1)}</strong>{Boolean(row.description)&&<p>{String(row.description)}</p>}<details><summary>{zh?'详情':'Details'}</summary><pre>{JSON.stringify(row,null,2)}</pre></details></li>)}</ul></>;}
 }
 return <pre>{typeof result==='string'?result:JSON.stringify(result,null,2)}</pre>;
}
