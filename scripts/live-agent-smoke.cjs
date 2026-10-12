// Explicit opt-in only: uses the user's saved API profile and incurs model usage.
const {app,safeStorage}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Vault}=require('../desktop/vault.cjs');
const {Runtime}=require('../desktop/runtime.cjs');
let runtime;
const cache=path.join(__dirname,'../work');fs.mkdirSync(cache,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(cache,'live-cache-')));
app.whenReady().then(async()=>{
  const started=Date.now();
  try{
    if(!process.argv.includes('--live'))throw new Error('Pass --live only with user authorization.');
    const vault=new Vault(safeStorage),userData=path.join(app.getPath('appData'),'apollo-code');
    const config=vault.read(path.join(userData,'config.json'),{});
    assert.ok(config.apiKey||config.provider==='ollama','No saved API credentials');assert.notEqual(config.provider,'claude','Select an API provider first');
    const work=path.join(__dirname,'../work');fs.mkdirSync(work,{recursive:true});
    const dir=fs.mkdtempSync(path.join(work,'live-agent-')),project=path.join(dir,'project');fs.mkdirSync(project);
    fs.writeFileSync(path.join(project,'package.json'),JSON.stringify({name:'apollo-live-fixture',version:'1.0.0',scripts:{test:'node --test calc.test.cjs'}}));
    fs.writeFileSync(path.join(project,'calc.cjs'),'exports.add = (a, b) => a - b;\n');
    fs.writeFileSync(path.join(project,'calc.test.cjs'),"const test=require('node:test'),assert=require('node:assert/strict');const {add}=require('./calc.cjs');test('addition',()=>assert.equal(add(2,3),5));\n");
    const events=[],approvals=[];
    runtime=new Runtime({dataDir:path.join(dir,'state'),skillDir:path.join(dir,'skills'),getConfig:()=>({...config,projectRoot:project}),vault,approve:async(type)=>{approvals.push(type);return ['patch','run-tests'].includes(type);},emit:event=>{if(event.type==='tool'){events.push({name:event.name,status:event.status,preview:event.preview});if(event.status!=='running')console.log('LIVE tool:',event.name,event.status,event.status==='failed'?event.preview:'');}if(event.type==='step')console.log('LIVE model step',event.step);}});
    await runtime.saveSettings({mode:'agent',contextTokens:16384,maxOutputTokens:1200,maxSteps:8,parallelAgents:false,autoMemory:false,semanticSummary:false,enabledSkills:[]});
    console.log('LIVE provider:',config.provider,'model:',config.model,'host:',new URL(config.baseUrl).host);
    const result=await runtime.chat({messages:[{role:'user',content:'This is an isolated test project. Use read_file to inspect calc.cjs and calc.test.cjs. The add function has a bug. Fix it using apply_patch (unified diff), then use run_tests to verify the actual test passes. Do not use shell, Git, browser, external tools or memory. Do not finish before tests pass. Report the verified result.'}]});
    fs.writeFileSync(path.join(work,'live-agent-last-attempt.json'),JSON.stringify({ok:result.ok,error:result.error,events,usage:runtime.usage()},null,2));
    assert.ok(result.ok,result.error);assert.match(fs.readFileSync(path.join(project,'calc.cjs'),'utf8'),/a\s*\+\s*b/);
    for(const name of ['read_file','apply_patch','run_tests'])assert.ok(events.some(e=>e.name===name&&e.status==='done'),'Missing successful tool: '+name);
    const testResult=await runtime.tools.tests();assert.ok(testResult.ok,testResult.output);
    const report={ok:true,provider:config.provider,model:config.model,host:new URL(config.baseUrl).host,durationMs:Date.now()-started,events,approvals,usage:runtime.usage(),checks:['real model selected tools','read fixture','applied code patch','ran project tests','independently reran passing tests'],scope:'Only this saved model endpoint was tested; no claim about unconfigured providers.'};
    fs.writeFileSync(path.join(work,'live-agent-report.json'),JSON.stringify(report,null,2));
    console.log('PASS: real saved model read code, applied patch and ran passing tests. Requests:',report.usage.requests);
    await runtime.close();app.exit(0);
  }catch(error){console.error('LIVE FAILED:',error.message);await runtime?.close();app.exit(1);}
});
