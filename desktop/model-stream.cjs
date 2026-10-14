const connection=require('./connection.cjs');
const {RequestError,httpError,streamError,recoverTurn}=require('./request-recovery.cjs');
function anthropicMessages(messages){
  const converted=[];
  for(const m of messages){
    let role=m.role,content;
    if(role==='tool'){role='user';content=[{type:'tool_result',tool_use_id:m.tool_call_id,content:m.content}];}
    else if(m.tool_calls){content=[...(m.content?[{type:'text',text:m.content}]:[]),...m.tool_calls.map(t=>({type:'tool_use',id:t.id,name:t.function.name,input:JSON.parse(t.function.arguments||'{}')}))];}
    else if(Array.isArray(m.content))content=m.content.map(c=>c.type==='image_url'?{type:'image',source:{type:'base64',media_type:c.image_url.url.split(';')[0].slice(5),data:c.image_url.url.split(',')[1]}}:c);
    else content=[{type:'text',text:m.content||' '}];
    if(converted.at(-1)?.role===role) converted.at(-1).content.push(...content);else converted.push({role,content});
  }
  return converted;
}
async function rawTurn(config,system,messages,tools,maxOutput,signal,emit,fetcher=fetch){
  if(connection.protocol(config)==='responses')return require('./responses.cjs').responsesTurn(config,system,messages,tools,maxOutput,signal,emit,fetcher);
  const anthropic=config.provider==='anthropic',stream=connection.streaming(config);
  const base=connection.normalize(config).baseUrl;
  const body=anthropic?{model:config.model,max_tokens:maxOutput,stream,...(system?{system}:{}),messages:anthropicMessages(messages),...(tools.length?{tools:tools.map(t=>({name:t.name,description:t.description,input_schema:t.parameters}))}:{})}
    :{model:config.model,...(config.provider==='ollama'||config.legacyMaxTokens?{max_tokens:maxOutput}:{max_completion_tokens:maxOutput}),stream,...(stream&&!config.omitStreamOptions?{stream_options:{include_usage:true}}:{}),messages:[...(system?[{role:'system',content:system}]:[]),...messages],...(tools.length?{tools:tools.map(t=>({type:'function',function:t}))}:{})};
  const headers=anthropic?{'Content-Type':'application/json','x-api-key':config.apiKey,'anthropic-version':'2023-06-01'}:{'Content-Type':'application/json',...(config.apiKey?{Authorization:'Bearer '+config.apiKey}:{})};
  const response=await fetcher(base+(anthropic?'/messages':'/chat/completions'),{method:'POST',headers,body:JSON.stringify(body),signal,redirect:'error'});
  if(!response.ok)throw await httpError(response,config);
  if(!String(response.headers.get('content-type')).includes('text/event-stream')){
    const data=await response.json();
    if(data.error)throw streamError(data.error.message,config);
    if(anthropic){const content=(data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');if(content)emit({type:'delta',text:content});completion(data.stop_reason);return {content,tools:(data.content||[]).filter(c=>c.type==='tool_use').map(c=>({id:c.id,function:{name:c.name,arguments:JSON.stringify(c.input)}})),usage:data.usage||{}};}
    const message=data.choices?.[0]?.message||{};if(message.content)emit({type:'delta',text:message.content});completion(data.choices?.[0]?.finish_reason);return {content:message.content||'',tools:message.tool_calls||[],usage:data.usage||{}};
  }
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',content='',usage={},complete=false,terminal=false,reason;const calls=new Map();
  const event=frame=>{
    const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');if(!data)return;if(data==='[DONE]'){if(!anthropic){complete=true;terminal=true;}return;}
    const value=JSON.parse(data);
    if(value.error)throw streamError(value.error.message,config);
    if(anthropic){
      if(value.type==='message_start')usage={...usage,...value.message?.usage};
      if(value.type==='message_delta'){usage={...usage,...value.usage};reason=value.delta?.stop_reason||reason;}
      if(value.type==='message_stop'){complete=true;terminal=true;}
      if(value.type==='content_block_start'&&value.content_block.type==='tool_use')calls.set(value.index,{id:value.content_block.id,function:{name:value.content_block.name,arguments:''}});
      if(value.type==='content_block_delta'){
        const delta=value.delta;
        if(delta.type==='text_delta'){content+=delta.text;emit({type:'delta',text:delta.text});}
        if(delta.type==='input_json_delta'){const call=calls.get(value.index);if(call)call.function.arguments+=delta.partial_json;}
      }
    }else{
      if(value.choices?.[0]?.finish_reason){reason=value.choices[0].finish_reason;complete=true;}
      if(value.usage)usage=value.usage;
      const delta=value.choices?.[0]?.delta||{};
      if(delta.content){content+=delta.content;emit({type:'delta',text:delta.content});}
      for(const t of delta.tool_calls||[]){const previous=calls.get(t.index)||{id:'',type:'function',function:{name:'',arguments:''}};if(t.id)previous.id=t.id;if(t.function?.name)previous.function.name+=t.function.name;if(t.function?.arguments)previous.function.arguments+=t.function.arguments;calls.set(t.index,previous);}
    }
  };
  try{while(!terminal){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true}).replace(/\r/g,'');if(buffer.length>4000000)throw new RequestError('invalid_stream','单个响应事件过大。');let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){event(buffer.slice(0,boundary));buffer=buffer.slice(boundary+2);if(terminal)break;}}buffer+=decoder.decode();if(!terminal&&buffer.trim())event(buffer);}
  finally{try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}reader.releaseLock();}
  if(!complete)throw new RequestError('incomplete_stream','响应流提前结束，未收到完成标记。',{retryable:true});
  completion(reason);
  return {content,tools:[...calls.values()],usage};
}
function completion(reason){if(reason==='length'||reason==='max_tokens')throw new RequestError('output_limit','回复达到输出上限，当前内容未完成。',{retryable:true});if(reason==='content_filter'||reason==='refusal')throw new RequestError('content_filter','服务商中止了本次回复。');}
const modelTurn=(config,system,messages,tools,maxOutput,signal,emit=()=>{},fetcher=fetch)=>recoverTurn(rawTurn,config,system,messages,tools,maxOutput,signal,emit,fetcher);
module.exports={modelTurn,anthropicMessages};
