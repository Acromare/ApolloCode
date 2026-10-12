const {spawn}=require('node:child_process');
const {redact}=require('./economy.cjs');
async function createPullRequest(tools,approve,args,signal,fetcher=fetch){
  const remote=await tools.command('git',['remote','get-url','origin'],signal);
  if(!remote.ok)throw new Error(remote.output);
  const match=remote.output.trim().match(/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if(!match)throw new Error('PR 工具目前仅支持 github.com 的 origin。');
  const repo=match[1]+'/'+match[2];const title=String(args.title||'').trim();const body=String(args.body||'');
  if(!title||title.length>256||body.length>60000||!args.head||!args.base)throw new Error('请提供有效的标题、正文和分支。');
  if(!await approve('github-pr',repo+'\n'+title+'\n'+redact(body)+'\n'+args.head+' → '+args.base))throw new Error('PR 未获批准。');
  const token=await new Promise((resolve,reject)=>{
    const child=spawn('git',['credential','fill'],{cwd:tools.root(),env:{...process.env,GCM_INTERACTIVE:'never',GIT_TERMINAL_PROMPT:'0'},windowsHide:true,signal});
    let output='';child.stdout.on('data',c=>{output+=c;if(output.length>100000)child.kill();});child.stderr.resume();
    const timer=setTimeout(()=>child.kill(),15000);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);const key=output.split(/\r?\n/).find(l=>l.startsWith('password='))?.slice(9);if(code!==0||!key)reject(new Error('请先用 Git Credential Manager 登录 GitHub。'));else resolve(key);});
    child.stdin.end('protocol=https\nhost=github.com\n\n');
  });
  const headers={Authorization:'Bearer '+token,'User-Agent':'ApolloCode','Accept':'application/vnd.github+json','Content-Type':'application/json'};
  const query=new URLSearchParams({state:'open',head:match[1]+':'+args.head,base:args.base});
  const existing=await fetcher('https://api.github.com/repos/'+repo+'/pulls?'+query,{headers,signal,redirect:'error'});
  if(!existing.ok)throw new Error('GitHub PR 查询失败：HTTP '+existing.status);
  const current=(await existing.json())[0];if(current)return {ok:true,existing:true,url:current.html_url,number:current.number};
  const response=await fetcher('https://api.github.com/repos/'+repo+'/pulls',{method:'POST',headers,signal,redirect:'error',body:JSON.stringify({title,body,head:args.head,base:args.base,draft:args.draft!==false})});
  const value=await response.json();if(!response.ok)throw new Error('GitHub PR 创建失败：HTTP '+response.status+' '+redact(value.message,[token]));
  return {ok:true,url:value.html_url,number:value.number,draft:value.draft};
}
module.exports={createPullRequest};
