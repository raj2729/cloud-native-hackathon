# Converge

**Your conference. Your interests. Your people.**

An AI-powered conference companion that connects people to the right talks, the right attendees, and the right opportunities in real time.

> Instead of making attendees search for interesting things at a conference, make the conference discover what is interesting to each attendee.

That inversion is the whole product. Organizers publish a conference and its talks. Attendees give five interests and a link to their work — any one of LinkedIn, GitHub, or a pasted resume. Everything after that is discovery the attendee never has to ask for.

## The four problems

| # | Problem | Answer |
|---|---|---|
| 01 | Attendees don't know which talks are relevant to them | `/agenda` — every talk scored against your interests and your own profile text, with the matched interests shown |
| 02 | Attendees don't know which other people they should meet | `/people` — attendees ranked by shared interests, profile similarity and shared sessions, with a reason and a LinkedIn link |
| 03 | Attendees don't know what people with similar interests are attending | `/agenda` — what the 20 closest profiles are actually going to, minus what you already saved |
| 04 | Organizers don't know what's attracting attention until the event is over | `/live` — room occupancy and velocity-ranked trending, updating every few seconds |

Elasticsearch is the only datastore: primary storage, hybrid search (BM25 + e5 vectors fused with RRF), and the real-time aggregation engine behind the live view. There is no second database.

## Run it

Needs Docker and Node 20+.

```bash
npm install
docker compose up -d        # Elasticsearch 9.5.1, single node, ~30s to green
npm run es:setup            # trial license, e5 inference endpoint, index mappings
npm run es:seed             # conference, 25 talks, 100 attendees, ~900 attendance rows
npm run dev                 # http://localhost:3000
```

`npm run setup` does the three middle steps in one go.

### The e5 model is the slow part

`es:setup` creates an inference endpoint backed by `.multilingual-e5-small`, which Elasticsearch downloads on first use (~76s on a good connection, much longer on bad conference wifi). The client times out at 30s while the download continues in the background — **this is expected and not an error.** It prints:

```
! inference endpoint not created: Timed out after [30s] waiting for trained model deployment
  Continuing without semantic search — re-run this script later to add it.
```

The app is fully functional at this point, ranking on tag overlap + BM25. To check on the model and switch semantic search on once it is ready:

```bash
# "started" / "fully_allocated" means it is ready
curl -s localhost:9200/_ml/trained_models/_stats | grep -o '"state":"[a-z]*"' | head -2

curl -s -X DELETE "localhost:9200/talks,users"   # semantic_text cannot be added to a mapped index
npm run es:setup                                  # now prints "Semantic search enabled"
npm run es:seed                                   # embeddings are generated at index time
```

Ranking is additive by design — the semantic retriever is fused in only when the model is live, so nothing breaks if it never deploys.

### Make the floor move

```bash
npm run simulate            # writes check-ins every 3s; Ctrl-C to stop
```

`/live` polls every 5 seconds. Without the simulator the numbers are correct but static.

## Optional: Claude and Dash0

