const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {Runtime}=require('../desktop/runtime.cjs');
const {ProjectTools}=require('../desktop/project-tools.cjs');
const {LanguageTools}=require('../desktop/lsp.cjs');
const {Vault}=require('../desktop/vault.cjs');
const {Workflows}=require('../desktop/workflows.cjs');
const {PersonalFiles}=require('../desktop/personal-files.cjs');
function fixture(t,fetcher,approve=async()=>true){
  const dir=fs.mkdtempSync(path.join(__dirname,'../work/capabilities-')),project=path.join(dir,'project');fs.mkdirSync(project);
  const runtime=new Runtime({dataDir:path.join(dir,'state'),skillDir:path.join(dir,'skills'),getConfig:()=>({provider:'openai',baseUrl:'https://example.invalid/v1',model:'fixture',apiKey:'fixture-secret',projectRoot:project}),approve,emit:()=>{},fetcher});
  t.after(async()=>{await runtime.close();fs.rmSync(dir,{recursive:true,force:true});});return {runtime,project,dir};
}
test('personal file tool creates and verifies a new Desktop-style file without a project',async t=>{
  const dir=fs.mkdtempSync(path.join(__dirname,'../work/personal-files-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const files=new PersonalFiles({folders:{desktop:dir,documents:path.join(dir,'docs'),downloads:path.join(dir,'downloads')},approve:async()=>true});
  const result=await files.create({folder:'desktop',path:'Apollo-test.txt',content:'created by Apollo\n'});
  assert.equal(result.ok,true);assert.equal(result.verified,true);assert.equal(fs.readFileSync(path.join(dir,'Apollo-test.txt'),'utf8'),'created by Apollo\n');
  await assert.rejects(files.create({folder:'desktop',path:'Apollo-test.txt',content:'overwrite'}),/已存在/);
  await assert.rejects(files.create({folder:'desktop',path:'..\\outside.txt',content:'no'}),/选定的个人目录/);
});
const response=message=>new Response(JSON.stringify({choices:[{message}],usage:{prompt_tokens:12,completion_tokens:4}}),{headers:{'Content-Type':'application/json'}});
test('vault migrates plaintext, decrypts after reopen and fails closed when encryption is unavailable',t=>{
  const {dir}=fixture(t);const file=path.join(dir,'credentials.json'),key=crypto.randomBytes(32);
  const storage={isEncryptionAvailable:()=>true,encryptString:text=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,c.getAuthTag?Buffer.alloc(0):Buffer.alloc(0),c.update(text),c.final(),c.getAuthTag()]);},decryptString:data=>{const d=crypto.createDecipheriv('aes-256-gcm',key,data.subarray(0,12));d.setAuthTag(data.subarray(-16));return Buffer.concat([d.update(data.subarray(12,-16)),d.final()]).toString();}};
  fs.writeFileSync(file,JSON.stringify({apiKey:'private-key-value',headers:{Authorization:'Bearer private-header'}}));
  const vault=new Vault(storage,{platform:'test'});assert.equal(vault.read(file,{}).apiKey,'private-key-value');assert.doesNotMatch(fs.readFileSync(file,'utf8'),/private-key|private-header/);
  assert.equal(new Vault(storage,{platform:'test'}).read(file,{}).headers.Authorization,'Bearer private-header');
  storage.isEncryptionAvailable=()=>false;assert.throws(()=>vault.read(file,{}),/加密不可用/);assert.throws(()=>vault.write(file,{}),/加密不可用/);
});
test('approved shell returns real output, reports failing exit codes, enforces cwd and rejects denied execution',async t=>{
  const {runtime,project}=fixture(t);const result=await runtime.tools.shell({command:process.platform==='win32'?"Write-Output 'shell-verified'":"printf shell-verified"});
  assert.equal(result.ok,true);assert.match(result.output,/shell-verified/);
  assert.equal((await runtime.tools.shell({command:'exit 7'})).code,7);
  await assert.rejects(runtime.tools.shell({command:'echo no',cwd:'..'}),/项目外/);
  runtime.tools.approve=async()=>false;await assert.rejects(runtime.tools.shell({command:'echo denied'}),/未获批准/);
  await assert.rejects(runtime.invoke('run_shell',{command:'echo denied'},null,{mode:'plan'}),/禁止/);
  assert.equal(fs.existsSync(path.join(project,'denied')),false);
});
test('git commits only explicitly selected files and refuses unrelated staged content',async t=>{
  const {runtime,project}=fixture(t);const git=(...args)=>execFileSync('git',args,{cwd:project,windowsHide:true,encoding:'utf8'});
  git('init','-b','main');git('config','user.name','Apollo Test');git('config','user.email','test@example.invalid');git('config','commit.gpgsign','false');
  fs.writeFileSync(path.join(project,'a.txt'),'a\n');fs.writeFileSync(path.join(project,'b.txt'),'b\n');git('add','b.txt');
  await assert.rejects(runtime.tools.commit({paths:['a.txt'],message:'first'}),/其他文件/);
  git('rm','--cached','b.txt');assert.equal((await runtime.tools.commit({paths:['a.txt'],message:'first'})).ok,true);
  assert.equal(git('show','--format=','--name-only','HEAD').trim(),'a.txt');
  assert.equal((await runtime.tools.branch('feature/test')).ok,true);assert.equal(git('branch','--show-current').trim(),'feature/test');
  await assert.rejects(runtime.tools.commit({paths:['.env'],message:'secret'}),/保护/);
});
test('Codex-style patches add, update and delete files with conflict-safe rollback',async t=>{
  const {runtime,project}=fixture(t);const file=path.join(project,'sample.cjs');
  const added=await runtime.tools.patch('*** Begin Patch\n*** Add File: sample.cjs\n+exports.add = (a, b) => a - b;\n*** End Patch');assert.match(fs.readFileSync(file,'utf8'),/a - b/);
  const updated=await runtime.tools.patch('*** Begin Patch\n*** Update File: sample.cjs\n@@\n-exports.add = (a, b) => a - b;\n+exports.add = (a, b) => a + b;\n*** End Patch');assert.match(fs.readFileSync(file,'utf8'),/a \+ b/);
  const deleted=await runtime.tools.patch('*** Begin Patch\n*** Delete File: sample.cjs\n*** End Patch');assert.equal(fs.existsSync(file),false);await runtime.tools.rollback(deleted.rollbackId);assert.match(fs.readFileSync(file,'utf8'),/a \+ b/);
  await runtime.tools.rollback(updated.rollbackId);await runtime.tools.rollback(added.rollbackId);assert.equal(fs.existsSync(file),false);
});
test('real bundled LSP diagnoses a type error, resolves hover/definition and updates after edit',async t=>{
  const {runtime,project}=fixture(t);fs.writeFileSync(path.join(project,'sample.ts'),'export const count: number = "bad";\nconsole.log(count);\n');
  const diagnostics=await runtime.lsp.inspect({path:'sample.ts',operation:'diagnostics'});
  assert.ok(diagnostics.diagnostics.some(d=>d.code===2322),JSON.stringify(diagnostics));
  const hover=await runtime.lsp.inspect({path:'sample.ts',operation:'hover',line:1,column:14});assert.match(JSON.stringify(hover),/number/);
  const definition=await runtime.lsp.inspect({path:'sample.ts',operation:'definition',line:2,column:14});assert.match(JSON.stringify(definition),/sample.ts/);
  fs.writeFileSync(path.join(project,'sample.ts'),'export const count: number = 5;\nconsole.log(count);\n');
  const updated=await runtime.lsp.inspect({path:'sample.ts',operation:'diagnostics'});assert.equal(updated.diagnostics.some(d=>d.code===2322),false);
});
test('parallel children really overlap, expose only read tools and count all model usage',async t=>{
  let inflight=0,maximum=0;const {runtime}=fixture(t,async(_url,options)=>{
    const body=JSON.parse(options.body);assert.ok(!body.tools.some(t=>['run_shell','apply_patch','delegate_tasks','remember_memory'].includes(t.function.name)));
    inflight++;maximum=Math.max(maximum,inflight);await new Promise(r=>setTimeout(r,150));inflight--;return response({content:'Verified investigation.'});
  });
  const result=await runtime.delegate(['inspect A','inspect B','inspect C'],new AbortController().signal,{...runtime.settings(),contextTokens:16384,mode:'agent'});
  assert.equal(maximum,3);assert.equal(result.length,3);assert.ok(result.every(r=>r.readOnly&&r.result));assert.equal(runtime.stats.requests,3);assert.equal(runtime.children.size,0);
});
test('semantic summary retains historical constraints with latest request and records extra usage',async t=>{
  let calls=0;const {runtime}=fixture(t,async(_,options)=>{
    const body=JSON.parse(options.body);calls++;
    if(calls===1){assert.match(body.messages[0].content,/Summarize historical/);return response({content:'Keep the final dark theme. Pending: verify tests.'});}
    assert.match(body.messages[1].content,/Keep the final dark theme/);assert.equal(body.messages.at(-1).content,'Latest exact request');return response({content:'Done.'});
  });
  await runtime.saveSettings({contextTokens:2048,maxOutputTokens:256});
  const history=Array.from({length:20},(_,i)=>({role:i%2?'assistant':'user',content:'old constraints '+('history '.repeat(150))}));history.push({role:'user',content:'Latest exact request'});
  const result=await runtime.chat({messages:history});assert.ok(result.ok,result.error);assert.equal(calls,2);assert.equal(runtime.stats.requests,2);
});
test('automatic memory proposes only after a response and never persists without approval',async t=>{
  let count=0;const {runtime}=fixture(t,async()=>response({content:++count===1?'Understood.':'User prefers concise Chinese answers.'}),async()=>false);
  await runtime.saveSettings({autoMemory:true});assert.ok((await runtime.chat({messages:[{role:'user',content:'Always answer concisely in Chinese.'}]})).ok);
  assert.equal(runtime.memory().text,'');assert.equal(count,2);
  runtime.approve=async()=>true;assert.ok((await runtime.remember('User prefers concise Chinese answers.')).ok);assert.match(runtime.memory().text,/Chinese/);
});
test('screenshots reach the next model turn as images after all tool results, not huge text logs',async t=>{
  let calls=0;const {runtime}=fixture(t,async(_,options)=>{
    const body=JSON.parse(options.body);if(++calls===1)return response({tool_calls:[{id:'screen',type:'function',function:{name:'browser_screenshot',arguments:'{}'}},{id:'files',type:'function',function:{name:'list_files',arguments:'{}'}}]});
    const roles=body.messages.slice(-3).map(m=>m.role);assert.deepEqual(roles,['tool','tool','user']);assert.ok(body.messages.at(-1).content.some(c=>c.type==='image_url'));assert.doesNotMatch(body.messages.at(-3).content,/base64/);return response({content:'Image received.'});
  });
  runtime.browser={screenshot:async()=>({image:'data:image/png;base64,aW1hZ2U=',width:100,height:100,screenshotId:'1'}),close:()=>{}};
  await runtime.saveSettings({mode:'agent',browserEnabled:true,contextTokens:16384,enabledSkills:[]});const result=await runtime.chat({messages:[{role:'user',content:'Inspect screen'}]});assert.ok(result.ok,result.error);
});
test('custom workflow graph validates cycles and follows a failure recovery branch',async t=>{
  const {runtime}=fixture(t);let requests=[];runtime.chat=async payload=>{requests.push(payload.messages[0].content);return {ok:true,content:'recovered'};};runtime.tools.shell=async()=>({ok:false,code:3,output:'failed fixture'});
  const workflows=new Workflows(runtime);
  assert.throws(()=>workflows.saveTemplate({name:'cycle',steps:[{id:'a',prompt:'x',dependsOn:['b']},{id:'b',prompt:'x',dependsOn:['a']}]}),/循环/);
  const template=workflows.saveTemplate({name:'recovery',steps:[{id:'start',name:'Start',kind:'shell',prompt:'exit 3',continueOnError:true},{id:'success',name:'Success',kind:'model',prompt:'success path',dependsOn:['start'],when:'success'},{id:'recover',name:'Recovery',kind:'model',mode:'plan',approval:false,prompt:'recover now',dependsOn:['start'],when:'failure'}]});
  const run=workflows.create({templateId:template.id,task:'test recovery'});await workflows.advance(run.id);assert.equal(run.status,'waiting');await workflows.advance(run.id,true);
  assert.equal(run.status,'completed_with_errors');assert.equal(run.steps[1].status,'skipped');assert.equal(run.steps[2].status,'completed');assert.equal(requests.length,1);assert.match(requests[0],/recover now/);
  assert.equal(new Workflows(runtime).state().templates.some(t=>t.id===template.id),true);
});
