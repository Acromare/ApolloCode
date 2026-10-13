const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const crypto = require('node:crypto');
class SkillStore {
  constructor(builtIn, external) {this.builtIn=builtIn; this.external=external;}
  parse(file, metadataOnly=false) {
    let source;
    if(metadataOnly) {const fd=fs.openSync(file,'r'); try {const buffer=Buffer.alloc(8192); const size=fs.readSync(fd,buffer,0,8192,0); source=buffer.subarray(0,size).toString();} finally {fs.closeSync(fd);}}
    else {if(fs.statSync(file).size>128000) throw new Error('技能文件超过 128 KB。'); source=fs.readFileSync(file,'utf8');}
    const match=source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    if(!match) throw new Error('技能缺少 YAML frontmatter。');
    const meta=YAML.parse(match[1]);
    if(!meta || typeof meta.name!=='string' || typeof meta.description!=='string') throw new Error('技能需要 name 与 description。');
    return {name:meta.name,description:meta.description.slice(0,300),body:metadataOnly ? undefined : source.slice(match[0].length)};
  }
  list() {
    const result=[];
    for(const [root,source] of [[this.builtIn,'built-in'],[this.external,'external']]) {
      if(!fs.existsSync(root)) continue;
      for(const entry of fs.readdirSync(root,{withFileTypes:true}).slice(0,200)) {
        if(entry.isSymbolicLink()) continue;
        const file=entry.isDirectory()?path.join(root,entry.name,'SKILL.md'):path.join(root,entry.name);
        if(!fs.existsSync(file) || !file.endsWith('.md') || fs.lstatSync(file).isSymbolicLink()) continue;
        try {result.push({id:source+':'+entry.name,source,...this.parse(file,true)});} catch {}
      }
    }
    return result;
  }
  file(id) {
    const item=this.list().find(s=>s.id===id); if(!item) throw new Error('技能不存在。');
    const root=item.source==='built-in'?this.builtIn:this.external;
    const entry=id.slice(id.indexOf(':')+1); const candidate=path.join(root,entry);
    return fs.statSync(candidate).isDirectory()?path.join(candidate,'SKILL.md'):candidate;
  }
  load(id) {return this.parse(this.file(id)).body;}
  restore(id,revision){
    if(!id.startsWith('external:')||typeof revision!=='string')throw new Error('Only external skill revisions can be restored');
    const version=this.versions(id).find(v=>v.revision===revision);if(!version)throw new Error('Skill revision not found');
    const item=this.list().find(s=>s.id===id);return this.save(item.name,version.description,version.body);
  }
  versions(id){
    if(!id.startsWith('external:'))return [];
    const dir=path.join(path.dirname(this.file(id)),'.versions');
    if(!fs.existsSync(dir))return [];
    if(fs.lstatSync(dir).isSymbolicLink())throw new Error('Version directory cannot be a symlink');
    return fs.readdirSync(dir).filter(name=>/^[a-f0-9-]+\.json$/.test(name)).slice(-20).map(name=>{const file=path.join(dir,name);if(fs.lstatSync(file).isSymbolicLink())return null;try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}).filter(Boolean).sort((a,b)=>b.created-a.created);
  }
  save(name, description, body) {
    if(typeof name!=='string'||!/^[a-z0-9][a-z0-9-]{1,63}$/.test(name)) throw new Error('技能名称使用小写字母、数字和短横线。');
    if(typeof description!=='string'||!description.trim()||typeof body!=='string'||body.length>100000) throw new Error('填写描述，正文不得超过 100000 字符。');
    fs.mkdirSync(this.external,{recursive:true});
    const dir=path.join(this.external,name); if(fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink()) throw new Error('技能目录不能是符号链接。');
    fs.mkdirSync(dir,{recursive:true}); const file=path.join(dir,'SKILL.md');
    const versions=path.join(dir,'.versions');if(fs.existsSync(versions)&&fs.lstatSync(versions).isSymbolicLink())throw new Error('Version directory cannot be a symlink');fs.mkdirSync(versions,{recursive:true});
    if(fs.existsSync(file)) {
      if(fs.lstatSync(file).isSymbolicLink()||(fs.existsSync(file+'.bak')&&fs.lstatSync(file+'.bak').isSymbolicLink()))throw new Error('技能文件不能是符号链接。');
      if(!fs.readdirSync(versions).some(n=>/^[a-f0-9-]+\.json$/.test(n))){const old=this.parse(file),revision=crypto.randomUUID();fs.writeFileSync(path.join(versions,revision+'.json'),JSON.stringify({revision,created:fs.statSync(file).mtimeMs,body:old.body,description:old.description}),'utf8');}
      fs.copyFileSync(file,file+'.bak');
    }
    const revision=crypto.randomUUID(),created=Date.now(),snapshot=path.join(versions,revision+'.json');
    fs.writeFileSync(snapshot,JSON.stringify({revision,created,body,description}),'utf8');
    const temp=file+'.'+revision+'.tmp';fs.writeFileSync(temp,'---\n'+YAML.stringify({name,description})+'---\n'+body,'utf8');fs.renameSync(temp,file);
    const snapshots=fs.readdirSync(versions).filter(n=>/^[a-f0-9-]+\.json$/.test(n)).map(n=>({name:n,time:fs.statSync(path.join(versions,n)).mtimeMs})).sort((a,b)=>b.time-a.time);
    for(const old of snapshots.slice(20))fs.unlinkSync(path.join(versions,old.name));
    return {id:'external:'+name,revision};
  }
}
module.exports={SkillStore};
