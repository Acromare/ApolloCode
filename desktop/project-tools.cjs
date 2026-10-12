const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {parsePatch,applyPatch}=require('diff');
const {redact}=require('./economy.cjs');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function contained(root,target){const rel=path.relative(root,target);return !rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);}
class ProjectTools {
  constructor(getRoot,approve){this.getRoot=getRoot;this.approve=approve;}
  root(){const root=this.getRoot();if(!root||!fs.existsSync(root))throw new Error('请先选择项目。');return fs.realpathSync(root);}
  resolve(relative){
    const root=this.root(); const file=path.resolve(root,String(relative||'.'));
    if(!contained(root,file))throw new Error('路径在项目外。');
    const rel=path.relative(root,file);
    if(rel.split(path.sep).some(p=>/^\.env(?:\.|$)|^\.git$|^\.apollocode$|^id_(rsa|ed25519)$|\.(pem|key|pfx)$/i.test(p)))throw new Error('此路径受保护。');
    let parent=file;while(!fs.existsSync(parent)){const next=path.dirname(parent);if(next===parent)throw new Error('无效路径。');parent=next;}
    if(!contained(root,fs.realpathSync(parent)))throw new Error('目录链接指向项目外。');
    return file;
  }
  audit(action,detail){
    const root=this.root(); const dir=path.join(root,'.apollocode');if(fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink())throw new Error('审计目录不能是链接。');
    fs.mkdirSync(dir,{recursive:true});const log=path.join(dir,'audit.log');if(fs.existsSync(log)&&fs.lstatSync(log).isSymbolicLink())throw new Error('审计文件不能是链接。');
    fs.appendFileSync(log,JSON.stringify({time:new Date().toISOString(),action,detail:redact(detail)})+'\n');
  }
  list(relative){const dir=this.resolve(relative);const items=fs.readdirSync(dir,{withFileTypes:true}).filter(d=>!['node_modules','.git','.apollocode'].includes(d.name)&&!d.name.startsWith('.env')).slice(0,200).map(d=>({name:d.name,directory:d.isDirectory()}));this.audit('list-files',relative||'.');return items;}
  read(relative,start=1,end=160){const file=this.resolve(relative);if(!fs.statSync(file).isFile()||fs.statSync(file).size>2_000_000)throw new Error('文件过大或不是普通文件。');const text=fs.readFileSync(file,'utf8');if(text.includes('\0'))throw new Error('不能读取二进制文件。');const lines=text.split('\n');start=Math.max(1,Number(start)||1);end=Math.min(lines.length,start+300,Number(end)||start+159);this.audit('read-file',relative+':'+start+'-'+end);return {path:relative,totalLines:lines.length,content:redact(lines.slice(start-1,end).map((l,i)=>(start+i)+': '+l).join('\n'))};}
  async command(file,args,signal){
    const root=this.root();this.audit('command',JSON.stringify({file,args}));
    return new Promise((resolve,reject)=>{
      if(signal?.aborted)return reject(new Error('已中断'));
      const npm=process.platform==='win32'&&file==='npm';
      const executable=npm?process.execPath:file;
      const argv=npm?[...args]:args;
      // Electron's bundled Node runs npm-cli directly, avoiding cmd.exe interpolation.
      let command=executable,actual=argv,env={...process.env};
      if(npm){const candidates=[path.join(path.dirname(process.env.npm_execpath||''),'npm-cli.js'),path.join(process.env.APPDATA||'','npm','node_modules','npm','bin','npm-cli.js'),...(process.env.PATH||'').split(path.delimiter).map(dir=>path.join(dir,'node_modules','npm','bin','npm-cli.js'))];const cli=candidates.find(p=>fs.existsSync(p));if(!cli)return reject(new Error('未找到 npm-cli.js，请配置本机 Node.js/npm。')); actual=[cli,...args];env.ELECTRON_RUN_AS_NODE='1';}
      const child=spawn(command,actual,{cwd:root,env,windowsHide:true,shell:false});
      let output='';const append=chunk=>{output=(output+chunk.toString()).slice(-80000);};child.stdout.on('data',append);child.stderr.on('data',append);
      const stop=()=>child.kill();signal?.addEventListener('abort',stop,{once:true});
      const timer=setTimeout(stop,120000);
      child.once('error',e=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);reject(e);});
      child.once('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);resolve({ok:code===0,code,command:[file,...args].join(' '),output:redact(output)});});
    });
  }
  async tests(signal){
    const root=this.root();const pkg=path.join(root,'package.json');
    if(fs.existsSync(pkg)&&JSON.parse(fs.readFileSync(pkg,'utf8')).scripts?.test)return this.command('npm',['test'],signal);
    if(fs.existsSync(path.join(root,'go.mod')))return this.command('go',['test','./...'],signal);
    throw new Error('未找到 npm test 或 go test。');
  }
  async patch(text){
    if(typeof text!=='string'||text.length>300000)throw new Error('补丁过大。');
    const patches=parsePatch(text);if(!patches.length)throw new Error('补丁为空。');
    const changes=[];const seen=new Set();
    for(const patch of patches){
      if(patch.newFileName==='/dev/null')throw new Error('删除文件暂不支持。');
      const relative=String(patch.newFileName||'').replace(/^b\//,'');const file=this.resolve(relative);
      if(seen.has(file))throw new Error('补丁包含重复文件。');seen.add(file);
      const before=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
      if(before!==null&&Buffer.byteLength(before)>2_000_000)throw new Error('文件过大。');
      const after=applyPatch(before||'',patch,{fuzzFactor:0});if(after===false)throw new Error('补丁与当前内容不匹配：'+relative);
      changes.push({relative,file,before,after,afterHash:hash(after)});
    }
    if(!await this.approve('patch',text))throw new Error('用户拒绝补丁。');
    // Recheck immediately before writing so approval never overwrites later user edits.
    for(const c of changes){this.resolve(c.relative);const current=fs.existsSync(c.file)?fs.readFileSync(c.file,'utf8'):null;if(current!==c.before)throw new Error('确认期间文件发生变化，请重新生成补丁。');}
    this.audit('patch-approved',changes.map(c=>c.relative).join(','));
    const record={id:crypto.randomUUID(),time:Date.now(),changes:changes.map(({file,...c})=>c)};
    const backup=path.join(this.root(),'.apollocode','rollback-'+record.id+'.json');fs.writeFileSync(backup,JSON.stringify(record));
    const written=[];
    try {for(const c of changes){fs.mkdirSync(path.dirname(c.file),{recursive:true});fs.writeFileSync(c.file,c.after);written.push(c);}}
    catch(error){for(const c of written){if(c.before===null)fs.unlinkSync(c.file);else fs.writeFileSync(c.file,c.before);}throw error;}
    return {ok:true,rollbackId:record.id,files:changes.map(c=>c.relative)};
  }
  async rollback(id){
    if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('无效回滚 ID。');
    const record=JSON.parse(fs.readFileSync(path.join(this.root(),'.apollocode','rollback-'+id+'.json'),'utf8'));
    const changes=record.changes.map(c=>({...c,file:this.resolve(c.relative)}));
    for(const c of changes)if(!fs.existsSync(c.file)||hash(fs.readFileSync(c.file,'utf8'))!==c.afterHash)throw new Error('文件存在后续修改，回滚已停止：'+c.relative);
    if(!await this.approve('rollback',changes.map(c=>c.relative).join('\n')))throw new Error('用户拒绝回滚。');
    for(const c of changes){this.resolve(c.relative);if(hash(fs.readFileSync(c.file,'utf8'))!==c.afterHash)throw new Error('确认期间文件发生变化。');}
    for(const c of changes)if(c.before===null)fs.unlinkSync(c.file);else fs.writeFileSync(c.file,c.before);
    this.audit('rollback',id);return {ok:true};
  }
}
const definitions=[
  {name:'list_files',description:'List one project directory.',parameters:{type:'object',properties:{path:{type:'string'}}}},
  {name:'read_file',description:'Read a narrow line range from a project file.',parameters:{type:'object',properties:{path:{type:'string'},start:{type:'integer'},end:{type:'integer'}},required:['path']}},
  {name:'git_status',description:'Inspect Git changes.',parameters:{type:'object',properties:{}}},
  {name:'git_diff',description:'Inspect the current Git diff.',parameters:{type:'object',properties:{}}},
  {name:'run_tests',description:'Run project tests with user approval.',parameters:{type:'object',properties:{}}},
  {name:'apply_patch',description:'Apply a unified diff after approval. Returns rollback ID.',parameters:{type:'object',properties:{patch:{type:'string'}},required:['patch']}}
];
module.exports={ProjectTools,definitions,contained};
