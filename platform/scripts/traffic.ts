/**
 * Synthetic attendee traffic through the real app, so every request exercises
 * the instrumented code paths and Dash0 has something real to show.
 *
 * Unlike `simulate.ts` (which writes check-ins straight into Elasticsearch to
 * make /live move), this goes through the Next.js server: page renders, ranking
 * queries, Claude rationales and all. Each worker acts as a random attendee via
 * the `actingAs` cookie and a random input mode via `a11y_input`, so the
 * keyboard-vs-pointer split in Dash0 has data behind it.
 *
 * Every URL carries `?synthetic=1` so this traffic is clearly labelled.
 *
 *   npm run traffic                          # 4 workers against localhost:3000
 *   npm run traffic -- --workers 8 --base http://localhost:3000
 *   npm run traffic -- --once                # one pass per worker, then exit
 */
import { es, hitsToDocs, INDEX } from '../lib/es';
import type { Talk, User } from '../lib/types';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = arg('base', process.env.TRAFFIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const WORKERS = Number.parseInt(arg('workers', '4'), 10);
const ONCE = process.argv.includes('--once');
const PAUSE_MIN_MS = 400;
const PAUSE_MAX_MS = 2500;

type InputMode = 'keyboard' | 'pointer' | 'touch';

/** Roughly the share of people who navigate primarily by keyboard in our scenario. */
function randomInputMode(): InputMode {
  const roll = Math.random();
  if (roll < 0.3) return 'keyboard';
  if (roll < 0.95) return 'pointer';
  return 'touch';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

interface Stats {
  requests: number;
  errors: number;
  totalMs: number;
  byStatus: Map<number, number>;
}

const stats: Stats = { requests: 0, errors: 0, totalMs: 0, byStatus: new Map() };

async function visit(path: string, userId: string, mode: InputMode): Promise<void> {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}synthetic=1`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        cookie: `actingAs=${userId}; a11y_input=${mode}`,
        'x-traffic-source': 'generator',
        'user-agent': 'confluence-traffic-generator',
      },
      redirect: 'manual',
    });
    await res.arrayBuffer();
    stats.byStatus.set(res.status, (stats.byStatus.get(res.status) ?? 0) + 1);
    if (res.status >= 500) stats.errors += 1;
  } catch {
    stats.errors += 1;
  } finally {
    stats.requests += 1;
    stats.totalMs += Date.now() - started;
  }
}

/** One attendee session: land, look at the agenda, maybe people, a talk or two, maybe /live. */
async function session(users: User[], talks: Talk[]): Promise<void> {
  const user = pick(users);
  const mode = randomInputMode();
  const steps: string[] = ['/agenda'];
  if (Math.random() < 0.7) steps.push('/people');
  const talkViews = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < talkViews; i++) steps.push(`/talks/${pick(talks).id}`);
  if (Math.random() < 0.5) steps.push('/live');
  if (Math.random() < 0.2) steps.push('/');

  for (const path of steps) {
    await visit(path, user.id, mode);
    await sleep(PAUSE_MIN_MS + Math.random() * (PAUSE_MAX_MS - PAUSE_MIN_MS));
  }
}

async function worker(users: User[], talks: Talk[], stop: () => boolean): Promise<void> {
  do {
    await session(users, talks);
  } while (!ONCE && !stop());
}

async function main(): Promise<void> {
  const [userRes, talkRes] = await Promise.all([
    es.search<Omit<User, 'id'>>({ index: INDEX.users, size: 2000, query: { match_all: {} } }),
    es.search<Omit<Talk, 'id'>>({ index: INDEX.talks, size: 200, query: { match_all: {} } }),
  ]);
  const users = hitsToDocs(userRes.hits.hits);
  const talks = hitsToDocs(talkRes.hits.hits);
  if (users.length === 0 || talks.length === 0) {
    console.error('No users or talks found. Run `npm run es:seed` first.');
    process.exit(1);
  }

  console.log(`Traffic → ${BASE} with ${WORKERS} workers, ${users.length} users, ${talks.length} talks.`);
  console.log('Ctrl-C to stop.\n');

  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
    console.log('\nStopping after current sessions…');
  });

  const report = setInterval(() => {
    const avg = stats.requests ? Math.round(stats.totalMs / stats.requests) : 0;
    const statuses = [...stats.byStatus.entries()].map(([s, n]) => `${s}:${n}`).join(' ');
    process.stdout.write(
      `\r${stats.requests} requests · ${stats.errors} errors · avg ${avg}ms · ${statuses}    `,
    );
  }, 2000);

  await Promise.all(Array.from({ length: WORKERS }, () => worker(users, talks, () => stopping)));
  clearInterval(report);
  console.log(`\nDone. ${stats.requests} requests, ${stats.errors} errors.`);
}

main().catch((err) => {
  console.error('Traffic generator failed:', err?.meta?.body?.error ?? err);
  process.exit(1);
});
