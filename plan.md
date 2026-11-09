# Dash0 Integration Plan: Confluence (`platform/`)

**Time budget:** ~4 hours
**Goal:** cover the Dash0 judging criteria. Instrument deeply (traces, logs, metrics, real-user monitoring), find and fix something real with Agent0 or MCP, make observability part of the product, build a dashboard and SLO, and make conferences easier and more inclusive.

All paths below are relative to `platform/`. Items marked **(verify)** use Dash0 APIs/URLs that should be checked against https://www.dash0.com/documentation/dash0 before relying on them.

---

## Current state (what's already there)

| Area | Status |
|---|---|
| Stack | Next.js 16 (App Router, server components + server actions), React 19, TypeScript, Elasticsearch 9.5 (only datastore), Claude via `@anthropic-ai/sdk` |
| OTel bootstrap | ✅ `instrumentation.ts` → `instrumentation.node.ts`: NodeSDK, OTLP/HTTP **traces + metrics** to Dash0, auto-instrumentations (fs disabled). Off unless `DASH0_ENDPOINT` + `DASH0_AUTH_TOKEN` are set |
| Custom spans | ⚠️ Only 5, all in `lib/search.ts`: `recommend.talks`, `recommend.people`, `recommend.similar-attendance`, `live.rooms`, `live.trending` (helper: `startSpan` in `lib/telemetry.ts`) |
| Custom metrics | ⚠️ `app.room.occupancy` (gauge, recorded on `/live`). `app.recommend.latency` / `app.search.hits` are defined, but **`recordRecommendLatency()` is never called**, so these two metrics are always empty |
| Logs | ❌ No OTel log export. `console.warn` in `lib/ai.ts` fallbacks only |
| Server actions | ❌ No spans or metrics (`app/actions.ts`: switch user, onboarding, save/check-in, create event/talk) |
| Claude calls | ❌ Not traced (`lib/ai.ts`: `tagTalks`, `enrichProfile`, `matchRationale`) |
| Browser / RUM | ❌ None |
| Traffic | `scripts/simulate.ts` writes check-ins **straight into Elasticsearch**, so it never goes through the app and produces no app telemetry |
| Conventions to respect | `CONVENTIONS.md`: telemetry must never break a render; all ES access via `lib/es.ts`; all queries in `lib/search.ts`; no `any`; explicit return types; `npm run typecheck && npm run lint` must pass. `AGENTS.md`: read `node_modules/next/dist/docs/` before writing Next.js code (the version has breaking changes) |

### How app concepts map to the original pitch
| Pitch | Confluence |
|---|---|
| User login / organiser login | Persona cookie `actingAs` (`switchUser`, `/onboarding`), `/organizer` page |
| "Conferences for my profile" | `/agenda` → `recommendTalks` |
| "Matched to a similar profile + their registrations" | `/people` → `findPeople`; `/agenda` strip → `similarPeopleAttending` |
| Registering | `saveTalk` / `checkInTalk` server actions |

---

## 0. Prerequisites (10 min)

