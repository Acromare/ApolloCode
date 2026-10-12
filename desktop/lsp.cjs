const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL,fileURLToPath}=require('node:url');
const uriKey=uri=>{try{const file=fileURLToPath(uri);return process.platform==='win32'?file.toLowerCase():file;}catch{return uri;}};
const executablePath=file=>file.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
const {spawn}=require('node:child_process');
class LanguageTools {
  constructor(tools){this.tools=tools;this.pending=new Map();this.diagnostics=new Map();this.waiters=new Map();this.documents=new Map();this.counter=0;this.buffer=Buffer.alloc(0);}
  send(message){const body=Buffer.from(JSON.stringify({jsonrpc:'2.0',...message}));this.child.stdin.write(Buffer.concat([Buffer.from('Content-Length: '+body.length+'\r\n\r\n'),body]));}
  request(method,params,signal){
    return new Promise((resolve,reject)=>{
      if(signal?.aborted)return reject(new Error('已中断'));
      const id=++this.counter;const abort=()=>finish(new Error('已中断'));
      const timer=setTimeout(()=>finish(new Error('LSP 请求超时：'+method)),15000);
      const finish=(error,result)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);this.pending.delete(id);error?reject(error):resolve(result);};
      this.pending.set(id,finish);signal?.addEventListener('abort',abort,{once:true});this.send({id,method,params});
    });
  }
  receive(chunk){
    this.buffer=Buffer.concat([this.buffer,chunk]);
    if(this.buffer.length>8_000_000){this.close();return;}
    while(true){
      const boundary=this.buffer.indexOf('\r\n\r\n');if(boundary<0)return;
      const size=Number(this.buffer.subarray(0,boundary).toString().match(/Content-Length:\s*(\d+)/i)?.[1]);
      if(!Number.isInteger(size)||size<0||size>8_000_000){this.close();return;}
      if(this.buffer.length<boundary+4+size)return;
      const message=JSON.parse(this.buffer.subarray(boundary+4,boundary+4+size));this.buffer=this.buffer.subarray(boundary+4+size);
      if(message.method==='textDocument/publishDiagnostics'){
        const {uri,diagnostics,version}=message.params;const key=uriKey(uri);this.diagnostics.set(key,{diagnostics,version});this.waiters.get(key)?.({diagnostics,version});
      }else if(message.method&&message.id!==undefined){
        const result=message.method==='workspace/configuration'?(message.params.items||[]).map(()=>({})):null;
        this.send({id:message.id,result});
      }else if(message.id!==undefined)this.pending.get(message.id)?.(message.error?new Error(message.error.message):null,message.result);
    }
  }
  async start(signal){
    const root=this.tools.root();if(this.initializing){await this.initializing;if(this.root===root)return;}
    if(this.child&&this.root===root)return;
    await this.close();this.root=root;
    this.initializing=(async()=>{
      const cli=executablePath(require.resolve('typescript-language-server/lib/cli.mjs'));
      this.child=spawn(process.execPath,[cli,'--stdio'],{cwd:root,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true});
      this.child.stdout.on('data',data=>{try{this.receive(data);}catch{this.close();}});this.child.stderr.resume();
      const child=this.child;const failed=()=>{if(this.child!==child)return;for(const finish of [...this.pending.values()])finish(new Error('LSP 服务已退出'));this.child=null;};
      this.child.on('error',failed);this.child.on('close',failed);
      await this.request('initialize',{processId:process.pid,rootUri:pathToFileURL(root).href,capabilities:{textDocument:{publishDiagnostics:{versionSupport:true},hover:{contentFormat:['plaintext']}}},initializationOptions:{disableAutomaticTypingAcquisition:true,tsserver:{path:executablePath(require.resolve('typescript/lib/tsserver.js'))}},workspaceFolders:[{uri:pathToFileURL(root).href,name:path.basename(root)}]},signal);
      this.send({method:'initialized',params:{}});this.ready=true;
    })();
    try{await this.initializing;}catch(error){await this.close();throw error;}finally{this.initializing=null;}
  }
  document(relative){
    const file=this.tools.resolve(relative);if(!/\.(?:[cm]?[jt]sx?)$/i.test(file))throw new Error('内置 LSP 支持 TypeScript / JavaScript。');
    if(fs.statSync(file).size>2_000_000)throw new Error('文件过大。');
    const text=fs.readFileSync(file,'utf8'),uri=pathToFileURL(file).href;const previous=this.documents.get(uri);
    if(previous?.text===text)return {uri,version:previous.version};
    const version=(previous?.version||0)+1;this.documents.set(uri,{text,version});this.diagnostics.delete(uriKey(uri));
    if(previous)this.send({method:'textDocument/didChange',params:{textDocument:{uri,version},contentChanges:[{text}]}});
    else this.send({method:'textDocument/didOpen',params:{textDocument:{uri,languageId:/tsx?$/.test(file)?'typescript':'javascript',version,text}}});
    return {uri,version};
  }
  async inspect(args,signal){
    await this.start(signal);
    if(args.operation==='diagnostics'){
      const file=this.tools.resolve(args.path),uri=uriKey(pathToFileURL(file).href);
      let cleanup;
      const result=new Promise((resolve,reject)=>{
        const finish=value=>{cleanup();resolve(value);};const abort=()=>{cleanup();reject(new Error('已中断'));};
        const timer=setTimeout(()=>{cleanup();reject(new Error('LSP 尚未返回诊断，请重试。'));},12000);
        cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);this.waiters.delete(uri);};
        this.waiters.set(uri,finish);signal?.addEventListener('abort',abort,{once:true});
      });
      try{this.document(args.path);const cached=this.diagnostics.get(uri);if(cached)this.waiters.get(uri)?.(cached);return {path:args.path,...await result};}catch(error){cleanup();throw error;}
    }
    const methods={hover:'textDocument/hover',definition:'textDocument/definition',references:'textDocument/references'};
    const method=methods[args.operation];if(!method)throw new Error('无效 LSP 操作。');
    if(!Number.isInteger(args.line)||args.line<1||!Number.isInteger(args.column)||args.column<1)throw new Error('行列从 1 开始。');
    const {uri}=this.document(args.path);
    return {path:args.path,result:await this.request(method,{textDocument:{uri},position:{line:args.line-1,character:args.column-1},...(args.operation==='references'?{context:{includeDeclaration:true}}:{})},signal)};
  }
  async close(){
    const child=this.child;
    if(child&&!child.killed&&child.exitCode===null){
      if(this.ready){try{await this.request('shutdown',null,AbortSignal.timeout(2000));this.send({method:'exit'});}catch{}}
      await new Promise(resolve=>{
        let timer;const finish=()=>{clearTimeout(timer);resolve();};child.once('close',finish);
        if(child.exitCode!==null)return finish();
        timer=setTimeout(()=>{
          if(process.platform==='win32'){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());killer.once('close',finish);}else{child.kill();}
          setTimeout(finish,1000).unref();
        },2000);
      });
    }
    if(this.child===child)this.child=null;this.ready=false;
    for(const finish of [...this.pending.values()])finish(new Error('LSP 已关闭'));this.pending.clear();this.documents.clear();this.diagnostics.clear();this.buffer=Buffer.alloc(0);
  }
}
const definition={name:'lsp_inspect',description:'Use bundled TypeScript/JavaScript LSP for diagnostics, hover, definitions or references. Positions are 1-based.',parameters:{type:'object',properties:{path:{type:'string'},operation:{type:'string',enum:['diagnostics','hover','definition','references']},line:{type:'integer'},column:{type:'integer'}},required:['path','operation']}};
module.exports={LanguageTools,definition};
