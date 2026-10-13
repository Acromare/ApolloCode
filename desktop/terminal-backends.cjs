const fs=require('node:fs');
const path=require('node:path');
const {redact}=require('./economy.cjs');
const quote=value=>"'"+String(value).replaceAll("'","'\\''")+"'";
function validate(input){
  const kind=input.kind||'local';if(!['local','docker','ssh','singularity'].includes(kind))throw new Error('Unknown terminal backend');
  const config={kind,directory:String(input.directory||'/workspace')};if(!config.directory.startsWith('/')||/[\0\r\n]/.test(config.directory))throw new Error('Remote working directory must be absolute');
  if(kind==='docker'){if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(input.container||''))throw new Error('Specify an existing Docker container');config.container=input.container;}
  if(kind==='ssh'){
    if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,252}$/.test(input.host||'')||!/^([a-zA-Z0-9_][a-zA-Z0-9_.-]{0,63})?$/.test(input.user||''))throw new Error('Invalid SSH host or user');
    config.host=input.host;config.user=input.user||'';config.port=Number(input.port||22);if(!Number.isInteger(config.port)||config.port<1||config.port>65535)throw new Error('Invalid SSH port');
    if(input.identity){const identity=path.resolve(input.identity);if(!fs.existsSync(identity)||!fs.statSync(identity).isFile())throw new Error('SSH identity file not found');config.identity=identity;}
  }
  if(kind==='singularity'){if(!['singularity','apptainer'].includes(input.engine||''))throw new Error('Choose singularity or apptainer');config.engine=input.engine;config.image=path.resolve(input.image||'');if(!input.image||!fs.existsSync(config.image)||!fs.statSync(config.image).isFile())throw new Error('Container image not found');}
  return config;
}
function invocation(config,command){
  config=validate(config);if(typeof command!=='string'||!command.trim()||command.length>30000||command.includes('\0'))throw new Error('Invalid command');
  if(config.kind==='docker')return {file:'docker',args:['exec','--workdir',config.directory,config.container,'/bin/sh','-lc',command]};
  if(config.kind==='ssh')return {file:'ssh',args:['-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-p',String(config.port),...(config.identity?['-i',config.identity]:[]),'--',(config.user?config.user+'@':'')+config.host,'cd -- '+quote(config.directory)+' && /bin/sh -lc '+quote(command)]};
  if(config.kind==='singularity')return {file:config.engine,args:['exec','--containall','--cleanenv','--pwd',config.directory,config.image,'/bin/sh','-lc',command]};
  return null;
}
class TerminalBackends{
  constructor(runtime){this.runtime=runtime;}
  state(){return this.runtime.read('execution.json',{kind:'local',directory:'/workspace'});}
  async save(input){if(this.runtime.running||this.runtime.workflowBusy)throw new Error('Stop the active task first');const config=validate(input);if(config.kind!=='local'&&!await this.runtime.approve('remote-terminal',JSON.stringify(config,null,2)))return {ok:false};this.runtime.write('execution.json',config);return {ok:true,config};}
  async run(args,signal){
    const config=this.state();if(config.kind==='local')return this.runtime.tools.shell(args,signal);
    const spec=invocation(config,args.command);const timeoutMs=Number(args.timeoutMs||120000);if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>300000)throw new Error('Timeout must be 1–300 seconds');
    if(!await this.runtime.approve('remote-terminal',JSON.stringify(config,null,2)+'\n'+redact(args.command,[this.runtime.getConfig().apiKey])))throw new Error('Terminal execution rejected');
    if(signal?.aborted)throw new Error('已中断');const result=await this.runtime.tools.command(spec.file,spec.args,signal,{timeoutMs,auditCommand:config.kind+': '+redact(args.command,[this.runtime.getConfig().apiKey])});
    return {...result,backend:config.kind,directory:config.directory,note:'Terminal files are in this backend; read_file/apply_patch address the local project only.'};
  }
}
const definition={name:'run_terminal',description:'Execute an approved command in the user-selected terminal backend. Read the backend in tool context; remote/container files differ from the local project. Never assume local file tools access remote files. No TLS/SSH host verification bypass.',parameters:{type:'object',properties:{command:{type:'string'},timeoutMs:{type:'integer',minimum:1000,maximum:300000}},required:['command']}};
module.exports={TerminalBackends,validate,invocation,definition};
