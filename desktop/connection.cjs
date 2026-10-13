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
  if (/upstream.*auth|上游.*认证/i.test(detail)) hint = '服务商的上游凭据认证失败。请联系该接口服务商检查渠道凭据与授权。';
  else if (/not supported|model.*not found|unknown model/i.test(detail)) hint = '当前账户或分组不支持这个模型。请获取模型列表，选择准确的模型 ID。';
  else if (status === 401 || status === 403) hint = '请检查 API Key、账户权限和分组授权。';
  else if (status === 429) hint = '请求触发了限流或额度限制，请检查服务商额度。';
  return 'HTTP ' + status + ' · ' + hint + '\n' + detail;
}
async function request(config, suffix, body, fetcher = fetch) {
  const response = await fetcher(config.baseUrl + suffix, {method: body ? 'POST' : 'GET', headers: headers(config), ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(30000), redirect: 'error'});
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
    const anthropic=config.provider==='anthropic',responses=protocol(config)==='responses';
    const data=await request(config,anthropic?'/messages':responses?'/responses':'/chat/completions',responses?{model:config.model,input:'Reply OK.',max_output_tokens:config.reasoningEffort&&config.reasoningEffort!=='auto'?256:64,store:false,...(config.reasoningEffort&&config.reasoningEffort!=='auto'?{reasoning:{effort:config.reasoningEffort}}:{})}:{model:config.model,...(anthropic||config.provider==='ollama'?{max_tokens:16}:{max_completion_tokens:64}),messages:[{role:'user',content:'Reply OK.'}]},fetcher);
    const text=anthropic?data.content?.find(x=>x.type==='text')?.text:responses?(data.output||[]).flatMap(item=>(item.content||[]).filter(c=>c.type==='output_text').map(c=>c.text)).join('\n'):data.choices?.[0]?.message?.content;
    if(typeof text!=='string'||!text.trim())throw new Error('接口成功响应，但未返回文本。');return {ok:true,content:text,usage:data.usage}; }
  catch (error) { return {ok: false, error: error.message}; }
}
function protocol(config){if(config.provider==='anthropic')return 'anthropic';if(config.provider==='ollama')return 'chat';if(config.apiMode==='responses'||config.apiMode==='chat')return config.apiMode;return /^(?:gpt-[5-9](?:[.-]|$)|o[1-9](?:[.-]|$))/i.test(config.model||'')&&!/azure/i.test(config.baseUrl||'')?'responses':'chat';}
module.exports = {normalize, diagnostic, models, test,headers,protocol};
