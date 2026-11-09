# Admin observability with Dash0

The admin view is `/admin`. It requires a separate `ADMIN_ACCESS_TOKEN`; attendee
profile-switch cookies do not grant access. A random access code was generated in
the ignored `.env.local` for this local workspace. Use that value on `/admin/login`.
`ADMIN_COOKIE_SECURE=false` is for localhost HTTP only; use `true` behind HTTPS.
For a production organisation, replace the shared demo code with your SSO/RBAC.

## What is implemented

Every Discover request records `retrieval`, optional `generation`, and end-to-end
`discovery` spans. Correlate the three by `app.request_id`. Each records duration,
outcome, provider and service version. A generated-answer failure remains visible
as `fallback` even when the user received useful source excerpts. No query text,
resume, response body, API key or user ID is recorded by this custom instrumentation.
Auto-instrumentation may also capture standard HTTP/database metadata; review your
Dash0 ingestion policies before production.

The embedded admin dashboard shows observed request counts, p50/p95/p99, a latency
time series, a non-overlapping histogram, latency/availability SLIs, window error
budgets and a triage queue. Filter by operation and 15m/1h/4h; application data polls every
2 seconds independently of Dash0 queries, which poll every 15 seconds. Empty windows show No data, never 100% availability. Charts and triage
use real measurements in `converge-operations`, with no generated demo measurements.
The index needs an appropriate retention policy for your production environment.

Dash0 panels query its Prometheus API from the server, with a separate read token.
These panels show explicit unconfigured/error/no-data states. Dash0, Slack and MCP
connectivity is not implied by a saved URL. The link to your saved Dash0 dashboard
opens your authenticated Dash0 workspace.

## 1. Collect OTel

In Dash0, open Organisation Settings → Endpoints and copy your OTLP **HTTP** ingress
endpoint, not the gRPC endpoint. Create an Ingesting auth token. Set on the server:

```dotenv
DASH0_ENDPOINT=https://YOUR-OTLP-HTTP-HOST
DASH0_AUTH_TOKEN=YOUR-INGESTING-TOKEN
DASH0_DATASET=default
OTEL_SERVICE_NAME=converge
APP_VERSION=0.1.0
```

Restart the app and run some searches. The NodeSDK exports metrics every 10 seconds.
Configuration is shown separately from confirmed delivery; verify the service,
spans and metrics in Dash0. `app.operation.duration` is an OTel histogram in **ms**.
`app.operation.requests` counts completed operations by outcome.
`app.operation.slo` counts good/bad events by `app.slo` and `app.good`.

## 2. Read Dash0 inside the app

From Organisation Settings → Endpoints, copy the **API host** for your region.
Create a token with Reading permission for your dataset; an ingest-only token
cannot query data. Keep both tokens server-side:

```dotenv
DASH0_API_ENDPOINT=https://api.YOUR-REGION.YOUR-CLOUD.dash0.com
DASH0_API_TOKEN=YOUR-READING-TOKEN
DASH0_DASHBOARD_URL=https://app.dash0.com/YOUR-SAVED-DASHBOARD
```

The custom panels call `/api/prometheus/api/v1/query` with Bearer auth and a dataset
parameter. OTel attribute keys use underscores in PromQL labels (`app.operation`
becomes `app_operation`); the `otel_metric_name` value retains dots. No token goes
into the browser or a dashboard URL.

The protected JSON API is `/api/admin/observability?minutes=15&operation=discovery`.
It accepts the signed admin cookie or `Authorization: Bearer ADMIN_ACCESS_TOKEN`.
Only the three defined operations and 15/60/240-minute windows are accepted.

## 3. Targets and dashboard assets

Targets live in `lib/observability.ts`:

| Operation | Good latency event | Latency target | Availability target |
| --- | --- | --- | --- |
| Retrieval | OK and ≤3s | 99% | 99.5% |
| Generation | OK and ≤12s | 99% | 99.5% |
| End-to-end discovery | OK and ≤15s | 99% | 99.5% |

