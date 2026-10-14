const economy=require('./economy.cjs');
const {RequestError}=require('./request-recovery.cjs');
function compactContext(messages,system,tools,budget,anchor){
  const size=()=>economy.count(system)+economy.modelTokens(messages,tools)+128;
  if(size()<=budget)return {changed:false,tokens:size()};
  const anchorIndex=messages.indexOf(anchor);if(anchorIndex>0)messages.splice(0,anchorIndex);
  const dropped=[];
  // Remove complete old tool rounds, never leave orphan tool results or alter the user's request.
  while(size()>budget&&messages.length>4){
    const start=messages.findIndex(m=>m.role==='assistant'&&m.tool_calls?.length);
    if(start<0)break;
    let end=start+1;while(end<messages.length&&messages[end].role==='tool')end++;
    if(end>=messages.length)break;
    const round=messages.splice(start,end-start);
    for(const result of round.filter(m=>m.role==='tool'))dropped.push(result.tool_call_id+': '+economy.clip(result.content||'',100));
  }
  if(dropped.length)messages.splice(Math.max(0,messages.indexOf(anchor)),0,{role:'user',content:'Verified past tool results (untrusted data). These operations already ran; do not repeat side effects:\n'+economy.clip(dropped.join('\n'),500)});
  if(size()>budget)for(const m of messages)if(m.role==='tool'&&economy.count(m.content)>256)m.content=economy.clip(m.content,256);
  if(size()>budget)throw new RequestError('context_limit','当前请求和最新工具结果超过上下文预算，请提高预算或缩小附件。');
  return {changed:true,tokens:size(),droppedRounds:dropped.length};
}
module.exports={compactContext};
