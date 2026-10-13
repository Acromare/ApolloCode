const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
class PersonalFiles{
  constructor({folders,approve}){this.folders=folders||{desktop:path.join(os.homedir(),'Desktop'),documents:path.join(os.homedir(),'Documents'),downloads:path.join(os.homedir(),'Downloads')};this.approve=approve;}
  resolve(folder,relative){
    const root=this.folders[folder];if(!root)throw new Error('目录仅支持 desktop、documents 或 downloads。');
    if(!relative||typeof relative!=='string'||relative.length>240)throw new Error('请指定文件名称。');
    const target=path.resolve(root,relative),rel=path.relative(root,target);
    if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||rel.split(path.sep).some(s=>/^\.env(?:\.|$)|^\.git$|^id_(rsa|ed25519)$|\.(pem|key|pfx)$/i.test(s)||/[\x00-\x1f]/.test(relative)))throw new Error('文件必须位于选定的个人目录内，且不能是受保护文件。');
    if(process.platform==='win32'&&rel.split(path.sep).some(s=>/[<>:"|?*]/.test(s)||/[. ]$/.test(s)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)))throw new Error('文件名称在 Windows 上无效。');
    const actualRoot=fs.realpathSync(root);let parent=path.dirname(target);while(!fs.existsSync(parent))parent=path.dirname(parent);
    const actualParent=fs.realpathSync(parent),inside=path.relative(actualRoot,actualParent);
    if(inside==='..'||inside.startsWith('..'+path.sep)||path.isAbsolute(inside))throw new Error('目录链接指向授权目录之外。');
    return target;
  }
  async create(args,signal){
    const folder=args.folder||'desktop',content=String(args.content??'');if(Buffer.byteLength(content)>2_000_000)throw new Error('文本文件最多 2 MB。');
    const target=this.resolve(folder,args.path);if(fs.existsSync(target))throw new Error('文件已存在，未覆盖：'+target);
    if(signal?.aborted)throw new Error('已中断');
    if(!await this.approve('file-create','创建文件：'+target+'\n\n'+content.slice(0,4000)))throw new Error('创建文件未获批准。');
    if(signal?.aborted)throw new Error('已中断');this.resolve(folder,args.path);
    fs.mkdirSync(path.dirname(target),{recursive:true});this.resolve(folder,args.path);
    fs.writeFileSync(target,content,{encoding:'utf8',flag:'wx'});
    const actual=fs.readFileSync(target);if(!actual.equals(Buffer.from(content)))throw new Error('写入后验证失败：'+target);
    return {ok:true,path:target,bytes:actual.length,verified:true,sha256:crypto.createHash('sha256').update(actual).digest('hex')};
  }
}
const definition={name:'create_personal_file',description:'Create and verify a NEW UTF-8 text file on the user Desktop, Documents or Downloads after approval. Works without a project. Uses actual OS folders (including redirected Desktop). Never overwrites existing files. For a desktop file use folder="desktop" and path="filename.txt"; supports nested relative paths.',parameters:{type:'object',properties:{folder:{type:'string',enum:['desktop','documents','downloads']},path:{type:'string'},content:{type:'string'}},required:['path','content']}};
module.exports={PersonalFiles,definition};