- [ ] Dash0: create two auth tokens:
  - **server** token (ingest + API query)
  - **browser** token (ingest only; it's visible in page source)
- [ ] `platform/.env.local` (git-ignored):
  ```bash
  DASH0_ENDPOINT=https://ingress.<region>.aws.dash0.com     # (verify region host)
  DASH0_AUTH_TOKEN=auth_...                                 # server token
  DASH0_DATASET=default
  DASH0_API_URL=https://api.<region>.aws.dash0.com          # (verify) for the in-product panel + MCP
  OTEL_SERVICE_NAME=confluence
  NEXT_PUBLIC_DASH0_ENDPOINT=https://ingress.<region>.aws.dash0.com
  NEXT_PUBLIC_DASH0_AUTH_TOKEN=auth_...                     # browser token
  ```
- [ ] Add `DASH0_API_URL` and the `NEXT_PUBLIC_DASH0_*` vars to `.env.example` (empty values).
- [ ] `npm run setup && npm run dev` works locally, and spans appear in Dash0 → Tracing for service `confluence`.

---

## 1. Backend: traces, logs, metrics (~1h15)

### 1.1 Add log export + resource attributes (`instrumentation.node.ts`, 15 min)
- [ ] Install, at the same version line as the existing exporters:
  `@opentelemetry/sdk-logs`, `@opentelemetry/exporter-logs-otlp-http`, `@opentelemetry/api-logs`
- [ ] Add `logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter({ url: `${endpoint}/v1/logs`, headers }))]` to the `NodeSDK` config.
- [ ] Add resource attributes: `deployment.environment=hackathon`, `service.namespace=confluence`.
- [ ] Make sure Elasticsearch calls show up as child spans. The ES JS client (8.15+) emits OTel spans natively when a tracer is registered **(verify)**. If they don't appear, wrap the `es` calls in `lib/search.ts` with `startSpan`.

### 1.2 Structured logger (`lib/log.ts`, 15 min)
- [ ] `log.info|warn|error(message, attrs)` → emits an OTel `LogRecord` through `@opentelemetry/api-logs`. The active span context gets attached automatically, which links logs to traces. Also mirrors to `console`. Must swallow its own errors (convention).
- [ ] Replace `console.warn` in `lib/ai.ts` (`tagTalks` / `enrichProfile` fallbacks) with `log.warn('ai.fallback', { 'ai.operation': ..., 'error.message': ... })`.
- [ ] Log in server actions: profile created, talk saved/checked-in, event/talk created, and any caught error.

### 1.3 Spans on every server action (`app/actions.ts`, 20 min)
Wrap each action body in `startSpan`:

| Span | Attributes (no names, emails or profile text) |
|---|---|
| `action.switch_user` | `app.user.seeded` |
| `action.create_profile` | `app.profile.interest_count`, `app.profile.has_linkedin` / `has_github` / `has_resume`, `app.ai.enriched` |
| `action.save_talk` / `action.unsave_talk` | `app.talk.id`, `app.event.id`, `app.a11y.input_mode` |
| `action.check_in` | `app.talk.id`, `app.room`, `app.a11y.input_mode` |
| `action.create_event` | `app.event.room_count` |
| `action.create_talk` | `app.talk.tag_count`, `app.talk.auto_tagged`, `app.ai.fallback` |
| `action.delete_talk` | `app.talk.id` |

- [ ] Validation failures (`{ error }` returns) set span status to ERROR with a message, plus `log.warn`.

### 1.4 Richer attributes on existing ranking spans (`lib/search.ts`, 10 min)
- [ ] `recommend.talks`: `app.recommend.result_count`, `app.recommend.top_score`, `app.recommend.empty`, `app.recommend.signals.{tags,keyword,semantic}` (counts of results each retriever contributed to).
- [ ] `recommend.people`: `app.people.result_count`, `app.people.top_score`, `app.people.with_rationale`.
- [ ] `recommend.similar-attendance`: `app.similar.peer_count`, `app.similar.talk_count`.
- [ ] **Fix the dead metric:** call `recordRecommendLatency(feature, ms, hits)` at the end of each `recommend.*` span.

### 1.5 Trace the Claude calls (`lib/ai.ts`, 15 min)
Wrap `tagTalks`, `enrichProfile` and `matchRationale` in spans named `chat <model>`, using the OTel GenAI semantic conventions:
- [ ] `gen_ai.system=anthropic`, `gen_ai.operation.name=chat`, `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.response.finish_reasons`, plus `app.ai.operation=tag_talks|enrich_profile|match_rationale` and `app.ai.fallback=true|false`.
- [ ] Don't record prompt or response content (profiles contain personal data).
- [ ] Dash0's AI observability views should pick these up **(verify)**.

### 1.6 New metrics (`lib/telemetry.ts`, 10 min)
Each wrapped in try/catch like the existing helpers:

| Metric | Type | Attributes |
|---|---|---|
| `app.attendance.actions` | counter | `app.action` (`save`/`unsave`/`check_in`), `app.result` (`ok`/`error`), `app.a11y.input_mode` |
| `app.onboarding.completed` | counter | `app.result`, `app.ai.enriched` |
| `app.recommend.empty` | counter | `app.feature` (`talks`/`people`/`similar`) |
| `app.ai.calls` | counter | `app.ai.operation`, `app.ai.fallback` |
| `app.ai.tokens` | counter | `app.ai.operation`, `gen_ai.token.type` (`input`/`output`) |
| `app.organizer.publishes` | counter | `app.kind` (`event`/`talk`), `app.result` |

### 1.7 Pass the input mode to the server (inclusion signal)
- [ ] The browser (see §2) writes a cookie `a11y_input=keyboard|pointer|touch`.
- [ ] Server actions read it via `cookies()` and add it as `app.a11y.input_mode` on spans and metrics. It only has 3 values, so it's safe as a metric attribute. The keyboard fairness SLO depends on it.

---

## 2. Frontend real-user monitoring (~35 min)

- [ ] Install the Dash0 Web SDK: `npm i @dash0/sdk-web` **(verify package name and init API)**.
- [ ] `components/dash0-rum.tsx` (`'use client'`): inits the SDK once in `useEffect`; renders nothing; does nothing if `NEXT_PUBLIC_DASH0_*` is unset. Mounted in `app/layout.tsx`.
  ```ts
  init({
    serviceName: 'confluence-web',
    endpoint: { url: process.env.NEXT_PUBLIC_DASH0_ENDPOINT!, authToken: process.env.NEXT_PUBLIC_DASH0_AUTH_TOKEN! },
    propagateTraceHeaders: [/^\//, new RegExp(`^${location.origin}`)],  // same-origin RSC + server-action requests
  });
  ```
- [ ] **Trace propagation:** confirm that a server-action POST from the browser shows up in Dash0 as browser span → `action.save_talk` → ES spans in one trace.
- [ ] **Accessibility context** on every session/page view (from browser settings, not identity):
  - `app.a11y.input_mode`: `keyboard` after Tab/arrow navigation with no recent pointer movement, otherwise `pointer`/`touch`; also writes the `a11y_input` cookie
  - `app.a11y.reduced_motion` (`prefers-reduced-motion: reduce`), `app.a11y.forced_colors` (`forced-colors: active`), `app.a11y.prefers_contrast` (`prefers-contrast: more`), `app.a11y.zoom_bucket` (`100` / `125-175` / `200+`)
  - `app.persona.kind`: `seeded` / `onboarded` / `none` (not the user ID)
- [ ] **Custom events**:
  - `a11y.focus_trap`: focus stays on the same element after 5+ Tab presses
  - `ux.rage_click`: 3+ clicks on one element within 1s
  - `onboarding.step` / `onboarding.abandoned` (step name only, no field values)
  - `form.error_shown` (form + field name only)
  - `recommendation.clicked` (`app.feature`, rank position): lets you measure whether recommendations actually get used

---

## 3. Traffic and data (~35 min)

### 3.1 Bigger crowd (10 min)
- [ ] Add a `--crowd N` flag to `scripts/seed.ts` (default stays 100) and seed about **1,500 crowd attendees** with matching attendance rows.
- [ ] Purpose: `findPeople` / `similarPeopleAttending` / the aggregations run at a realistic size, so real performance problems appear in traces.

### 3.2 HTTP load script: `scripts/traffic.ts` (10 min)
Simple and cheap: drives the real Next.js server so every request produces app telemetry.
- [ ] Picks random crowd user IDs and sends `GET /agenda`, `/people`, `/live`, `/talks/<id>` with `Cookie: actingAs=<id>; a11y_input=<mode>`.
- [ ] About 30% `keyboard`, 65% `pointer`, 5% `touch`. 3–5 concurrent loops with jittered pauses.
- [ ] Adds header `x-traffic-source: generator` → recorded as span attribute `app.traffic.synthetic=true` so it can be filtered.
- [ ] `npm run traffic`.

### 3.3 Browser simulator: Playwright (`traffic/`, 15 min)
Needed for real-user monitoring data and for server actions, which plain HTTP can't easily trigger.
- [ ] `traffic/attendee.spec.ts`: pick persona on `/` → `/agenda` → open a talk → save → check in → `/people`.
- [ ] `traffic/onboarding.spec.ts`: `/onboarding` → 5 interests + pasted resume → submit.
- [ ] `traffic/organizer.spec.ts`: `/organizer` → add a talk with no tags (Claude tags it).
- [ ] About **30% of runs are keyboard-only** (Tab/Shift+Tab/Enter/Space, no clicks). Some runs emulate `reducedMotion: 'reduce'` and `forcedColors: 'active'`.
- [ ] `traffic/run.sh` loops 2–3 headless workers for the whole session.

### 3.4 Keep `npm run simulate` running
It still makes `/live` move. Optionally emit a `simulate.tick` span from the script so its writes to ES are visible too.

### 3.5 Dash0 synthetic checks (5 min)
- [ ] HTTP checks every 1 min on `/`, `/agenda`, `/live`, `/organizer`. Requires a reachable URL: deployed, or tunnelled (e.g. `cloudflared tunnel --url http://localhost:3000`).

---

## 4. Dashboard, SLOs, alerts (~30 min)

How Dash0 names OTel metrics in PromQL (dots → underscores, or `{otel_metric_name="..."}`) is **(verify)**. The queries below use the underscore form.

### 4.1 Dashboard: "Confluence Health"
| Panel | Query idea |
|---|---|
| Save/check-in success rate | `sum(rate(app_attendance_actions_total{app_result="ok"}[5m])) / sum(rate(app_attendance_actions_total[5m]))` |
| …split by input mode (keyboard vs pointer) | same, `by (app_a11y_input_mode)` |
| Recommendation latency p95 per feature | `histogram_quantile(0.95, sum by (le, app_feature) (rate(app_recommend_latency_bucket[5m])))` |
| Empty-recommendation rate | `app_recommend_empty` ÷ recommendation span count |
| Claude: calls, fallback rate, tokens/min | `app_ai_calls`, `app_ai_tokens` |
| Room occupancy | `app_room_occupancy` by `app_room` |
| Web Vitals (LCP/INP/CLS) by `app.a11y.input_mode` | Web SDK data |
| Error spans by span name | tracing data |

### 4.2 SLOs
- [ ] **Attendance actions succeed**: 99% of save/check-in actions succeed.
- [ ] **Keyboard fairness**: ≥ 97% of keyboard-only save/check-in actions succeed (the same bar as everyone else minus a small margin).
- [ ] **Recommendations are fast**: 95% of `recommend.*` spans < 800 ms.
- [ ] (Optional) **No one left out**: ≥ 95% of agenda/people views return at least 1 result.

### 4.3 Alerts (check rules)
- [ ] Attendance action success < 95% for 5 min
- [ ] Keyboard success more than 5 points below pointer success for 5 min
- [ ] `recommend.*` p95 > 1.5 s
- [ ] Claude fallback rate > 50% for 10 min (AI silently degrading)
- [ ] Synthetic check failing
- [ ] Route alerts to Slack and/or Linear **(verify integrations available on your plan)**

---

## 5. Find and fix with Agent0 / MCP (ongoing from ~hour 1)

### 5.1 Connect Dash0 MCP to Claude Code (5 min)
```bash
claude mcp add --transport http dash0 "${DASH0_API_URL}/mcp" \
  --header "Authorization: Bearer ${DASH0_AUTH_TOKEN}"     # (verify URL)
```
- [ ] Check: Claude Code can list services and see `confluence` / `confluence-web`.

### 5.2 Loop (start once traffic has run ~20 min)
1. Ask Agent0 (Dash0 UI) or Claude Code via MCP, for example:
   - "Which spans in `confluence` have the highest p95 in the last 30 min, and what are their child Elasticsearch calls?"
   - "Why is `recommend.people` slow for some users?"
   - "Which server actions are erroring and what do the linked logs say?"
   - "Are keyboard-only sessions failing save/check-in more than pointer sessions?"
   - "How often is Claude falling back to keywords, and why?"
2. Fix the root cause in code (respecting `CONVENTIONS.md`).
3. Confirm the improvement in Dash0 (same query, after the fix).

**Places likely to show real problems:**
- `findPeople` / `similarPeopleAttending`: multi-step ES queries (similar profiles → terms agg → ID lookups) that grow with crowd size
- `getTalkAttendeeCounts` / `getUsersByIds` called per page render: look for repeated or sequential ES calls in one trace
- `semanticReady()` mapping probe every 15 s
- Claude latency or fallbacks on `createTalk` / `createProfile` (blocking the action)
- `/live` polling every 5 s creating load on `live.rooms` / `live.trending`
- Keyboard focus problems in `onboarding-form.tsx`, `talk-form.tsx`, `top-nav.tsx` (from `a11y.focus_trap` events)
- (Already known) `recordRecommendLatency` never called. Fix it in §1.4. It doesn't count as a Dash0 find, because we found it by reading the code.

### 5.3 Evidence log: `docs/dash0-fixes.md`
For each fix: time, question asked, Agent0/MCP answer (screenshot), root cause, commit hash, before/after numbers.

---

## 6. Observability inside the product (~45 min, in parallel with §4–5)

### 6.1 Organizer "Is this conference working for attendees?" panel
- [ ] `lib/dash0.ts`: the only module that queries the Dash0 API (PromQL, Prometheus-compatible query endpoint **(verify path)**) using the server token. 60 s in-memory cache. Never throws; returns `null` so the UI hides the panel.
- [ ] Rendered as a section on `app/organizer/page.tsx` (server component):
  - **Recommendation coverage**: % of attendee views that got at least 1 talk / person
  - **Keyboard vs pointer success**: save/check-in success by input mode
  - **Recommendation speed**: p95 per feature
  - **AI tagging health**: Claude fallback rate (so organisers know whether new talks get good tags)
  - Link: "Open in Dash0 →" to the dashboard
- [ ] Follows the "explainable numbers" convention: each figure says what it measures and over what window.

### 6.2 Attendee-facing status on `/live` (if time)
- [ ] A small "Platform status" line on `/live` that uses the same `lib/dash0.ts`: "Recommendations: healthy · Updated 30s ago", with a degraded state when the SLO is burning.

---

## 7. Privacy

- [ ] No names, emails, LinkedIn/GitHub URLs, resume text, headline/summary or Claude prompts/responses in spans, logs, metrics or browser events. IDs, counts, enums and booleans only.
- [ ] (Optional, 10 min) A Dash0 SignalControl rule as a safety net that drops attributes matching `*.email`, `*.name`, `*resume*` **(verify)**.

---

## Schedule

| Time | Person A (Dash0 owner) | Person B (free teammate) |
|---|---|---|
| 0:00–0:10 | §0 prerequisites | |
| 0:10–1:25 | §1 backend: logs, action spans, AI spans, metrics, dead-metric fix; §5.1 MCP | |
| 1:25–2:00 | §2 Web SDK + a11y context | §3.1 bigger seed + §3.2 HTTP load script → start running |
| 2:00–2:30 | §4 dashboard, SLOs, alerts | §3.3 Playwright simulator → start running |
| 2:30–3:15 | §5.2 find and fix loop + §5.3 evidence | §6.1 organizer panel |
| 3:15–3:45 | §5.2 continued | §6.2 `/live` status / §3.5 synthetics |
| 3:45–4:00 | `npm run typecheck && npm run lint`, commit, buffer | §7 |

## Out of scope
Terraform, Kubernetes operator, profiling, AI evals, Darkplane, CI deploy gates.

## Open questions
- [ ] Where will it be hosted for the demo (needed for synthetic checks)? Local + tunnel, or a VM/container?
- [ ] Dash0 region and both tokens ready?
- [ ] OK to add Playwright as a dev dependency?
- [ ] Is the teammate still changing `lib/search.ts` / `app/actions.ts`? Coordinate to avoid merge conflicts (instrument after their next push, or work in small commits).