Both are optional. Without them the app runs unchanged.

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...        # talk tagging, profile enrichment, match rationales
DASH0_ENDPOINT=https://ingress.<region>.dash0.com
DASH0_AUTH_TOKEN=auth_...
DASH0_DATASET=default
```

Every Claude call in `lib/ai.ts` has a deterministic keyword fallback and cannot throw, so a missing key degrades the copy rather than losing a feature. Without Dash0 credentials the OTel SDK is not started at all.

`npm run es:seed:ai` also runs Claude profile enrichment across the 20 seeded personas (20 API calls, slower).

## Optional: ElevenLabs voice navigation

Set `ELEVENLABS_API_KEY` in `platform/.env.local` to enable the microphone button in the navigation bar. Click **Speak**, say a destination such as “Speaker Schedules”, then click **Stop**. Speech is transcribed with ElevenLabs Scribe and matched to a known app page; the API key stays on the server. Audio is sent to ElevenLabs for transcription.

Voice destinations include Speaker Schedules/Agenda, People, Live, Organizer, Onboarding, and Home. Without the key, the app displays a setup message when voice navigation is used.

## How each one works

| Feature | Where | Mechanics |
|---|---|---|
| Talks tagged against your interests | `/agenda` | RRF fusion of a tag/BM25 retriever and a semantic retriever over `talks.semantic`. The displayed score blends retrieval rank with how much of your stated interest the talk covers, so a talk no tag matched can still score ~40 on similarity alone. |
| People tagged against your interests | `/people` | Same RRF shape over `users.semantic`, re-ranked by shared interests and shared sessions. Restricted to people who wrote about their own work, because a match you cannot explain is not worth making. LinkedIn connect on every card. |
| What similar people are attending | `/agenda` | The 20 closest profiles → a `terms` aggregation over their attendance → minus what you already saved. |
| Live rooms and trending | `/live` | `terms` agg on `room` for check-ins in the last 25 min. Trending ranks by **velocity** — last 10 minutes against the 10 before — so a talk filling up now beats one that filled an hour ago. |

## Layout

```
lib/search.ts        every query behind the four features
lib/es.ts            the only Elasticsearch client; semanticReady() gates vector ranking
lib/ai.ts            Claude tagging / enrichment / rationale, each with a fallback
lib/taxonomy.ts      the 40-slug vocabulary shared by users and talks
lib/demo-data.ts     the seeded conference, speakers and personas
scripts/setup-es.ts  license, inference endpoint, mappings (idempotent)
scripts/seed.ts      demo data; the schedule is relative to now, so a slot is always live
scripts/simulate.ts  live check-in traffic
instrumentation.node.ts  OpenTelemetry → Dash0
```

### Why one vocabulary

Users and talks are tagged from the same 40 slugs in `lib/taxonomy.ts`. That makes tag overlap a deterministic, explainable signal and keeps the demo repeatable; the vectors then handle the nuance exact tags miss — searching *"how do I stop my cloud bill from growing"* returns **Cloud Bill Archaeology** with no keyword overlap at all.

### Auth

There is none, deliberately. A cookie holds the id of the attendee you are browsing as, so you can switch personas instantly from `/` and watch every ranking reshuffle. `/onboarding` creates a real profile and sets the same cookie.

## Verify it works

1. `curl -s localhost:9200/_cat/indices` — four indices, `talks` and `users` populated.
2. Open `/`, pick **Nadia Farouk** (AI infra). `/agenda` should put retrieval and evals talks on top.
3. Switch to **Jonathan Oyedepo** (frontend). The whole agenda reorders — accessibility and design systems lead.
4. `/people` as Nadia returns Grace Ahn and Beatriz Lima, with shared interests highlighted and a LinkedIn link.
5. `npm run simulate`, then watch `/live` bars move and trending reorder within ~10s.
6. `/organizer` — add a talk with no tags and watch Claude tag it on save.
7. `npm run typecheck && npm run lint`.

## Run on Docker Desktop Kubernetes with Radar

Radar's desktop app runs locally and reads the cluster through your kubeconfig. There is no Radar pod or Helm install needed for local use. These manifests deploy Converge and Elasticsearch into the existing `hackathon` namespace; both services stay internal to the cluster.

The Elasticsearch settings below are for local development only: security is disabled, with no public Service or Ingress. Give Docker Desktop at least 4 GB of memory (6 GB recommended when enabling the e5 model).

For a hosted Elastic Cloud cluster instead of the in-cluster Elasticsearch, set `ELASTICSEARCH_URL` to its HTTPS endpoint and `ELASTICSEARCH_API_KEY` to an API key. No local software installation is needed. The Next.js app can load these values from `platform/.env.local` (which is gitignored). For setup/seed scripts, export the values in the shell or prefix the commands with them. Use a least-privilege key for the app, and a separate appropriately privileged key for index/model setup if required.

For local development, create `platform/.env.local` with:

```dotenv
ELASTICSEARCH_URL=https://my-vectordb-project-d22796.es.us-east4.gcp.elastic.cloud:443
ELASTICSEARCH_API_KEY=replace-with-your-key
```

Replace the placeholder locally; never commit this file or paste the key into chat.

For the Kubernetes app, create a Secret without putting the key in YAML or source control. Enter the key at the hidden prompt:

```bash
printf 'Elastic Cloud API key: '
read -s ELASTICSEARCH_API_KEY
printf '\n'
kubectl -n hackathon create secret generic elasticsearch-credentials \
  --from-literal=api-key="$ELASTICSEARCH_API_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -
