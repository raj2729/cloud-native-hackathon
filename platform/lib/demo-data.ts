/**
 * The demo dataset. Personas are deliberately clustered into four interest
 * groups so "people like you" and "similar attendees" have something real to
 * surface — with noise-shaped personas those features look broken even when the
 * ranking code is correct.
 *
 * Speaker details are hardcoded, per the brief.
 */
import type { Interest } from './taxonomy';

export const EVENT_ID = 'devconf-2026';

export const ROOMS = [
  { id: 'R101', name: 'Room 101 — Main Hall', capacity: 400 },
  { id: 'R202', name: 'Room 202 — Platform Track', capacity: 180 },
  { id: 'R203', name: 'Room 203 — AI Track', capacity: 180 },
  { id: 'R310', name: 'Room 310 — Security Track', capacity: 120 },
  { id: 'R311', name: 'Room 311 — Workshop Lab', capacity: 60 },
] as const;

export interface SpeakerSeed {
  key: string;
  name: string;
  title: string;
  company: string;
  bio: string;
  linkedin: string;
  github: string;
}

export const SPEAKERS: SpeakerSeed[] = [
  {
    key: 'okonkwo',
    name: 'Ada Okonkwo',
    title: 'Principal Engineer, Retrieval',
    company: 'Northwind Labs',
    bio: 'Ada previously co-founded a search startup. Ada has spent eight years making search engines return the right answer. They led the migration of Northwind\'s product search from a hand-tuned BM25 stack to hybrid retrieval, and now work on evaluation harnesses for RAG systems that have to be right rather than merely plausible.',
    linkedin: 'https://linkedin.com/in/ada-okonkwo',
    github: 'https://github.com/adaokonkwo',
  },
  {
    key: 'reyes',
    name: 'Mateo Reyes',
    title: 'Staff SRE',
    company: 'Helio Systems',
    bio: 'Mateo runs the observability platform at Helio, where 1,400 services emit OpenTelemetry to a single pipeline. He is a recovering Prometheus maximalist and spends most of his time deleting dashboards nobody reads.',
    linkedin: 'https://linkedin.com/in/mateoreyes',
    github: 'https://github.com/mreyes-sre',
  },
  {
    key: 'lindqvist',
    name: 'Sanna Lindqvist',
    title: 'Head of Platform',
    company: 'Vantage Freight',
    bio: 'Sanna built the internal developer platform that took Vantage from eleven-day releases to forty a day. She writes about golden paths, the cost of optionality, and why most platform teams build the wrong abstraction first.',
    linkedin: 'https://linkedin.com/in/sannalindqvist',
    github: 'https://github.com/sannal',
  },
  {
    key: 'devaraj',
    name: 'Priya Devaraj',
    title: 'Security Architect',
    company: 'Ironwood Bank',
    bio: 'Priya leads application security for a bank that ships 300 services. She has opinions about SBOMs, has read more OWASP guidance than is healthy, and believes most supply-chain security is a dependency-management problem wearing a costume.',
    linkedin: 'https://linkedin.com/in/priyadevaraj',
    github: 'https://github.com/pdevaraj',
  },
  {
    key: 'bauer',
    name: 'Jonas Bauer',
    title: 'Staff Engineer, Agents',
    company: 'Calderwood AI',
    bio: 'Jonas builds agent harnesses for production use — the unglamorous parts: retries, tool schemas, context budgets and the evaluation suites that catch a regression before a customer does. Previously compilers.',
    linkedin: 'https://linkedin.com/in/jonasbauer',
    github: 'https://github.com/jbauer-dev',
  },
  {
    key: 'haddad',
    name: 'Leila Haddad',
    title: 'Principal Frontend Engineer',
    company: 'Lumen Retail',
    bio: 'Leila owns the design system used by 60 product teams at Lumen. She cares about the boring parts of frontend that decide whether a site is usable: layout stability, input latency, and components that survive contact with real content.',
    linkedin: 'https://linkedin.com/in/leilahaddad',
    github: 'https://github.com/leilah',
  },
  {
    key: 'nakamura',
    name: 'Kenji Nakamura',
    title: 'Distinguished Engineer',
    company: 'Tsuru Data',
    bio: 'Kenji has built four streaming systems and regrets two of them. He works on exactly-once semantics, backpressure, and convincing teams that they do not need Kafka.',
    linkedin: 'https://linkedin.com/in/kenjinakamura',
    github: 'https://github.com/knakamura',
  },
  {
    key: 'oyelaran',
    name: 'Tunde Oyelaran',
    title: 'Engineering Manager, Developer Experience',
    company: 'Brightpath',
    bio: 'Tunde manages the team that owns build times, CI, and the local dev environment. He reduced Brightpath\'s median CI run from 34 minutes to 6 and will tell you it was mostly caching and deleting tests.',
    linkedin: 'https://linkedin.com/in/tundeoyelaran',
    github: 'https://github.com/tundeo',
  },
  {
    key: 'whitlock',
    name: 'Dr. Ruth Whitlock',
    title: 'Research Engineer',
    company: 'Institute for Applied ML',
    bio: 'Ruth works on evaluation: how to tell whether a model change actually improved anything. She publishes on inter-annotator agreement for LLM judges and maintains two widely used open-source eval harnesses.',
    linkedin: 'https://linkedin.com/in/ruthwhitlock',
    github: 'https://github.com/rwhitlock',
  },
  {
    key: 'ferreira',
    name: 'Bruno Ferreira',
    title: 'Cloud Economics Lead',
    company: 'Atlas Mobility',
    bio: 'Bruno cut Atlas\'s cloud bill by 38% without a single migration, mostly by reading invoices nobody else would read. He now helps teams build cost signals into their deploy pipelines.',
    linkedin: 'https://linkedin.com/in/brunoferreira',
    github: 'https://github.com/bferreira',
  },
  {
    key: 'kowalski',
    name: 'Eva Kowalski',
    title: 'Senior Engineer, Core Infrastructure',
    company: 'Northwind Labs',
    bio: 'Eva writes Rust for a living and Go under duress. She maintains Northwind\'s ingestion path, which handles 2M events per second, and has strong views on when a rewrite is justified.',
    linkedin: 'https://linkedin.com/in/evakowalski',
    github: 'https://github.com/ekowalski',
  },
  {
    key: 'santos',
    name: 'Inés Santos',
    title: 'Accessibility Lead',
    company: 'Civic Digital Service',
    bio: 'Inés makes government services usable by everyone who has to use them. She has run over 200 assistive-technology usability sessions and argues that accessibility work is the cheapest performance work you will ever do.',
    linkedin: 'https://linkedin.com/in/inessantos',
    github: 'https://github.com/isantos-a11y',
  },
];

