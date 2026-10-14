const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {StringDecoder}=require('node:string_decoder');
const {RequestError,failure,descriptor}=require('./request-recovery.cjs');
const {redact}=require('./economy.cjs');
async function claudeChat(runtime,payload,prompt,config,spawnProcess=spawn){
  if(runtime.running)return {ok:false,error:'已有任务正在执行。'};
  const controller=new AbortController();runtime.running=controller;runtime.activeRequestId=payload.requestId;
  const started=Date.now(),settings=runtime.settings();let partial='',final=null,error=null,buffer='',stderr='',sequence=0;
  const emit=e=>runtime.emit({...e,requestId:payload.requestId,time:Date.now(),sequence:++sequence});
  const executable=path.join(process.env.APPDATA||'','npm','node_modules','@anthropic-ai','claude-code','bin','claude.exe');
  const args=['-p',prompt,'--output-format','stream-json','--verbose','--include-partial-messages',...(config.model?['--model',config.model]:[])];
  const active=new Map(),names=new Map();
  const event=value=>{
    if(value.type==='stream_event'){
      const e=value.event;
      if(e?.type==='content_block_delta'&&e.delta?.type==='text_delta'){partial+=e.delta.text;emit({type:'delta',text:e.delta.text});}
      if(e?.type==='content_block_start'&&e.content_block?.type==='tool_use')names.set(e.content_block.id,e.content_block.name);
    }
    if(value.type==='assistant')for(const block of value.message?.content||[]){
      if(block.type==='tool_use'&&!active.has(block.id)){active.set(block.id,Date.now());names.set(block.id,block.name);if(partial){emit({type:'commentary',text:partial});partial='';}emit({type:'tool',callId:block.id,name:block.name,status:'running',arguments:redact(JSON.stringify(block.input||{}),[config.apiKey])});}
    }
    if(value.type==='user')for(const block of value.message?.content||[])if(block.type==='tool_result'){
      const id=block.tool_use_id;emit({type:'tool',callId:id,name:names.get(id)||'Claude tool',status:block.is_error?'failed':'done',durationMs:Date.now()-(active.get(id)||Date.now()),preview:redact(typeof block.content==='string'?block.content:JSON.stringify(block.content),[config.apiKey]).slice(-4000)});active.delete(id);
    }
    if(value.type==='result')final=value;
    if(value.type==='system')emit({type:'phase',name:'claude',status:'running',preview:value.subtype||''});
  };
  emit({type:'phase',name:'claude',status:'running'});
  try{
    await new Promise((resolve,reject)=>{
      const child=spawnProcess(fs.existsSync(executable)?executable:'claude',args,{cwd:config.projectRoot||undefined,windowsHide:true,shell:false,env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
      const decoder=new StringDecoder('utf8');
      const stop=()=>{if(process.platform==='win32'&&child.pid){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}else child.kill();};
      controller.signal.addEventListener('abort',stop,{once:true});
      const timer=setTimeout(()=>controller.abort(new RequestError('task_timeout','Claude Code 任务总预算已用尽。',{layer:'task'})),settings.taskTimeoutMs);
      const cleanup=()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',stop);};
      child.stdout.on('data',chunk=>{
        buffer+=decoder.write(chunk);if(buffer.length>4*1024*1024){error=new RequestError('invalid_stream','Claude Code 输出事件过大。');stop();return;}
        let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);if(line.trim())try{event(JSON.parse(line));}catch{error=new RequestError('invalid_stream','Claude Code 返回了无效流式事件。');}}
      });
      child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-12000);emit({type:'commentary',text:redact(stderr,[config.apiKey])});});
      child.once('error',caught=>{cleanup();reject(new RequestError('claude_launch','Claude Code 启动失败：'+caught.message,{layer:'process'}));});
      child.once('close',code=>{cleanup();buffer+=decoder.end();if(buffer.trim())try{event(JSON.parse(buffer));}catch{error=new RequestError('invalid_stream','Claude Code 返回了无效结束事件。');}if(controller.signal.aborted)return reject(controller.signal.reason);if(error)return reject(error);if(code!==0)return reject(new RequestError('claude_exit','Claude Code 退出码 '+code+'：'+redact(stderr,[config.apiKey]),{layer:'process'}));resolve();});
    });
    if(!final)throw new RequestError('incomplete_stream','Claude Code 未返回完成结果。');
    if(final.is_error)throw new RequestError('claude_error',redact(final.result||(final.errors||[]).join('\n')||'Claude Code 请求失败。',[config.apiKey]),{layer:'process'});
    return {ok:true,content:final.result||partial,outcome:'done'};
  }catch(caught){const detail=descriptor(failure(caught,config,controller.signal),config);detail.partial=Boolean(partial);detail.hint='Claude Code 由自身运行时管理工具。检查实际结果后继续，失败时不会自动重新运行整条命令。';emit({type:'failure',failure:detail});return {ok:false,error:detail.message,partial:redact(partial,[config.apiKey]),failure:detail,outcome:detail.code==='cancelled'?'interrupted':'failed'};}
  finally{for(const [id,time] of active)emit({type:'tool',callId:id,name:names.get(id)||'Claude tool',status:'interrupted',durationMs:Date.now()-time,preview:'CLI ended before the tool result was observed; verify actual state.'});runtime.running=null;runtime.activeRequestId=null;emit({type:'done',durationMs:Date.now()-started});}
}
module.exports={claudeChat};
