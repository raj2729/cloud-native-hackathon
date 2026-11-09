import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildDash0Queries } from './dash0';
import type { Operation } from './observability';

export interface McpCheck {
  status: 'connected' | 'unconfigured' | 'error';
  tools: string[];
  message: string;
  checkedAt: number;
  observation?: string;
  query?: string;
}

export function mcpConfiguration(): { endpoint: URL; token: string } | null {
  const value = process.env.DASH0_MCP_ENDPOINT;
  const token = process.env.DASH0_MCP_TOKEN ?? process.env.DASH0_API_TOKEN;
  if (!value || !token) return null;
  const endpoint = new URL(value);
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.dash0.com') || endpoint.pathname !== '/mcp' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Invalid MCP endpoint');
  if (!process.env.DASH0_MCP_TOKEN && endpoint.origin !== new URL(process.env.DASH0_API_ENDPOINT ?? '').origin) throw new Error('Reading token cannot be sent to a different host');
  return { endpoint, token };
}

/** Only the fixed PromQL latency query is callable; discovered tools are not executable via user input. */
export async function checkDash0Mcp(operation: Operation, minutes: number, investigate: boolean): Promise<McpCheck> {
  const base = { tools: [] as string[], checkedAt: Date.now() };
  let config: ReturnType<typeof mcpConfiguration>;
  try { config = mcpConfiguration(); }
  catch { return { ...base, status: 'error', message: 'Use the Dash0 regional /mcp endpoint. A reused Reading token must match the configured Dash0 API host.' }; }
  if (!config) return { ...base, status: 'unconfigured', message: 'Set DASH0_MCP_ENDPOINT and a Dash0 Reading token on the server.' };
  const client = new Client({ name: 'converge-admin', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(config.endpoint, {
    requestInit: { headers: { Authorization: `Bearer ${config.token}` }, redirect: 'error' },
  });
  try {
    await client.connect(transport, { timeout: 10000 });
    const { tools } = await client.listTools({}, { timeout: 10000 });
    const readOnlyTools = tools.filter((tool) => tool.annotations?.readOnlyHint === true).map((tool) => tool.name);
    const summary: McpCheck = { ...base, checkedAt: Date.now(), tools: readOnlyTools, status: 'connected', message: `Connected to Dash0 MCP. ${readOnlyTools.length} read-only tools discovered.` };
    if (!investigate) return summary;
    if (!readOnlyTools.includes('promql')) return { ...summary, status: 'error', message: 'This server did not advertise PromQL as read-only; no tool was called.' };
    const query = buildDash0Queries(minutes, operation).find((entry) => entry.key === 'p95')!.query;
    const result = await client.callTool({ name: 'promql', arguments: {
      query, dataset: process.env.DASH0_DATASET ?? 'default', timeRange: { from: `now-${minutes}m`, to: 'now' },
    } }, undefined, { timeout: 15000 });
    if (result.isError) return { ...summary, status: 'error', message: 'MCP connected, but the latency query failed. Check metric availability and dataset permission.' };
    const observation = (result.content as { type: string; text?: string }[])
      .filter((block) => block.type === 'text').map((block) => block.text ?? '').join('\n').split(config.token).join('[redacted]').slice(0, 12000);
    return { ...summary, query, observation: observation || 'The MCP server returned no textual metric data.', message: 'Read-only latency query completed through Dash0 MCP. Empty results mean no metric samples in this window.' };
  } catch {
    return { ...base, status: 'error', message: 'Dash0 MCP could not complete the request. Check the endpoint, Reading permission and connectivity.' };
  } finally { try { await client.close(); } catch { /* Closing a failed connection cannot break admin. */ } }
}