unset ELASTICSEARCH_API_KEY
```

The `converge` ConfigMap in `k8s/app.yaml` is set to the provided Elastic Cloud HTTPS endpoint. Apply it and restart the app after the Secret is created:

```bash
kubectl apply -f k8s/app.yaml
kubectl -n hackathon rollout restart deployment/converge
kubectl -n hackathon rollout status deployment/converge --timeout=5m
```

Do not use the in-cluster Elasticsearch endpoint and a Cloud API key together. If using the local in-cluster Elasticsearch shown in this guide, leave `ELASTICSEARCH_API_KEY` unset.

From the repository root, install the app dependencies and confirm the intended cluster:

```bash
cd platform
npm ci
kubectl config current-context
kubectl get nodes
```

The current Docker Desktop context is usually `docker-desktop`. If the displayed context is not the local Docker Desktop cluster, select the correct context before applying anything:

```bash
kubectl config get-contexts
kubectl config use-context docker-desktop
```

Create Elasticsearch and wait for its pod and persistent volume to become ready:

```bash
kubectl apply -f k8s/elasticsearch.yaml
kubectl -n hackathon rollout status statefulset/elasticsearch --timeout=10m
kubectl -n hackathon get pods,pvc
```

In a first terminal, forward Elasticsearch to localhost and leave the command running:

```bash
kubectl -n hackathon port-forward svc/elasticsearch 9200:9200
```

In a second terminal, initialize Elasticsearch and load the demo conference data:

```bash
cd platform
ELASTICSEARCH_URL=http://localhost:9200 npm run es:setup
ELASTICSEARCH_URL=http://localhost:9200 npm run es:seed
```

`es:setup` attempts to download and start the e5 model. That can take a while; if it reports that semantic search was skipped, the app still works with tag-overlap and BM25 ranking. You can retry setup and seeding later after the model is available.

To enable voice navigation in Kubernetes, put the key in `platform/.env.elevenlabs` (a Git-ignored file):

```dotenv
ELEVENLABS_API_KEY=your-key
```

Create or update the Kubernetes Secret before deploying the app:

```bash
cd platform
kubectl -n hackathon create secret generic converge-secrets \
  --from-env-file=.env.elevenlabs \
  --dry-run=client -o yaml | kubectl apply -f -
```

Build the local app image, deploy it, and wait for the pod:

```bash
docker build -t converge:local .
kubectl apply -f k8s/app.yaml
kubectl -n hackathon rollout status deployment/converge --timeout=5m
```

In a third terminal, forward the app's local port:

```bash
kubectl -n hackathon port-forward svc/converge 3000:3000
```

Open [http://localhost:3000](http://localhost:3000). In Radar Desktop, select the same Docker Desktop cluster and inspect the `hackathon` namespace. The active context reported by `kubectl config current-context` is the authoritative context name; it may appear as `docker-desktop` rather than `docker-default`.

Useful checks:

```bash
kubectl -n hackathon get pods,services,pvc
kubectl -n hackathon logs statefulset/elasticsearch --tail=80
kubectl -n hackathon logs deployment/converge --tail=80
curl -s http://localhost:9200/_cat/indices
```

To remove the workloads while retaining Elasticsearch data:

```bash
kubectl delete -f k8s/app.yaml
kubectl delete -f k8s/elasticsearch.yaml
```

The Elasticsearch PVC is retained when the StatefulSet is removed. Delete `data-elasticsearch-0` explicitly only if you also intend to erase the local Elasticsearch data.
