const fs=require('node:fs'),path=require('node:path');
const {execFile,spawn}=require('node:child_process');
function interpreter(file,args=[]){return new Promise(resolve=>execFile(file,[...args,'-c','import sys; print(sys.executable)'],{windowsHide:true,timeout:15000},(error,stdout)=>resolve(error?null:stdout.trim())));}
async function provision({source,dataDir,onProgress=()=>{}}){
 const candidates=[['py',['-3']],['python',[]],['python3',[]]];
 let python;for(const [file,args] of candidates){python=await interpreter(file,args);if(python&&fs.existsSync(python))break;python=null;}
 if(!python)throw new Error('未找到 Python。请重新安装含运行环境的 Apollo 安装包，或先安装 Python 3.11–3.14。');
 const target=path.join(dataDir,'environment'),script=path.join(__dirname,'hermes-prepare.py');
 const env={...process.env,HERMES_HOME:path.join(dataDir,'bootstrap'),HERMES_RUNTIME_DIR:path.join(dataDir,'manager'),PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'};
 delete env.PYTHONPATH;delete env.VIRTUAL_ENV;delete env.ELECTRON_RUN_AS_NODE;
 return new Promise((resolve,reject)=>{
  const child=spawn(python,['-B','-X','utf8',script,source,target],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',tail='';
  const timeout=setTimeout(()=>{child.kill();reject(new Error('运行环境准备超时，请重试。'));},1800000);
  child.stdout.on('data',chunk=>{output=(output+chunk).slice(-100000);});
  child.stderr.on('data',chunk=>{tail=(tail+chunk).slice(-4000);onProgress('正在安装锁定的后端依赖，请稍候…');});
  child.once('error',error=>{clearTimeout(timeout);reject(error);});
  child.once('exit',code=>{clearTimeout(timeout);if(code!==0)return reject(new Error('环境准备失败。\n'+tail));
   try{const line=output.split(/\r?\n/).findLast(line=>line.startsWith('APOLLO_PYTHON='));const result=JSON.parse(line.slice('APOLLO_PYTHON='.length));if(!fs.existsSync(result))throw new Error('Python 输出不存在');resolve(result);}catch{reject(new Error('环境准备未返回有效 Python 路径。'));}
  });
 });
}
module.exports={provision};
