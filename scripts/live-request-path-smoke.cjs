const {app,safeStorage,net}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {Vault}=require('../desktop/vault.cjs'),{modelTurn}=require('../desktop/model-stream.cjs'),{modelFetch}=require('../desktop/model-network.cjs'),{defaults}=require('../desktop/runtime.cjs');
const root=path.join(__dirname,'../work');fs.mkdirSync(root,{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(root,'live-path-cache-')));
app.whenReady().then(async()=>{
 const report={version:require('../package.json').version,at:new Date().toISOString(),scope:'Six real model calls, maxAttempts=1, including two independent read-tool continuations. Not a general success-rate guarantee.',calls:[]};
 const out=path.join(root,'live-request-path-0.7.4.json');
 try{
  const saved=new Vault(safeStorage).read(path.join(app.getPath('appData'),'apollo-code/config.json'),{});
  const config={...saved,requestSettings:{...defaults,maxAttempts:1}},fetcher=modelFetch(net.fetch.bind(net));
  report.connection={host:new URL(config.baseUrl).host,model:config.model,apiMode:config.apiMode||'auto',responseMode:config.requestSettings.responseMode};
  const tools=[{name:'read_file',description:'Read the content of a local fixture file.',parameters:{type:'object',properties:{path:{type:'string',enum:['fact.txt']}},required:['path'],additionalProperties:false}}];
  const fixture=fs.mkdtempSync(path.join(root,'live-path-fixture-'));fs.writeFileSync(path.join(fixture,'fact.txt'),'VERIFIED_'+require('node:crypto').randomBytes(6).toString('hex'));
  const invoke=async(label,messages,available,verify)=>{
   const started=Date.now(),events=[],entry={label};
   try{const result=await modelTurn(config,'Follow the user request precisely. File contents must be read using the supplied tool. Do not guess.',messages,available,2048,AbortSignal.timeout(180000),e=>{if(['request_start','connected','first_event','attempt_end'].includes(e.type))events.push(e);},fetcher);entry.ok=Boolean(verify(result));entry.attempts=result.attempts;entry.usage=result.usage;return result;}
   catch(error){entry.ok=false;entry.errorCode=error.code;entry.error=error.message.split(saved.apiKey).join('[REDACTED]').slice(0,600);return null;}
   finally{entry.durationMs=Date.now()-started;entry.events=events;report.calls.push(entry);fs.writeFileSync(out,JSON.stringify(report,null,2));console.log('CALL',label,entry.ok,entry.durationMs);}
  };
  await invoke('exact text',[{role:'user',content:'Reply with exactly APOLLO_OK. No tools.'}],[],r=>r.content.trim()==='APOLLO_OK');
  await invoke('arithmetic',[{role:'user',content:'Calculate 17 + 25. Reply with just the number.'}],[],r=>r.content.trim()==='42');
  for(let cycle=1;cycle<=2;cycle++){
   const messages=[{role:'user',content:'Use read_file to read fact.txt, then reply with its exact contents and nothing else.'}];
   const first=await invoke('tool request '+cycle,messages,tools,r=>r.tools.length===1&&r.tools[0].function.name==='read_file'&&JSON.parse(r.tools[0].function.arguments).path==='fact.txt');
   if(!first?.tools.length)continue;
   const call=first.tools[0],fact=fs.readFileSync(path.join(fixture,'fact.txt'),'utf8');
   messages.push({role:'assistant',content:first.content||null,tool_calls:first.tools},{role:'tool',tool_call_id:call.id,content:fact});
   await invoke('tool result '+cycle,messages,tools,r=>r.content.trim()===fact&&!r.tools.length);
  }
  const times=report.calls.filter(c=>c.ok).map(c=>c.durationMs).sort((a,b)=>a-b);report.summary={calls:report.calls.length,successful:report.calls.filter(c=>c.ok).length,failed:report.calls.filter(c=>!c.ok).length,medianMs:times.length?(times[Math.floor((times.length-1)/2)]+times[Math.ceil((times.length-1)/2)])/2:null,maxMs:times.at(-1)||null};fs.writeFileSync(out,JSON.stringify(report,null,2));console.log('SUMMARY',JSON.stringify(report.summary));app.exit(report.summary.calls===6&&report.summary.failed===0?0:1);
 }catch(error){console.error('LIVE PATH FAILED',error.name);app.exit(1);}
});
