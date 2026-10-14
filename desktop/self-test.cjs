const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Runtime}=require('./runtime.cjs');const {Vault}=require('./vault.cjs');
async function run(app,storage){
  const dir=app.getPath('userData'),project=path.join(dir,'fixture-project');fs.mkdirSync(project,{recursive:true});
  fs.writeFileSync(path.join(project,'sample.ts'),'const value: number = "invalid";\n');
  const config={provider:'openai',baseUrl:'https://example.invalid/v1',model:'fixture',projectRoot:project,apiKey:'packaged-fixture-secret'};
  const vault=new Vault(storage),file=path.join(dir,'vault-fixture.json');vault.write(file,config);assert.equal(new Vault(storage).read(file,{}).apiKey,config.apiKey);assert.doesNotMatch(fs.readFileSync(file,'utf8'),/packaged-fixture-secret/);
  const runtime=new Runtime({dataDir:path.join(dir,'runtime'),skillDir:path.join(dir,'skills'),getConfig:()=>config,approve:async()=>true,vault,emit:()=>{}});
  try{
    assert.equal(runtime.skills.list().length,11);
    const {CronExpressionParser}=require('cron-parser');assert.ok(CronExpressionParser.parse('0 * * * *').next().toDate() instanceof Date);
    runtime.journal.sync([{id:'packaged-fts',title:'Packaged history',project,messages:[{role:'user',content:'透明毛玻璃输入框'}]}]);
    const recalled=runtime.journal.search('毛玻璃输入框',project);assert.equal(recalled.engine,'sqlite-fts5-trigram');assert.equal(recalled.results.length,1);
    const diagnostics=await runtime.lsp.inspect({path:'sample.ts',operation:'diagnostics'});assert.ok(diagnostics.diagnostics.some(d=>d.code===2322));
    const command=await runtime.tools.shell({command:"Write-Output 'packaged-shell-verified'"});assert.ok(command.ok&&command.output.includes('packaged-shell-verified'));
    const {HermesBackend}=require('./hermes-backend.cjs');
    const backend=new HermesBackend({dataDir:path.join(dir,'hermes'),resourcesPath:process.resourcesPath,getConfig:()=>config});
    let hermes;
    try{
      if(app.isPackaged){assert.equal(backend.python,path.join(process.resourcesPath,'hermes-python/python.exe'));assert.equal(backend.source,path.join(process.resourcesPath,'hermes-engine'));assert.equal(backend.launcher,path.join(process.resourcesPath,'hermes-launch.py'));}
      hermes=await backend.start();assert.equal(hermes.methodCount,258);
      assert.equal(fs.readFileSync(path.join(backend.home,'SOUL.md'),'utf8'),'');
      assert.equal(require('yaml').parse(fs.readFileSync(path.join(backend.home,'config.yaml'),'utf8')).onboarding.profile_build,'off');
      await backend.request('ping');await backend.request('skills.manage',{action:'list'});
      const session=await backend.request('session.create',{cwd:project});assert.ok(session.session_id);
      const attached=await backend.request('file.attach',{session_id:session.session_id,path:path.join(project,'sample.ts')});assert.ok(attached.ref_text);
      const second=await backend.request('session.create',{cwd:project});assert.notEqual(second.session_id,session.session_id);
      const binary=path.join(dir,'附件 测试.unusual'),bytes=Buffer.from([0,255,13,10,37]);fs.writeFileSync(binary,bytes);
      const stored=await backend.request('file.attach',{session_id:second.session_id,path:binary});assert.ok(stored.ref_text);assert.deepEqual(fs.readFileSync(stored.path),bytes);
    }finally{await backend.stop();}
    const report={ok:true,version:app.getVersion(),isPackaged:app.isPackaged,hermes,checks:['packaged dependencies','11 skills','bundled cron parser','packaged SQLite FTS5 actual recall','bundled TypeScript LSP actual diagnostic','actual approved Shell','Windows credential encryption and reopen','bundled Hermes Python and source startup','no imposed identity and disabled profile onboarding','258 native RPC methods','native skills and session creation','native file attachment']};fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));return report;
  }finally{await runtime.close();}
}
module.exports={run};
