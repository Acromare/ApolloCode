// Explicit local acceptance run against the user's saved profile. Never prints credentials.
const {app,safeStorage,net}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Vault}=require('../desktop/vault.cjs'),{Runtime}=require('../desktop/runtime.cjs');
const {modelFetch}=require('../desktop/model-network.cjs');
const work=path.join(__dirname,'../work');fs.mkdirSync(work,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(work,'live-reliability-cache-')));
let runtime;
app.whenReady().then(async()=>{
  const report={version:require('../package.json').version,date:'2026-10-14',scope:'Ten sequential isolated tasks against the saved API endpoint; not a general success-rate guarantee.',tasks:[]};
  try{
    assert.ok(process.argv.includes('--live'),'Use --live with user authorization');
    const vault=new Vault(safeStorage),config=vault.read(path.join(app.getPath('appData'),'apollo-code','config.json'),{});
    assert.ok(config.apiKey||config.provider==='ollama','No saved credentials');assert.notEqual(config.provider,'claude','API acceptance requires an API profile');
    report.identity={provider:config.provider,model:config.model,host:new URL(config.baseUrl).host,apiMode:config.apiMode||'auto'};
    console.log('LIVE',JSON.stringify(report.identity));
    const prompts=[
      'Reply with exactly APOLLO_OK. No tools.',
      'Calculate 17 + 25. Return just the number. No tools.',
      '用一句中文说明什么是请求重试。不要使用工具。',
      'Read fact.txt with read_file, then report its exact text.',
      'Use read_file for fact.txt and calc.cjs, then report what you verified. Do not modify files.',
      'Use list_files to inspect the project and report the two JavaScript filenames. Do not modify files.',
      'Use read_file to inspect calc.cjs and calc.test.cjs. Fix the add function using apply_patch, then run_tests and report the actual passing test. Never modify the test or package.json.',
      'Read calc.cjs, fix its add bug with apply_patch, and run_tests. The result must pass before you finish. Never modify tests or package.json.',
      'Use read_file to read calc.cjs. Report the exact function and its bug; do not change files.',
      'Run run_tests on this fixture. It intentionally contains a failing addition test. Report that failure accurately, with no file changes.'
    ];
    const root=fs.mkdtempSync(path.join(work,'live-reliability-'));report.fixtureDirectory=root;
    for(let index=0;index<prompts.length;index++){
      const dir=path.join(root,String(index+1)),project=path.join(dir,'project');fs.mkdirSync(project,{recursive:true});
      fs.writeFileSync(path.join(project,'fact.txt'),'APOLLO_VERIFIED_FACT');
      fs.writeFileSync(path.join(project,'package.json'),JSON.stringify({name:'apollo-live-fixture',version:'1.0.0',scripts:{test:'node --test calc.test.cjs'}}));
      fs.writeFileSync(path.join(project,'calc.cjs'),'exports.add = (a, b) => a - b;\n');
      fs.writeFileSync(path.join(project,'calc.test.cjs'),"const test=require('node:test'),assert=require('node:assert/strict');const {add}=require('./calc.cjs');test('addition',()=>assert.equal(add(2,3),5));\n");
      const events=[],started=Date.now();
      runtime=new Runtime({dataDir:path.join(dir,'state'),skillDir:path.join(dir,'skills'),getConfig:()=>({...config,projectRoot:project}),vault,fetcher:modelFetch(net.fetch.bind(net)),approve:async type=>['patch','run-tests'].includes(type),emit:e=>{if(['request_start','connected','first_text','first_event','attempt_end','retrying','failure','tool','command_end'].includes(e.type)){events.push(e);if(e.type==='attempt_end'||e.type==='tool'&&e.status!=='running')console.log('LIVE task',index+1,e.type,e.name||e.attempt,e.status,e.code||'');}}});
      await runtime.saveSettings({mode:index<3?'chat':'agent',contextTokens:16384,maxOutputTokens:2048,maxSteps:6,maxAttempts:3,connectTimeoutMs:20000,firstEventTimeoutMs:60000,idleTimeoutMs:45000,taskTimeoutMs:180000,parallelAgents:false,autoMemory:false,semanticSummary:false,enabledSkills:[]});
      const result=await runtime.chat({messages:[{role:'user',content:prompts[index]+'\nThis is an isolated acceptance fixture. Use only the requested read/list/patch/test tools. No shell, Git, external operations, personal files, memory or delegation.'}]});
      let verified=result.ok,verification=[];
      if(index===0)verified&&=result.content.includes('APOLLO_OK');
      if(index===1)verified&&=result.content.includes('42');
      if(index===3)verified&&=result.content.includes('APOLLO_VERIFIED_FACT');
      if(index===6||index===7){const tests=await runtime.tools.tests();verified&&=tests.ok&&/a\s*\+\s*b/.test(fs.readFileSync(path.join(project,'calc.cjs'),'utf8'));verification.push({check:'independent fixture tests',ok:tests.ok});}
      if(index>=3)verified&&=events.some(e=>e.type==='tool');
      if(index===9)verified&&=events.some(e=>e.type==='tool'&&e.name==='run_tests'&&e.status==='failed');
      report.tasks.push({number:index+1,ok:result.ok,verified,outcome:result.outcome,failure:result.failure,durationMs:Date.now()-started,usage:runtime.usage(),events,verification});
      console.log('LIVE result',index+1,'verified='+verified,'duration='+((Date.now()-started)/1000).toFixed(1)+'s',result.failure?.code||'');
      fs.writeFileSync(path.join(work,'live-reliability-report.json'),JSON.stringify(report,null,2));await runtime.close();runtime=null;
    }
    const sorted=report.tasks.filter(t=>t.verified).map(t=>t.durationMs).sort((a,b)=>a-b);
    report.summary={tasks:report.tasks.length,verified:report.tasks.filter(t=>t.verified).length,firstAttemptTasks:report.tasks.filter(t=>t.verified&&t.usage.failedAttempts===0).length,recoveredTasks:report.tasks.filter(t=>t.verified&&t.usage.recoveredCalls>0).length,failedTasks:report.tasks.filter(t=>!t.verified).length,successfulDurationP50:sorted.length?sorted[Math.floor((sorted.length-1)*.5)]:null,successfulDurationP95:sorted.length?sorted[Math.ceil((sorted.length-1)*.95)]:null};
    fs.writeFileSync(path.join(work,'live-reliability-report.json'),JSON.stringify(report,null,2));console.log('LIVE SUMMARY',JSON.stringify(report.summary));app.exit(report.summary.failedTasks===0?0:1);
  }catch(error){report.error=error.message;fs.writeFileSync(path.join(work,'live-reliability-report.json'),JSON.stringify(report,null,2));console.error('LIVE FAILED',error.message);await runtime?.close();app.exit(1);}
});
