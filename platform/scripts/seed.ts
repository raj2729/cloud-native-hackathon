/**
 * Seeds the demo dataset: one conference, 24 talks, 12 speakers, 20 curated
 * personas in four interest clusters, ~80 crowd attendees so room counts look
 * real, and attendance records shaped so the live dashboard is already alive the
 * moment you open it.
 *
 * The schedule is computed relative to "now", so one slot is always live.
 *
 *   npx tsx scripts/seed.ts          # curated tags, deterministic enrichment
 *   npx tsx scripts/seed.ts --ai     # also run Claude profile enrichment
 *
 * Safe to re-run: it deletes and rewrites the demo documents.
 */
import { es, INDEX, resetSemanticCache } from '../lib/es';
import { EVENT_ID, PERSONAS, ROOMS, SPEAKERS, TALKS } from '../lib/demo-data';
import { TAXONOMY, type Interest } from '../lib/taxonomy';
import { enrichProfile, tagsFromKeywords } from '../lib/ai';
import type { Attendance, Event, Talk, User } from '../lib/types';

const USE_AI = process.argv.includes('--ai');

// --- Deterministic pseudo-randomness so re-seeding is reproducible ----------
let seedState = 1337;
function rand(): number {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

// --- Schedule ---------------------------------------------------------------
const SLOT_COUNT = 6;
const SLOT_STRIDE_MIN = 45;
const TALK_LENGTH_MIN = 40;
/** Slot 0 starts 150 minutes ago, which puts slot 3 live right now. */
const FIRST_SLOT_OFFSET_MIN = -150;
/** The slot that is currently running. */
const LIVE_SLOT = 3;

const NOW = Date.now();
const MIN = 60_000;

function slotStart(slot: number): Date {
  return new Date(NOW + (FIRST_SLOT_OFFSET_MIN + slot * SLOT_STRIDE_MIN) * MIN);
}
function slotEnd(slot: number): Date {
  return new Date(slotStart(slot).getTime() + TALK_LENGTH_MIN * MIN);
}

// --- Crowd attendees --------------------------------------------------------
const CLUSTER_INTERESTS: Record<string, Interest[]> = {
  'AI infrastructure': [
    'ai-agents',
    'llms',
    'rag',
    'vector-search',
    'evals',
    'ml-ops',
    'prompt-engineering',
    'fine-tuning',
    'search-relevance',
  ],
  'Platform & observability': [
    'observability',
    'kubernetes',
    'platform-eng',
    'ci-cd',
    'devex',
    'cost-optimization',
    'streaming',
    'serverless',
    'go',
  ],
  Security: [
    'security',
    'appsec',
    'supply-chain',
    'identity',
    'cryptography',
    'testing',
    'architecture',
  ],
  'Product engineering': [
    'frontend',
    'design-systems',
    'accessibility',
    'performance',
    'typescript',
    'product',
    'api-design',
    'mobile',
  ],
};

const FIRST_NAMES = [
  'Alex', 'Rin', 'Noor', 'Ivan', 'Chloe', 'Omar', 'Yuki', 'Hana', 'Dev', 'Lucia',
  'Theo', 'Amara', 'Pieter', 'Siya', 'Tariq', 'Elena', 'Kofi', 'Mira', 'Soren', 'Nia',
  'Bo', 'Farah', 'Jesse', 'Anya', 'Rohan', 'Clara', 'Tobias', 'Isla', 'Viktor', 'Zoya',
];
const LAST_NAMES = [
  'Whitfield', 'Okafor', 'Berglund', 'Mahtani', 'Costa', 'Yamada', 'Dubois', 'Keller',
  'Nowak', 'Ibrahim', 'Fontaine', 'Sandoval', 'Larsen', 'Mwangi', 'Rossi', 'Haas',
  'Krishnan', 'Albright', 'Duarte', 'Sorensen',
];
const COMPANIES = [
  'Northwind Labs', 'Helio Systems', 'Fernpath', 'Granite Payments', 'Atlas Mobility',
  'Tsuru Data', 'Lumen Retail', 'Brightpath', 'Cobalt Health', 'Meridian Insurance',
  'Steeple', 'Civic Digital Service', 'Tidewater Logistics', 'Vantage Freight',
];
const ROLES = [
  'Senior Engineer', 'Staff Engineer', 'Engineering Manager', 'Platform Engineer',
  'Backend Engineer', 'Site Reliability Engineer', 'Product Engineer', 'Tech Lead',
];

const CROWD_SIZE = 80;

interface SeedUser extends Omit<User, 'id'> {
  id: string;
}

function buildProfileText(u: {
  name: string;
  headline: string;
  summary: string;
  interests: string[];
  derivedTags: string[];
  resumeText?: string;
}): string {
  return [
    u.headline,
    u.summary,
    u.resumeText ?? '',
    `Interests: ${u.interests.join(', ')}`,
    u.derivedTags.length ? `Also: ${u.derivedTags.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 4000);
}

function buildCrowd(): SeedUser[] {
  const clusters = Object.keys(CLUSTER_INTERESTS);
  const out: SeedUser[] = [];

  for (let i = 0; i < CROWD_SIZE; i++) {
    const cluster = clusters[i % clusters.length];
    const pool = CLUSTER_INTERESTS[cluster];
    const interests: Interest[] = [];
    // Three interests from their cluster plus two from anywhere. The crowd
    // exists to make room counts and collaborative filtering realistic, so it
    // should read as background density — if crowd profiles were as tightly
    // clustered as the hand-authored personas they would out-match them on raw
    // tag overlap and bury the people actually worth meeting.
    while (interests.length < 3) {
      const candidate = pick(pool);
      if (!interests.includes(candidate)) interests.push(candidate);
    }
    let guard = 0;
    while (interests.length < 5 && guard++ < 50) {
      const candidate = pick(TAXONOMY);
      if (!interests.includes(candidate)) interests.push(candidate);
    }
    while (interests.length < 5) {
      const unused = pool.filter((candidate) => !interests.includes(candidate));
      if (unused.length === 0) break;
      interests.push(pick(unused));
    }

    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    const company = pick(COMPANIES);
    const role = pick(ROLES);
    const headline = `${role} at ${company}`;
    const summary = `Works on ${interests
      .slice(0, 2)
      .map((s) => s.replace(/-/g, ' '))
      .join(' and ')} at ${company}.`;
    const handle = name.toLowerCase().replace(/[^a-z]+/g, '-');

    out.push({
      id: `crowd-${i + 1}`,
      name,
      headline,
      summary,
      interests,
      derivedTags: tagsFromKeywords(`${headline} ${summary}`, 3).filter(
        (t) => !interests.includes(t),
      ),
      cluster: `${cluster} (crowd)`,
      avatarSeed: handle,
      isSeeded: true,
      links: { linkedin: `https://linkedin.com/in/${handle}` },
      profileText: buildProfileText({
        name,
        headline,
        summary,
        interests,
        derivedTags: [],
      }),
      createdAt: new Date(NOW - randInt(2, 40) * 24 * 60 * MIN).toISOString(),
    });
  }
  return out;
}

