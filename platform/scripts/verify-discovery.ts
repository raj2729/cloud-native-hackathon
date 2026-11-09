import './env';
import assert from 'node:assert/strict';
import { discoverConference } from '../lib/search';
import { answerConferenceQuestion } from '../lib/ai';
import { es, INDEX } from '../lib/es';
import { EVENT_ID } from '../lib/demo-data';
import type { User } from '../lib/types';

async function main(): Promise<void> {
  const base = { query: 'autonomous AI agents', kind: 'all' as const, eventId: EVENT_ID, tag: '', assistant: false };
  const results = await discoverConference(base, null);
  assert(results.semantic, 'Expected a working embedding retriever');
  assert(results.sources.some((s) => s.kind === 'talk' && s.tags.includes('ai-agents')), 'Expected an agent talk');
  assert(results.sources.some((s) => s.signals.semantic > 0), 'Expected semantic contributions');
  console.log('✓ hybrid talk + people search and semantic contributions');

  const people = await discoverConference({ ...base, query: 'computer vision robotics', kind: 'people', tag: 'robotics' }, null);
  assert(people.sources.length > 0);
  assert(people.sources.every((s) => s.kind === 'person' && s.tags.includes('robotics')));
  for (const source of people.sources) {
    const doc = await es.get<User>({ index: INDEX.users, id: source.id });
    assert.equal(doc._source?.discoveryOptIn, true);
    assert(doc._source?.eventIds?.includes(EVENT_ID));
    assert(!('links' in source), 'Search must not return raw resume or links');
  }
  console.log('✓ skill, opt-in and conference filters; public source projection');

  const outside = await discoverConference({ ...base, eventId: 'nonexistent-conference' }, null);
  assert.equal(outside.sources.length, 0);
  console.log('✓ conference isolation');

  const attendance = await discoverConference({ ...base, query: 'What are people interested in robotics attending?', assistant: true }, null);
  assert(attendance.sources.some((s) => s.kind === 'talk' && s.excerpt.includes('Matched attendees')));
  console.log('✓ multi-hop people → attendance → talks evidence');

  const answer = await answerConferenceQuestion(base.query, results.sources);
  assert(answer.answer.includes('[S'));
  assert.match(answer.answer, /^Talks$/m);
  assert.match(answer.answer, /^People$/m);
  assert(results.sources.filter((source) => source.kind === 'talk').every((source) => source.session?.rooms.length));
  if (process.env.OPENAI_API_KEY && process.env.AI_ENABLED !== 'false') {
    assert.equal(answer.generation, 'openai', 'Configured OpenAI must generate a cited answer, rather than silently falling back');
  }
  console.log(`✓ cited assistant answer (${answer.generation})`);
  const empty = await answerConferenceQuestion('unknown', []);
  assert.equal(empty.generation, 'extractive');
  assert(empty.answer.includes('could not find'));
  console.log('✓ empty-evidence fallback');
  await es.close();
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
