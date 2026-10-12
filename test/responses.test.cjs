const {test}=require('node:test');const assert=require('node:assert/strict');
const {modelTurn}=require('../desktop/model-stream.cjs');const {inputItems}=require('../desktop/responses.cjs');const connection=require('../desktop/connection.cjs');
const config={provider:'openai',baseUrl:'https://example.invalid/v1',apiKey:'fixture',model:'gpt-5.5'};
test('Responses converts tool call IDs, outputs and screenshots without losing their relationships',()=>{
  const result=inputItems([{role:'user',content:'inspect'},{role:'assistant',content:'',tool_calls:[{id:'call-1',function:{name:'read_file',arguments:'{"path":"a.ts"}'}}]},{role:'tool',tool_call_id:'call-1',content:'verified'},{role:'user',content:[{type:'text',text:'screenshot'},{type:'image_url',image_url:{url:'data:image/png;base64,aW1hZ2U='}}]}]);
  assert.equal(result[1].call_id,'call-1');assert.equal(result[2].call_id,'call-1');assert.equal(result[2].type,'function_call_output');assert.equal(result[3].content[1].type,'input_image');
});
test('Responses streaming tolerates split UTF-8 frames and uses completed function arguments and usage',async()=>{
  const events=[{type:'response.output_item.added',output_index:0,item:{type:'function_call',id:'item-1',call_id:'call-1',name:'read_file',arguments:''}},{type:'response.function_call_arguments.delta',output_index:0,delta:'{"path":'},{type:'response.function_call_arguments.delta',output_index:0,delta:'"中文.ts"}'},{type:'response.output_item.done',output_index:0,item:{type:'function_call',call_id:'call-1',name:'read_file',arguments:'{"path":"中文.ts"}'}},{type:'response.completed',response:{output:[{type:'function_call',call_id:'call-1',name:'read_file',arguments:'{"path":"中文.ts"}'}],usage:{input_tokens:30,output_tokens:10}}}];
  const bytes=Buffer.from(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));let requested;
  const result=await modelTurn(config,'system',[{role:'user',content:'read'}],[{name:'read_file',description:'read',parameters:{type:'object',properties:{path:{type:'string'}}}}],128,null,()=>{},async(url,options)=>{requested={url,body:JSON.parse(options.body)};return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.subarray(i,i+7));controller.close();}}),{headers:{'Content-Type':'text/event-stream'}});});
  assert.equal(requested.url,config.baseUrl+'/responses');assert.equal(requested.body.store,false);assert.equal(requested.body.tools[0].type,'function');assert.equal(result.tools[0].id,'call-1');assert.equal(JSON.parse(result.tools[0].function.arguments).path,'中文.ts');assert.equal(result.usage.input_tokens,30);
});
test('explicit Chat Completions remains available for gateways and rejects upstream SSE errors',async()=>{
  assert.equal(connection.protocol({...config,apiMode:'chat'}),'chat');assert.equal(connection.protocol({...config,provider:'ollama'}),'chat');
  await assert.rejects(modelTurn({...config,apiMode:'chat'},'system',[{role:'user',content:'hi'}],[],64,null,()=>{},async(url,options)=>{assert.match(url,/chat\/completions$/);assert.equal(JSON.parse(options.body).max_completion_tokens,64);return new Response('data: {"error":{"message":"Upstream access forbidden"}}\n\n',{headers:{'Content-Type':'text/event-stream'}});}),/Upstream access forbidden/);
});
test('Responses nonstream replies and failed terminal events produce distinct success and failure',async()=>{
  const result=await modelTurn(config,'system',[{role:'user',content:'hi'}],[],64,null,()=>{},async()=>new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:'OK'}]}],usage:{input_tokens:1,output_tokens:1}}),{headers:{'Content-Type':'application/json'}}));assert.equal(result.content,'OK');
  await assert.rejects(modelTurn(config,'system',[{role:'user',content:'hi'}],[],64,null,()=>{},async()=>new Response('data: {"type":"response.failed","response":{"error":{"message":"quota exceeded"}}}\n\n',{headers:{'Content-Type':'text/event-stream'}})),/quota exceeded/);
});
