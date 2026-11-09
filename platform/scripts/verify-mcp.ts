import './env';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function main(): Promise<void> {
  const endpoint = process.env.DASH0_MCP_ENDPOINT;
  const token = process.env.DASH0_MCP_TOKEN ?? process.env.DASH0_API_TOKEN;
  if (!endpoint || !token) throw new Error('Configure the Dash0 MCP endpoint and Reading token.');
  const client = new Client({ name: 'converge-admin-verification', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  try {
    await client.connect(transport, { timeout: 10000 });
    const { tools } = await client.listTools({}, { timeout: 10000 });
    console.log(JSON.stringify({ connected: true, tools: tools.map((tool) => ({ name: tool.name, readOnly: tool.annotations?.readOnlyHint })) }));
    const promql = tools.find((tool) => tool.name === 'promql');
    if (promql) console.log(JSON.stringify({ metricTool: promql.name, inputSchema: promql.inputSchema }));
  } finally { await client.close(); }
}
main().catch(() => { console.error('MCP verification failed; check endpoint and Reading permission.'); process.exitCode = 1; });
