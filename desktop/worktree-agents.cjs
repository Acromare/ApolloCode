const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
async function prepare(runtime,task,signal){
  const {tools}=runtime;if(signal?.aborted)throw new Error('已中断');
  const check=await tools.command('git',['rev-parse','--show-toplevel'],signal);if(!check.ok)throw new Error('Writable agents require a Git repository with a commit');
  const root=fs.realpathSync(check.output.trim());if(root.toLowerCase()!==tools.root().toLowerCase())throw new Error('Select the Git repository root for writable agents');
  const head=await tools.command('git',['rev-parse','--verify','HEAD'],signal);if(!head.ok)throw new Error('Commit a baseline before creating a worktree');
  const status=await tools.command('git',['status','--porcelain','--','.',':(exclude).apollocode'],signal);if(!status.ok)throw new Error(status.output||'Git status failed');if(status.output.trim())throw new Error('Commit or stash local edits first; worktrees start from the committed HEAD');
  if(!await runtime.approve('worktree-create',task+'\n'+root+'\nSeparate branch/worktree. Changes remain there; no automatic merge.'))throw new Error('Writable child task rejected');
  if(signal?.aborted)throw new Error('已中断');
  const id=crypto.randomUUID(),branch='apollo/agent-'+id.slice(0,8),parent=path.join(runtime.dir,'worktrees');fs.mkdirSync(parent,{recursive:true});if(fs.lstatSync(parent).isSymbolicLink())throw new Error('Worktree directory cannot be a symlink');
  const directory=path.join(parent,id);const result=await tools.command('git',['worktree','add','-b',branch,'--',directory,'HEAD'],signal);if(!result.ok)throw new Error(result.output||'Git worktree creation failed');
  return {id,branch,directory,base:head.output.trim(),root,created:Date.now(),task,status:'ready'};
}
module.exports={prepare};
