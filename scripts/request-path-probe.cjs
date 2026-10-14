// Local authorized diagnostics. Credentials stay in memory; report excludes request/response text.
const {app,safeStorage,net}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {Vault}=require('../desktop/vault.cjs'),connection=require('../desktop/connection.cjs');
const reportPath=process.env.APOLLO_PROBE_REPORT||path.join(__dirname,'../work/request-path-report.json');
fs.mkdirSync(path.dirname(reportPath),{recursive:true});
app.setPath('userData',fs.mkdtempSync(path.join(path.dirname(reportPath),'probe-cache-')));
app.whenReady().then(async()=>{
 const report={at:new Date().toISOString(),scope:'Single HTTP attempts, no automatic retries, identical saved connection and prompt',cases:[]};
 try{
  const config=new Vault(safeStorage).read(path.join(app.getPath('appData'),'apollo-code/config.json'),{});
  const hermes=fs.readFileSync(path.join(app.getPath('home'),'AppData/Local/hermes/.env'),'utf8');
  const envValue=name=>{const line=hermes.split(/\r?\n/).find(l=>l.startsWith(name+'='));return line?.slice(name.length+1).trim().replace(/^['"]|['"]$/g,'');};
  report.connection={host:new URL(config.baseUrl).host,model:config.model,apiMode:config.apiMode||'auto',selectedProtocol:connection.protocol(config),sameHermesKey:envValue('OPENAI_API_KEY')===config.apiKey,sameHermesHost:new URL(envValue('OPENAI_BASE_URL')).host===new URL(config.baseUrl).host};
  try{const asar=require('@electron/asar');report.installedVersion=JSON.parse(asar.extractFile(path.join(app.getPath('home'),'AppData/Local/Programs/Apollo Code/resources/app.asar'),'package.json')).version;}catch{report.installedVersion='unavailable';}
  console.log('IDENTITY',JSON.stringify(report.connection),'INSTALLED',report.installedVersion);
  const combinations=[];for(let round=1;round<=2;round++)for(const mode of ['responses','chat'])for(const stream of [true,false])for(const transport of ['system','node'])combinations.push({round,mode,stream,transport});
  for(const item of combinations){
   const started=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
   const result={...item};
   try{
    const body=item.mode==='responses'?{model:config.model,input:'Reply with exactly APOLLO_OK. No tools.',max_output_tokens:2048,store:false,stream:item.stream}:{model:config.model,messages:[{role:'user',content:'Reply with exactly APOLLO_OK. No tools.'}],max_completion_tokens:2048,stream:item.stream,...(item.stream?{stream_options:{include_usage:true}}:{})};
    const response=await (item.transport==='system'?net.fetch.bind(net):fetch)(connection.normalize(config).baseUrl+(item.mode==='responses'?'/responses':'/chat/completions'),{method:'POST',headers:connection.headers(config),body:JSON.stringify(body),signal:controller.signal,redirect:'error'});
    result.headersMs=Date.now()-started;result.status=response.status;result.contentType=response.headers.get('content-type');
    const reader=response.body.getReader(),decoder=new TextDecoder();let raw='',buffer='',text='',complete=false,error='';
    const parse=value=>{
     if(value.error||value.type==='error'||value.type==='response.failed')error=value.error?.message||value.message||value.response?.error?.message||'model_error';
     const delta=value.choices?.[0]?.delta?.content||(value.type==='response.output_text.delta'?value.delta:'');
     if(delta){text+=delta;if(!result.firstTextMs)result.firstTextMs=Date.now()-started;}
     if(value.choices?.[0]?.finish_reason==='stop'||value.type==='response.completed')complete=true;
     if(value.type==='response.incomplete')error='incomplete: '+value.response?.incomplete_details?.reason;
    };
    while(true){const packet=await reader.read();if(packet.done)break;if(!result.firstByteMs)result.firstByteMs=Date.now()-started;const chunk=decoder.decode(packet.value,{stream:true});raw+=chunk;if(raw.length>2000000)throw new Error('response_too_large');if(result.contentType?.includes('text/event-stream')){buffer+=chunk.replace(/\r/g,'');let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');if(data&&data!=='[DONE]'){try{parse(JSON.parse(data));}catch{error='invalid_stream_json';}}}if(complete||error){reader.cancel().catch(()=>{});break;}}}
    if(!result.contentType?.includes('text/event-stream')){const value=JSON.parse(raw);error=value.error?.message||value.message||'';text=item.mode==='responses'?(value.output||[]).flatMap(i=>(i.content||[]).filter(c=>c.type==='output_text').map(c=>c.text)).join(''):value.choices?.[0]?.message?.content||'';complete=item.mode==='responses'?value.status==='completed':value.choices?.[0]?.finish_reason==='stop';if(text)result.firstTextMs=Date.now()-started;result.usage=value.usage;if(value.status==='incomplete')error='incomplete: '+value.incomplete_details?.reason;}
    result.ok=response.ok&&complete&&text.trim()==='APOLLO_OK';if(error)result.error=String(error).split(config.apiKey).join('[REDACTED]').slice(0,600);if(!result.ok&&!error)result.error='missing completion or expected text';
   }catch(error){result.ok=false;result.error=String(error.message).split(config.apiKey).join('[REDACTED]').slice(0,600);result.cause=error.cause?.code;}
   finally{clearTimeout(timer);result.durationMs=Date.now()-started;report.cases.push(result);fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log('CASE',JSON.stringify(result));}
  }
  console.log('REPORT',reportPath);app.exit(0);
 }catch(error){console.error('PROBE FAILED',error.name);app.exit(1);}
});
