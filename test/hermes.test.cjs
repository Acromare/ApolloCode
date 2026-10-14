const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {HermesRpc}=require('../desktop/hermes-rpc.cjs'),{HermesBridge}=require('../desktop/hermes-bridge.cjs'),{HermesBackend}=require('../desktop/hermes-backend.cjs'),{translate,turnResult}=require('../desktop/hermes-events.cjs'),{range}=require('../desktop/hermes-desktop.cjs');
const config={provider:'openai',model:'test',baseUrl:'https://gateway.example/v1',apiKey:'fixture-sensitive-key',reasoningEffort:'medium',projectRoot:''};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apollo-hermes-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 class Backend extends EventEmitter{
  constructor(){super();this.home=dir;this.calls=[];this.rpc={request:(...args)=>this.request(...args)};this.contract={methods:[]};}
  status(){return {status:'ready'};}
  async start(){return this.status();}
  async stop(){this.emit('state',{status:'stopped'});}
  async request(method,params){this.calls.push({method,params});if(method==='session.create')return {session_id:'live',stored_session_id:'stored',info:{usage:{input:10,output:2,calls:1}}};if(method==='session.resume')return {session_id:'resumed',stored_session_id:params.session_id,info:{}};if(method==='prompt.submit')return {status:'streaming'};return {ok:true};}
 }
 const backend=new Backend(),events=[],messages=[],stats={tasks:0,tools:0,input:0,output:0,cost:0,modelCalls:0,successfulTasks:0,failedTasks:0,cancelledTasks:0};
 const runtime={stats,emit:event=>events.push(event),write:()=>{},settings:()=>({mode:'agent'}),skills:{load:()=> 'Selected skill instructions'}};
 const bridge=new HermesBridge({dataDir:dir,getConfig:()=>config,runtime,backend,emit:(channel,payload)=>messages.push({channel,payload})});
 t.after(()=>bridge.close());return {dir,bridge,backend,events,messages,runtime};
}
test('parallel chats isolate events, cancellation and completion while retaining the busy guard',async t=>{
 const f=fixture(t),native=f.backend.request.bind(f.backend);let next=0;
 f.backend.request=async(method,params)=>method==='session.create'?{session_id:'live-'+(++next),stored_session_id:'stored-'+next}:native(method,params);
 const a=f.bridge.chat({chatId:'a',requestId:'a',messages:[{role:'user',content:'one'}]},config,{mode:'agent'});
 const b=f.bridge.chat({chatId:'b',requestId:'b',messages:[{role:'user',content:'two'}]},config,{mode:'agent'});
 await tick();await tick();assert.equal(f.bridge.actives.size,2);
 await assert.rejects(f.bridge.chat({chatId:'a',requestId:'duplicate',messages:[{role:'user',content:'again'}]},config,{mode:'agent'}),/该对话/);
 const sa=f.bridge.actives.get('a').sessionId,sb=f.bridge.actives.get('b').sessionId;assert.notEqual(sa,sb);
 f.backend.emit('event',{type:'message.delta',session_id:sa,payload:{text:'only a'}});
 f.backend.emit('event',{type:'message.delta',session_id:sb,payload:{text:'only b'}});
 assert.deepEqual(f.events.filter(e=>e.type==='delta').map(e=>[e.requestId,e.text]),[['a','only a'],['b','only b']]);
 await f.bridge.cancel('a');assert.equal((await a).partial,'only a');assert.ok(f.bridge.actives.has('b'));assert.ok(f.runtime.running);
 assert.equal(f.backend.calls.find(c=>c.method==='session.interrupt').params.session_id,sa);
 f.backend.emit('event',{type:'message.complete',session_id:sb,payload:{status:'complete',text:'answer b'}});assert.equal((await b).content,'answer b');assert.equal(f.bridge.actives.size,0);assert.equal(f.runtime.running,null);
});
test('all attachments are passed through and a missing PDF converter falls back to a file reference',async t=>{
 const f=fixture(t),native=f.backend.request.bind(f.backend),attachments=[];
 for(let i=0;i<12;i++){const file=path.join(f.dir,`文件 ${i}.${i===0?'pdf':'unknown'}`);fs.writeFileSync(file,'fixture');attachments.push({path:file,name:path.basename(file)});}
 f.backend.request=async(method,params)=>{if(method==='pdf.attach'){const error=new Error('pdftoppm not installed');error.rpcCode=5028;throw error;}if(method==='file.attach'){f.backend.calls.push({method,params});return {ref_text:'@file:'+JSON.stringify(params.path)};}return native(method,params);};
 const {promise}=await startChat(f,{attachments});
 assert.equal(f.backend.calls.filter(c=>c.method==='file.attach').length,12);assert.equal((f.backend.calls.find(c=>c.method==='prompt.submit').params.text.match(/@file:/g)||[]).length,12);
 f.backend.emit('event',{type:'message.complete',session_id:'live',payload:{status:'complete',text:'done'}});assert.equal((await promise).ok,true);
});
async function startChat(f,extra={}){const promise=f.bridge.chat({chatId:'chat',requestId:'request',messages:[{role:'user',content:'Read the fixture.'}],...extra},config,{mode:'agent',taskTimeoutMs:30000});await tick();await tick();return {promise};}
test('native event results reject partial and interrupted turns',()=>{
 assert.equal(turnResult({status:'complete',text:'answer'},'',0).ok,true);
 assert.equal(turnResult({status:'complete',text:'answer'},'',1).outcome,'done_with_errors');
 assert.equal(turnResult({status:'error',text:'half',partial:true},'',0).partial,'half');
 assert.equal(turnResult({status:'interrupted',text:'half'},'saved',0).outcome,'interrupted');
 assert.equal(turnResult({text:'no completion'},'',0).ok,false);
 assert.equal(translate({type:'tool.complete',payload:{name:'terminal',tool_id:'id',result:'{"error":"failed"}'}}).status,'failed');
 assert.equal(translate({type:'tool.complete',payload:{name:'terminal',tool_id:'id',result:{exit_code:7}}}).status,'failed');
 assert.equal(translate({type:'reasoning.delta',payload:{text:'hidden'}}),null);
});
test('chat ignores foreign sessions, preserves skill and reports cumulative usage once',async t=>{
 const f=fixture(t),{promise}=await startChat(f,{skillId:'chosen'});
 const submit=f.backend.calls.find(c=>c.method==='prompt.submit');assert.match(submit.params.text,/Selected skill instructions/);
 f.backend.emit('event',{type:'message.complete',session_id:'foreign',payload:{status:'complete',text:'wrong'}});assert.ok(f.bridge.active);
 f.backend.emit('event',{type:'message.delta',session_id:'live',payload:{text:'hello'}});
 f.backend.emit('event',{type:'message.complete',session_id:'live',payload:{status:'complete',text:'hello',usage:{input:25,output:9,calls:2,cost_usd:0.05}}});
 assert.equal((await promise).content,'hello');assert.equal(f.runtime.stats.input,15);assert.equal(f.runtime.stats.output,7);assert.equal(f.runtime.stats.modelCalls,1);assert.equal(f.runtime.running,null);
 assert.ok(f.backend.calls.some(c=>c.method==='config.set'&&c.params.key==='yolo'&&c.params.value==='off'));
});
test('background terminal chunks are bounded cumulative snapshots attached to a visible tool',async t=>{
 const f=fixture(t),{promise}=await startChat(f);
 for(const chunk of ['one\n','two\n'])f.backend.emit('event',{type:'agent.terminal.output',session_id:'live',payload:{process_id:'process',chunk}});
 const outputs=f.events.filter(e=>e.type==='tool_output');assert.equal(outputs.at(-1).text,'one\ntwo\n');assert.equal(outputs.at(-1).snapshot,true);
 assert.ok(f.events.some(e=>e.type==='tool'&&e.callId===outputs[0].callId));
 f.backend.emit('event',{type:'message.complete',session_id:'live',payload:{status:'complete',text:'done'}});await promise;
 assert.equal(f.bridge.buffers.get('live'),'one\ntwo\n');
});
test('cancel waits for interrupt acknowledgement and keeps partial text',async t=>{
 const f=fixture(t),{promise}=await startChat(f);let acknowledge;const original=f.backend.request.bind(f.backend);
 f.backend.rpc.request=(method,params)=>method==='session.interrupt'?new Promise(resolve=>{acknowledge=resolve;}):original(method,params);
 f.backend.emit('event',{type:'message.delta',session_id:'live',payload:{text:'partial'}});
 const cancel=f.bridge.cancel();await tick();assert.ok(f.runtime.running,'Task slot remains occupied until the interruption is acknowledged');
 acknowledge({ok:true});await cancel;const result=await promise;assert.equal(result.failure.code,'cancelled');assert.equal(result.partial,'partial');assert.equal(result.outcome,'interrupted');assert.equal(f.runtime.stats.cancelledTasks,1);
});
test('disconnect resolves the task without replaying its prompt',async t=>{
 const f=fixture(t),{promise}=await startChat(f);f.backend.emit('event',{type:'message.delta',session_id:'live',payload:{text:'partial'}});f.backend.emit('disconnect');
 const result=await promise;assert.equal(result.failure.code,'hermes_disconnected');assert.equal(result.partial,'partial');assert.equal(f.backend.calls.filter(c=>c.method==='prompt.submit').length,1);
});
test('session compression updates the durable mapping and reconnect resumes it',async t=>{
 const f=fixture(t);await f.bridge.session('chat',config,[{role:'user',content:'seed'},{role:'assistant',content:'answer'},{role:'user',content:'new'}]);
 f.backend.emit('event',{type:'session.info',session_id:'live',payload:{stored_session_id:'compressed-tip',model:'test'}});
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir,'sessions.json'),'utf8')).chat.storedId,'compressed-tip');
 f.backend.emit('disconnect');await f.bridge.session('chat',config,[{role:'user',content:'must not seed again'}]);
 assert.equal(f.backend.calls.at(-1).method,'session.resume');assert.equal(f.backend.calls.at(-1).params.session_id,'compressed-tip');
});
test('withdrawn server requests reject and disappear using the native request id',async t=>{
 const f=fixture(t),pending=f.bridge.ask('approval',{session_id:'live',request_id:'approval-id',tool_name:'terminal'},'srq-1');pending.catch(()=>{});await tick();
 assert.equal(f.bridge.requests.size,1);f.backend.emit('event',{type:'request.cancel',session_id:'live',payload:{id:'srq-1',method:'approval',reason:'interrupted'}});
 await assert.rejects(pending,/取消/);assert.equal(f.bridge.requests.size,0);assert.ok(f.messages.some(m=>m.channel==='hermes:request:cancel'));
});
test('approval telemetry matches the waiting request name and redacts credentials',async t=>{
 const f=fixture(t),pending=f.bridge.ask('approval',{session_id:'live',tool_name:'terminal',command:config.apiKey},'srq-1');await tick();
 assert.equal(f.messages.at(-1).payload.params.command,'[REDACTED]');f.bridge.answer('srq-1',{choice:'deny'});assert.deepEqual(await pending,{choice:'deny'});
 const events=f.events.filter(e=>e.type==='approval');
 // Outside an active chat, approval responses remain available in the request stream.
 assert.equal(f.bridge.requests.size,0);assert.equal(events.length,0);
});
test('manual environment configuration keeps native settings and never saves the API key',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apollo-hermes-config-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let mode='json';
 const backend=new HermesBackend({dataDir:dir,getConfig:()=>config,getSettings:()=>({responseMode:mode})});backend.prepare(config);
 const file=path.join(backend.home,'config.yaml'),before=JSON.parse(fs.readFileSync(file));before.browser={driver:'custom'};fs.writeFileSync(file,JSON.stringify(before));
 const identity=backend.identity();mode='stream';assert.notEqual(identity,backend.identity());backend.prepare({...config,reasoningEffort:'high'});
 const value=JSON.parse(fs.readFileSync(file));assert.equal(value.streaming.enabled,true);assert.equal(value.agent.reasoning_effort,'high');assert.equal(value.browser.driver,'custom');assert.ok(!fs.readFileSync(file,'utf8').includes(config.apiKey));
 assert.equal(value.onboarding.profile_build,'off');
 for(const flag of ['task_completion_guidance','parallel_tool_call_guidance','tool_use_enforcement','execution_guidance','stall_guards','intent_ack_continuation'])assert.equal(value.agent[flag],false);
 assert.equal(value.agent.coding_context,'off');
 backend.prepare({...config,provider:'anthropic'});assert.equal(JSON.parse(fs.readFileSync(file)).model.api_mode,'anthropic_messages');
});
test('terminal read ranges use zero based paging',()=>{assert.deepEqual(range('one\ntwo\nthree',{start:1,count:1}),{total_lines:3,start:1,end:2,viewport_rows:1,cursor_row:2,text:'two'});});
class Socket extends EventTarget{constructor(){super();this.readyState=0;this.sent=[];}send(frame){this.sent.push(JSON.parse(frame));}close(){this.readyState=3;this.dispatchEvent(new Event('close'));}open(){this.readyState=1;this.dispatchEvent(new Event('open'));}}
test('RPC loss rejects outstanding operations and does not retry writes',async()=>{
 const socket=new Socket(),rpc=new HermesRpc({socketFactory:()=>socket});const connecting=rpc.connect('ws://fixture');socket.open();await connecting;
 const write=rpc.request('config.set',{key:'fixture',value:'test'});socket.close();await assert.rejects(write,/中断/);assert.equal(socket.sent.length,1);rpc.close();
});
test('RPC malformed frames close the channel and publish a disconnect',async()=>{
 const socket=new Socket(),rpc=new HermesRpc({socketFactory:()=>socket});const connecting=rpc.connect('ws://fixture');socket.open();await connecting;let disconnected=0;rpc.on('disconnect',()=>disconnected++);
 await rpc.frame('{bad');assert.equal(disconnected,1);assert.equal(rpc.socket,null);
});
test('RPC native prompts send the exact JSON result on the same request id',async()=>{
 const socket=new Socket(),rpc=new HermesRpc({socketFactory:()=>socket,onRequest:async()=>({picked:['one','two']})});const connecting=rpc.connect('ws://fixture');socket.open();await connecting;
 await rpc.frame(JSON.stringify({jsonrpc:'2.0',id:'srq-native',method:'setup_choose',params:{multi_select:true}}));assert.deepEqual(socket.sent[0],{jsonrpc:'2.0',id:'srq-native',result:{picked:['one','two']}});rpc.close();
});