// --- Documents --------------------------------------------------------------

function buildEvent(): Event {
  return {
    id: EVENT_ID,
    name: 'DevConf 2026',
    slug: 'devconf-2026',
    venue: 'Metropolitan Conference Centre, Hall A',
    description:
      'One day, four tracks, five rooms. Talks on AI retrieval, platform engineering, ' +
      'security and product engineering — plus the people worth meeting between them.',
    startsAt: slotStart(0).toISOString(),
    endsAt: slotEnd(SLOT_COUNT - 1).toISOString(),
    rooms: ROOMS.map((r) => ({ ...r })),
    createdAt: new Date(NOW - 30 * 24 * 60 * MIN).toISOString(),
  };
}

function buildTalks(withSemantic: boolean): Talk[] {
  const speakerByKey = new Map(SPEAKERS.map((s) => [s.key, s]));

  return TALKS.map((seed) => {
    const speaker = speakerByKey.get(seed.speaker);
    if (!speaker) throw new Error(`Unknown speaker key "${seed.speaker}" on talk "${seed.id}"`);

    const talk: Talk = {
      id: seed.id,
      eventId: EVENT_ID,
      title: seed.title,
      abstract: seed.abstract,
      tags: [...seed.tags],
      rooms: [...seed.rooms],
      track: seed.track,
      startsAt: slotStart(seed.slot).toISOString(),
      endsAt: slotEnd(seed.slot).toISOString(),
      speaker: {
        name: speaker.name,
        title: speaker.title,
        company: speaker.company,
        bio: speaker.bio,
        photoUrl: '',
        linkedin: speaker.linkedin,
        github: speaker.github,
      },
      createdAt: new Date(NOW - 20 * 24 * 60 * MIN).toISOString(),
    };
    if (withSemantic) {
      talk.semantic = `${talk.title}. ${talk.abstract} Topics: ${talk.tags.join(', ')}.`;
    }
    return talk;
  });
}

