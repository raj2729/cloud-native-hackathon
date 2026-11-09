import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { checkDash0Mcp, mcpConfiguration } from '../lib/dash0-mcp';

for (const readOnly of [true, false]) {
  test(`MCP calls latency tools only with explicit read-only annotation (${readOnly})`, async () => {
    const previous = { endpoint: process.env.DASH0_MCP_ENDPOINT, token: process.env.DASH0_MCP_TOKEN };
    process.env.DASH0_MCP_ENDPOINT = 'https://api.us-west-2.aws.dash0.com/mcp';
    process.env.DASH0_MCP_TOKEN = 'test-mcp-secret';
    let called = 0; let closed = 0;
    mock.method(Client.prototype, 'connect', async () => {});
    mock.method(Client.prototype, 'listTools', async () => ({ tools: [
      { name: 'promql', inputSchema: { type: 'object' }, annotations: { readOnlyHint: readOnly } },
      { name: 'runTask', inputSchema: { type: 'object' }, annotations: { readOnlyHint: false } },
    ] }));
    mock.method(Client.prototype, 'callTool', async (input: { name: string; arguments: Record<string, unknown> }) => {
      called++;
      assert.equal(input.name, 'promql');
      assert(String(input.arguments.query).includes('app_operation="retrieval"'));
      return { content: [{ type: 'text', text: 'metric result test-mcp-secret' }] };
    });
    mock.method(Client.prototype, 'close', async () => { closed++; });
    try {
      const result = await checkDash0Mcp('retrieval', 15, true);
      assert.equal(result.status, readOnly ? 'connected' : 'error');
      assert.equal(called, readOnly ? 1 : 0);
      assert.equal(closed, 1);
      assert(!result.tools.includes('runTask'));
      assert(!JSON.stringify(result).includes('test-mcp-secret'));
    } finally {
      if (previous.endpoint === undefined) delete process.env.DASH0_MCP_ENDPOINT; else process.env.DASH0_MCP_ENDPOINT = previous.endpoint;
      if (previous.token === undefined) delete process.env.DASH0_MCP_TOKEN; else process.env.DASH0_MCP_TOKEN = previous.token;
      mock.restoreAll();
    }
  });
}

test('MCP cannot forward an API token to arbitrary hosts or a different Dash0 region', () => {
  const previous = { mcp: process.env.DASH0_MCP_ENDPOINT, api: process.env.DASH0_API_ENDPOINT, token: process.env.DASH0_API_TOKEN, dedicated: process.env.DASH0_MCP_TOKEN };
  delete process.env.DASH0_MCP_TOKEN;
  process.env.DASH0_API_ENDPOINT = 'https://api.us-west-2.aws.dash0.com';
  process.env.DASH0_API_TOKEN = 'private';
  try {
    for (const endpoint of ['https://evil.example/mcp', 'http://api.us-west-2.aws.dash0.com/mcp', 'https://api.us-east-1.aws.dash0.com/mcp']) {
      process.env.DASH0_MCP_ENDPOINT = endpoint;
      assert.throws(mcpConfiguration);
    }
  } finally {
    for (const [key, value] of Object.entries({ DASH0_MCP_ENDPOINT: previous.mcp, DASH0_API_ENDPOINT: previous.api, DASH0_API_TOKEN: previous.token, DASH0_MCP_TOKEN: previous.dedicated })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
