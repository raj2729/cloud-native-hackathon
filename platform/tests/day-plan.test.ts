import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { selectDaySessions, matchSessionPeople, fallbackDayNarrative } from '../lib/day-plan';
import { generateDayPlanNarrative } from '../lib/ai';
import { prepareDayPlan } from '../lib/day-plan-service';
import { es } from '../lib/es';
import { dayPlanCalendar } from '../lib/calendar';
import type { User, RankedTalk } from '../lib/types';

const viewer: User = { id: 'viewer', name: 'Demo Viewer', headline: 'Agent engineer', summary: 'Building retrieval and tool-using assistants.', interests: ['ai-agents', 'llms', 'rag', 'python', 'evals'], derivedTags: [], avatarSeed: 'viewer', isSeeded: false, links: {}, profileText: 'Agent engineer', createdAt: '2026-11-09T00:00:00Z' };
function talk(id: string, start: string, end: string, score: number, tags = ['ai-agents']): RankedTalk {
  return { talk: { id, eventId: 'event', title: id, abstract: 'Learn to build and evaluate reliable systems.', tags, rooms: ['R203'], track: 'AI', startsAt: `2026-11-09T${start}:00Z`, endsAt: `2026-11-09T${end}:00Z`, speaker: { name: 'Speaker', title: 'Engineer', company: 'Demo', bio: '', photoUrl: '', linkedin: '', github: '' }, createdAt: '2026-11-01T00:00:00Z' }, score, matchedInterests: [], signals: { tags: true, keyword: true, semantic: false } };
}
const ranked = [talk('long', '09:00', '10:30', 90), talk('first', '09:00', '09:40', 60), talk('second', '09:45', '10:30', 60), talk('third', '10:30', '11:00', 50)];

test('day plan maximises relevance without overlapping variable-length sessions', () => {
  const result = selectDaySessions(ranked, viewer, 'event', '2026-11-09', new Set());
  assert.deepEqual(result.sessions.map((session) => session.talk.id), ['first', 'second', 'third']);
  for (let i = 1; i < result.sessions.length; i++) assert(Date.parse(result.sessions[i - 1].talk.endsAt) <= Date.parse(result.sessions[i].talk.startsAt));
});

test('saved choices take priority and overlapping saved alternatives are surfaced', () => {
  const saved = selectDaySessions(ranked, viewer, 'event', '2026-11-09', new Set(['long']));
  assert.deepEqual(saved.sessions.map((session) => session.talk.id), ['long', 'third']);
  const result = selectDaySessions(ranked, viewer, 'event', '2026-11-09', new Set(['long', 'first']));
  assert.deepEqual(result.sessions.map((session) => session.talk.id), ['first', 'second', 'third']);
  assert.deepEqual(result.conflictingSaved.map((session) => session.id), ['long']);
});

test('extra goals change slot choice and do not alter the five profile interests', () => {
  const options = [talk('agents', '09:00', '10:00', 50), talk('robots', '09:00', '10:00', 45, ['robotics'])];
  assert.equal(selectDaySessions(options, viewer, 'event', '2026-11-09', new Set()).sessions[0].talk.id, 'agents');
  const result = selectDaySessions(options, viewer, 'event', '2026-11-09', new Set(), ['robotics']);
  assert.equal(result.sessions[0].talk.id, 'robots');
  assert.match(result.sessions[0].whyAttend, /extra goals/);
  assert.equal(viewer.interests.length, 5);
});

test('plans exclude other conferences, other days and invalid or backwards times', () => {
  const invalid = [
    { ...ranked[0], talk: { ...ranked[0].talk, eventId: 'other' } },
    { ...ranked[0], talk: { ...ranked[0].talk, startsAt: '2026-11-10T09:00:00Z' } },
    talk('bad-time', '11:00', '10:00', 100),
    { ...ranked[0], talk: { ...ranked[0].talk, startsAt: 'bad timestamp' } },
  ];
  assert.equal(selectDaySessions(invalid, viewer, 'event', '2026-11-09', new Set()).sessions.length, 0);
});

test('introductions require opt-in, same conference, actual session attendance, shared topics and exclude self', () => {
  const eligible = { ...viewer, id: 'eligible', name: 'Eligible', discoveryOptIn: true, eventIds: ['event'] };
  const candidates = [eligible, { ...eligible, id: 'no-consent', discoveryOptIn: false }, { ...eligible, id: 'other-event', eventIds: ['other'] }, { ...eligible, id: 'not-attending' }, { ...eligible, id: 'unrelated', interests: ['security'] as User['interests'] }, { ...eligible, id: viewer.id }];
  const attendance = new Map(candidates.filter((candidate) => candidate.id !== 'not-attending').map((candidate) => [candidate.id, 'saved' as const]));
  const matches = matchSessionPeople(viewer, candidates, attendance, 'event');
  assert.deepEqual(matches.map((person) => person.id), ['eligible']);
  assert.equal(matches[0].attendance, 'saved');
  assert(matches[0].sharedTopics.includes('ai-agents'));
  assert(!('links' in matches[0]));
});

