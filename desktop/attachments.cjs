const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const UPLOAD_LIMIT=20*1024*1024;
function localFile(file){
 if(typeof file?.path!=='string'||!path.isAbsolute(file.path))throw new Error('附件必须是本地文件，请重新选择。');
 const resolved=fs.realpathSync(file.path);if(!fs.statSync(resolved).isFile())throw new Error('请选择文件，文件夹暂不支持。');
 return {path:resolved,name:path.basename(resolved)};
}
function storeUpload(directory,{name,data}={}){
 if(!(data instanceof ArrayBuffer)&&!ArrayBuffer.isView(data))throw new Error('附件内容无效。');
 const bytes=data instanceof ArrayBuffer?Buffer.from(data):Buffer.from(data.buffer,data.byteOffset,data.byteLength);
 if(bytes.length>UPLOAD_LIMIT)throw new Error('粘贴附件最多 20 MB，请通过拖拽或文件选择添加较大的本地文件。');
 const filename=String(name||'attachment').split(/[\\/]/).at(-1).replace(/[<>:"|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'')||'attachment';
 const dir=path.join(directory,crypto.randomUUID());fs.mkdirSync(dir,{recursive:true});
 const target=path.join(dir,filename);fs.writeFileSync(target,bytes,{flag:'wx'});return {path:target,name:filename,size:bytes.length};
}
function attachmentContext(payload,projectRoot){
 if(!payload.attachments?.length)return payload;
 const refs=[];
 for(const attachment of payload.attachments){
  let file=localFile(attachment);
  if(projectRoot){
   const root=fs.realpathSync(projectRoot),relative=path.relative(root,file.path);
   if(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative)){
    const dir=path.join(root,'.apollocode','attachments',crypto.randomUUID());fs.mkdirSync(dir,{recursive:true});
    const stored=path.join(dir,file.name);fs.copyFileSync(file.path,stored,fs.constants.COPYFILE_EXCL);file={...file,path:stored};
   }
  }
  refs.push('Attached file: '+JSON.stringify(file.name)+'\nPath: '+JSON.stringify(file.path));
  // Preserve text-only conversation support without a filename whitelist.
  const size=fs.statSync(file.path).size;
  if(size<=64*1024){
   const bytes=fs.readFileSync(file.path);
   try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(!text.includes('\0'))refs.push('File content:\n'+text);}catch{}
  }
 }
 const messages=(payload.messages||[]).map(message=>({...message}));
 const index=messages.findLastIndex(message=>message.role==='user');
 if(index<0)messages.push({role:'user',content:refs.join('\n\n')});
 else messages[index].content=[messages[index].content,...refs].filter(Boolean).join('\n\n');
 return {...payload,messages};
}
module.exports={UPLOAD_LIMIT,localFile,storeUpload,attachmentContext};
