const https=require('node:https');
const API='https://api.github.com/repos/Acromare/ApolloCode/releases/latest';
const RELEASES='https://github.com/Acromare/ApolloCode/releases/latest';
const HEADERS={'User-Agent':'ApolloCode-release-notifications',Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
const MAX_BODY=1024*1024;
function failure(code,message){return Object.assign(new Error(message),{code});}
function validateRelease(data){
  const version=String(data?.tag_name||'').replace(/^v/,'');
  if(data?.draft||data?.prerelease||!/^\d{1,8}\.\d{1,8}\.\d{1,8}$/.test(version))throw failure('UPDATE_METADATA','Invalid stable release metadata');
  const installer='Apollo-Code-Setup-'+version+'-x64.exe';
  if(!Array.isArray(data.assets)||!data.assets.some(a=>a.name===installer&&a.size>0))throw failure('UPDATE_METADATA','Release installer is missing');
  return {version,releaseNotes:data.body||''};
}
function isNewer(candidate,current){
  const parse=v=>{if(!/^\d{1,8}\.\d{1,8}\.\d{1,8}$/.test(v))throw failure('UPDATE_METADATA','Invalid version');return v.split('.').map(Number);};
  const a=parse(candidate),b=parse(current);
  for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;
}
function statusError(status){return failure(status===403||status===429?'UPDATE_RATE_LIMIT':'UPDATE_NETWORK','GitHub HTTP '+status);}
function nodeJson(url,{signal}){
  return new Promise((resolve,reject)=>{
    const request=https.get(url,{headers:HEADERS,signal},response=>{
      if(response.statusCode!==200){response.resume();reject(statusError(response.statusCode));return;}
      const chunks=[];let bytes=0;
      response.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_BODY){request.destroy(failure('UPDATE_METADATA','Release response too large'));return;}chunks.push(chunk);});
      response.on('error',reject);
      response.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(failure('UPDATE_METADATA','Invalid release JSON'));}});
    });
    request.on('error',reject);
  });
}
async function electronJson(fetch,url,{signal}){
  const response=await fetch(url,{headers:HEADERS,signal,cache:'no-store',redirect:'error'});
  if(response.status!==200)throw statusError(response.status);
  const reader=response.body.getReader();let bytes=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>MAX_BODY)throw failure('UPDATE_METADATA','Release response too large');chunks.push(Buffer.from(value));}}
  finally{await reader.cancel().catch(()=>{});}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw failure('UPDATE_METADATA','Invalid release JSON');}
}
// Chromium respects the user's system proxy. A staggered Node request also
// covers Chromium-specific routing failures. Both keep normal TLS validation.
async function fetchLatestRelease({electronFetch,nodeFetch=nodeJson,timeoutMs=12000,fallbackDelayMs=800}={}){
  const controller=new AbortController();let timeout,delay;
  const errors=[];
  const attempt=async fetch=>{try{return validateRelease(await fetch(API,{signal:controller.signal}));}catch(error){errors.push(error);throw error;}};
  const deadline=new Promise((_,reject)=>{timeout=setTimeout(()=>reject(failure('UPDATE_TIMEOUT','Release check timed out')),timeoutMs);});
  const requests=[];
  if(electronFetch){
    requests.push(attempt((url,options)=>electronJson(electronFetch,url,options)));
    requests.push(new Promise(resolve=>{delay=setTimeout(resolve,fallbackDelayMs);}).then(()=>attempt(nodeFetch)));
  }else requests.push(attempt(nodeFetch));
  try{return await Promise.race([Promise.any(requests),deadline]);}
  catch(error){if(error instanceof AggregateError)throw errors.find(e=>e.code==='UPDATE_RATE_LIMIT')||errors.find(e=>e.code==='UPDATE_METADATA')||failure('UPDATE_NETWORK','Unable to connect to GitHub');throw error;}
  finally{clearTimeout(timeout);clearTimeout(delay);controller.abort();}
}
module.exports={fetchLatestRelease,isNewer,validateRelease,RELEASES};