export interface TalkSeed {
  id: string;
  title: string;
  abstract: string;
  tags: Interest[];
  track: string;
  speaker: string;
  /** Primary room first; a second entry means the talk is also streamed there. */
  rooms: string[];
  /** Index into the schedule slots. */
  slot: number;
}

export const TRACKS = ['AI & Retrieval', 'Platform & Observability', 'Security', 'Product Engineering'] as const;

export const TALKS: TalkSeed[] = [
  // ---- AI & Retrieval ----
  {
    id: 'hybrid-retrieval-production',
    title: 'Hybrid Retrieval in Production: BM25 and Vectors Without the Hand-Waving',
    abstract:
      'Everyone demos vector search on a thousand documents. We run it over 40 million. This talk covers how we combined BM25 with dense embeddings using reciprocal rank fusion, how we tuned the fusion weights with real click data, and the three times hybrid search was worse than keyword search alone. Expect query plans, latency budgets and a frank accounting of what semantic search does not fix.',
    tags: ['vector-search', 'search-relevance', 'rag', 'performance'],
    track: 'AI & Retrieval',
    speaker: 'okonkwo',
    rooms: ['R203'],
    slot: 0,
  },
  {
    id: 'agent-harness-retries',
    title: 'The Unglamorous Agent: Retries, Tool Schemas and Context Budgets',
    abstract:
      'A working agent is 10% model and 90% harness. We walk through the production harness behind Calderwood\'s support agent: how tools are described so the model picks the right one, what happens when a tool times out mid-loop, how we bound context growth across a 40-turn session, and the structured-output patterns that removed an entire class of parsing bug.',
    tags: ['ai-agents', 'llms', 'api-design', 'architecture'],
    track: 'AI & Retrieval',
    speaker: 'bauer',
    rooms: ['R203'],
    slot: 1,
  },
  {
    id: 'evals-that-catch-regressions',
    title: 'Evals That Actually Catch Regressions',
    abstract:
      'Your eval suite passes and your users are complaining. This talk is about why: contaminated test sets, LLM judges that agree with themselves, and metrics that move for reasons unrelated to quality. We cover how to build a regression suite you can block a deploy on, how to measure judge reliability, and how many examples you actually need.',
    tags: ['evals', 'llms', 'testing', 'ml-ops'],
    track: 'AI & Retrieval',
    speaker: 'whitlock',
    rooms: ['R203'],
    slot: 2,
  },
  {
    id: 'rag-grounding-failures',
    title: 'Why Your RAG Pipeline Lies: Six Grounding Failures and Their Fixes',
    abstract:
      'Retrieval-augmented generation fails in characteristic ways: the chunk boundary that split the answer in half, the reranker that buried the right document, the prompt that let the model answer from memory anyway. We catalogue six failure modes we hit at Northwind, show the telemetry that exposed each one, and the mitigation that worked.',
    tags: ['rag', 'llms', 'vector-search', 'observability'],
    track: 'AI & Retrieval',
    speaker: 'okonkwo',
    rooms: ['R203', 'R311'],
    slot: 3,
  },
  {
    id: 'prompt-eng-is-engineering',
    title: 'Prompt Engineering Is Just Engineering (With Worse Tooling)',
    abstract:
      'Prompts are code: they need version control, review, tests and a rollback plan. We show how Calderwood treats its prompt library as a first-class artefact — diffed in pull requests, covered by evals, deployed behind flags — and what broke before we did that.',
    tags: ['prompt-engineering', 'llms', 'devex', 'ci-cd'],
    track: 'AI & Retrieval',
    speaker: 'bauer',
    rooms: ['R311'],
    slot: 4,
  },
  {
    id: 'embeddings-at-scale',
    title: 'Two Million Embeddings an Hour on a Budget',
    abstract:
      'Re-embedding a corpus is a batch problem pretending to be a streaming one. We cover model selection for cost per useful result, when a smaller model is strictly better, quantisation trade-offs we measured rather than guessed, and the index-rebuild strategy that let us swap embedding models without downtime.',
    tags: ['vector-search', 'cost-optimization', 'data-eng', 'ml-ops'],
    track: 'AI & Retrieval',
    speaker: 'kowalski',
    rooms: ['R203'],
    slot: 5,
  },

  // ---- Platform & Observability ----
  {
    id: 'otel-one-pipeline',
    title: 'One Pipeline, 1,400 Services: OpenTelemetry Without a Rewrite',
    abstract:
      'We moved Helio from four observability vendors and three agent formats to a single OpenTelemetry pipeline, incrementally, without a migration freeze. This talk covers the collector topology, how we handled services nobody owned, the sampling decisions that kept the bill flat, and what we got wrong about semantic conventions.',
    tags: ['observability', 'platform-eng', 'architecture', 'cost-optimization'],
    track: 'Platform & Observability',
    speaker: 'reyes',
    rooms: ['R202'],
    slot: 0,
  },
  {
    id: 'slos-people-read',
    title: 'SLOs People Actually Read',
    abstract:
      'Most SLOs are decoration. We rebuilt Helio\'s from the user\'s perspective instead of the service\'s, cut the number of alerts by 80%, and started paging on things that were actually broken. Includes the error-budget policy that survived its first real incident and the dashboards we deleted.',
    tags: ['observability', 'platform-eng', 'engineering-leadership'],
    track: 'Platform & Observability',
    speaker: 'reyes',
    rooms: ['R202'],
    slot: 2,
  },
  {
    id: 'golden-paths',
    title: 'Golden Paths, Not Golden Cages',
    abstract:
      'Platform teams build the wrong abstraction first, almost universally. Sanna walks through three abstractions Vantage built, which two were abandoned, and the design rule that emerged: make the common path trivial and the uncommon path possible. Includes the internal metric used to decide what to platformise next.',
    tags: ['platform-eng', 'devex', 'architecture', 'engineering-leadership'],
    track: 'Platform & Observability',
    speaker: 'lindqvist',
    rooms: ['R202'],
    slot: 1,
  },
  {
    id: 'eleven-days-to-forty',
    title: 'From Eleven-Day Releases to Forty a Day',
    abstract:
      'The story of a two-year deployment overhaul: what we automated, what we deliberately did not, how we moved from release trains to continuous deploy without a quality cliff, and the four metrics we watched to know whether it was working.',
    tags: ['ci-cd', 'platform-eng', 'devex', 'testing'],
    track: 'Platform & Observability',
    speaker: 'lindqvist',
    rooms: ['R101'],
    slot: 4,
  },
  {
    id: 'kubernetes-you-dont-need',
    title: 'The Kubernetes You Do Not Need',
    abstract:
      'A guided tour of Kubernetes features that cost more than they return for teams under fifty engineers — service meshes installed for one feature, custom operators maintained by one person, autoscaling tuned by nobody. Then the subset that genuinely earns its keep.',
    tags: ['kubernetes', 'platform-eng', 'cost-optimization', 'architecture'],
    track: 'Platform & Observability',
    speaker: 'ferreira',
    rooms: ['R202'],
    slot: 3,
  },
  {
    id: 'cloud-bill-archaeology',
    title: 'Cloud Bill Archaeology: Finding 38% Nobody Was Using',
    abstract:
      'Bruno read eighteen months of invoices line by line. This talk is what he found: idle preproduction, cross-AZ traffic nobody designed, logs retained for seven years by accident, and a load balancer serving one request a day. Plus how to wire cost signals into CI so it does not come back.',
    tags: ['cost-optimization', 'observability', 'platform-eng', 'analytics'],
    track: 'Platform & Observability',
    speaker: 'ferreira',
    rooms: ['R202'],
    slot: 5,
  },
  {
    id: 'six-minute-ci',
    title: 'Thirty-Four Minutes to Six: An Honest CI Teardown',
    abstract:
      'Every CI talk says "add caching". This one shows the profile: where the 34 minutes actually went, which caches paid off and which added flakiness, the 400 tests we deleted and why that was correct, and the test-selection approach that handles a monorepo.',
    tags: ['ci-cd', 'devex', 'testing', 'performance'],
    track: 'Platform & Observability',
    speaker: 'oyelaran',
    rooms: ['R101'],
    slot: 2,
  },
  {
    id: 'backpressure-first',
    title: 'Backpressure First: Streaming Systems That Degrade Instead of Dying',
    abstract:
      'Four streaming systems in, Kenji argues that throughput is the easy part and backpressure is the whole job. Covers exactly-once semantics and what it actually costs, the queue-depth signals that predict failure, and a decision tree for whether you need a streaming system at all.',
    tags: ['streaming', 'data-eng', 'architecture', 'performance'],
    track: 'Platform & Observability',
    speaker: 'nakamura',
    rooms: ['R101'],
    slot: 1,
  },
  {
    id: 'rust-ingestion-path',
    title: 'Rewriting the Ingestion Path in Rust: What It Bought and What It Cost',
    abstract:
      'Northwind\'s ingestion path handles 2M events/sec. We rewrote it from Go to Rust. Latency p99 fell 71%, the team onboarding time tripled, and one class of bug disappeared entirely. An honest accounting, including the parts we would not do again.',
    tags: ['rust', 'performance', 'go', 'architecture'],
    track: 'Platform & Observability',
    speaker: 'kowalski',
    rooms: ['R202'],
    slot: 4,
  },

  // ---- Security ----
  {
    id: 'sbom-costume',
    title: 'Supply-Chain Security Is Dependency Management in a Costume',
    abstract:
      'SBOMs, provenance attestation, signing — useful, but they do not fix the actual problem, which is that you have 1,900 transitive dependencies and no idea which matter. Priya shows how Ironwood prioritised by reachability instead of CVE score, and cut actionable alerts by 94%.',
    tags: ['supply-chain', 'appsec', 'security', 'ci-cd'],
    track: 'Security',
    speaker: 'devaraj',
    rooms: ['R310'],
    slot: 0,
  },
  {
    id: 'appsec-at-300-services',
    title: 'AppSec Across 300 Services Without 300 Security Engineers',
    abstract:
      'How a four-person security team covers 300 services: where to put guardrails so they cannot be skipped, which SAST findings to suppress permanently, and the threat-modelling format teams actually complete. Includes the paved-road pattern that removed authn bugs as a category.',
    tags: ['appsec', 'security', 'platform-eng', 'identity'],
    track: 'Security',
    speaker: 'devaraj',
    rooms: ['R310'],
    slot: 2,
  },
  {
    id: 'identity-for-agents',
    title: 'Identity for Agents: Who Is the Principal When a Model Calls Your API?',
    abstract:
      'Agents break the assumptions of every authorisation model we have: the caller is software, acting for a human, with scopes that should narrow mid-task. We cover delegation patterns, short-lived credentials for tool calls, audit trails that survive a post-incident review, and the failure we had in staging.',
    tags: ['identity', 'security', 'ai-agents', 'api-design'],
    track: 'Security',
    speaker: 'devaraj',
    rooms: ['R310', 'R203'],
    slot: 3,
  },
  {
    id: 'encrypting-the-boring-parts',
    title: 'Encrypting the Boring Parts: Key Management You Can Operate',
    abstract:
      'Encryption is easy; key rotation at 3am is not. A practical tour of envelope encryption, rotation without re-encrypting everything, what to do when a key is suspected compromised, and why your TLS config is probably fine and your secret sprawl is not.',
    tags: ['cryptography', 'security', 'platform-eng'],
    track: 'Security',
    speaker: 'devaraj',
    rooms: ['R310'],
    slot: 5,
  },

  // ---- Product Engineering ----
  {
    id: 'design-system-60-teams',
    title: 'A Design System 60 Teams Will Actually Use',
    abstract:
      'Lumen\'s design system is used by 60 product teams, which means every API decision is permanent. Leila covers the component contracts that survived, token architecture that allowed rebranding in a week, and the governance model that stopped the system forking into six variants.',
    tags: ['design-systems', 'frontend', 'api-design', 'devex'],
    track: 'Product Engineering',
    speaker: 'haddad',
    rooms: ['R101'],
    slot: 0,
  },
  {
    id: 'input-latency-budget',
    title: 'The Input Latency Budget Nobody Set',
    abstract:
      'Teams track page load and ignore the 300ms between a tap and a response. We instrumented every interaction in Lumen\'s checkout, found four interactions over a second, and fixed them. Covers measurement methodology, layout stability, and why your framework is rarely the bottleneck.',
    tags: ['performance', 'frontend', 'observability'],
    track: 'Product Engineering',
    speaker: 'haddad',
    rooms: ['R101'],
    slot: 3,
  },
  {
    id: 'accessibility-is-performance',
    title: 'Accessibility Is the Cheapest Performance Work You Will Ever Do',
    abstract:
      'From 200 assistive-technology usability sessions: the five issues that account for most real-world failure, why automated audits find the wrong 30%, and how the fixes consistently made pages faster and simpler for everyone. Includes live screen-reader walkthroughs of real government services.',
    tags: ['accessibility', 'frontend', 'performance', 'product'],
    track: 'Product Engineering',
    speaker: 'santos',
    rooms: ['R311'],
    slot: 1,
  },
  {
    id: 'typescript-at-the-boundary',
    title: 'TypeScript at the Boundary: Types Are Not Validation',
    abstract:
      'Every production incident in our API layer came from the same mistake: trusting a type at a runtime boundary. We cover schema-first API design, where to validate and where not to bother, codegen that stays in sync, and the pattern that eliminated a recurring class of 500s.',
    tags: ['typescript', 'api-design', 'testing', 'architecture'],
    track: 'Product Engineering',
    speaker: 'oyelaran',
    rooms: ['R311'],
    slot: 3,
  },
  {
    id: 'open-source-maintainer-burnout',
    title: 'Maintaining Two Popular Repos Without Burning Out',
    abstract:
      'Ruth maintains two widely used eval harnesses alongside a full-time job. What she automates, what she declines, how she handles the issue tracker, and the contribution-ladder approach that produced three co-maintainers.',
    tags: ['open-source', 'engineering-leadership', 'product'],
    track: 'Product Engineering',
    speaker: 'whitlock',
    rooms: ['R311'],
    slot: 5,
  },
  {
    id: 'postgres-until-it-hurts',
    title: 'Postgres Until It Hurts (It Hurts Later Than You Think)',
    abstract:
      'Kenji has replaced Postgres with four specialised systems and regrets two. A decision framework for when a single relational database genuinely stops being enough — with the query patterns, table sizes and latency requirements that mark each threshold.',
    tags: ['databases', 'architecture', 'data-eng', 'performance'],
    track: 'Product Engineering',
    speaker: 'nakamura',
    rooms: ['R101'],
    slot: 5,
  },
];

