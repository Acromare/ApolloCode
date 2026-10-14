const {redact}=require('./economy.cjs');
function sanitize(value,secrets=[]){
 if(typeof value==='string')return redact(value,secrets);
 if(Array.isArray(value))return value.map(item=>sanitize(item,secrets));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,/^(api[_-]?key|password|secret|access_token|refresh_token|session_token)$/i.test(key)?'[REDACTED]':sanitize(item,secrets)]));
 return value;
}
module.exports={sanitize};
