import { Client } from '@elastic/elasticsearch';

/**
 * Elasticsearch is the only datastore in this app. Every read and write goes
 * through this client so there is a single place to configure it.
 */
const globalForEs = globalThis as unknown as { esClient?: Client };

export const ES_NODE = process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200';

export const es: Client =
  globalForEs.esClient ??
  new Client({
    node: ES_NODE,
    requestTimeout: 30_000,
    maxRetries: 2,
  });

if (process.env.NODE_ENV !== 'production') globalForEs.esClient = es;

export const INDEX = {
  events: 'events',
  talks: 'talks',
  users: 'users',
  attendance: 'attendance',
} as const;

/** Name of the inference endpoint backing every `semantic_text` field. */
export const INFERENCE_ID = 'e5-small';

/**
 * True when the e5 inference endpoint is deployed and serving. Ranking adds a
 * semantic term only when this is true, so the app stays fully functional on
 * tag-overlap + BM25 alone if the model never finishes deploying.
 */
let semanticCache: { value: boolean; checkedAt: number } | null = null;
const SEMANTIC_CACHE_MS = 15_000;

export async function semanticReady(): Promise<boolean> {
  const now = Date.now();
  if (semanticCache && now - semanticCache.checkedAt < SEMANTIC_CACHE_MS) {
    return semanticCache.value;
  }

  let value = false;
  try {
    const mapping = await es.indices.getMapping({ index: INDEX.talks });
    const props = Object.values(mapping)[0]?.mappings?.properties ?? {};
    // The field only exists in the mapping when setup-es.ts was able to create
    // the inference endpoint.
    value = 'semantic' in props;
  } catch {
    value = false;
  }

  semanticCache = { value, checkedAt: now };
  return value;
}

/** Forget the cached semantic-readiness probe (used right after setup/seed). */
export function resetSemanticCache(): void {
  semanticCache = null;
}

/**
 * The client types `_id` and `_source` as optional on every hit. These helpers
 * narrow once, so call sites get a document with a guaranteed `id` instead of
 * repeating the same two guards everywhere.
 */
export interface RawHit<T> {
  _id?: string;
  _source?: T;
  _score?: number | null;
}

export function hitToDoc<T>(hit: RawHit<T>): (T & { id: string }) | null {
  if (!hit._id || !hit._source) return null;
  return { id: hit._id, ...hit._source };
}

export function hitsToDocs<T>(hits: RawHit<T>[]): (T & { id: string })[] {
  return hits
    .map((hit) => hitToDoc(hit))
    .filter((doc): doc is T & { id: string } => doc !== null);
}

/** Same, but keeps the relevance score for blended ranking. */
export function hitsToScoredDocs<T>(
  hits: RawHit<T>[],
): (T & { id: string; _score: number })[] {
  return hits
    .map((hit) => {
      const doc = hitToDoc(hit);
      return doc ? { ...doc, _score: hit._score ?? 0 } : null;
    })
    .filter((doc): doc is T & { id: string; _score: number } => doc !== null);
}