async function buildPersonas(withSemantic: boolean): Promise<SeedUser[]> {
  const out: SeedUser[] = [];

  for (const persona of PERSONAS) {
    let headline = persona.headline;
    let summary =
      persona.resumeText?.split('. ').slice(0, 2).join('. ') ??
      `Interested in ${persona.interests.map((i) => i.replace(/-/g, ' ')).join(', ')}.`;
    let derivedTags: string[] = tagsFromKeywords(
      `${persona.headline} ${persona.resumeText ?? ''}`,
      6,
    ).filter((t) => !persona.interests.includes(t));

    if (USE_AI) {
      const enriched = await enrichProfile({
        name: persona.name,
        interests: persona.interests,
        linkedin: persona.linkedin,
        github: persona.github,
        resumeText: persona.resumeText,
      });
      headline = enriched.headline || headline;
      summary = enriched.summary || summary;
      derivedTags = enriched.derivedTags.length ? enriched.derivedTags : derivedTags;
      process.stdout.write('.');
    }

    const user: SeedUser = {
      id: persona.id,
      name: persona.name,
      headline,
      summary,
      interests: persona.interests,
      derivedTags,
      cluster: persona.cluster,
      avatarSeed: persona.id,
      isSeeded: true,
      links: {
        linkedin: persona.linkedin,
        github: persona.github,
        resumeText: persona.resumeText,
      },
      profileText: buildProfileText({
        name: persona.name,
        headline,
        summary,
        interests: persona.interests,
        derivedTags,
        resumeText: persona.resumeText,
      }),
      createdAt: new Date(NOW - randInt(1, 25) * 24 * 60 * MIN).toISOString(),
    };
    if (withSemantic) user.semantic = user.profileText;
    out.push(user);
  }

  if (USE_AI) process.stdout.write('\n');
  return out;
}

/**
 * Attendance is generated from genuine tag overlap, so "people like you are
 * going to X" reflects the same signal the ranking uses.
 */
function buildAttendance(users: SeedUser[], talks: Talk[]): Attendance[] {
  const rows: Attendance[] = [];
  let n = 0;

  const slotOf = new Map(TALKS.map((t) => [t.id, t.slot]));

  for (const user of users) {
    const scored = talks
      .map((talk) => {
        const overlap = talk.tags.filter((tag) => user.interests.includes(tag as Interest)).length;
        const derived = talk.tags.filter((tag) => user.derivedTags.includes(tag)).length;
        return { talk, score: overlap * 3 + derived + rand() * 1.2 };
      })
      .filter((s) => s.score > 0.9)
      .sort((a, b) => b.score - a.score);

    const take = Math.min(scored.length, randInt(4, 7));

    for (let i = 0; i < take; i++) {
      const talk = scored[i].talk;
      const slot = slotOf.get(talk.id) ?? 0;
      const room = talk.rooms[0];

      // Everyone saves the talk at some point before the conference.
      rows.push({
        id: `att-${++n}`,
        userId: user.id,
        talkId: talk.id,
        eventId: EVENT_ID,
        room,
        state: 'saved',
        at: new Date(NOW - randInt(30, 4000) * MIN).toISOString(),
      });

      // Check-ins only for slots that have started.
      if (slot > LIVE_SLOT) continue;
      // Not everyone who saved a talk turns up.
      if (rand() > 0.78) continue;

      let at: number;
      if (slot === LIVE_SLOT) {
        // Spread across the last ~22 minutes so both trending windows have
        // data, but weighted towards the recent half: a room fills up over
        // time, so the newer window should be busier and trending velocity
        // should read positive before the simulator is even running.
        at = NOW - Math.floor(Math.pow(rand(), 2) * 22) * MIN;
      } else {
        at = slotStart(slot).getTime() + randInt(0, 12) * MIN;
      }

      rows.push({
        id: `att-${++n}`,
        userId: user.id,
        talkId: talk.id,
        eventId: EVENT_ID,
        room,
        state: 'checked_in',
        at: new Date(at).toISOString(),
      });
    }
  }

  // Give one live talk a deliberate spike in the most recent window so the
  // trending list has a clear, explainable leader during the demo.
  const liveTalks = talks.filter((t) => (slotOf.get(t.id) ?? -1) === LIVE_SLOT);
  const spiking = liveTalks[0];
  if (spiking) {
    const crowd = users.filter((u) => u.id.startsWith('crowd-'));
    for (let i = 0; i < 26 && i < crowd.length; i++) {
      rows.push({
        id: `att-${++n}`,
        userId: crowd[i].id,
        talkId: spiking.id,
        eventId: EVENT_ID,
        room: spiking.rooms[0],
        state: 'checked_in',
        at: new Date(NOW - randInt(0, 6) * MIN).toISOString(),
      });
    }
  }

  return rows;
}