Availability treats errors and excerpt fallbacks as bad events. These are starting
targets to review with your team, not a measured production commitment. The app
shows selected-window SLIs; the supplied OpenSLO resources define rolling 28-day
objectives. `1 - bad / (total * (1 - target))` is the selected-window remaining
budget; negative values indicate overspend. Empty windows do not pass an SLO.

`observability/dashboard.json` is a Perses dashboard starter; import it into Dash0
or use its CLI. `observability/slo-*.json` are OpenSLO resources. To provision SLOs,
use Dash0's `PUT /api/slos/{origin}?dataset=default`, with each JSON file as the body
and a configuration token with All permissions. Six resources cover the three
operations and two objectives. Change service/dataset to match your deployment.
The current workspace templates use the configured service name `confluence`.
Keep their service selectors in sync with `OTEL_SERVICE_NAME`.
Review these templates in your Dash0 tenant before enabling alerting. Live import
has not been tested without Dash0 credentials.

`observability/check-rules.json` provides sustained latency, fallback and missing-
telemetry checks. They are disabled (`dash0-enabled=false`) until you choose routing
and review thresholds. The missing-telemetry rule is suitable only when traffic is
expected. For SLO burn-rate alerts use Dash0's SLO alerting UI with fast and slow
burn windows, rather than paging on each individual slow request.

## 4. Slack routing and triage

In Dash0: Organisation Settings → Notification Channels → Add → Slack Bot.
Connect the intended workspace, select the alert channel and invite @Dash0 for a
private channel. Attach the channel to the check rules, or use label-based routing
for `team=conference`. Set notification frequency to prevent duplicate storms.
Then use Dash0's test-notification action and verify it in Slack.

Set `DASH0_SLACK_CHANNEL_URL` to the HTTPS Slack channel link to make it accessible
from the admin panel. No webhook token is needed by the app. Slack delivery and
check-rule provisioning are external configuration steps; this implementation
has not posted messages or connected your Slack workspace.

Triage flow: alert thread → admin triage row → request/trace ID → Dash0 spans →
compare retrieval vs generation → investigate provider rate limits, ES failures,
latency or citation fallback → fix → verify the SLI recovers. The queue is a view
of observed events, not a replacement for incident ownership/acknowledgement.

## 5. CI and release decisions

Normal Platform CI now runs all regression tests. The separate **Dash0 Release
Gate** workflow is manually triggered. Add GitHub Actions secrets
`DASH0_API_ENDPOINT` and `DASH0_API_TOKEN` (Reading) and optional variables
`DASH0_DATASET` / `OTEL_SERVICE_NAME`. It reads discovery SLIs for the preceding
15 minutes, requires 20 completed operations and fails on missing telemetry,
API errors or missed targets. It evaluates existing service health, not an
isolated PR preview. Use it as a required pre-release step once your team has
chosen targets and a traffic baseline. Run locally with `npm run dash0:gate`.
No workflow or release was triggered by this change.

## 6. MCP investigations

Set `DASH0_MCP_ENDPOINT` to the region-specific MCP endpoint shown in Dash0
Organisation Settings → Endpoints → MCP, such as
`https://api.us-east-1.aws.dash0.com/mcp`. Configure that remote Streamable HTTP
server in your MCP client and complete its OAuth flow, or use a Reading token for
automation. The app displays setup guidance; its admin-only controls can verify the connection and execute a fixed read-only
latency query. Credentials stay on the server. Example investigation prompts:

- Why did Converge generation p95 increase in the last 15 minutes?
- Correlate fallback requests with provider errors and rate limits.
- Which Converge SLO is consuming its error budget fastest?

MCP is for investigation; it is not needed to draw charts. No remediation runs from
the admin dashboard automatically.

## Verification

