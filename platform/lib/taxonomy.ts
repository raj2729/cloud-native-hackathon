/**
 * The canonical interest vocabulary. Users and talks are tagged from this exact
 * list so tag-overlap is a deterministic signal; semantic search handles the
 * nuance that exact tags miss.
 */
export const TAXONOMY = [
  // AI / ML
  'ai-agents',
  'llms',
  'rag',
  'vector-search',
  'prompt-engineering',
  'ml-ops',
  'evals',
  'fine-tuning',
  'computer-vision',
  'robotics',
  // Data
  'data-eng',
  'streaming',
  'databases',
  'analytics',
  'search-relevance',
  // Platform / infra
  'kubernetes',
  'observability',
  'platform-eng',
  'serverless',
  'cost-optimization',
  'ci-cd',
  'devex',
  // Languages
  'rust',
  'go',
  'typescript',
  'python',
  'java',
  // Product-facing engineering
  'frontend',
  'design-systems',
  'accessibility',
  'mobile',
  'performance',
  'api-design',
  // Security
  'security',
  'appsec',
  'cryptography',
  'identity',
  'supply-chain',
  // Craft & career
  'testing',
  'architecture',
  'open-source',
  'engineering-leadership',
  'product',
  'startups',
] as const;

export type Interest = (typeof TAXONOMY)[number];

export const TAXONOMY_SET: ReadonlySet<string> = new Set(TAXONOMY);

export function isInterest(value: string): value is Interest {
  return TAXONOMY_SET.has(value);
}

/** Slugs whose title-cased form reads wrong. */
const SPECIAL_CASE_LABELS: Record<string, string> = {
  'ai-agents': 'AI Agents',
  'llms': 'LLMs',
  'rag': 'RAG',
  'ml-ops': 'MLOps',
  'ci-cd': 'CI/CD',
  'devex': 'DevEx',
  'api-design': 'API Design',
  'appsec': 'AppSec',
  'data-eng': 'Data Engineering',
  'platform-eng': 'Platform Engineering',
};

/** Human-readable label for a slug: `vector-search` -> `Vector Search`. */
export function label(slug: string): string {
  const special = SPECIAL_CASE_LABELS[slug];
  if (special) return special;
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Groups used to lay out the interest picker during onboarding. */
export const TAXONOMY_GROUPS: { title: string; interests: Interest[] }[] = [
  {
    title: 'AI & ML',
    interests: [
      'computer-vision',
      'robotics',
      'ai-agents',
      'llms',
      'rag',
      'vector-search',
      'prompt-engineering',
      'ml-ops',
      'evals',
      'fine-tuning',
    ],
  },
  {
    title: 'Data & Search',
    interests: ['data-eng', 'streaming', 'databases', 'analytics', 'search-relevance'],
  },
  {
    title: 'Platform & Infra',
    interests: [
      'kubernetes',
      'observability',
      'platform-eng',
      'serverless',
      'cost-optimization',
      'ci-cd',
      'devex',
    ],
  },
  {
    title: 'Languages',
    interests: ['rust', 'go', 'typescript', 'python', 'java'],
  },
  {
    title: 'Product Engineering',
    interests: [
      'frontend',
      'design-systems',
      'accessibility',
      'mobile',
      'performance',
      'api-design',
    ],
  },
  {
    title: 'Security',
    interests: ['security', 'appsec', 'cryptography', 'identity', 'supply-chain'],
  },
  {
    title: 'Craft & Career',
    interests: [
      'testing',
      'architecture',
      'open-source',
      'engineering-leadership',
      'product',
      'startups',
    ],
  },
];

/**
 * Keyword hints for the deterministic tagging fallback in `lib/ai.ts`, used when
 * the Claude API is unavailable. Keys are taxonomy slugs.
 */
export const TAG_KEYWORDS: Partial<Record<Interest, string[]>> = {
  'computer-vision': ['computer vision', 'image recognition', 'object detection', 'visual perception'],
  'robotics': ['robot', 'robotics', 'motion planning', 'autonomous navigation'],
  'ai-agents': ['agent', 'agentic', 'tool use', 'autonomous', 'mcp'],
  'llms': ['llm', 'language model', 'transformer', 'inference', 'claude', 'gpt'],
  'rag': ['rag', 'retrieval augmented', 'grounding', 'context window'],
  'vector-search': ['vector', 'embedding', 'knn', 'semantic search', 'ann'],
  'prompt-engineering': ['prompt', 'few-shot', 'system prompt'],
  'ml-ops': ['mlops', 'model serving', 'feature store', 'model registry'],
  'evals': ['eval', 'benchmark', 'llm-as-judge', 'regression suite'],
  'fine-tuning': ['fine-tune', 'fine tuning', 'lora', 'distillation'],
  'data-eng': ['pipeline', 'etl', 'elt', 'warehouse', 'lakehouse', 'dbt'],
  'streaming': ['kafka', 'stream', 'real-time', 'event-driven', 'flink'],
  'databases': ['postgres', 'database', 'sql', 'transaction', 'sharding'],
  'analytics': ['analytics', 'dashboard', 'olap', 'metrics layer'],
  'search-relevance': ['relevance', 'ranking', 'bm25', 'elasticsearch', 'rrf', 'hybrid search'],
  'kubernetes': ['kubernetes', 'k8s', 'container', 'pod', 'helm', 'operator'],
  'observability': ['observability', 'opentelemetry', 'otel', 'tracing', 'slo', 'telemetry'],
  'platform-eng': ['platform', 'internal developer', 'golden path', 'self-service'],
  'serverless': ['serverless', 'lambda', 'edge function', 'cold start'],
  'cost-optimization': ['cost', 'spend', 'finops', 'cloud bill'],
  'ci-cd': ['continuous integration', 'continuous delivery', 'deploy', 'release', 'github actions'],
  'devex': ['developer experience', 'devex', 'tooling', 'build time', 'monorepo'],
  'rust': ['rust', 'cargo', 'borrow checker'],
  'go': ['golang', 'goroutine'],
  'typescript': ['typescript', 'type-safe', 'tsc'],
  'python': ['python', 'pydantic', 'asyncio'],
  'java': ['jvm', 'spring boot'],
  'frontend': ['frontend', 'react', 'browser', 'next.js', 'rendering', 'hydration'],
  'design-systems': ['design system', 'component library', 'design tokens'],
  'accessibility': ['accessibility', 'a11y', 'screen reader', 'wcag'],
  'mobile': ['mobile', 'ios', 'android', 'react native'],
  'performance': ['performance', 'latency', 'throughput', 'profiling', 'p99'],
  'api-design': ['api design', 'rest', 'graphql', 'grpc', 'versioning'],
  'security': ['security', 'threat model', 'vulnerability', 'zero trust'],
  'appsec': ['appsec', 'sast', 'dast', 'owasp', 'injection'],
  'cryptography': ['cryptography', 'encryption', 'tls', 'key management'],
  'identity': ['identity', 'oauth', 'sso', 'authentication', 'authorization'],
  'supply-chain': ['supply chain', 'sbom', 'dependency', 'provenance', 'sigstore'],
  'testing': ['testing', 'property-based', 'fuzz', 'coverage', 'flaky'],
  'architecture': ['architecture', 'monolith', 'microservice', 'migration'],
  'open-source': ['open source', 'maintainer', 'community'],
  'engineering-leadership': ['leadership', 'engineering manager', 'hiring', 'mentoring'],
  'product': ['product', 'roadmap', 'user research', 'discovery'],
  'startups': ['startup', 'founder', 'zero to one'],
};
