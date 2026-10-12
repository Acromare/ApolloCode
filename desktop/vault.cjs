const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
function dpapi(data,decrypt=false){
  const operation=decrypt?'Unprotect':'Protect';
  const script="$ProgressPreference='SilentlyContinue'; Add-Type -AssemblyName System.Security; $data=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::"+operation+"($data,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($result))";
  const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{input:Buffer.from(data).toString('base64'),encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:2_000_000});
  return Buffer.from(output.trim(),'base64');
}
class Vault {
  constructor(storage,options={}){this.storage=storage;this.platform=options.platform||process.platform;this.cache=new Map();}
  ready(){if(!this.storage.isEncryptionAvailable()||this.storage.getSelectedStorageBackend?.()==='basic_text')throw new Error('系统凭证加密不可用，未写入明文。');}
  write(file,value){
    if(this.platform!=='win32')this.ready();fs.mkdirSync(path.dirname(file),{recursive:true});
    const encrypted=(this.platform==='win32'?dpapi(Buffer.from(JSON.stringify(value))):this.storage.encryptString(JSON.stringify(value))).toString('base64');
    fs.writeFileSync(file+'.tmp',JSON.stringify({vaultVersion:this.platform==='win32'?2:1,backend:this.platform==='win32'?'windows-dpapi':'safeStorage',encrypted}),{mode:0o600});fs.renameSync(file+'.tmp',file);this.cache.delete(file);
  }
  read(file,fallback){
    if(!fs.existsSync(file))return fallback;
    const stat=fs.statSync(file),signature=stat.mtimeMs+':'+stat.size;const cached=this.cache.get(file);if(cached?.signature===signature)return structuredClone(cached.value);
    const stored=JSON.parse(fs.readFileSync(file,'utf8'));
    if(stored.vaultVersion===2&&stored.backend==='windows-dpapi'){
      if(this.platform!=='win32')throw new Error('此凭证文件绑定到 Windows 用户，请在原系统迁移。');
      const value=JSON.parse(dpapi(Buffer.from(stored.encrypted,'base64'),true).toString('utf8'));this.cache.set(file,{signature,value});return value;
    }
    if(stored.vaultVersion===1){this.ready();const value=JSON.parse(this.storage.decryptString(Buffer.from(stored.encrypted,'base64')));if(this.platform==='win32')this.write(file,value);return value;}
    // Upgrade old plaintext in place only after successful encryption, without plaintext backups.
    this.write(file,stored);return stored;
  }
}
module.exports={Vault};
