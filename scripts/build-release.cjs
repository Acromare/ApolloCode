const fs=require('node:fs'),path=require('node:path');
function signing(env,required=false){
  if(env.APOLLO_AZURE_SIGNING_JSON){
    const options=JSON.parse(env.APOLLO_AZURE_SIGNING_JSON);
    for(const key of ['publisherName','endpoint','certificateProfileName','codeSigningAccountName'])if(typeof options[key]!=='string'||!options[key].trim())throw new Error('Azure 签名配置缺少 '+key);
    if(!/^https:\/\//.test(options.endpoint))throw new Error('Azure 签名端点必须使用 HTTPS。');
    return {signExecutable:true,verifyUpdateCodeSignature:true,azureSignOptions:{...options,fileDigest:'SHA256',timestampDigest:'SHA256'}};
  }
  if(env.CSC_LINK||env.WIN_CSC_LINK||env.APOLLO_SIGN_HOOK){
    if(env.APOLLO_SIGN_HOOK&&!env.APOLLO_PUBLISHER_NAME)throw new Error('自定义云签名需提供 APOLLO_PUBLISHER_NAME，用于更新签名校验。');
    return {signExecutable:true,verifyUpdateCodeSignature:true,signtoolOptions:{signingHashAlgorithms:['sha256'],rfc3161TimeStampServer:'http://timestamp.digicert.com',...(env.APOLLO_PUBLISHER_NAME?{publisherName:env.APOLLO_PUBLISHER_NAME}:{}),...(env.APOLLO_SIGN_HOOK?{sign:path.resolve(env.APOLLO_SIGN_HOOK)}:{})}};
  }
  if(required)throw new Error('未配置代码签名证书或服务。请设置 CSC_LINK / WIN_CSC_LINK、Azure 配置或自定义签名 Hook；未生成伪签名安装包。');
  return {signExecutable:false};
}
async function build(){
  const {build,Platform,Arch}=require('electron-builder');const options=signing(process.env,process.argv.includes('--signed'));
  const output=process.env.APOLLO_RELEASE_DIR||'release';
  await build({targets:Platform.WINDOWS.createTarget('nsis',Arch.x64),publish:'never',config:{directories:{output},win:options,...(process.env.APOLLO_ELECTRON_DIST?{electronDist:path.resolve(process.env.APOLLO_ELECTRON_DIST)}:{})}});
  if(options.signExecutable){
    const {execFileSync}=require('node:child_process');
    const files=[path.resolve(output,'win-unpacked','Apollo Code.exe'),...fs.readdirSync(output).filter(f=>/^Apollo-Code-Setup-.*\.exe$/.test(f)).map(f=>path.resolve(output,f))];
    for(const file of files)execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'verify-signature.ps1'),'-Target',file],{windowsHide:true,stdio:'inherit'});
  }
}
if(require.main===module)build().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={signing};