// --- Indexing ---------------------------------------------------------------

async function hasSemanticField(index: string): Promise<boolean> {
  try {
    const mapping = await es.indices.getMapping({ index });
    const props = Object.values(mapping)[0]?.mappings?.properties ?? {};
    return 'semantic' in props;
  } catch {
    return false;
  }
}

async function bulkIndex<T extends { id: string }>(
  index: string,
  docs: T[],
  chunkSize = 25,
): Promise<void> {
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize);
    const operations = chunk.flatMap((doc) => {
      const { id, ...rest } = doc;
      return [{ index: { _index: index, _id: id } }, rest];
    });
    const res = await es.bulk({ operations, refresh: i + chunkSize >= docs.length });
    if (res.errors) {
      const firstError = res.items.find((item) => item.index?.error)?.index?.error;
      throw new Error(`Bulk index into "${index}" failed: ${JSON.stringify(firstError)}`);
    }
    process.stdout.write(`\r  ${index}: ${Math.min(i + chunkSize, docs.length)}/${docs.length}`);
  }
  process.stdout.write('\n');
}

async function clearIndex(index: string): Promise<void> {
  try {
    await es.deleteByQuery({ index, query: { match_all: {} }, refresh: true, conflicts: 'proceed' });
  } catch {
    // Index may not exist yet; setup-es.ts creates it.
  }
}

async function main(): Promise<void> {
  const health = await es.cluster.health({ wait_for_status: 'yellow', timeout: '30s' });
  console.log(`Cluster "${health.cluster_name}" is ${health.status}`);

  const [talksSemantic, usersSemantic] = await Promise.all([
    hasSemanticField(INDEX.talks),
    hasSemanticField(INDEX.users),
  ]);
  console.log(
    talksSemantic && usersSemantic
      ? 'Semantic fields present — embeddings will be generated at index time (this is the slow part).'
      : 'No semantic fields — seeding for tag-overlap + BM25 ranking only.',
  );

  const event = buildEvent();
  const talks = buildTalks(talksSemantic);
  const personas = await buildPersonas(usersSemantic);
  const crowd = buildCrowd();
  if (usersSemantic) for (const u of crowd) u.semantic = u.profileText;
  const users = [...personas, ...crowd];
  const attendance = buildAttendance(users, talks);

  console.log(
    `\nSeeding: 1 event, ${talks.length} talks, ${SPEAKERS.length} speakers, ` +
      `${personas.length} personas + ${crowd.length} crowd, ${attendance.length} attendance rows`,
  );

  for (const index of Object.values(INDEX)) await clearIndex(index);

  await bulkIndex(INDEX.events, [event]);
  await bulkIndex(INDEX.talks, talks, talksSemantic ? 8 : 25);
  await bulkIndex(INDEX.users, users, usersSemantic ? 8 : 50);
  await bulkIndex(INDEX.attendance, attendance, 200);

  resetSemanticCache();

  const live = talks.filter((t) => Date.parse(t.startsAt) <= NOW && Date.parse(t.endsAt) > NOW);
  console.log(`\nDone. Live right now: ${live.map((t) => t.title).join(' | ') || '(none)'}`);
  console.log(`Open http://localhost:3000/events/${EVENT_ID}`);
}

main().catch((err) => {
  console.error('\nSeed failed:', err?.meta?.body?.error ?? err);
  process.exit(1);
});
