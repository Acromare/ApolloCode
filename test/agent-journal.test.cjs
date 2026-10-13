const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {AgentJournal}=require('../desktop/agent-journal.cjs');
const {Runtime}=require('../desktop/runtime.cjs');
const {SkillStore}=require('../desktop/skills.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apollo-journal-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('history search survives restart, isolates projects and strips credentials',t=>{
  const dir=fixture(t),journal=new AgentJournal(dir,()=>['private-key']);
  journal.sync([{id:'a',title:'Database plan',project:path.join(dir,'one'),updated:2,messages:[{role:'user',content:'Use SQLite and private-key for this project.'}]},{id:'b',title:'Database plan',project:path.join(dir,'two'),updated:3,messages:[{role:'assistant',content:'Use PostgreSQL.'}]}]);
  const restored=new AgentJournal(dir,()=>['private-key']);
  const results=restored.search('Database',path.join(dir,'one')).results;
  assert.equal(results.length,1);assert.equal(results[0].chatId,'a');assert.match(results[0].excerpt,/SQLite/);assert.doesNotMatch(JSON.stringify(results),/private-key/);
  assert.equal(restored.search('Database','').results.length,0);
  assert.throws(()=>restored.search('',path.join(dir,'one')));
  restored.clear();assert.equal(new AgentJournal(dir,()=>[]).history.length,0);
});
test('interrupted task keeps plan and next action without replaying completed tools',t=>{
  const dir=fixture(t),journal=new AgentJournal(dir,()=>[]);
  journal.start('request','chat',dir,'Fix addition');journal.update('request',{plan:[{text:'Read files',status:'done'},{text:'Run tests',status:'pending'}],nextAction:'Run actual tests',blockers:''});
  journal.event('request',{type:'tool',name:'apply_patch',status:'done',preview:'patch applied'});
  const restored=new AgentJournal(dir,()=>[]),task=restored.list(dir)[0];
  assert.equal(task.status,'interrupted');assert.equal(task.plan[0].status,'done');assert.equal(task.nextAction,'Run actual tests');assert.equal(task.lastTool.name,'apply_patch');
  assert.throws(()=>restored.update('request',{nextAction:'continue'}),/active task/);
  assert.equal(restored.list(path.join(dir,'other')).length,0);
});
const sse=delta=>new Response('data: '+JSON.stringify({choices:[{delta}]})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
test('runtime retrieves past project facts through a tool, without bulk history injection',async t=>{
  const dir=fixture(t),requests=[],project=path.join(dir,'project');fs.mkdirSync(project);
  const runtime=new Runtime({dataDir:path.join(dir,'state'),skillDir:path.join(dir,'skills'),getConfig:()=>({provider:'openai',baseUrl:'https://example.invalid/v1',apiKey:'secret-token',model:'fixture',projectRoot:project}),approve:async()=>true,emit:()=>{},fetcher:async(_,options)=>{const body=JSON.parse(options.body);requests.push(body);return requests.length===1?sse({tool_calls:[{index:0,id:'recall',function:{name:'search_history',arguments:JSON.stringify({query:'SQLite'})}}]}):sse({content:'The previous choice was SQLite.'});}});
  t.after(()=>runtime.close());await runtime.saveSettings({mode:'plan',enabledSkills:[],historyRecall:true});
  runtime.journal.sync([{id:'past',title:'Storage',project,updated:Date.now(),messages:[{role:'user',content:'We chose SQLite; keep this source fact.'}]}]);
  const result=await runtime.chat({chatId:'current',messages:[{role:'user',content:'What database did we choose?'}]});
  assert.ok(result.ok,result.error);assert.doesNotMatch(JSON.stringify(requests[0].messages),/keep this source fact/);assert.match(requests[1].messages.at(-1).content,/SQLite/);
  assert.equal(runtime.journal.list(project)[0].status,'done');assert.equal(runtime.journal.list(project)[0].chatId,'current');
  await runtime.saveSettings({historyRecall:false});await assert.rejects(runtime.invoke('search_history',{query:'SQLite'},new AbortController().signal,runtime.settings()),/disabled/);
});
test('skill learning is approval-gated even in YOLO, versioned and redacted',async t=>{
  const dir=fixture(t);let approved=false;const approvals=[];
  const runtime=new Runtime({dataDir:path.join(dir,'state'),skillDir:path.join(dir,'skills'),getConfig:()=>({apiKey:'secret-token'}),approve:async(type,detail)=>{approvals.push({type,detail});return approved;},emit:()=>{}});t.after(()=>runtime.close());
  const proposal={name:'verified-tests',description:'Repeat proven validation',body:'Read files, run tests, check results. secret-token'};
  const signal=new AbortController().signal,settings={...runtime.settings(),mode:'yolo'};
  assert.equal((await runtime.invoke('learn_skill',proposal,signal,settings)).ok,false);assert.equal(runtime.skills.list().some(s=>s.name===proposal.name),false);
  approved=true;const first=await runtime.invoke('learn_skill',proposal,signal,settings);assert.ok(first.ok);assert.ok(runtime.settings().enabledSkills.includes(first.id));
  const second=await runtime.invoke('learn_skill',{...proposal,body:'Read files, verify test exit status, report evidence.'},signal,settings);
  const versions=runtime.skills.versions(first.id);assert.equal(versions.length,2);assert.notEqual(first.revision,second.revision);assert.ok(versions.some(v=>v.body.includes('verify test exit')));assert.doesNotMatch(JSON.stringify(versions),/secret-token/);assert.ok(approvals.every(a=>a.type==='learn-skill'&&!a.detail.includes('secret-token')));
  await assert.rejects(runtime.invoke('learn_skill',proposal,signal,{...settings,mode:'plan'}),/mode/);
});
test('revising a legacy skill preserves its original content and caps revision history',t=>{
  const dir=fixture(t),external=path.join(dir,'skills'),skillDir=path.join(external,'legacy-skill');fs.mkdirSync(skillDir,{recursive:true});
  fs.writeFileSync(path.join(skillDir,'SKILL.md'),'---\nname: legacy-skill\ndescription: Existing procedure\n---\nOriginal verified procedure.');
  const store=new SkillStore(path.join(dir,'builtin'),external);
  store.save('legacy-skill','Revised procedure','Verify test exit codes.');
  assert.equal(store.versions('external:legacy-skill').length,2);
  assert.ok(store.versions('external:legacy-skill').some(v=>v.body==='Original verified procedure.'));
  for(let i=0;i<23;i++)store.save('legacy-skill','Revised procedure','Revision '+i);
  assert.equal(store.versions('external:legacy-skill').length,20);
  assert.equal(store.load('external:legacy-skill'),'Revision 22');
});
