const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Workflows}=require('../desktop/workflows.cjs');
const {ComputerTools}=require('../desktop/computer-tools.cjs');
function fixture(saved=[]){
  const store={'workflows.json':saved};let calls=0;
  const runtime={read:(k,f)=>store[k]||f,write:(k,v)=>{store[k]=JSON.parse(JSON.stringify(v));},getConfig:()=>({provider:'openai',baseUrl:'https://test.invalid',model:'test',projectRoot:'project'}),tools:{root:()=> 'project',tests:async()=>({ok:true,output:'tests passed'})},approve:async()=>true,emit:()=>{},cancel:()=>{},chat:async()=>{calls++;return {ok:true,content:'verified step'};}};
  return {runtime,store,calls:()=>calls};
}
test('workflow pauses at every gate, persists steps and never silently executes tests',async()=>{
  const f=fixture();const workflows=new Workflows(f.runtime);
  const run=workflows.create({templateId:'development',task:'fix bug'});
  await workflows.advance(run.id);assert.equal(run.status,'waiting');assert.equal(run.index,1);assert.equal(f.calls(),1);
  await workflows.advance(run.id,true);assert.equal(run.index,2);assert.equal(run.status,'waiting');assert.equal(f.calls(),2);
  await workflows.advance(run.id,true);assert.equal(run.index,3);assert.equal(run.steps[2].output,'tests passed');
  await workflows.advance(run.id,true);assert.equal(run.status,'completed');assert.equal(f.calls(),3);
  await workflows.advance(run.id,true);assert.equal(f.calls(),3);assert.equal(f.store['workflows.json'][0].status,'completed');
});
test('failed tests stop the workflow and do not execute acceptance stage',async()=>{
  const f=fixture();f.runtime.tools.tests=async()=>({ok:false,output:'FAIL assertion'});
  const workflows=new Workflows(f.runtime),run=workflows.create({templateId:'development',task:'bug'});
  await workflows.advance(run.id);await workflows.advance(run.id,true);await workflows.advance(run.id,true);
  assert.equal(run.status,'failed');assert.equal(run.index,2);assert.match(run.steps[2].output,/FAIL/);assert.equal(f.calls(),2);
});
test('interrupted runs restore stopped and project changes prevent resume',async()=>{
  const f=fixture();const w=new Workflows(f.runtime),run=w.create({templateId:'automation',task:'read site'});
  run.status='running';w.persist();const restored=new Workflows({...f.runtime,read:()=>f.store['workflows.json']});
  assert.equal(restored.state().runs[0].status,'interrupted');
  f.runtime.getConfig=()=>({projectRoot:'other'});await assert.rejects(w.advance(run.id),/连接已变更/);
});
test('workflow cancellation stops current step without advancing or auto-retrying',async()=>{
  const f=fixture();let resolve;f.runtime.chat=()=>new Promise(r=>{resolve=r;});
  const w=new Workflows(f.runtime),run=w.create({templateId:'automation',task:'read page'});
  const pending=w.advance(run.id);w.cancel();resolve({ok:true,content:'late reply'});await pending;
  assert.equal(run.status,'interrupted');assert.equal(run.index,0);assert.equal(f.runtime.workflowBusy,false);
});
test('desktop target requires approval, prevents stale control replay and supports revoke',async()=>{
  const requests=[];let allowed=true;
  const computer=new ComputerTools(async()=>allowed,async r=>{requests.push(r);return r.action==='snapshot'?[{id:'control1',name:'button',role:'Button'}]:{ok:true};});
  await assert.rejects(computer.snapshot(),/先在桌面/);
  await computer.select('123',456);assert.equal(computer.target.pid,456);
  await computer.action('click','control1');await assert.rejects(computer.action('click','control1'),/当前快照/);
  await computer.snapshot();allowed=false;await assert.rejects(computer.action('type','control1','text'),/被拒绝/);
  assert.equal(requests.filter(r=>r.action==='type').length,0);computer.revoke();assert.equal(computer.target,null);
});
