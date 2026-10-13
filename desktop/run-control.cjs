// Pausing is cooperative: an in-flight request/action completes before the next boundary.
class RunControl {
  constructor(signal,emit,{timeoutMs=300000,onTimeout=()=>{}}={}){
    this.signal=signal;this.emit=emit;this.queue=[];this.status='running';this.remaining=timeoutMs;this.onTimeout=onTimeout;
    this.abort=()=>this.release?.();signal.addEventListener('abort',this.abort,{once:true});this.arm();
  }
  arm(){this.since=Date.now();this.timer=setTimeout(this.onTimeout,Math.max(1,this.remaining));this.timer.unref?.();}
  pause(){if(this.signal.aborted)throw new Error('Task has ended');if(this.status==='running'){this.status='pausing';this.emit({type:'control',status:'pausing'});}return {ok:true,status:this.status};}
  resume(){if(this.status==='paused'){this.arm();}this.status='running';this.release?.();this.emit({type:'control',status:'running'});return {ok:true,status:this.status};}
  steer(text){if(typeof text!=='string'||!text.trim()||text.length>4000)throw new Error('Instruction must contain 1–4000 characters');if(this.signal.aborted)throw new Error('Task has ended');if(this.queue.length>=8)throw new Error('Too many pending instructions');this.queue.push(text.trim());this.emit({type:'steering',status:'queued',text:text.trim()});return {ok:true};}
  drain(messages){const queued=this.queue.splice(0);for(const text of queued){messages.push({role:'user',content:text});this.emit({type:'steering',status:'applied',text});}return queued.length;}
  async checkpoint(){
    if(this.signal.aborted)throw new Error('已中断');
    if(this.status==='pausing'){
      clearTimeout(this.timer);this.remaining-=Date.now()-this.since;this.status='paused';
      const wait=new Promise(resolve=>{this.release=resolve;});this.emit({type:'control',status:'paused'});await wait;this.release=null;
    }
    if(this.signal.aborted)throw new Error('已中断');
  }
  close(){clearTimeout(this.timer);this.signal.removeEventListener('abort',this.abort);this.release?.();this.queue=[];}
}
module.exports={RunControl};
