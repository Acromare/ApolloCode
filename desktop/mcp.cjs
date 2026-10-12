const {Client} = require('@modelcontextprotocol/sdk/client/index.js');
const {StdioClientTransport} = require('@modelcontextprotocol/sdk/client/stdio.js');
const {StreamableHTTPClientTransport} = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const crypto=require('node:crypto');
class McpPool {
  constructor(){this.clients=new Map();}
  async connect(server) {
    await this.disconnect(server.id);
    const client=new Client({name:'apollo-code',version:'0.2.0'},{capabilities:{}});
    let transport;
    if(server.transport==='stdio') {
      if(!server.command) throw new Error('填写 MCP 可执行程序。');
      transport=new StdioClientTransport({command:server.command,args:server.args||[],env:{PATH:process.env.PATH||'',SystemRoot:process.env.SystemRoot||'',TEMP:process.env.TEMP||'',...server.env},stderr:'pipe'});
    } else {
      const url=new URL(server.url); if(!['http:','https:'].includes(url.protocol)) throw new Error('MCP 地址必须使用 HTTP/HTTPS。');
      transport=new StreamableHTTPClientTransport(url,{requestInit:{headers:server.headers||{}}});
    }
    try {
      await client.connect(transport,{timeout:15000});
      const result=await client.listTools({}, {timeout:15000});
      const tools=result.tools.slice(0,100).map(tool=>({...tool,alias:'mcp_'+server.id+'_'+crypto.createHash('sha256').update(tool.name).digest('hex').slice(0,10)}));
      this.clients.set(server.id,{client,tools});
      return tools.map(t=>({name:t.name,alias:t.alias,description:t.description||'',inputSchema:t.inputSchema}));
    } catch(error) {await client.close().catch(()=>{}); throw error;}
  }
  async disconnect(id){const item=this.clients.get(id);if(item){this.clients.delete(id);await item.client.close().catch(()=>{});}}
  schemas(allowed){return [...this.clients.values()].flatMap(item=>item.tools).filter(t=>allowed.includes(t.alias)).map(t=>({name:t.alias,description:(t.description||t.name).slice(0,200),parameters:t.inputSchema}));}
  async call(alias,args,signal) {
    for(const item of this.clients.values()) {const tool=item.tools.find(t=>t.alias===alias); if(tool) return item.client.callTool({name:tool.name,arguments:args},undefined,{timeout:60000,signal});}
    throw new Error('MCP 工具未连接。');
  }
  async close(){await Promise.all([...this.clients.keys()].map(id=>this.disconnect(id)));}
}
module.exports={McpPool};
