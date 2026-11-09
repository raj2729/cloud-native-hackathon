import './env';
import { setTimeout as delay } from 'node:timers/promises';
import { EVENT_ID } from '../lib/demo-data';

const EXAMPLES = [
  { query: 'Talks about autonomous AI agents', kind: 'talks' },
  { query: 'People working on computer vision and robotics', kind: 'people' },
  { query: 'Hybrid search and retrieval augmented generation', kind: 'all' },
  { query: 'Platform engineering and Kubernetes', kind: 'talks' },
  { query: 'Engineers building accessible web applications', kind: 'people' },
  { query: 'What are people interested in robotics attending?', kind: 'all' },
];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('npm run traffic:search -- [--count=20] [--concurrency=2] [--delay=1500] [--url=http://localhost:3101] [--event=devconf-2026] [--rag]');
    console.log('Runs real measured searches. --rag also calls the configured answer model. Ctrl+C stops the run.');
    return;
  }
  const recognised = ['--count=', '--concurrency=', '--delay=', '--url=', '--event='];
  for (const arg of args) if (arg !== '--rag' && !recognised.some((key) => arg.startsWith(key))) throw new Error(`Unknown option: ${arg.split('=')[0]}. Use --help.`);
  const option = (key: string, fallback: string): string => args.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
  const integer = (key: string, fallback: number, min: number, max: number): number => {
    const value = Number(option(key, String(fallback)));
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`--${key} must be an integer from ${min} to ${max}`);
    return value;
  };
  const count = integer('count', 20, 1, 100);
  const concurrency = integer('concurrency', 2, 1, 5);
  const pause = integer('delay', 1500, 0, 60000);
  const rag = args.includes('--rag');
  const target = new URL(option('url', process.env.SEARCH_TRAFFIC_URL ?? 'http://localhost:3101'));
  if (target.username || target.password || target.search || target.hash || !['http:', 'https:'].includes(target.protocol)) throw new Error('Use an HTTP(S) app URL without credentials or query parameters.');
  if (target.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) throw new Error('Remote traffic requires HTTPS to protect the admin credential.');
  const token = process.env.ADMIN_ACCESS_TOKEN;
  if (!token) throw new Error('Set ADMIN_ACCESS_TOKEN in .env.local to match the running app.');
  const endpoint = new URL('/api/admin/search-traffic', target);
  const abort = new AbortController();
  const stop = (): void => abort.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  let next = 0; let completed = 0; let failed = 0; let fallbacks = 0;
  console.log(`Sending ${count} real ${rag ? 'search + RAG' : 'search-only'} requests to ${target.origin}; concurrency ${concurrency}, pause ${pause}ms per worker.`);
  console.log(rag ? 'Uses Elasticsearch inference and the configured answer model; normal provider usage applies.' : 'Uses Elasticsearch keyword and semantic retrieval. Add --rag to exercise answer generation.');
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, count) }, async () => {
      while (!abort.signal.aborted) {
        const index = next++;
        if (index >= count) return;
        const example = EXAMPLES[index % EXAMPLES.length];
        const started = performance.now();
        try {
          const response = await fetch(endpoint, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...example, eventId: option('event', EVENT_ID), tag: '', assistant: rag }),
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(60000)]), redirect: 'error',
          });
          if (!response.ok) {
            failed++;
            console.log(`[${index + 1}/${count}] HTTP ${response.status}${response.status === 401 ? ' — check ADMIN_ACCESS_TOKEN and restart the app' : ''}`);
            if (response.status === 401 || response.status === 404) { abort.abort(); return; }
          } else {
            const result = await response.json() as { sources: number; generation: string };
            completed++;
            if (result.generation === 'extractive') fallbacks++;
            console.log(`[${index + 1}/${count}] ${example.kind}: ${result.sources} sources · ${Math.round(performance.now() - started)}ms · ${result.generation}`);
          }
        } catch {
          if (abort.signal.aborted) return;
          failed++; console.log(`[${index + 1}/${count}] Request failed or timed out`);
        }
        if (next < count && !abort.signal.aborted) {
          try { await delay(pause, undefined, { signal: abort.signal }); } catch { return; }
        }
      }
    }));
    console.log(`Finished: ${completed} completed, ${failed} failed, ${fallbacks} excerpt fallbacks${abort.signal.aborted ? ' (stopped early)' : ''}. Open /admin; Dash0 metrics export every 10 seconds.`);
    if (failed) process.exitCode = 1;
  } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Traffic run failed'); process.exitCode = 1; });
