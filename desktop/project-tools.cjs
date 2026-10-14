const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {parsePatch,applyPatch,createPatch}=require('diff');
const {redact}=require('./economy.cjs');
const {CommandOutput}=require('./command-output.cjs');
const {StringDecoder}=require('node:string_decoder');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function contained(root,target){const rel=path.relative(root,target);return !rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);}
function normalizePatch(text,tools){
  if(!text.trimStart().startsWith('*** Begin Patch'))return text;
  const lines=text.replace(/\r\n/g,'\n').trim().split('\n');if(lines.at(-1)!=='*** End Patch')throw new Error('补丁缺少 End Patch。');
  const patches=[];let index=1;
  while(index<lines.length-1){
    const header=lines[index++].match(/^\*\*\* (Add|Update|Delete) File: (.+)$/);if(!header)throw new Error('无效补丁文件头。');
    const [,operation,relative]=header,file=tools.resolve(relative);
    if(fs.existsSync(file)&&(!fs.statSync(file).isFile()||fs.statSync(file).size>2_000_000))throw new Error('补丁目标不是普通文件或文件过大。');
    const before=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;const content=[];
    while(index<lines.length-1&&!/^\*\*\* (?:Add|Update|Delete) File:/.test(lines[index]))content.push(lines[index++]);
    let after;
    if(operation==='Add'){if(before!==null)throw new Error('新增文件已存在：'+relative);if(content.some(l=>!l.startsWith('+')))throw new Error('新增文件内容必须以 + 开头。');after=content.map(l=>l.slice(1)).join('\n')+'\n';}
    else if(operation==='Delete'){if(before===null)throw new Error('删除目标不存在。');if(content.length)throw new Error('删除文件头不应带内容。');after='';}
    else {
      if(before===null)throw new Error('更新目标不存在：'+relative);const eol=before.includes('\r\n')&&!/(^|[^\r])\n/.test(before)?'\r\n':'\n';let result=(eol==='\r\n'?before.replace(/\r\n/g,'\n'):before).split('\n');let cursor=0;
      while(cursor<content.length){
        if(!content[cursor].startsWith('@@'))throw new Error('更新补丁需要 @@ 区块。');cursor++;
        const chunk=[];while(cursor<content.length&&!content[cursor].startsWith('@@')){if(content[cursor]==='*** End of File'){cursor++;break;}chunk.push(content[cursor++]);}
        if(chunk.some(l=>![' ','+','-'].includes(l[0])))throw new Error('补丁行需以空格、+ 或 - 开头。');
        const original=chunk.filter(l=>l[0]!=='+').map(l=>l.slice(1)),replacement=chunk.filter(l=>l[0]!=='-').map(l=>l.slice(1));
        if(!original.length)throw new Error('更新补丁需提供定位上下文。');
        const matches=[];for(let i=0;i<=result.length-original.length;i++)if(original.every((line,j)=>result[i+j]===line))matches.push(i);
        if(matches.length!==1)throw new Error('补丁上下文不匹配或不唯一：'+relative);result.splice(matches[0],original.length,...replacement);
      }
      after=result.join(eol);
    }
    const diff=createPatch(relative,before||'',after);patches.push(operation==='Delete'?diff.replace('+++ '+relative,'+++ /dev/null'):diff);
  }
  return patches.join('\n');
}
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
  async command(file,args,signal,options={}){
    const root=options.cwd?this.resolve(options.cwd):this.root();this.audit('command',options.auditCommand?JSON.stringify({command:redact(options.auditCommand),cwd:root}):JSON.stringify({file,args,cwd:root}));
    return new Promise((resolve,reject)=>{
      if(signal?.aborted)return reject(new Error('已中断'));
      const npm=process.platform==='win32'&&file==='npm';
      const executable=npm?process.execPath:file;
      const argv=npm?[...args]:args;
      // Electron's bundled Node runs npm-cli directly, avoiding cmd.exe interpolation.
      let command=executable,actual=argv,env={...process.env,...(file==='git'?{GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}:{})};
      if(npm){const candidates=[path.join(path.dirname(process.env.npm_execpath||''),'npm-cli.js'),path.join(process.env.APPDATA||'','npm','node_modules','npm','bin','npm-cli.js'),...(process.env.PATH||'').split(path.delimiter).map(dir=>path.join(dir,'node_modules','npm','bin','npm-cli.js'))];const cli=candidates.find(p=>fs.existsSync(p));if(!cli)return reject(new Error('未找到 npm-cli.js，请配置本机 Node.js/npm。')); actual=[cli,...args];env.ELECTRON_RUN_AS_NODE='1';}
      const child=spawn(command,actual,{cwd:root,env,windowsHide:true,shell:false,detached:process.platform!=='win32'});
      const secrets=options.secrets||this.outputSecrets||[],notify=options.onOutput||this.onOutput;
      const started=Date.now(),displayCommand=redact(options.auditCommand||[file,...args].join(' '),secrets);
      notify?.({type:'command_start',command:displayCommand,cwd:root,backend:options.backend||'local'});
      const live=new CommandOutput(secrets,event=>notify?.({type:'tool_output',...event,durationMs:Date.now()-started}));
      let output='';const decoders={stdout:new StringDecoder('utf8'),stderr:new StringDecoder('utf8')};
      const append=(stream,chunk)=>{const text=decoders[stream].write(chunk);output=(output+text).slice(-80000);live.append(stream,text);};child.stdout.on('data',chunk=>append('stdout',chunk));child.stderr.on('data',chunk=>append('stderr',chunk));
      let timedOut=false;const stop=()=>{if(process.platform==='win32'){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}else{try{process.kill(-child.pid,'SIGTERM');}catch{child.kill();}}};signal?.addEventListener('abort',stop,{once:true});
      const timer=setTimeout(()=>{timedOut=true;stop();},options.timeoutMs||120000);
      child.once('error',e=>{clearTimeout(timer);live.flush();signal?.removeEventListener('abort',stop);reject(e);});
      child.once('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);for(const stream of ['stdout','stderr'])live.append(stream,decoders[stream].end());live.flush();notify?.({type:'command_end',code,timedOut,interrupted:Boolean(signal?.aborted),durationMs:Date.now()-started});resolve({ok:code===0&&!timedOut&&!signal?.aborted,code,timedOut,interrupted:Boolean(signal?.aborted),command:displayCommand,cwd:root,output:redact(output,secrets)});});
    });
  }
  async shell(args,signal,options={}){
    const command=String(args.command||'');if(!command.trim()||command.length>30000)throw new Error('命令不能为空且最多 30000 字符。');
    const timeoutMs=Number(args.timeoutMs||120000);if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>300000)throw new Error('命令超时范围为 1–300 秒。');
    const cwd=args.cwd||'.';this.resolve(cwd);
    if(!await this.approve('shell',this.root()+'\n'+cwd+'\n'+redact(command)))throw new Error('Shell 命令未获批准。');
    if(process.platform==='win32')return this.command('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],signal,{...options,cwd,timeoutMs,auditCommand:command});
    return this.command('/bin/sh',['-c',command],signal,{...options,cwd,timeoutMs,auditCommand:command});
  }
  async commit(args,signal){
    if(!Array.isArray(args.paths)||!args.paths.length||args.paths.length>100)throw new Error('提交需明确选择 1–100 个文件。');
    const paths=args.paths.map(p=>{const file=this.resolve(p);if(fs.existsSync(file)&&!fs.statSync(file).isFile())throw new Error('请逐个指定文件。');return path.relative(this.root(),file);});
    const message=String(args.message||'').trim();if(!message||message.length>4000)throw new Error('提交消息不能为空，最多 4000 字符。');
    const staged=await this.command('git',['diff','--cached','--name-only','-z'],signal);
    if(!staged.ok)throw new Error(staged.output);
    const other=staged.output.split('\0').filter(Boolean).filter(p=>!paths.includes(path.normalize(p)));
    if(other.length)throw new Error('暂存区已有其他文件，请先处理：'+other.join(', '));
    const before=paths.map(p=>{const f=this.resolve(p);return fs.existsSync(f)?hash(fs.readFileSync(f)):null;});
    const diff=await this.command('git',['diff','HEAD','--no-ext-diff','--no-textconv','--',...paths],signal);
    const initial=diff.ok?diff.output:(await this.command('git',['diff','--no-ext-diff','--no-textconv','--',...paths],signal)).output;
    if(!await this.approve('git-commit',redact(message)+'\n'+paths.join('\n')+'\n'+initial))throw new Error('Git 提交未获批准。');
    const current=await this.command('git',['diff','--cached','--name-only','-z'],signal);
    if(!current.ok||current.output!==staged.output)throw new Error('审批期间暂存区变更，请重新检查。');
    for(let i=0;i<paths.length;i++){const f=this.resolve(paths[i]);if((fs.existsSync(f)?hash(fs.readFileSync(f)):null)!==before[i])throw new Error('审批期间文件变更，请重新检查。');}
    for(const p of paths)this.resolve(p);
    let result=await this.command('git',['add','--',...paths],signal);if(!result.ok)return result;
    result=await this.command('git',['commit','-m',message,'--',...paths],signal);return result;
  }
  async branch(name,signal){
    if(typeof name!=='string'||name.startsWith('-')||name.length>120)throw new Error('无效分支名称。');
    const checked=await this.command('git',['check-ref-format','--branch',name],signal);if(!checked.ok)throw new Error('无效分支名称。');
    if(!await this.approve('git-branch',name))throw new Error('创建分支未获批准。');return this.command('git',['switch','-c',name],signal);
  }
  async push(branch,signal){
    if(typeof branch!=='string'||branch.startsWith('-'))throw new Error('无效分支。');
    const checked=await this.command('git',['check-ref-format','--branch',branch],signal);if(!checked.ok)throw new Error('无效分支。');
    const remote=await this.command('git',['remote','get-url','origin'],signal);if(!remote.ok)throw new Error(remote.output);
    if(!await this.approve('git-push',redact(remote.output.trim())+'\n'+branch))throw new Error('推送未获批准。');
    return this.command('git',['push','--set-upstream','origin',branch],signal);
  }
  async tests(signal,options={}){
    const root=this.root();const pkg=path.join(root,'package.json');
    if(fs.existsSync(pkg)&&JSON.parse(fs.readFileSync(pkg,'utf8')).scripts?.test)return this.command('npm',['test'],signal,options);
    if(fs.existsSync(path.join(root,'go.mod')))return this.command('go',['test','./...'],signal,options);
    throw new Error('未找到 npm test 或 go test。');
  }
  async patch(text){
    if(typeof text!=='string'||text.length>300000)throw new Error('补丁过大。');
    const patches=parsePatch(normalizePatch(text,this));if(!patches.length)throw new Error('补丁为空。请使用 unified diff 或 Begin Patch 格式。');
    const changes=[];const seen=new Set();
    for(const patch of patches){
      const deleting=patch.newFileName==='/dev/null';const relative=String(deleting?patch.oldFileName:patch.newFileName||'').replace(/^[ab]\//,'');if(!relative||relative==='/dev/null')throw new Error('补丁文件名缺失。请使用完整补丁文件头。');const file=this.resolve(relative);
      if(seen.has(file))throw new Error('补丁包含重复文件。');seen.add(file);
      if(fs.existsSync(file)&&!fs.statSync(file).isFile())throw new Error('补丁目标不是普通文件：'+relative);const before=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
      if(before!==null&&Buffer.byteLength(before)>2_000_000)throw new Error('文件过大。');
      const applied=applyPatch(before||'',patch,{fuzzFactor:0});if(applied===false)throw new Error('补丁与当前内容不匹配：'+relative);
      const after=deleting?null:applied;if(deleting&&before===null)throw new Error('删除目标不存在。');changes.push({relative,file,before,after,afterHash:after===null?null:hash(after)});
    }
    if(!await this.approve('patch',text))throw new Error('用户拒绝补丁。');
    // Recheck immediately before writing so approval never overwrites later user edits.
    for(const c of changes){this.resolve(c.relative);const current=fs.existsSync(c.file)?fs.readFileSync(c.file,'utf8'):null;if(current!==c.before)throw new Error('确认期间文件发生变化，请重新生成补丁。');}
    this.audit('patch-approved',changes.map(c=>c.relative).join(','));
    const record={id:crypto.randomUUID(),time:Date.now(),changes:changes.map(({file,...c})=>c)};
    const backup=path.join(this.root(),'.apollocode','rollback-'+record.id+'.json');fs.writeFileSync(backup,JSON.stringify(record));
    const written=[];
    try {for(const c of changes){fs.mkdirSync(path.dirname(c.file),{recursive:true});if(c.after===null)fs.unlinkSync(c.file);else fs.writeFileSync(c.file,c.after);written.push(c);}}
    catch(error){for(const c of written){if(c.before===null)fs.unlinkSync(c.file);else fs.writeFileSync(c.file,c.before);}throw error;}
    return {ok:true,rollbackId:record.id,files:changes.map(c=>c.relative)};
  }
  async rollback(id){
    if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('无效回滚 ID。');
    const record=JSON.parse(fs.readFileSync(path.join(this.root(),'.apollocode','rollback-'+id+'.json'),'utf8'));
    const changes=record.changes.map(c=>({...c,file:this.resolve(c.relative)}));
    const matches=c=>c.afterHash===null?!fs.existsSync(c.file):fs.existsSync(c.file)&&hash(fs.readFileSync(c.file,'utf8'))===c.afterHash;
    for(const c of changes)if(!matches(c))throw new Error('文件存在后续修改，回滚已停止：'+c.relative);
    if(!await this.approve('rollback',changes.map(c=>c.relative).join('\n')))throw new Error('用户拒绝回滚。');
    for(const c of changes){this.resolve(c.relative);if(!matches(c))throw new Error('确认期间文件发生变化。');}
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
  {name:'apply_patch',description:'Apply a unified diff after approval. Returns rollback ID.',parameters:{type:'object',properties:{patch:{type:'string'}},required:['patch']}},
  {name:'run_shell',description:'Run an approved shell command in the selected project. This has OS process permissions, not a filesystem sandbox. Inspect results; cancellation stops descendants.',parameters:{type:'object',properties:{command:{type:'string'},cwd:{type:'string'},timeoutMs:{type:'integer'}},required:['command']}},
  {name:'git_branch',description:'Create and switch to a new branch after approval.',parameters:{type:'object',properties:{name:{type:'string'}},required:['name']}},
  {name:'git_commit',description:'Commit explicit project files after approval; refuses unrelated staged files.',parameters:{type:'object',properties:{paths:{type:'array',items:{type:'string'}},message:{type:'string'}},required:['paths','message']}},
  {name:'git_push',description:'Push a named branch to origin after explicit approval, without force.',parameters:{type:'object',properties:{branch:{type:'string'}},required:['branch']}}
];
module.exports={ProjectTools,definitions,contained};
