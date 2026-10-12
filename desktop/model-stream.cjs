const connection=require('./connection.cjs');
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
async function modelTurn(config,system,messages,tools,maxOutput,signal,emit,fetcher=fetch){
  if(connection.protocol(config)==='responses')return require('./responses.cjs').responsesTurn(config,system,messages,tools,maxOutput,signal,emit,fetcher);
  const anthropic=config.provider==='anthropic';
  const base=connection.normalize(config).baseUrl;
  const body=anthropic?{model:config.model,max_tokens:maxOutput,stream:true,system,messages:anthropicMessages(messages),...(tools.length?{tools:tools.map(t=>({name:t.name,description:t.description,input_schema:t.parameters}))}:{})}
    :{model:config.model,...(config.provider==='ollama'?{max_tokens:maxOutput}:{max_completion_tokens:maxOutput}),stream:true,stream_options:{include_usage:true},messages:[{role:'system',content:system},...messages],...(tools.length?{tools:tools.map(t=>({type:'function',function:t}))}:{})};
  const headers=anthropic?{'Content-Type':'application/json','x-api-key':config.apiKey,'anthropic-version':'2023-06-01'}:{'Content-Type':'application/json',...(config.apiKey?{Authorization:'Bearer '+config.apiKey}:{})};
  const response=await fetcher(base+(anthropic?'/messages':'/chat/completions'),{method:'POST',headers,body:JSON.stringify(body),signal,redirect:'error'});
  if(!response.ok){let data;try{data=await response.json();}catch{}throw new Error(connection.diagnostic(response.status,data?.error?.message,config.apiKey));}
  if(!String(response.headers.get('content-type')).includes('text/event-stream')){
    const data=await response.json();
    if(anthropic){const content=(data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n');if(content)emit({type:'delta',text:content});return {content,tools:(data.content||[]).filter(c=>c.type==='tool_use').map(c=>({id:c.id,function:{name:c.name,arguments:JSON.stringify(c.input)}})),usage:data.usage||{}};}
    const message=data.choices?.[0]?.message||{};if(message.content)emit({type:'delta',text:message.content});return {content:message.content||'',tools:message.tool_calls||[],usage:data.usage||{}};
  }
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',content='',usage={};const calls=new Map();
  const event=frame=>{
    const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');if(!data||data==='[DONE]')return;
    const value=JSON.parse(data);
    if(value.error)throw new Error(value.error.message||'流式接口错误');
    if(anthropic){
      if(value.type==='message_start')usage={...usage,...value.message?.usage};
      if(value.type==='message_delta')usage={...usage,...value.usage};
      if(value.type==='content_block_start'&&value.content_block.type==='tool_use')calls.set(value.index,{id:value.content_block.id,function:{name:value.content_block.name,arguments:''}});
      if(value.type==='content_block_delta'){
        const delta=value.delta;
        if(delta.type==='text_delta'){content+=delta.text;emit({type:'delta',text:delta.text});}
        if(delta.type==='input_json_delta'){const call=calls.get(value.index);if(call)call.function.arguments+=delta.partial_json;}
      }
    }else{
      if(value.usage)usage=value.usage;
      const delta=value.choices?.[0]?.delta||{};
      if(delta.content){content+=delta.content;emit({type:'delta',text:delta.content});}
      for(const t of delta.tool_calls||[]){const previous=calls.get(t.index)||{id:'',type:'function',function:{name:'',arguments:''}};if(t.id)previous.id=t.id;if(t.function?.name)previous.function.name+=t.function.name;if(t.function?.arguments)previous.function.arguments+=t.function.arguments;calls.set(t.index,previous);}
    }
  };
  try{while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true}).replace(/\r/g,'');let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){event(buffer.slice(0,boundary));buffer=buffer.slice(boundary+2);}}buffer+=decoder.decode();if(buffer.trim())event(buffer);}
  finally{reader.releaseLock();}
  return {content,tools:[...calls.values()],usage};
}
module.exports={modelTurn,anthropicMessages};
