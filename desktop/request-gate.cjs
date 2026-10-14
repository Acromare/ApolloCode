const {RequestError}=require('./request-recovery.cjs');
class RequestGate {
  constructor(){this.active=0;this.queue=[];this.limit=2;}
  acquire(limit,signal){
    this.limit=Math.max(1,Math.min(3,limit||2));
    return new Promise((resolve,reject)=>{
      if(signal?.aborted)return reject(signal.reason||new RequestError('cancelled','任务已中断。'));
      const item={signal,resolve,reject,abort:null};
      item.abort=()=>{this.queue=this.queue.filter(v=>v!==item);reject(signal.reason||new RequestError('cancelled','任务已中断。'));};
      signal?.addEventListener('abort',item.abort,{once:true});this.queue.push(item);this.drain();
    });
  }
  drain(){while(this.active<this.limit&&this.queue.length){const item=this.queue.shift();item.signal?.removeEventListener('abort',item.abort);if(item.signal?.aborted){item.reject(item.signal.reason);continue;}this.active++;let released=false;item.resolve(()=>{if(released)return;released=true;this.active--;this.drain();});}}
}
module.exports={RequestGate};
