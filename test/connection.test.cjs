const {test} = require('node:test');
const assert = require('node:assert/strict');
const connection = require('../desktop/connection.cjs');
const config = {provider: 'openai', baseUrl: 'https://example.com/v1', apiKey: 'test-secret', model: 'authorized-model'};
test('model discovery deduplicates actual provider IDs and normalizes endpoint', async () => {
  const result = await connection.models({...config, baseUrl: config.baseUrl + '/chat/completions'}, async (url, options) => {
    assert.equal(url, config.baseUrl + '/models');
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    return {ok: true, text: async () => JSON.stringify({data: [{id:'b'}, {id:'a'}, {id:'a'}]})};
  });
  assert.deepEqual(result, {ok:true, models:['a','b']});
});
test('upstream authentication errors preserve diagnosis without exposing key', async () => {
  const result = await connection.models(config, async () => ({ok:false, status:502, text: async () => JSON.stringify({error:{message:'Upstream authentication failed test-secret'}})}));
  assert.equal(result.ok, false);
  assert.match(result.error, /上游凭据/);
  assert.ok(!result.error.includes(config.apiKey));
});
test('Ollama discovery does not require credentials', async () => {
  const result = await connection.models({...config, provider:'ollama', apiKey:''}, async (_, options) => {
    assert.equal(options.headers.Authorization, undefined);
    return {ok:true, text: async () => JSON.stringify({data:[{id:'local-model'}]})};
  });
  assert.deepEqual(result.models, ['local-model']);
});
test('connection test uses selected model with a small generation', async () => {
  const result = await connection.test(config, async (_, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, config.model);
    assert.equal(body.max_tokens, 8);
    return {ok:true, text:async () => JSON.stringify({choices:[{message:{content:'OK'}}]})};
  });
  assert.equal(result.ok, true);
});
