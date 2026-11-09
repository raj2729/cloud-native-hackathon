/**
 * Paired latency A/B between two running builds of the app.
 *
 * Each worker repeatedly picks a page and an attendee, then requests that page
 * from BOTH builds back to back in random order. Because every base sample has a
 * head sample taken under the same machine load a moment apart, ~25 seconds of
 * traffic is enough to detect a real p95 shift — no long sequential windows and
 * no wait for telemetry ingestion.
 *
 *   npx tsx scripts/latency-ab.ts --base http://localhost:3000 --head http://localhost:3001 \
 *     --seconds 25 --workers 10 --out ab.json
 *
 * Writes { base: {op: stats}, head: {op: stats} } for scripts/deploy-gate.ts
 * (GATE_RESULTS_FILE). Reads users and talks from ELASTICSEARCH_URL.
 */
import { writeFileSync } from 'node:fs';
import { es, hitsToDocs, INDEX } from '../lib/es';
import type { Talk, User } from '../lib/types';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = arg('base', 'http://localhost:3000').replace(/\/$/, '');
const HEAD = arg('head', 'http://localhost:3001').replace(/\/$/, '');
const SECONDS = Number.parseFloat(arg('seconds', '25'));
const WARMUP_SECONDS = Number.parseFloat(arg('warmup', '4'));
const WORKERS = Number.parseInt(arg('workers', '10'), 10);
const OUT = arg('out', 'latency-ab.json');

type Build = 'base' | 'head';

/** Pages an attendee visits; the route template is the operation name. */
const ROUTES: { op: string; path: (talks: Talk[]) => string }[] = [
  { op: 'GET /', path: () => '/' },
  { op: 'GET /agenda', path: () => '/agenda' },
  { op: 'GET /people', path: () => '/people' },
  { op: 'GET /live', path: () => '/live' },
  { op: 'GET /talks/[id]', path: (talks) => `/talks/${pick(talks).id}` },
];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

const samples: Record<Build, Map<string, number[]>> = { base: new Map(), head: new Map() };
let errors = 0;

async function timed(build: Build, origin: string, op: string, path: string, userId: string, record: boolean) {
  const started = performance.now();
  try {
    const res = await fetch(`${origin}${path}${path.includes('?') ? '&' : '?'}synthetic=1`, {
      headers: {
        cookie: `actingAs=${userId}; a11y_input=pointer`,
        'x-traffic-source': 'latency-ab',
        'user-agent': 'confluence-latency-ab',
      },
      redirect: 'manual',
    });
    await res.arrayBuffer();
    if (res.status >= 500) {
      errors += 1;
      return;
    }
  } catch {
    errors += 1;
    return;
  }
  if (!record) return;
  const list = samples[build].get(op) ?? [];
  list.push(performance.now() - started);
  samples[build].set(op, list);
}

async function worker(users: User[], talks: Talk[], until: number, record: boolean): Promise<void> {
  while (Date.now() < until) {
    const route = pick(ROUTES);
    const path = route.path(talks);
    const user = pick(users).id;
    const order: [Build, string][] = [
      ['base', BASE],
      ['head', HEAD],
    ];
    if (Math.random() < 0.5) order.reverse();
    for (const [build, origin] of order) await timed(build, origin, route.op, path, user, record);
  }
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

function stats(build: Build): Record<string, { p95Ms: number; p50Ms: number; samples: number }> {
  const out: Record<string, { p95Ms: number; p50Ms: number; samples: number }> = {};
  for (const [op, values] of samples[build]) {
    out[op] = { p95Ms: percentile(values, 95), p50Ms: percentile(values, 50), samples: values.length };
  }
  return out;
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

  // Warm-up: JIT, connection pools, first-render caches — not recorded.
  const warmUntil = Date.now() + WARMUP_SECONDS * 1000;
  await Promise.all(Array.from({ length: WORKERS }, () => worker(users, talks, warmUntil, false)));

  const startedAt = new Date();
  console.log(`A/B ${BASE} (base) vs ${HEAD} (head): ${WORKERS} workers for ${SECONDS}s…`);
  const until = Date.now() + SECONDS * 1000;
  await Promise.all(Array.from({ length: WORKERS }, () => worker(users, talks, until, true)));

  const result = { startedAt: startedAt.toISOString(), seconds: SECONDS, errors, base: stats('base'), head: stats('head') };
  writeFileSync(OUT, JSON.stringify(result, null, 2));

  for (const op of Object.keys(result.head).sort()) {
    const b = result.base[op];
    const h = result.head[op];
    console.log(
      `${op.padEnd(18)} p95 ${Math.round(b?.p95Ms ?? 0)}ms → ${Math.round(h.p95Ms)}ms  (n=${b?.samples ?? 0}/${h.samples})`,
    );
  }
  console.log(`${errors} errors. Results → ${OUT}`);
  if (errors > 0 && Object.keys(result.head).length === 0) process.exit(1);
}

main().catch((err) => {
  console.error('Latency A/B failed:', err?.meta?.body?.error ?? err);
  process.exit(1);
});
