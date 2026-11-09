import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { es, INDEX } from '../lib/es';
import { discoverConference } from '../lib/search';

const input = { query: 'autonomous agents', eventId: 'conference-a', kind: 'talks' as const, tag: 'ai-agents', assistant: false };
const talk = { rooms: ['R203'], startsAt: '2026-11-09T16:00:00Z', endsAt: '2026-11-09T16:40:00Z', track: 'AI & Retrieval', title: 'Agents', abstract: 'Autonomous systems', tags: ['ai-agents'], speaker: { name: 'Demo Speaker', bio: 'Works on orchestration.' } };

for (const mode of ['missing', 'failed', 'ready'] as const) {
  test(`discovery with ${mode} semantic inference preserves filtered keyword results`, async () => {
    const requests: Record<string, unknown>[] = [];
    mock.method(es.indices, 'getMapping', async () => ({ talks: { mappings: { properties: mode === 'missing' ? {} : { semantic: { type: 'semantic_text' } } } } }));
    mock.method(es, 'search', async (request: Record<string, unknown>) => {
      requests.push(request);
      if (request.index === INDEX.attendance) return { aggregations: { per_talk: { buckets: [] } }, hits: { hits: [] } };
      const semantic = JSON.stringify(request.query).includes('"semantic"');
      if (semantic && mode === 'failed') throw new Error('inference unavailable');
      return { hits: { hits: [{ _id: 'agent-talk', _source: talk, _score: 4 }] } };
    });
    try {
      const result = await discoverConference(input, null);
      assert.equal(result.sources.length, 1);
      assert.deepEqual(result.sources[0].session, { rooms: ['R203'], startsAt: talk.startsAt, endsAt: talk.endsAt, track: talk.track, speaker: 'Demo Speaker' });
      assert(result.sources[0].signals.keyword > 0);
      assert.equal(result.semantic, mode === 'ready');
      assert.equal(result.sources[0].signals.semantic > 0, mode === 'ready');
      assert.equal(result.warnings.length, mode === 'ready' ? 0 : 1);
      for (const request of requests.filter((r) => r.index === INDEX.talks)) {
        const query = request.query as { bool: { filter: unknown[] } };
        assert.deepEqual(query.bool.filter, [{ term: { eventId: 'conference-a' } }, { term: { tags: 'ai-agents' } }]);
      }
    } finally { mock.restoreAll(); }
  });
}

test('people retrieval applies consent and conference filters to both retrievers', async () => {
  const requests: Record<string, unknown>[] = [];
  mock.method(es.indices, 'getMapping', async () => ({ users: { mappings: { properties: { semantic: { type: 'semantic_text' } } } } }));
  mock.method(es, 'search', async (request: Record<string, unknown>) => {
    requests.push(request);
    return { hits: { hits: [] } };
  });
  try {
    await discoverConference({ ...input, kind: 'people', tag: '' }, null);
    assert.equal(requests.length, 2);
    for (const request of requests) {
      const query = request.query as { bool: { filter: unknown[] } };
      assert.deepEqual(query.bool.filter, [{ term: { discoveryOptIn: true } }, { term: { eventIds: 'conference-a' } }]);
    }
  } finally { mock.restoreAll(); }
});

for (const scenario of ['success', 'bad-citation', 'refusal', 'http-error', 'network-error', 'empty-evidence'] as const) {
  test(`OpenAI grounded answer: ${scenario}`, async () => {
    const { answerConferenceQuestion } = await import('../lib/ai');
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-secret';
    let calls = 0;
    mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init.body));
      assert.equal(body.store, false);
      assert(body.input.includes('Synthetic evidence'));
      assert(body.instructions.includes('Talks, then People'));
      assert(!body.input.includes('test-secret'));
      if (scenario === 'network-error') throw new Error('timeout');
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [
        scenario === 'refusal' ? { type: 'refusal', refusal: 'Unable to answer' } :
        { type: 'output_text', text: scenario === 'bad-citation' ? 'Agents [S999]' : 'Agents [S1]' },
      ] }] }), { status: scenario === 'http-error' ? 429 : 200 });
    });
    try {
      const source = { id: 'test-talk', citation: 'S1', kind: 'talk' as const, title: 'Demo', excerpt: 'Synthetic evidence', href: '/talks/test-talk', tags: [], attendees: 0,
        signals: { keyword: 1, semantic: 0, interests: 0, popularity: 0, social: 0 } };
      const result = await answerConferenceQuestion('Which agent talks?', scenario === 'empty-evidence' ? [] : [source]);
      assert.equal(result.generation, scenario === 'success' ? 'openai' : 'extractive');
      assert.equal(calls, scenario === 'empty-evidence' ? 0 : 1);
    } finally {
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
      mock.restoreAll();
    }
  });
}
