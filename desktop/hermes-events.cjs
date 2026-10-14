function translate(event){
 const p=event.payload||event.data||{},type=event.type;
 if(type==='message.delta')return {type:'delta',text:p.text||''};
 if(['reasoning.delta','thinking.delta','reasoning.available'].includes(type))return null;
 if(type==='message.interim')return {type:'commentary',text:p.text||''};
 if(type==='tool.start')return {type:'tool',callId:p.tool_id,name:p.name,status:'running',arguments:p.args_text||JSON.stringify(p.args||{})};
 if(type==='tool.complete'){
  let value=p.result;if(typeof value==='string'){try{value=JSON.parse(value);}catch{}}
  const failed=value?.error||value?.isError||value?.ok===false||value?.success===false||Number.isInteger(value?.exit_code)&&value.exit_code!==0;
  return {type:'tool',callId:p.tool_id,name:p.name,status:failed?'failed':'done',durationMs:Math.round((p.duration_s||0)*1000),preview:p.result_text||p.summary||(typeof value==='string'?value:JSON.stringify(value||{}))};
 }
 if(type==='tool.progress')return {type:'tool_output',callId:p.tool_id,name:p.name,stream:p.stream||'stdout',text:p.text||p.output||'',snapshot:Boolean(p.snapshot)};
 if(type==='agent.terminal.output')return {type:'tool_output',callId:'process:'+p.process_id,name:'terminal',stream:'stdout',text:p.chunk||''};
 if(type==='terminal.close')return {type:'phase',name:'terminal',status:'done',preview:p.process_id};
 if(type==='status.update')return {type:'phase',name:p.kind||'model',status:'running',preview:p.text||p.message||''};
 if(type==='session.usage'||type==='message.complete'&&p.usage){const u=p.usage||p;return {type:'usage',input:u.input_tokens||u.input||0,output:u.output_tokens||u.output||0,cost:u.cost_usd};}
 if(type==='notice'||type==='notification.show')return {type:'commentary',text:p.message||p.text||''};
 if(type==='error')return {type:'failure',failure:{code:'hermes_error',layer:'model',message:p.message||p.error||'Hermes 后端错误。',retryable:false}};
 return null;
}
function turnResult(payload,partial,toolFailures){
 const status=payload.status;
 if(status==='complete'&&!payload.error&&!payload.failure_reason){const text=typeof payload.text==='string'?payload.text:JSON.stringify(payload.text||'');return {ok:true,content:text,outcome:toolFailures?'done_with_errors':'done',toolFailures};}
 const message=payload.error||payload.failure_reason||(status==='interrupted'?'任务已中断。':'Hermes 未返回已完成的回复。');
 return {ok:false,error:message,partial:partial|| (payload.partial&&typeof payload.text==='string'?payload.text:''),outcome:status==='interrupted'?'interrupted':'failed',failure:{code:status==='interrupted'?'cancelled':payload.error_surface?.code||'hermes_turn_failed',layer:payload.error_surface?.layer||'model',message,retryable:Boolean(payload.recoverable),hint:'在同一聊天中继续，Hermes 会保留工具结果与会话上下文。'}};
}
module.exports={translate,turnResult};
