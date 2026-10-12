const {getEncoding} = require('js-tiktoken');
const tokenizer = getEncoding('cl100k_base');
const count = value => tokenizer.encode(String(value || '')).length;
function redact(value, secrets = []) {
  let text = String(value || '').replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]').replace(/((?:api[_-]?key|access[_-]?token|secret|password)\s*[=:]\s*)[^\s,'"]+/gi, '$1[REDACTED]');
  for (const secret of secrets) if (secret && secret.length > 3) text = text.split(secret).join('[REDACTED]');
  return text;
}
function clip(text, budget) {
  const tokens = tokenizer.encode(String(text));
  if (tokens.length <= budget) return String(text);
  return tokenizer.decode(tokens.slice(0, Math.max(0, budget - 20))) + '\n[output limited; request a narrower range]';
}
function filterOutput(raw, budget = 1200) {
  const original = redact(raw);
  const lines = original.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').split('\n');
  let previous = null;
  const useful = lines.filter(line => {
    if (line === previous) return false;
    previous = line;
    return !/^\s*(Downloading|Progress:|\d+%|[|/\\-]\s*$)/i.test(line);
  });
  let text = useful.join('\n');
  if (count(text) > budget) {
    const errors = useful.filter(line => /error|fail|exception|warning|assert|\bat .+:\d+/i.test(line));
    text = clip([...useful.slice(0, 10), ...errors.slice(0, 50), '[...middle omitted...]', ...useful.slice(-15)].join('\n'), budget);
  }
  return {text, originalTokens: count(original), sentTokens: count(text)};
}
function context(messages, budget, prefixTokens = 0) {
  const safe = messages.filter(m => ['user', 'assistant'].includes(m.role)).map(m => ({role:m.role,content:redact(m.content)}));
  if (!safe.length) throw new Error('请输入消息。');
  const latest = safe.at(-1);
  if (count(latest.content) + prefixTokens + 32 > budget) throw new Error('当前消息超过上下文预算。请提高预算或缩小附件；当前消息未被截断。');
  const selected = [latest]; let total = count(latest.content) + 8 + prefixTokens;
  for (let i=safe.length-2; i>=0; i--) {
    const tokens=count(safe[i].content)+8;
    if(total+tokens>budget) break;
    selected.unshift(safe[i]); total+=tokens;
  }
  while (selected.length>1 && selected[0].role==='assistant') selected.shift();
  return {messages:selected, omitted:safe.length-selected.length, estimatedInput:total, rawEstimatedInput:safe.reduce((n,m)=>n+count(m.content)+8, prefixTokens)};
}
function modelTokens(messages,tools){
  let images=0;const compact=messages.map(m=>({...m,content:Array.isArray(m.content)?m.content.map(c=>{
    if(c.type==='image_url'||c.type==='image'){images++;return {type:'image',note:'approved screenshot'};}return c;
  }):m.content}));
  return count(JSON.stringify({messages:compact,tools}))+images*1500;
}
module.exports = {count, redact, clip, filterOutput, context,modelTokens};
