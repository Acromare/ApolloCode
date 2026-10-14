const {EventEmitter}=require('node:events');
class HermesRpc extends EventEmitter{
 constructor({socketFactory=url=>new WebSocket(url),onRequest=async()=>{throw new Error('Unsupported client request');},timeoutMs=120000}={}){super();this.socketFactory=socketFactory;this.onRequest=onRequest;this.timeoutMs=timeoutMs;this.pending=new Map();this.next=0;this.generation=0;}
 async connect(url){
  if(this.socket?.readyState===1)return;
  this.close();const generation=++this.generation,socket=this.socketFactory(url);this.socket=socket;
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{socket.close();reject(new Error('Hermes 连接超时。'));},15000);
   socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
   socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('无法连接 Hermes 后端。'));},{once:true});
   socket.addEventListener('close',()=>{clearTimeout(timer);reject(new Error('Hermes 连接已关闭。'));},{once:true});
   socket.addEventListener('message',event=>{if(generation===this.generation)this.frame(event.data);});
   socket.addEventListener('close',()=>{if(generation===this.generation){this.rejectPending(new Error('Hermes 连接中断；未自动重发正在执行的操作。'));this.emit('disconnect');}});
  });
  if(generation!==this.generation)throw new Error('Hermes 连接已取消。');
  this.heartbeat=setInterval(()=>this.request('ping',{},5000).catch(()=>{if(generation===this.generation){this.close();this.emit('disconnect');}}),15000);this.heartbeat.unref?.();
 }
 async frame(raw){
  if(typeof raw!=='string'||raw.length>8_000_000){this.close();this.emit('disconnect');return;}
  let frame;try{frame=JSON.parse(raw);}catch{this.emit('protocol_error',new Error('Hermes 返回无效协议数据。'));this.close();this.emit('disconnect');return;}
  if(frame.method==='event'){this.emit('event',frame.params);return;}
  if(frame.method&&frame.id!==undefined){
   const generation=this.generation;
   try{const result=await this.onRequest(frame.method,frame.params||{},frame.id);if(generation===this.generation)this.send({jsonrpc:'2.0',id:frame.id,result});}
   catch(error){if(generation===this.generation&&this.socket?.readyState===1)this.send({jsonrpc:'2.0',id:frame.id,error:{code:error.rpcCode||-32603,message:error.message}});}
   return;
  }
  const pending=this.pending.get(frame.id);if(!pending)return;this.pending.delete(frame.id);clearTimeout(pending.timer);
  if(frame.error){const error=new Error(frame.error.message||'Hermes 操作失败。');error.rpcCode=frame.error.code;error.data=frame.error.data;pending.reject(error);}else pending.resolve(frame.result);
 }
 send(frame){if(this.socket?.readyState!==1)throw new Error('Hermes 后端未连接。');this.socket.send(JSON.stringify(frame));}
 request(method,params={},timeoutMs=this.timeoutMs){
  if(this.socket?.readyState!==1)return Promise.reject(new Error('Hermes 后端未连接。'));
  const id='apollo-'+(++this.next);
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Hermes 操作等待超时。操作可能已执行，请先核查状态。'));},timeoutMs);this.pending.set(id,{resolve,reject,timer});try{this.send({jsonrpc:'2.0',id,method,params});}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}});
 }
 rejectPending(error){for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}this.pending.clear();}
 close(){++this.generation;clearInterval(this.heartbeat);this.heartbeat=null;this.rejectPending(new Error('Hermes 连接已结束。'));const socket=this.socket;this.socket=null;socket?.close();}
}
module.exports={HermesRpc};
