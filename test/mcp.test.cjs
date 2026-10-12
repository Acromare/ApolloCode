const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {McpPool}=require('../desktop/mcp.cjs');
test('real MCP stdio handshake, discovery, selected schema and tool call',async t=>{
  const pool=new McpPool();t.after(()=>pool.close());
  const tools=await pool.connect({id:'test',transport:'stdio',command:process.execPath,args:[path.join(__dirname,'fixtures/mcp-server.cjs')],env:{}});
  assert.equal(tools[0].name,'echo');assert.equal(pool.schemas([]).length,0);
  const selected=pool.schemas([tools[0].alias]);assert.equal(selected.length,1);
  const result=await pool.call(tools[0].alias,{message:'verified'});
  assert.equal(result.content[0].text,'echo: verified');
  await pool.disconnect('test');assert.equal(pool.schemas([tools[0].alias]).length,0);
});
