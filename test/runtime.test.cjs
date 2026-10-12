const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Runtime}=require('../desktop/runtime.cjs');
const economy=require('../desktop/economy.cjs');
function fixture(t,fetcher,approve=async()=>true){
  const work=path.join(__dirname,'../work');fs.mkdirSync(work,{recursive:true});
  const dir=fs.mkdtempSync(path.join(work,'runtime-test-'));const project=path.join(dir,'project');fs.mkdirSync(project);
  const runtime=new Runtime({dataDir:path.join(dir,'state'),skillDir:path.join(dir,'skills'),getConfig:()=>({provider:'openai',baseUrl:'https://example.invalid/v1',model:'test-model',apiKey:'test-secret',projectRoot:project}),approve,emit:()=>{},fetcher});
  t.after(async()=>{await runtime.close();fs.rmSync(dir,{recursive:true,force:true});});
  return {runtime,project,dir};
}
const sse=(delta,usage)=>new Response('data: '+JSON.stringify({choices:[{delta}]})+'\n\ndata: '+JSON.stringify({choices:[],usage})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
test('tool loop reads real project data, streams final answer and records provider usage',async t=>{
  const requests=[];const {runtime,project}=fixture(t,async(_,options)=>{
    const body=JSON.parse(options.body);requests.push(body);
    if(requests.length===1)return sse({tool_calls:[{index:0,id:'read1',function:{name:'read_file',arguments:JSON.stringify({path:'sample.txt',start:1,end:2})}}]},{prompt_tokens:100,completion_tokens:20});
    assert.match(body.messages.at(-1).content,/verified fact/);return sse({content:'Done.'},{prompt_tokens:80,completion_tokens:10});
  });
  fs.writeFileSync(path.join(project,'sample.txt'),'verified fact\nsecond line');
  await runtime.saveSettings({mode:'plan'});
  const events=[];runtime.emit=e=>events.push(e);
  const result=await runtime.chat({messages:[{role:'user',content:'Read sample.txt.'}],requestId:'test'});
  assert.equal(result.ok,true);assert.equal(result.content,'Done.');assert.equal(requests.length,2);
  assert.equal(runtime.usage().input,180);assert.equal(runtime.usage().output,30);assert.equal(runtime.usage().tools,1);
  assert.ok(events.some(e=>e.type==='delta'));assert.ok(!requests[0].tools.some(t=>t.function.name==='apply_patch'));
  const start=events.find(e=>e.type==='tool'&&e.status==='running'),end=events.find(e=>e.type==='tool'&&e.status==='done');
  assert.equal(start.callId,'read1');assert.equal(end.callId,'read1');assert.match(start.arguments,/sample.txt/);assert.ok(start.time>0);assert.ok(end.durationMs>=0);assert.match(end.preview,/verified fact/);
});
test('tool activity redacts credentials and marks failed operations',async t=>{
  let turn=0;const {runtime}=fixture(t,async()=>++turn===1?sse({tool_calls:[{index:0,id:'bad-read',function:{name:'read_file',arguments:JSON.stringify({path:'test-secret/missing.txt'})}}]},{}):sse({content:'File unavailable.'},{}));
  await runtime.saveSettings({mode:'plan'});const events=[];runtime.emit=e=>events.push(e);
  await runtime.chat({messages:[{role:'user',content:'read missing file'}]});
  const start=events.find(e=>e.type==='tool'&&e.status==='running'),end=events.find(e=>e.type==='tool'&&e.status==='failed');
  assert.ok(end);assert.doesNotMatch(start.arguments,/test-secret/);assert.doesNotMatch(end.preview,/test-secret/);assert.equal(start.callId,end.callId);
});
test('skill metadata is routed without loading every skill body',async t=>{
  let prompt;const {runtime}=fixture(t,async(_,options)=>{prompt=JSON.parse(options.body).messages[0].content;return sse({content:'OK'},{prompt_tokens:10,completion_tokens:1});});
  const s=runtime.skills.save('private-procedure','Use for a special task.','DO-NOT-BULK-LOAD-THIS-BODY');
  await runtime.saveSettings({mode:'plan',enabledSkills:[s.id]});
  await runtime.chat({messages:[{role:'user',content:'hello'}]});
  assert.match(prompt,/private-procedure/);assert.doesNotMatch(prompt,/DO-NOT-BULK/);
  await runtime.chat({messages:[{role:'user',content:'special task'}],skillId:s.id});
  assert.match(prompt,/DO-NOT-BULK/);
});
test('context budget retains the latest request and rejects oversized current input',()=>{
  const messages=Array.from({length:30},(_,i)=>({role:i%2?'assistant':'user',content:'old '+i+' '+('history '.repeat(80))}));
  const latest={role:'user',content:'Preserve this exact request.'};messages.push(latest);
  const result=economy.context(messages,1000,100);
  assert.deepEqual(result.messages.at(-1),latest);assert.ok(result.omitted>0);assert.ok(result.estimatedInput<=1000);
  assert.throws(()=>economy.context([{role:'user',content:'large '.repeat(10000)}],1000),/未被截断/);
});
test('tool output filter removes repetition but preserves failure evidence within budget',()=>{
  const raw=['progress','same'.repeat(20),...Array(500).fill('same line'), 'ERROR src/sample.ts:42 invalid type',...Array(200).fill('Downloading 50%')].join('\n');
  const result=economy.filterOutput(raw,200);
  assert.match(result.text,/ERROR src\/sample.ts:42/);assert.ok(result.sentTokens<=200);assert.ok(result.sentTokens<result.originalTokens);
});
test('cancellation aborts an in-flight model request',async t=>{
  let started;const ready=new Promise(resolve=>started=resolve);
  const {runtime}=fixture(t,(_,options)=>new Promise((resolve,reject)=>{started();options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});}));
  const pending=runtime.chat({messages:[{role:'user',content:'wait'}]});await ready;runtime.cancel();
  const result=await pending;assert.equal(result.ok,false);assert.match(result.error,/中断/);assert.equal(runtime.running,null);
});
test('project paths reject escape and linked directories; approved patches can roll back',async t=>{
  const {runtime,project,dir}=fixture(t,async()=>{throw new Error('unused');});
  assert.throws(()=>runtime.tools.read('../state/usage.json'),/项目外/);
  fs.writeFileSync(path.join(project,'.env'),'API_KEY=private');assert.throws(()=>runtime.tools.read('.env'),/保护/);
  fs.symlinkSync(path.join(dir,'state'),path.join(project,'outside'),'junction');
  assert.throws(()=>runtime.tools.list('outside'),/项目外/);
  fs.writeFileSync(path.join(project,'file.txt'),'old\n');
  const result=await runtime.tools.patch('diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new\n');
  assert.equal(fs.readFileSync(path.join(project,'file.txt'),'utf8'),'new\n');
  await runtime.tools.rollback(result.rollbackId);assert.equal(fs.readFileSync(path.join(project,'file.txt'),'utf8'),'old\n');
});
test('rollback refuses to overwrite subsequent user edits and patch rejection leaves file intact',async t=>{
  const {runtime,project}=fixture(t,async()=>{throw new Error('unused');});
  const file=path.join(project,'file.txt');fs.writeFileSync(file,'old\n');
  const patch='diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new\n';
  const result=await runtime.tools.patch(patch);fs.writeFileSync(file,'user edit\n');
  await assert.rejects(runtime.tools.rollback(result.rollbackId),/后续修改/);
  assert.equal(fs.readFileSync(file,'utf8'),'user edit\n');
  runtime.tools.approve=async()=>false;fs.writeFileSync(file,'old\n');await assert.rejects(runtime.tools.patch(patch),/拒绝/);assert.equal(fs.readFileSync(file,'utf8'),'old\n');
});
