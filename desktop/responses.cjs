const connection=require('./connection.cjs');
function inputItems(messages){
  const input=[];
  for(const m of messages){
    if(m.role==='tool'){input.push({type:'function_call_output',call_id:m.tool_call_id,output:m.content});continue;}
    if(m.content){
      const content=Array.isArray(m.content)?m.content.map(c=>c.type==='image_url'?{type:'input_image',image_url:c.image_url.url,detail:'auto'}:{type:'input_text',text:c.text}):[{type:m.role==='assistant'?'output_text':'input_text',text:m.content}];
      input.push({role:m.role,content});
    }
    for(const call of m.tool_calls||[])input.push({type:'function_call',call_id:call.id,name:call.function.name,arguments:call.function.arguments});
  }
  return input;
}
function output(value){
  if(value?.error||value?.status==='failed')throw new Error(value.error?.message||'Responses 请求失败。');
  return {content:(value.output||[]).filter(item=>item.type==='message').flatMap(item=>(item.content||[]).filter(c=>c.type==='output_text').map(c=>c.text)).join('\n'),tools:(value.output||[]).filter(item=>item.type==='function_call').map(item=>({id:item.call_id,type:'function',function:{name:item.name,arguments:item.arguments||'{}'}})),usage:value.usage||{}};
}
async function responsesTurn(config,system,messages,tools,maxOutput,signal,emit,fetcher){
  const body={model:config.model,...(system?{instructions:system}:{}),input:inputItems(messages),max_output_tokens:maxOutput,stream:true,store:false,...(config.reasoningEffort&&config.reasoningEffort!=='auto'?{reasoning:{effort:config.reasoningEffort}}:{}),...(tools.length?{tools:tools.map(t=>({type:'function',name:t.name,description:t.description,parameters:t.parameters,strict:false}))}:{})};
  const response=await fetcher(connection.normalize(config).baseUrl+'/responses',{method:'POST',headers:connection.headers(config),body:JSON.stringify(body),signal,redirect:'error'});
  if(!response.ok){let data;try{data=await response.json();}catch{}throw new Error(connection.diagnostic(response.status,data?.error?.message,config.apiKey));}
  if(!String(response.headers.get('content-type')).includes('text/event-stream')){const result=output(await response.json());if(result.content)emit({type:'delta',text:result.content});return result;}
  const calls=new Map();let content='',usage={},finished=null,buffer='';const decoder=new TextDecoder(),reader=response.body.getReader();
  const event=frame=>{
    const raw=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');if(!raw||raw==='[DONE]')return;
    const value=JSON.parse(raw);if(value.type==='error'||value.type==='response.failed')throw new Error(value.message||value.error?.message||value.response?.error?.message||'Responses 流式请求失败。');
    if(value.type==='response.output_text.delta'){content+=value.delta;emit({type:'delta',text:value.delta});}
    if(value.type==='response.reasoning_summary_text.delta'&&value.delta)emit({type:'reasoning_summary',text:value.delta});
    if(value.type==='response.output_item.added'&&value.item.type==='function_call')calls.set(value.output_index,{id:value.item.call_id,type:'function',function:{name:value.item.name,arguments:value.item.arguments||''}});
    if(value.type==='response.function_call_arguments.delta'){const call=calls.get(value.output_index);if(call)call.function.arguments+=value.delta;}
    if(value.type==='response.output_item.done'&&value.item.type==='function_call')calls.set(value.output_index,{id:value.item.call_id,type:'function',function:{name:value.item.name,arguments:value.item.arguments||'{}'}});
    if(value.type==='response.completed'||value.type==='response.incomplete'){finished=output(value.response);usage=value.response.usage||{};}
  };
  try{
    while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true}).replace(/\r/g,'');let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){event(buffer.slice(0,boundary));buffer=buffer.slice(boundary+2);}}
    buffer+=decoder.decode();if(buffer.trim())event(buffer);
  }finally{reader.releaseLock();}
  return {content:finished?.content||content,tools:finished?.tools||[...calls.values()],usage};
}
module.exports={responsesTurn,inputItems,output};
