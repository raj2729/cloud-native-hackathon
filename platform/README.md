# Confluence

A conference platform that answers the two hardest questions at any event: **which talk is worth your next hour, and which person is worth your next conversation.**

Organizers publish a conference and its talks. Attendees give five interests and a link to their work — any one of LinkedIn, GitHub, or a pasted resume. From that, the platform ranks every talk against you, finds the people you should meet, shows what people like you are attending, and runs a live view of the floor.

Elasticsearch is the only datastore: primary storage, hybrid search (BM25 + e5 vectors fused with RRF), and the real-time aggregation engine behind the live dashboard. There is no second database.

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

## The four features

| Feature | Where | How it works |
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