```sh
npm run es:setup
npm test
npm run typecheck
npm run lint
npm run build
```

Open Discover and search, then open Admin to confirm real samples appear. Test
admin redirects/401 responses without the admin cookie. Configure Dash0 credentials
and verify the same custom metrics appear in the Dash0 panels. Without credentials,
only the app measurements are live; Dash0 queries, Slack delivery and MCP require
account setup.

Sources: [Dash0 API](https://www.dash0.com/docs/dash0/miscellaneous/glossary/dash0-api),
[Dashboards as code](https://www.dash0.com/docs/dash0/dashboards/manage-dashboards-as-code),
[SLO API](https://www.dash0.com/docs/dash0/monitoring/alerting/slos-api),
[Notification channels](https://www.dash0.com/docs/dash0/monitoring/alerting/send-alert-check-notifications),
[MCP](https://www.dash0.com/hub/integrations/int_dash0_mcp/overview).

## Generate real search traffic

With the app running, use a second terminal:

```sh
cd platform
npm run traffic:search -- --count=20 --url=http://localhost:3101
```

This runs real keyword/semantic searches through the same measured pipeline as the
Discover page. It rotates talk, people and combined searches. The protected
`POST /api/admin/search-traffic` endpoint requires `ADMIN_ACCESS_TOKEN`; the CLI
loads it from `.env.local` and sends it in an Authorization header. It never prints
the token. API responses contain counts and generation status, not attendee text.

For RAG generation traffic as well:

```sh
npm run traffic:search -- --count=10 --rag --url=http://localhost:3101
```

Normal Elasticsearch inference and model-provider usage applies. Search-only is
the default. Tune `--concurrency=2` (1–5), `--delay=1500` (milliseconds between
requests per worker), and `--event=devconf-2026`. Runs are capped at 100 requests;
Ctrl+C aborts in-flight requests. The API endpoint is admin-only. This is a small
load generator for the demo, not a production stress-testing service.

Watch `/admin` or the Dash0 service `confluence`. The admin view polls application measurements every
2 seconds; OTel metrics export every 10 seconds. Histogram and SLI samples are
measured from actual operations. The existing `npm run simulate` command changes
attendance/check-ins; it does not generate search traffic.


## Live chart behaviour and in-app MCP

The 15-minute latency chart now uses 10-second p95 buckets (1-minute buckets for
an hour, 5-minute buckets for four hours). The app polls only its Elasticsearch
snapshot every 2 seconds, so Dash0 query latency cannot stall the local chart.
Dash0 panels poll independently every 15 seconds and OTel exports every 10 seconds.
Index refresh and network time still add delay. Only completed requests become
latency samples; a quiet service legitimately has no new points. The dashboard
shows its last successful update, retains the last snapshot on a failure, and
provides pause/resume and manual refresh controls. Hidden tabs stop requesting
metrics and resume when visible. No sample traffic is generated by opening Admin.

The MCP investigation card has **Check MCP connection** and **Investigate latency**
buttons. It connects with the official MCP client SDK to `DASH0_MCP_ENDPOINT` via
Streamable HTTP, using `DASH0_MCP_TOKEN` or the existing Dash0 API Reading token.
When reusing the API token, the endpoint must match `DASH0_API_ENDPOINT`'s origin.
Both require HTTPS and the configured Dash0 `/mcp` endpoint; no URL comes from the
browser. The first action discovers read-only tools. The second calls only
`promql`, only if it advertises `readOnlyHint=true`, with the fixed service/operation
p95 query and selected time window. Other tools, including task execution, are not
callable from this panel. Results are displayed as bounded monitoring evidence.

Use `npm run verify:mcp` to verify the connection and advertised schemas. The
configuration is an MCP **client** connecting to Dash0's hosted server; the app does
not launch an unauthenticated MCP server. Adding a different provider requires a
separate approved endpoint, credentials and tool mapping, not pointing the Dash0
token at a different server.
