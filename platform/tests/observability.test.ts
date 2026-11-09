import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { sliState } from '../lib/observability';
import { buildDash0Queries, getDash0Summary } from '../lib/dash0';
import { observeOperation } from '../lib/operation-tracking';
import { es } from '../lib/es';
import { secretMatches } from '../lib/admin-session';

test('SLI uses no-data for an empty window and preserves negative exhausted budgets', () => {
  assert.deepEqual(sliState(0, 0, 0.99), { ratio: null, budgetRemaining: null, state: 'no-data' });
  assert.equal(sliState(100, 100, 0.99).state, 'meeting');
  const breached = sliState(95, 100, 0.99);
  assert.equal(breached.state, 'breached');
  assert(breached.budgetRemaining! < 0);
});

test('Dash0 queries isolate the service and operation, count all-failed windows as zero good events', () => {
  const queries = buildDash0Queries(15, 'generation');
  assert(queries.every((q) => q.query.includes('app_operation="generation"') && q.query.includes('service_name=')));
  assert(queries.find((q) => q.key === 'availabilitySli')!.query.includes('or vector(0)'));
  assert(queries.find((q) => q.key === 'p95')!.query.includes('histogram_quantile'));
});

for (const scenario of ['missing', 'empty', 'nan', 'good', 'forbidden', 'timeout'] as const) {
  test(`Dash0 panel ${scenario} does not claim healthy telemetry`, async () => {
    const previousEndpoint = process.env.DASH0_API_ENDPOINT;
    const previousToken = process.env.DASH0_API_TOKEN;
    process.env.DASH0_API_ENDPOINT = 'https://api.us-east-1.aws.dash0.com';
    if (scenario === 'missing') delete process.env.DASH0_API_TOKEN;
    else process.env.DASH0_API_TOKEN = 'test-private-token';
    let calls = 0;
    mock.method(globalThis, 'fetch', async (url: URL, options: RequestInit) => {
      calls++;
      assert(!url.toString().includes('test-private-token'));
      assert.equal((options.headers as Record<string, string>).Authorization, 'Bearer test-private-token');
      assert.equal(options.cache, 'no-store');
      if (scenario === 'timeout') throw new Error('timeout');
      return new Response(JSON.stringify({ status: 'success', data: { resultType: 'vector', result: scenario === 'empty' ? [] : [{ value: [1234, scenario === 'nan' ? 'NaN' : '99.9'] }] } }), { status: scenario === 'forbidden' ? 403 : 200 });
    });
    try {
      const summary = await getDash0Summary(15, 'discovery');
      if (scenario === 'missing') { assert.equal(summary.status, 'unconfigured'); assert.equal(calls, 0); }
      else if (scenario === 'forbidden' || scenario === 'timeout') { assert.equal(summary.status, 'error'); assert(summary.panels.every((p) => p.value === null && p.error)); }
      else { assert.equal(summary.status, 'connected'); assert(summary.panels.every((p) => p.value === (scenario === 'good' ? 99.9 : null))); }
      assert(!JSON.stringify(summary).includes('test-private-token'));
    } finally {
      if (previousEndpoint === undefined) delete process.env.DASH0_API_ENDPOINT; else process.env.DASH0_API_ENDPOINT = previousEndpoint;
      if (previousToken === undefined) delete process.env.DASH0_API_TOKEN; else process.env.DASH0_API_TOKEN = previousToken;
      mock.restoreAll();
    }
  });
}

test('operation tracking records fallback without attendee content and survives storage failure', async () => {
  const records: Record<string, unknown>[] = [];
  mock.method(es, 'index', async (request: { document: Record<string, unknown> }) => { records.push(request.document); throw new Error('ES offline'); });
  try {
    const result = await observeOperation('generation', 'request-test', async () => ({ generation: 'extractive', question: 'private question' }), () => ({ outcome: 'fallback', provider: 'openai' }));
    assert.equal(result.generation, 'extractive');
    assert.equal(records[0].outcome, 'fallback');
    assert.equal(records[0].operation, 'generation');
    assert(!JSON.stringify(records).includes('private question'));
    await assert.rejects(() => observeOperation('retrieval', 'request-error', async () => { throw new Error('underlying failure'); }), /underlying failure/);
    assert.equal(records[1].outcome, 'error');
  } finally { mock.restoreAll(); }
});

test('admin code is independent of attendee cookies and disabled when unset', () => {
  const previous = process.env.ADMIN_ACCESS_TOKEN;
  try {
    delete process.env.ADMIN_ACCESS_TOKEN;
    assert.equal(secretMatches('anything'), false);
    process.env.ADMIN_ACCESS_TOKEN = 'admin-test-code';
    assert.equal(secretMatches('wrong'), false);
    assert.equal(secretMatches('admin-test-code'), true);
  } finally { if (previous === undefined) delete process.env.ADMIN_ACCESS_TOKEN; else process.env.ADMIN_ACCESS_TOKEN = previous; }
});
