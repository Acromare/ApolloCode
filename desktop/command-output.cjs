const {redact}=require('./economy.cjs');
// Snapshots let us retract a partial credential before it is ever sent across IPC.
// Keep raw lines together so chunk and UTF-8 boundaries cannot split redaction matches.
class CommandOutput {
  constructor(secrets=[],send=()=>{}){this.secrets=secrets.filter(Boolean);this.send=send;this.raw={stdout:'',stderr:''};this.trimmed={stdout:false,stderr:false};this.timer=null;this.sequence=0;}
  append(stream,text){
    this.raw[stream]+=text;
    if(this.raw[stream].length>80000){const boundary=this.raw[stream].indexOf('\n',this.raw[stream].length-60000);if(boundary>=0){this.raw[stream]=this.raw[stream].slice(boundary+1);this.trimmed[stream]=true;}else{this.raw[stream]='';this.trimmed[stream]=true;}}
    if(!this.timer)this.timer=setTimeout(()=>{this.timer=null;this.flush(false);},100);
  }
  safe(stream,final){
    let raw=this.raw[stream];
    if(!final){for(const key of this.secrets){for(let n=Math.min(key.length-1,raw.length);n>0;n--)if(raw.endsWith(key.slice(0,n))){raw=raw.slice(0,-n)+'[REDACTED]';break;}}}
    return (this.trimmed[stream]?'[earlier output omitted]\n':'')+redact(raw,this.secrets).replace(/\bsk-[A-Za-z0-9_-]*/g,'[REDACTED]').replace(/((?:authorization|token)\s*[:=]\s*(?:Bearer\s+)?)[^\s,'"]*/gi,'$1[REDACTED]').slice(-16000);
  }
  flush(final=true){clearTimeout(this.timer);this.timer=null;for(const stream of ['stdout','stderr'])if(this.raw[stream]||this.trimmed[stream])this.send({stream,text:this.safe(stream,final),sequence:++this.sequence,snapshot:true});}
}
module.exports={CommandOutput};
