const {redact}=require('./economy.cjs');
const connection=require('./connection.cjs');
class RequestError extends Error {
  constructor(code,message,detail={}){super(message);this.name='RequestError';Object.assign(this,{code,layer:'model',retryable:false},detail);}
}
function retryAfter(value){if(!value)return 0;const seconds=Number(value);return Number.isFinite(seconds)?Math.max(0,seconds*1000):Math.max(0,Date.parse(value)-Date.now())||0;}
async function httpError(response,config){
  let data;try{data=await response.json();}catch{}
  const detail=data?.error?.message||data?.message||response.statusText;
  const status=response.status,quota=/insufficient_quota|quota.*exhaust|billing|余额|额度不足/i.test(JSON.stringify(data||{}));
  const code=/upstream.*(?:auth|access forbidden)/i.test(detail||'')?'upstream_authentication':status===401||status===403?'authentication':status===402||quota?'quota':status===429?'rate_limit':status===413?'payload_too_large':status===400&&/context|maximum.*token|too many tokens/i.test(detail||'')?'context_limit':status===404?'model_or_endpoint':status===400||status===422?'invalid_parameter':'http_error';
  return new RequestError(code,connection.diagnostic(status,detail,config.apiKey),{status,retryable:code!=='upstream_authentication'&&!quota&&(status===408||status===429||status>=500),retryAfterMs:retryAfter(response.headers.get('retry-after')),upstreamRequestId:response.headers.get('x-request-id')||response.headers.get('request-id')||undefined,detail:redact(detail,[config.apiKey])});
}
function streamError(message,config={}){
  const text=String(message||'流式接口错误');
  const deterministic=/forbidden|unauthori[sz]ed|authentication|invalid.*key|quota|billing|余额|认证/i.test(text);
  const temporary=!deterministic&&/upstream|stream failed|HTTP\/2|overload|rate.?limit|temporar|terminated|network/i.test(text);
  return new RequestError(/upstream.*(?:auth|access forbidden)/i.test(text)?'upstream_authentication':/quota|billing|余额/i.test(text)?'quota':/forbidden|unauthori[sz]ed|authentication|认证/i.test(text)?'authentication':temporary?'transport':'model_error',connection.streamDiagnostic(text,config.apiKey),{retryable:temporary});
}
function failure(error,config={},signal){
  const source=signal?.aborted?signal.reason:error;
  if(source instanceof RequestError)return source;
  if(signal?.aborted)return new RequestError('cancelled','任务已中断。',{layer:'task'});
  const message=redact(error?.message||String(error),[config.apiKey]);
  const cause=redact([error?.cause?.code,error?.cause?.message].filter(Boolean).join(' · '),[config.apiKey]);
  const network=error instanceof TypeError||/fetch failed|network|terminated|socket|ECONN|ENOTFOUND|EAI_AGAIN|HTTP\/2|stream failed/i.test(message+' '+cause);
  return new RequestError(network?'transport':'model_error',message,{layer:network?'transport':'model',retryable:network,cause});
}
function descriptor(error,config={}){
  return Object.fromEntries(Object.entries({code:error.code||'model_error',layer:error.layer||'model',message:redact(error.message,[config.apiKey]),status:error.status,cause:redact(error.cause||'',[config.apiKey]),retryable:Boolean(error.retryable),retryAfterMs:error.retryAfterMs,attempts:error.attempts||1,provider:config.provider,model:config.model,upstreamRequestId:error.upstreamRequestId,partial:Boolean(error.partial),hint:error.code==='upstream_authentication'?'服务商上游认证被拒绝，请检查渠道状态或选择已保存的备用连接。':error.code==='authentication'?'检查连接凭据与服务商授权。':error.code==='quota'?'检查服务商余额或额度，或选择已保存的连接。':error.code==='output_limit'?'提高输出上限后恢复模型调用。':error.code==='context_limit'?'提高上下文预算或缩小附件。':error.code==='task_timeout'?'提高任务总预算后继续。':error.code==='cancelled'?'可以从已完成的操作之后继续。':'可恢复当前模型调用；已执行的操作不会重放。'}).filter(([,v])=>v!==undefined));
}
function wait(ms,signal){return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(signal.reason||new RequestError('cancelled','任务已中断。'));
  const cancel=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(signal.reason||new RequestError('cancelled','任务已中断。'));};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);signal?.addEventListener('abort',cancel,{once:true});
});}
function abortable(operation,signal){return new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(signal.reason);
  const stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});
  Promise.resolve().then(operation).then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop));
});}
function validateResult(result){
  for(const call of result.tools||[]){
    try{const value=JSON.parse(call.function?.arguments||'{}');if(!call.id||!call.function?.name||!value||typeof value!=='object'||Array.isArray(value))throw new Error();}
    catch{throw new RequestError('invalid_tool_arguments','模型返回了不完整或无效的工具参数，未执行该轮工具。',{retryable:true});}
  }
  if(!result.tools?.length&&!result.content?.trim())throw new RequestError('empty_output','模型没有返回可用文本；请检查接口协议或提高输出预算。',{retryable:true});
  return result;
}
// Each attempt owns its controller and reader timers. User cancellation interrupts both I/O and backoff.
async function recoverTurn(raw,config,system,messages,tools,maxOutput,signal,emit,fetcher){
  const options=config.requestSettings||{},attemptLimit=Math.max(1,Math.min(3,options.maxAttempts||3));
  let adjusted={...config},outputLimit=maxOutput,corrected=false,streamCorrected=false,last;
  for(let attempt=1;attempt<=attemptLimit;attempt++){
    if(signal?.aborted)throw failure(signal.reason,adjusted,signal);
    const controller=new AbortController(),stop=()=>controller.abort(signal.reason),started=Date.now();
    signal?.addEventListener('abort',stop,{once:true});
    let timer,partial='',firstEvent=false,connected=false,transport;
    const arm=(ms,code,message)=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(new RequestError(code,message,{layer:'transport',retryable:true})),ms);};
    const event=e=>{if(e.type==='delta')partial+=e.text||'';emit(e);};
    const guardedFetch=async(url,init)=>{
      // Fetch resolves at response headers, after server/model computation. This
      // deadline is not a TCP handshake timer.
      arm(options.connectTimeoutMs||90000,'connect_timeout','等待服务商响应头超时（包含模型计算时间）。');
      const response=await abortable(()=>fetcher(url,{...init,signal:controller.signal,apolloTransport:options.networkTransport||'auto',apolloAttempt:attempt}),controller.signal);connected=true;
      transport=response.apolloTransport;
      emit({type:'connected',attempt,provider:adjusted.provider,model:adjusted.model,transport,durationMs:Date.now()-started});
      arm(options.firstEventTimeoutMs||90000,'first_event_timeout','服务商连接成功，但等待首个响应超时。');
      if(!response.body)return response;
      const getReader=()=>{
        const reader=response.body.getReader();
        return {read:async()=>{
          const packet=await abortable(()=>reader.read(),controller.signal);
          if(packet.value?.length){if(!firstEvent){firstEvent=true;emit({type:'first_event',attempt,durationMs:Date.now()-started});}arm(options.idleTimeoutMs||60000,'stream_timeout','响应流长时间没有进展。');}
          return packet;
        },releaseLock:()=>reader.releaseLock(),cancel:reason=>reader.cancel(reason)};
      };
      // JSON/error reads are also subject to the first-event deadline.
      return {ok:response.ok,status:response.status,statusText:response.statusText,headers:response.headers,body:{getReader},json:()=>abortable(()=>response.json(),controller.signal),text:()=>abortable(()=>response.text(),controller.signal)};
    };
    emit({type:'request_start',attempt,provider:adjusted.provider,model:adjusted.model});
    let result,error;
    try{result=validateResult(await raw(adjusted,system,messages,tools,outputLimit,controller.signal,event,guardedFetch));}
    catch(caught){error=failure(caught,adjusted,controller.signal);error.partial=partial||error.partial||'';error.attempts=attempt;last=error;}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);if(!controller.signal.aborted)controller.abort();}
    emit({type:'attempt_end',attempt,status:error?'failed':'done',code:error?.code,durationMs:Date.now()-started,provider:adjusted.provider,model:adjusted.model,connected});
    if(result){if(streamCorrected&&adjusted.requestSettings?.responseMode==='stream'&&adjusted.baseUrl===config.baseUrl&&adjusted.model===config.model)connection.rememberStreaming(config,true);if((options.networkTransport||'auto')==='auto')fetcher.recordSuccess?.(connection.normalize(adjusted).baseUrl,transport);return {...result,identity:{provider:adjusted.provider,model:adjusted.model},attempts:attempt};}
    if(signal?.aborted)throw failure(signal.reason,adjusted,signal);
    // Never silently replace visible partial text or execute tools from an incomplete turn.
    if(error.partial){error.identity=adjusted;throw error;}
    let correction=false;
    if(!corrected&&['context_limit','payload_too_large'].includes(error.code)){
      const {compactContext}=require('./context-window.cjs'),economy=require('./economy.cjs');
      const candidate=structuredClone(messages),anchor=[...candidate].reverse().find(m=>m.role==='user'&&typeof m.content==='string');
      const current=economy.count(system)+economy.modelTokens(candidate,tools)+128;
      try{const compacted=compactContext(candidate,system,tools,Math.floor(current*.72),anchor);if(compacted.changed){messages=candidate;correction=true;emit({type:'context',estimatedTokens:compacted.tokens,preview:'服务商拒绝上下文长度，已整理完整历史回合后恢复当前请求。'});}}catch{}
    }
    if(!corrected&&error.code==='invalid_parameter'){
      if((options.responseMode||'auto')==='auto'&&!connection.streaming(adjusted)&&/stream(?:ing)?\s*(?:(?:must|should)\s*(?:be|=)?\s*true|(?:is\s*)?required|only)|only\s*(?:supports?\s*)?stream(?:ing)?/i.test(error.detail||'')){adjusted.requestSettings={...options,responseMode:'stream'};streamCorrected=true;correction=true;}
      else if(/stream_options/i.test(error.detail||'')){adjusted.omitStreamOptions=true;correction=true;}
      else if(/reasoning.*(?:unsupported|not supported)|unsupported.*reasoning/i.test(error.detail||'')){adjusted.reasoningEffort='auto';correction=true;}
      else if(/max_completion_tokens.*(?:unsupported|not supported)|unsupported.*max_completion_tokens/i.test(error.detail||'')){adjusted.legacyMaxTokens=true;correction=true;}
    }
    if(!corrected&&(error.code==='output_limit'||error.code==='empty_output')&&outputLimit<8192){outputLimit=Math.min(8192,Math.max(outputLimit+512,outputLimit*2),options.outputCap||8192);correction=true;}
    if(correction)corrected=true;
    if(attempt===attemptLimit||(!error.retryable&&!correction)){error.identity=adjusted;throw error;}
    if(!correction&&attempt===attemptLimit-1&&error.retryable&&['transport','http_error','connect_timeout','first_event_timeout','stream_timeout'].includes(error.code)){
      const candidate=(config.fallbacks||[]).find(p=>p.provider!=='claude'&&p.model&&p.baseUrl&&(p.apiKey||p.provider==='ollama')&&(p.baseUrl!==adjusted.baseUrl||p.model!==adjusted.model));
      if(candidate){adjusted={...candidate,requestSettings:options};emit({type:'fallback',provider:adjusted.provider,model:adjusted.model});}
    }
    const delay=correction?0:Math.max(error.retryAfterMs||0,Math.min(8000,500*2**(attempt-1)+Math.floor(Math.random()*250)));
    if(delay>(options.maxRetryWaitMs||60000)){error.identity=adjusted;throw error;}
    emit({type:'retrying',attempt:attempt+1,delayMs:delay,code:error.code,preview:error.message,provider:adjusted.provider,model:adjusted.model});
    try{await wait(delay,signal);}catch(caught){throw failure(caught,adjusted,signal);}
  }
  throw last;
}
module.exports={RequestError,httpError,streamError,failure,descriptor,wait,retryAfter,validateResult,recoverTurn};
