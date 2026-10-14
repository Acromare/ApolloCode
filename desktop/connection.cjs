function normalize(config) {
  const url = new URL(String(config.baseUrl || '').trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('请输入有效的 HTTP/HTTPS API 根地址，不要包含认证信息或查询参数。');
  url.pathname = url.pathname.replace(/\/(chat\/completions|responses|messages|models)\/?$/, '').replace(/\/+$/, '');
  return {...config, baseUrl: url.toString().replace(/\/+$/, '')};
}
function headers(config) {
  if (config.provider === 'anthropic') return {'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01'};
  return {'Content-Type': 'application/json', ...(config.apiKey ? {Authorization: 'Bearer ' + config.apiKey} : {})};
}
function diagnostic(status, message, key = '') {
  let detail = String(message || '接口未返回错误详情。');
  if (key) detail = detail.split(key).join('[REDACTED]');
  detail = detail.slice(0, 1000);
  let hint = '请核对 API 地址、接口协议和模型 ID。';
  if (/upstream.*(?:auth|access forbidden)|上游.*认证/i.test(detail)) hint = '服务商的上游凭据认证失败。请联系该接口服务商检查渠道凭据与授权。';
  else if (/upstream.*(?:http\/2|stream failed)/i.test(detail)) hint = '服务商返回了上游连接或流中断错误。请检查该服务的渠道状态与接口协议；这不等于本地 API Key 无效。';
  else if (/not supported|model.*not found|unknown model/i.test(detail)) hint = '当前账户或分组不支持这个模型。请获取模型列表，选择准确的模型 ID。';
  else if (status === 401 || status === 403) hint = '请检查 API Key、账户权限和分组授权。';
  else if (status === 429) hint = '请求触发了限流或额度限制，请检查服务商额度。';
  return (status ? 'HTTP ' + status + ' · ' : '') + hint + '\n' + detail;
}
function streamDiagnostic(message,key='') {
  return diagnostic(undefined,message,key);
}
async function request(config, suffix, body, fetcher = fetch) {
  const response = await fetcher(config.baseUrl + suffix, {method: body ? 'POST' : 'GET', headers: headers(config), ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(body?90000:30000), redirect: 'error'});
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(diagnostic(response.status, '接口返回非 JSON 内容，请检查 API 根地址。', config.apiKey)); }
  if (!response.ok) throw new Error(diagnostic(response.status, data.error?.message || data.message, config.apiKey));
  return data;
}
async function models(input, fetcher) {
  if (input.provider === 'claude') return {ok: false, error: 'Claude Code 使用自身配置的模型。'};
  try { const config = normalize(input); if (config.provider !== 'ollama' && !config.apiKey) throw new Error('请填写 API Key。'); const data = await request(config, '/models', undefined, fetcher); return {ok: true, models: [...new Set((data.data || []).map(m => m.id).filter(id => typeof id === 'string'))].sort()}; }
  catch (error) { return {ok: false, error: error.message}; }
}
async function test(input, fetcher) {
  if (input.provider === 'claude') return {ok: false, error: '请在聊天页使用 Claude Code 的登录进行验证。'};
  try { const config = normalize(input); if (!config.model) throw new Error('请选择或填写模型 ID。'); if (config.provider !== 'ollama' && !config.apiKey) throw new Error('请填写 API Key。');
    const reasoning=/^(?:gpt-[5-9](?:[.-]|$)|o[1-9](?:[.-]|$))/i.test(config.model),budget=reasoning?(['high','xhigh'].includes(config.reasoningEffort)?4096:2048):64;
    // Exercise the same projection, terminal validation and transport selection
    // used by real conversations. A tiny reasoning budget can yield no text.
    const result=await require('./model-stream.cjs').modelTurn({...config,requestSettings:{...config.requestSettings,maxAttempts:2}},'',[{role:'user',content:'Reply OK.'}],[],budget,AbortSignal.timeout(120000),()=>{},fetcher);
    return {ok:true,content:result.content,usage:result.usage}; }
  catch (error) { return {ok: false, error: error.message}; }
}
function protocol(config){if(config.provider==='anthropic')return 'anthropic';if(config.provider==='ollama')return 'chat';if(config.apiMode==='responses'||config.apiMode==='chat')return config.apiMode;return /^(?:gpt-[5-9](?:[.-]|$)|o[1-9](?:[.-]|$))/i.test(config.model||'')&&!/azure/i.test(config.baseUrl||'')?'responses':'chat';}
// Compatible gateways may buffer/drop SSE terminal events. JSON still carries the
// same tools and usage, and avoids depending on a second persistent stream.
const streamCapabilities=new Map();
function capabilityKey(config){return [config.provider,normalize(config).baseUrl,config.model,require('node:crypto').createHash('sha256').update(config.apiKey||'').digest('hex')].join('|');}
function rememberStreaming(config,value){const key=capabilityKey(config);if(streamCapabilities.size>=128&&!streamCapabilities.has(key))streamCapabilities.delete(streamCapabilities.keys().next().value);streamCapabilities.set(key,value);}
function streaming(config){
  const mode=config.requestSettings?.responseMode||'auto';
  if(mode==='stream')return true;if(mode==='json')return false;
  const known=streamCapabilities.get(capabilityKey(config));if(known!==undefined)return known;
  let host;try{host=new URL(config.baseUrl).hostname.toLowerCase();}catch{return false;}
  return config.provider==='ollama'||host==='api.openai.com'||host==='api.anthropic.com';
}
module.exports = {normalize, diagnostic, streamDiagnostic, models, test,headers,protocol,streaming,rememberStreaming};
