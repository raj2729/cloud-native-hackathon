/**
 * Idempotent Elasticsearch setup: trial license, the e5 inference endpoint that
 * backs every `semantic_text` field, and the four index mappings.
 *
 * Safe to re-run. If the inference endpoint cannot be created (no ML capacity,
 * no license, model still downloading) the indices are still created without
 * the `semantic` field and the app runs on tag-overlap + BM25. Re-run this
 * script once the model is ready to add the field in place.
 *
 *   npx tsx scripts/setup-es.ts
 */
import { es, INDEX, INFERENCE_ID } from '../lib/es';
import type {
  MappingProperty,
  MappingTypeMapping,
} from '@elastic/elasticsearch/lib/api/types';

/** `semantic_text` carries an `inference_id` the generated types do not model. */
const SEMANTIC_FIELD = {
  type: 'semantic_text',
  inference_id: INFERENCE_ID,
} as unknown as MappingProperty;

const textWithKeyword: MappingProperty = {
  type: 'text',
  fields: { keyword: { type: 'keyword', ignore_above: 256 } },
};

const MAPPINGS: Record<string, MappingTypeMapping> = {
  [INDEX.events]: {
    properties: {
      name: textWithKeyword,
      slug: { type: 'keyword' },
      venue: { type: 'text' },
      description: { type: 'text' },
      startsAt: { type: 'date' },
      endsAt: { type: 'date' },
      rooms: {
        type: 'object',
        properties: {
          id: { type: 'keyword' },
          name: { type: 'keyword' },
          capacity: { type: 'integer' },
        },
      },
      createdAt: { type: 'date' },
    },
  },
  [INDEX.talks]: {
    properties: {
      eventId: { type: 'keyword' },
      title: textWithKeyword,
      abstract: { type: 'text' },
      tags: { type: 'keyword' },
      rooms: { type: 'keyword' },
      track: { type: 'keyword' },
      startsAt: { type: 'date' },
      endsAt: { type: 'date' },
      speaker: {
        type: 'object',
        properties: {
          name: textWithKeyword,
          title: { type: 'text' },
          company: textWithKeyword,
          bio: { type: 'text' },
          photoUrl: { type: 'keyword', index: false },
          linkedin: { type: 'keyword', index: false },
          github: { type: 'keyword', index: false },
        },
      },
      createdAt: { type: 'date' },
    },
  },
  [INDEX.users]: {
    properties: {
      name: textWithKeyword,
      headline: { type: 'text' },
      summary: { type: 'text' },
      interests: { type: 'keyword' },
      derivedTags: { type: 'keyword' },
      cluster: { type: 'keyword' },
      avatarSeed: { type: 'keyword', index: false },
      isSeeded: { type: 'boolean' },
      links: {
        type: 'object',
        properties: {
          linkedin: { type: 'keyword', index: false },
          github: { type: 'keyword', index: false },
          resumeText: { type: 'text' },
        },
      },
      profileText: { type: 'text' },
      createdAt: { type: 'date' },
    },
  },
  [INDEX.attendance]: {
    properties: {
      userId: { type: 'keyword' },
      talkId: { type: 'keyword' },
      eventId: { type: 'keyword' },
      room: { type: 'keyword' },
      state: { type: 'keyword' },
      at: { type: 'date' },
    },
  },
};

/** Indices that carry a `semantic_text` field when the model is available. */
const SEMANTIC_INDICES = [INDEX.talks, INDEX.users];

/** Fields whose text is concatenated into `semantic` at index time. */
async function startTrialLicense(): Promise<void> {
  try {
    const current = await es.license.get();
    if (current.license?.type === 'trial' || current.license?.type === 'platinum') {
      console.log(`✓ license: ${current.license.type}`);
      return;
    }
    await es.license.postStartTrial({ acknowledge: true });
    console.log('✓ license: trial started');
  } catch (err) {
    console.warn(`! license: could not start trial (${describe(err)})`);
    console.warn('  ML inference needs a trial license; semantic search will be skipped.');
  }
}

async function createInferenceEndpoint(): Promise<boolean> {
  try {
    const existing = await es.inference.get({ inference_id: INFERENCE_ID });
    if (existing.endpoints?.length) {
      console.log(`✓ inference endpoint "${INFERENCE_ID}" already exists`);
      return true;
    }
  } catch {
    // Not found — fall through and create it.
  }

  try {
    console.log(`… creating inference endpoint "${INFERENCE_ID}" (downloads .multilingual-e5-small)`);
    await es.inference.put({
      task_type: 'text_embedding',
      inference_id: INFERENCE_ID,
      inference_config: {
        service: 'elasticsearch',
        service_settings: {
          model_id: '.multilingual-e5-small',
          num_allocations: 1,
          num_threads: 1,
        },
      },
    });
    console.log(`✓ inference endpoint "${INFERENCE_ID}" created`);
    return true;
  } catch (err) {
    console.warn(`! inference endpoint not created: ${describe(err)}`);
    console.warn('  Continuing without semantic search — re-run this script later to add it.');
    return false;
  }
}

async function ensureIndex(name: string, semantic: boolean): Promise<void> {
  const mappings: MappingTypeMapping = structuredClone(MAPPINGS[name]);
  if (semantic && SEMANTIC_INDICES.includes(name as (typeof SEMANTIC_INDICES)[number])) {
    mappings.properties!.semantic = SEMANTIC_FIELD;
  }

  const exists = await es.indices.exists({ index: name });
  if (!exists) {
    await es.indices.create({
      index: name,
      mappings,
      settings: { number_of_shards: 1, number_of_replicas: 0 },
    });
    console.log(`✓ created index "${name}"${mappings.properties!.semantic ? ' (+semantic)' : ''}`);
    return;
  }

  // Index exists. Adding a new field to an existing mapping is allowed, so this
  // is how a later run upgrades an index once the model finally deploys.
  if (!mappings.properties!.semantic) {
    console.log(`✓ index "${name}" exists`);
    return;
  }

  const mapping = await es.indices.getMapping({ index: name });
  const props = Object.values(mapping)[0]?.mappings?.properties ?? {};
  if ('semantic' in props) {
    console.log(`✓ index "${name}" exists (+semantic)`);
    return;
  }

  try {
    await es.indices.putMapping({ index: name, properties: { semantic: SEMANTIC_FIELD } });
    console.log(`✓ index "${name}": added semantic field — re-run seed to backfill`);
  } catch (err) {
    console.warn(`! index "${name}": could not add semantic field (${describe(err)})`);
  }
}

function describe(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const anyErr = err as { message?: string; meta?: { body?: { error?: { reason?: string } } } };
    return anyErr.meta?.body?.error?.reason ?? anyErr.message ?? String(err);
  }
  return String(err);
}

async function waitForCluster(attempts = 30): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const health = await es.cluster.health({ wait_for_status: 'yellow', timeout: '5s' });
      console.log(`✓ cluster "${health.cluster_name}" is ${health.status}`);
      return;
    } catch {
      process.stdout.write('.');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Elasticsearch did not become available — is `docker compose up -d` running?');
}

async function main(): Promise<void> {
  await waitForCluster();
  await startTrialLicense();
  const semantic = await createInferenceEndpoint();

  for (const name of Object.values(INDEX)) {
    await ensureIndex(name, semantic);
  }

  console.log(
    semantic
      ? '\nSetup complete. Semantic search enabled.'
      : '\nSetup complete. Semantic search DISABLED (tag-overlap + BM25 ranking only).',
  );
}

main().catch((err) => {
  console.error(`\nSetup failed: ${describe(err)}`);
  process.exit(1);
});
