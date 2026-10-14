// In Electron, Chromium honors the OS proxy. An automatic retry uses Node's transport
// on the second attempt to recover Chromium/HTTP2 failures without replaying tools.
function modelFetch(electronFetch,nodeFetch=fetch){
 const preferred=new Map(),key=url=>new URL(url).origin;
 const fetcher=async(url,options={})=>{
  const {apolloTransport='auto',apolloAttempt=1,...init}=options;
  const first=preferred.get(key(url))||'system';
  const selected=apolloTransport==='auto'?(apolloAttempt===2?(first==='system'?'node':'system'):first):apolloTransport;
  const transport=electronFetch&&selected==='system'?'system':'node';
  const response=await (transport==='system'?electronFetch:nodeFetch)(url,init);
  if(response&&typeof response==='object')Object.defineProperty(response,'apolloTransport',{value:transport,configurable:true});
  return response;
 };
 // Remember only fully validated model results, never an HTTP 200 error stream.
 fetcher.recordSuccess=(url,transport)=>{if(['system','node'].includes(transport)){if(preferred.size>=128&&!preferred.has(key(url)))preferred.delete(preferred.keys().next().value);preferred.set(key(url),transport);}};
 return fetcher;
}
module.exports={modelFetch};
