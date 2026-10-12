const {Server}=require('@modelcontextprotocol/sdk/server/index.js');
const {StdioServerTransport}=require('@modelcontextprotocol/sdk/server/stdio.js');
const {ListToolsRequestSchema,CallToolRequestSchema}=require('@modelcontextprotocol/sdk/types.js');
const server=new Server({name:'apollo-test-mcp',version:'1.0.0'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{name:'echo',description:'Echo a small message',inputSchema:{type:'object',properties:{message:{type:'string'}},required:['message']}}]}));
server.setRequestHandler(CallToolRequestSchema,async request=>({content:[{type:'text',text:'echo: '+request.params.arguments.message}]}));
server.connect(new StdioServerTransport()).catch(e=>{console.error(e);process.exit(1);});