for (const mode of ['valid', 'wrong-person', 'wrong-talk', 'incomplete', 'api-failure'] as const) {
  test(`day-plan AI ${mode} preserves the evidence-selected schedule and people`, async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key';
    const selected = selectDaySessions([ranked[1]], viewer, 'event', '2026-11-09', new Set()).sessions;
    const fallback = fallbackDayNarrative(viewer, selected);
    mock.method(globalThis, 'fetch', async (_url: string, request: RequestInit) => {
      const input = JSON.parse(String(request.body));
      assert.equal(input.store, false);
      assert.equal(input.text.format.strict, true);
      assert(!input.input.includes('test-key'));
      const narrative = { summary: 'You will explore reliable agent systems.', learningGoals: ['Evaluate tool-using systems.'], sessions: [{ talkId: mode === 'wrong-talk' ? 'invented-talk' : 'first', whyAttend: 'Matches your agent work.', learningOutcome: 'Learn reliable systems.', people: mode === 'wrong-person' ? [{ userId: 'invented-person', whyMeet: 'Invented', conversationStarter: 'Hello' }] : [] }] };
      return new Response(JSON.stringify({ status: mode === 'incomplete' ? 'incomplete' : 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(narrative) }] }] }), { status: mode === 'api-failure' ? 429 : 200 });
    });
    try {
      const result = await generateDayPlanNarrative(viewer, '', selected, fallback);
      assert.equal(result.source, mode === 'valid' ? 'openai' : 'profile');
      assert.deepEqual(result.sessions.map((session) => session.talkId), ['first']);
      assert.equal(result.sessions[0].people.length, 0);
    } finally { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; mock.restoreAll(); }
  });
}

test('plan cache is private, reused without a model call, and invalidates when goals change', async () => {
  const event = { id: 'event', name: 'Demo', slug: 'demo', venue: 'Demo', description: '', startsAt: '2026-11-09T09:00:00Z', endsAt: '2026-11-09T18:00:00Z', rooms: [], createdAt: '2026-11-01T00:00:00Z' };
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  let writes: User['dayPlanCache']; let modelCalls = 0;
  mock.method(es, 'search', async () => ({ aggregations: { sessions: { buckets: [] } } }));
  mock.method(es, 'update', async (request: { doc: { dayPlanCache: NonNullable<User['dayPlanCache']> } }) => { writes = request.doc.dayPlanCache; return {}; });
  mock.method(globalThis, 'fetch', async () => { modelCalls++; throw new Error('unavailable'); });
  try {
    const preferences = { eventId: 'event', date: '2026-11-09', notes: 'Private project goal' };
    await prepareDayPlan({ ...viewer, planningPreferences: preferences }, event, { ranked: [ranked[1]], savedIds: new Set(), generate: true });
    assert(writes);
    assert(!JSON.stringify(writes).includes('Private project goal'));
    const cached = await prepareDayPlan({ ...viewer, planningPreferences: preferences, dayPlanCache: writes }, event, { ranked: [ranked[1]], savedIds: new Set() });
    assert.equal(cached.plan.needsRefresh, false);
    assert.equal(modelCalls, 1);
    const changed = await prepareDayPlan({ ...viewer, planningPreferences: { ...preferences, notes: 'A different goal' }, dayPlanCache: writes }, event, { ranked: [ranked[1]], savedIds: new Set() });
    assert.equal(changed.plan.needsRefresh, true);
    assert.equal(modelCalls, 1);
  } finally { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; mock.restoreAll(); }
});


test('calendar preserves times and safely escapes and folds Unicode titles', () => {
  const sessions = selectDaySessions([ranked[1]], viewer, 'event', '2026-11-09', new Set()).sessions;
  sessions[0].talk.title = 'Security, dependencies; ' + 'é'.repeat(100) + '\nEND:VEVENT';
  const event = { id: 'event', name: 'Demo', slug: 'demo', venue: 'Hall', description: '', startsAt: '', endsAt: '', rooms: [], createdAt: '' };
  const narrative = fallbackDayNarrative(viewer, sessions);
  const plan = { date: '2026-11-09', notes: 'private extra goals', summary: narrative.summary, learningGoals: narrative.learningGoals, sessions, conflictingSaved: [], narrativeSource: 'profile' as const, needsRefresh: false };
  const calendar = dayPlanCalendar(plan, event, viewer.id);
  const unfolded = calendar.replace(/\r\n /g, '');
  assert.match(unfolded, /DTSTART:20261109T090000Z/);
  assert.match(unfolded, /DTEND:20261109T094000Z/);
  assert(unfolded.includes('Security\\, dependencies\\; '));
  assert(unfolded.includes('\\nEND:VEVENT'));
  assert.equal(calendar.split('\r\nEND:VEVENT\r\n').length - 1, 1);
  assert(!calendar.includes(plan.notes));
  for (const line of calendar.split('\r\n')) assert(Buffer.byteLength(line) <= 75);
  const uid = unfolded.match(/UID:(.*)/)?.[1];
  assert.equal(uid, dayPlanCalendar(plan, event, viewer.id).replace(/\r\n /g, '').match(/UID:(.*)/)?.[1]);
  assert.notEqual(uid, dayPlanCalendar(plan, event, 'another-user').replace(/\r\n /g, '').match(/UID:(.*)/)?.[1]);
});
