const {test}=require('node:test'),assert=require('node:assert/strict');
const {modelTurn}=require('../desktop/model-stream.cjs'),connection=require('../desktop/connection.cjs');
const {modelFetch}=require('../desktop/model-network.cjs');
const config={provider:'openai',baseUrl:'https://gateway.invalid/v1',model:'gpt-5.5',apiKey:'fixture',requestSettings:{maxAttempts:1}};
const tool={name:'read_file',description:'read',parameters:{type:'object',properties:{path:{type:'string'}}}};
const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
test('automatic response mode respects explicit choice and exact official hosts',()=>{
 assert.equal(connection.streaming(config),false);
 assert.equal(connection.streaming({...config,baseUrl:'https://api.openai.com/v1'}),true);
 assert.equal(connection.streaming({...config,baseUrl:'https://api.openai.com.attacker.invalid'}),false);
 assert.equal(connection.streaming({...config,requestSettings:{responseMode:'stream'}}),true);
 assert.equal(connection.streaming({...config,baseUrl:'https://api.openai.com/v1',requestSettings:{responseMode:'json'}}),false);
});
test('JSON mode preserves Chat and Responses tool rounds and usage',async()=>{
 for(const apiMode of ['chat','responses']){
  let round=0;
  const fetcher=async(url,init)=>{
   const body=JSON.parse(init.body);assert.equal(body.stream,false);assert.equal('stream_options' in body,false);round++;
   if(round===1)return apiMode==='chat'?json({choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[{id:'call-1',type:'function',function:{name:'read_file',arguments:'{"path":"fact.txt"}'}}]}}],usage:{prompt_tokens:20,completion_tokens:10}}):json({status:'completed',output:[{type:'function_call',call_id:'call-1',name:'read_file',arguments:'{"path":"fact.txt"}'}],usage:{input_tokens:20,output_tokens:10}});
   assert.ok(JSON.stringify(body).includes('verified-fact'));return apiMode==='chat'?json({choices:[{finish_reason:'stop',message:{content:'verified-fact'}}],usage:{prompt_tokens:30,completion_tokens:5}}):json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'verified-fact'}]}],usage:{input_tokens:30,output_tokens:5}});
  };
  const messages=[{role:'user',content:'read fact.txt'}];
  const first=await modelTurn({...config,apiMode},'',messages,[tool],2048,null,()=>{},fetcher);
  assert.equal(first.tools[0].id,'call-1');messages.push({role:'assistant',content:first.content,tool_calls:first.tools},{role:'tool',tool_call_id:'call-1',content:'verified-fact'});
  const final=await modelTurn({...config,apiMode},'',messages,[tool],2048,null,()=>{},fetcher);
  assert.equal(final.content,'verified-fact');assert.equal(final.usage.input_tokens||final.usage.prompt_tokens,30);
 }
});
test('JSON incomplete text and invalid tool arguments remain failures',async()=>{
 await assert.rejects(modelTurn(config,'',[{role:'user',content:'read'}],[tool],2048,null,()=>{},async()=>json({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[{type:'message',content:[{type:'output_text',text:'partial'}]}]})),e=>e.code==='output_limit'&&e.partial==='partial');
 await assert.rejects(modelTurn(config,'',[{role:'user',content:'read'}],[tool],2048,null,()=>{},async()=>json({status:'completed',output:[{type:'function_call',call_id:'call-1',name:'read_file',arguments:'{"path":'}]})),e=>e.code==='invalid_tool_arguments');
});
test('network preference changes only after validated success, and stays endpoint scoped',async()=>{
 const used=[],fetcher=modelFetch(async()=>{used.push('system');return json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'OK'}]}]});},async()=>{used.push('node');return json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'OK'}]}]});});
 await fetcher(config.baseUrl,{apolloAttempt:2});await fetcher(config.baseUrl);assert.deepEqual(used,['node','system']);
 fetcher.recordSuccess(config.baseUrl,'node');await modelTurn(config,'',[{role:'user',content:'hi'}],[],2048,null,()=>{},fetcher);await fetcher(config.baseUrl);await fetcher('https://other.invalid/v1');await fetcher(config.baseUrl,{apolloTransport:'system'});
 assert.deepEqual(used.slice(2),['node','node','system','system']);
});
test('stream-only endpoints reject JSON once then recover without looping',async()=>{
 let calls=0;
 const result=await modelTurn({...config,requestSettings:{maxAttempts:3}},'',[{role:'user',content:'hi'}],[],2048,null,()=>{},async(url,init)=>{
  const body=JSON.parse(init.body);if(++calls===1){assert.equal(body.stream,false);return new Response('{"error":{"message":"stream must be true"}}',{status:400});}
  assert.equal(body.stream,true);return new Response('data: {"type":"response.completed","response":{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"OK"}]}]}}\n\n',{headers:{'content-type':'text/event-stream'}});
 });assert.equal(result.content,'OK');assert.equal(calls,2);
});