export interface PersonaSeed {
  id: string;
  name: string;
  headline: string;
  cluster: string;
  interests: Interest[];
  linkedin?: string;
  github?: string;
  resumeText?: string;
}

/**
 * Four clusters of five. Link coverage is deliberately mixed to exercise the
 * "any one of LinkedIn / GitHub / resume is enough" requirement:
 * some personas have one link, some two, some all three.
 */
export const PERSONAS: PersonaSeed[] = [
  {
    id: 'u-robin', name: 'Robin Patel', headline: 'Computer Vision Engineer at Atlas Robotics',
    cluster: 'AI infrastructure', interests: ['computer-vision', 'robotics', 'python', 'ml-ops', 'ai-agents'],
    resumeText: 'Synthetic resume: Built object detection and visual perception systems for warehouse robots. Works on autonomous navigation, motion planning and deployment of vision models. Interested in agent orchestration and evaluation for reliable robotic systems.',
  },
  {
    id: 'u-samira', name: 'Samira Brooks', headline: 'Robotics Research Engineer at Fernpath',
    cluster: 'AI infrastructure', interests: ['robotics', 'computer-vision', 'evals', 'python', 'architecture'],
    resumeText: 'Synthetic resume: Researches robotic manipulation, camera calibration and computer vision. Built safety evaluations for autonomous systems and open-source perception pipelines. Previously the first engineer at a robotics startup.',
  },
  // ---- Cluster: AI infrastructure ----
  {
    id: 'u-nadia',
    name: 'Nadia Farouk',
    headline: 'ML Platform Engineer at Cobalt Health',
    cluster: 'AI infrastructure',
    interests: ['rag', 'vector-search', 'llms', 'evals', 'ml-ops'],
    linkedin: 'https://linkedin.com/in/nadiafarouk',
    github: 'https://github.com/nfarouk',
    resumeText:
      'ML Platform Engineer, 6 years. Built and operate a RAG pipeline over 4M clinical documents: chunking strategy, embedding refresh, hybrid retrieval with reciprocal rank fusion. Own the offline eval harness that gates model changes. Previously data engineering on Spark and Airflow. Looking to talk to anyone who has solved embedding-model migration without downtime.',
  },
  {
    id: 'u-dmitri',
    name: 'Dmitri Volkov',
    headline: 'Founding Engineer at Steeple (agents for logistics)',
    cluster: 'AI infrastructure',
    interests: ['ai-agents', 'llms', 'prompt-engineering', 'evals', 'startups'],
    github: 'https://github.com/dvolkov',
  },
  {
    id: 'u-grace',
    name: 'Grace Ahn',
    headline: 'Senior Engineer, Search Relevance at Marketplace Co',
    cluster: 'AI infrastructure',
    interests: ['search-relevance', 'vector-search', 'rag', 'llms', 'analytics'],
    linkedin: 'https://linkedin.com/in/graceahn',
    resumeText:
      'Search relevance for an 80M-listing marketplace. Moved ranking from hand-tuned boosts to a learning-to-rank model; now adding semantic retrieval as a second candidate source. Comfortable in Elasticsearch internals, click-model evaluation, and explaining to product why relevance is not a single number.',
  },
  {
    id: 'u-samir',
    name: 'Samir Qureshi',
    headline: 'Applied Scientist turned Engineer, Calderwood AI',
    cluster: 'AI infrastructure',
    interests: ['evals', 'llms', 'ml-ops', 'fine-tuning', 'python'],
    linkedin: 'https://linkedin.com/in/samirqureshi',
    github: 'https://github.com/squreshi',
  },
  {
    id: 'u-bea',
    name: 'Beatriz Lima',
    headline: 'Staff Engineer, Agent Infrastructure at Hollow Street',
    cluster: 'AI infrastructure',
    interests: ['ai-agents', 'api-design', 'observability', 'llms', 'architecture'],
    github: 'https://github.com/bealima',
    resumeText:
      'Staff engineer on agent infrastructure. I own the tool-calling layer: schemas, timeouts, idempotency, and the tracing that makes a 40-turn session debuggable. Strong opinions on structured outputs and on never parsing a model response with a regex.',
  },

  // ---- Cluster: Platform & observability ----
  {
    id: 'u-tom',
    name: 'Tomas Novak',
    headline: 'SRE at Granite Payments',
    cluster: 'Platform & observability',
    interests: ['observability', 'kubernetes', 'platform-eng', 'ci-cd', 'cost-optimization'],
    linkedin: 'https://linkedin.com/in/tomasnovak',
    github: 'https://github.com/tnovak',
    resumeText:
      'SRE, 9 years, currently payments infrastructure where downtime is measured in regulatory letters. Migrated 200 services to OpenTelemetry. Run the on-call rotation and the error-budget policy. Want to compare notes on sampling strategies that keep the bill flat.',
  },
  {
    id: 'u-aiko',
    name: 'Aiko Tanabe',
    headline: 'Platform Engineering Lead at Fernpath',
    cluster: 'Platform & observability',
    interests: ['platform-eng', 'devex', 'ci-cd', 'kubernetes', 'engineering-leadership'],
    linkedin: 'https://linkedin.com/in/aikotanabe',
  },
  {
    id: 'u-marcus',
    name: 'Marcus Bell',
    headline: 'Infrastructure Engineer at Tidewater Logistics',
    cluster: 'Platform & observability',
    interests: ['kubernetes', 'cost-optimization', 'observability', 'go', 'serverless'],
    github: 'https://github.com/marcusbell',
    resumeText:
      'Infrastructure engineer. Spent the last year reducing spend: rightsizing, spot adoption, killing idle preprod. Wrote the internal tool that attributes cost per team. Go and Terraform mostly. Interested in how others wire cost signals into deploys.',
  },
  {
    id: 'u-fatima',
    name: 'Fatima Zidane',
    headline: 'Senior DevEx Engineer at Brightpath',
    cluster: 'Platform & observability',
    interests: ['devex', 'ci-cd', 'testing', 'typescript', 'performance'],
    linkedin: 'https://linkedin.com/in/fatimazidane',
    github: 'https://github.com/fzidane',
  },
  {
    id: 'u-olu',
    name: 'Olu Adeyemi',
    headline: 'Staff Engineer, Streaming Data at Tsuru Data',
    cluster: 'Platform & observability',
    interests: ['streaming', 'data-eng', 'databases', 'architecture', 'rust'],
    linkedin: 'https://linkedin.com/in/oluadeyemi',
    github: 'https://github.com/oluadeyemi',
    resumeText:
      'Streaming data, 7 years. Operate a Kafka estate processing 900k msg/sec and spend most of my time on backpressure and exactly-once semantics. Rust for the hot path, Java for everything older than me. Keen to argue about whether you need a streaming system.',
  },

  // ---- Cluster: Security ----
  {
    id: 'u-hannah',
    name: 'Hannah Vogel',
    headline: 'Application Security Engineer at Ironwood Bank',
    cluster: 'Security',
    interests: ['appsec', 'supply-chain', 'security', 'identity', 'ci-cd'],
    linkedin: 'https://linkedin.com/in/hannahvogel',
    github: 'https://github.com/hvogel-sec',
  },
  {
    id: 'u-raj',
    name: 'Raj Pillai',
    headline: 'Security Architect at Meridian Insurance',
    cluster: 'Security',
    interests: ['security', 'cryptography', 'identity', 'architecture', 'platform-eng'],
    linkedin: 'https://linkedin.com/in/rajpillai',
    resumeText:
      'Security architect in a regulated industry. Threat modelling, key management, and authorisation design across 140 services. Currently rethinking authz for agent-driven integrations, which breaks most of our assumptions about who the principal is.',
  },
  {
    id: 'u-sofia',
    name: 'Sofia Marchetti',
    headline: 'Product Security Engineer at Lumen Retail',
    cluster: 'Security',
    interests: ['appsec', 'frontend', 'security', 'testing', 'identity'],
    github: 'https://github.com/smarchetti',
  },
  {
    id: 'u-ken',
    name: 'Ken Boateng',
    headline: 'Supply Chain Security Lead at Atlas Mobility',
    cluster: 'Security',
    interests: ['supply-chain', 'open-source', 'security', 'ci-cd', 'go'],
    linkedin: 'https://linkedin.com/in/kenboateng',
    github: 'https://github.com/kboateng',
    resumeText:
      'I own dependency and build-pipeline security for 400 repos. SBOM generation, provenance attestation, and the much harder problem of prioritising 1,900 transitive dependencies by reachability rather than CVE score. Open-source maintainer on two scanning tools.',
  },
  {
    id: 'u-lena',
    name: 'Lena Petrova',
    headline: 'Identity Platform Engineer at Granite Payments',
    cluster: 'Security',
    interests: ['identity', 'api-design', 'security', 'ai-agents', 'typescript'],
    linkedin: 'https://linkedin.com/in/lenapetrova',
  },

  // ---- Cluster: Product engineering ----
  {
    id: 'u-jon',
    name: 'Jonathan Oyedepo',
    headline: 'Frontend Lead at Civic Digital Service',
    cluster: 'Product engineering',
    interests: ['frontend', 'accessibility', 'design-systems', 'performance', 'typescript'],
    linkedin: 'https://linkedin.com/in/jonathanoyedepo',
    github: 'https://github.com/joyedepo',
    resumeText:
      'Frontend lead on services used by millions of citizens who have no alternative. Accessibility is not optional for us. Own a design system across 14 teams and a performance budget that is actually enforced in CI.',
  },
  {
    id: 'u-mei',
    name: 'Mei Chen',
    headline: 'Senior Product Engineer at Lumen Retail',
    cluster: 'Product engineering',
    interests: ['frontend', 'design-systems', 'product', 'performance', 'api-design'],
    github: 'https://github.com/meichen',
  },
  {
    id: 'u-eli',
    name: 'Eli Rosenberg',
    headline: 'Engineering Manager, Web Platform at Northwind Labs',
    cluster: 'Product engineering',
    interests: ['engineering-leadership', 'frontend', 'devex', 'product', 'architecture'],
    linkedin: 'https://linkedin.com/in/elirosenberg',
    resumeText:
      'EM for a web platform team of nine. Previously eight years as an IC in frontend infrastructure. I spend my time on technical strategy, hiring, and protecting the team from the roadmap. Interested in how other managers measure platform-team impact.',
  },
  {
    id: 'u-priyanka',
    name: 'Priyanka Rao',
    headline: 'Accessibility Specialist at Fernpath',
    cluster: 'Product engineering',
    interests: ['accessibility', 'frontend', 'testing', 'product', 'design-systems'],
    linkedin: 'https://linkedin.com/in/priyankarao',
    github: 'https://github.com/praoa11y',
  },
  {
    id: 'u-carlos',
    name: 'Carlos Mendes',
    headline: 'Full-stack Engineer at Steeple',
    cluster: 'Product engineering',
    interests: ['typescript', 'api-design', 'databases', 'startups', 'frontend'],
    github: 'https://github.com/cmendes',
    resumeText:
      'Full-stack at a nine-person startup, which means I own the frontend, the API and the on-call pager. TypeScript end to end, Postgres until it hurts. Previously three years at a larger company where I learned what I did not want to rebuild.',
  },
];
