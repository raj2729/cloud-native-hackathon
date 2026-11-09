/**
 * CI latency gate.
 *
 * Compares p95 latency per operation before and after the CI window boundary,
 * using Dash0's Prometheus-compatible query API over the span-derived
 * `dash0.spans.duration` metric. When an operation regresses it:
 *
 *   1. calls an Agent0 Automation webhook with the numbers, commits and a diff
 *      link, so Agent0 runs a root-cause analysis and posts it to Slack;
 *   2. optionally posts an immediate heads-up to a Slack incoming webhook;
 *   3. writes a GitHub job summary and the `regressed` step output;
 *   4. exits non-zero when FAIL_ON_REGRESSION is true (the default).
 *
 * If Dash0 cannot be queried the result is "inconclusive": reported, but never
 * a failed build — an observability outage must not block shipping.
 *
 * Runs the same in CI and locally:
 *   npm run deploy:gate -- --window-start 2026-11-09T18:00:00Z --bake 5
 *
 * Required env: DASH0_API_URL, DASH0_AUTH_TOKEN
 * Optional env: see `config` below.
 */
import { appendFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function num(value: string | undefined, fallback: number): number {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) ? n : fallback;
}

const bakeMinutes = num(arg('bake') ?? process.env.BAKE_MINUTES, 10);

const config = {
  apiUrl: (process.env.DASH0_API_URL ?? '').replace(/\/$/, ''),
  token: process.env.DASH0_AUTH_TOKEN ?? '',
  dataset: process.env.DASH0_DATASET ?? 'default',
  service: process.env.GATE_SERVICE_NAME ?? process.env.OTEL_SERVICE_NAME ?? 'converge',
  /** Comparison boundary. Defaults to "bake minutes ago" for local runs. */
  windowStart: new Date(
    arg('window-start') ??
      process.env.WINDOW_START ??
      arg('deploy-time') ??
      process.env.DEPLOY_TIME ??
      Date.now() - bakeMinutes * 60_000,
  ),
  bakeMinutes,
  /** Length of the baseline window before the comparison boundary. */
  baselineMinutes: num(process.env.BASELINE_MINUTES, Math.max(bakeMinutes, 15)),
  /** Relative increase in p95 that counts as a regression. */
  thresholdPct: num(process.env.LATENCY_REGRESSION_PCT, 25),
  /** Absolute increase in p95 (ms) that must also be exceeded. */
  minDeltaMs: num(process.env.LATENCY_MIN_DELTA_MS, 50),
  /** Minimum spans per window for an operation to be compared at all. */
  minSamples: num(process.env.LATENCY_MIN_SAMPLES, 20),
  /** PromQL label for the span name. (verify against your Dash0 data) */
  groupLabel: process.env.GATE_GROUP_LABEL ?? 'otel_span_name',
  failOnRegression: (process.env.FAIL_ON_REGRESSION ?? 'true') !== 'false',
  agent0WebhookUrl: process.env.AGENT0_WEBHOOK_URL ?? '',
  agent0WebhookSecret: process.env.AGENT0_WEBHOOK_SECRET ?? '',
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL ?? '',
  // CI context, filled in by GitHub Actions.
  commitSha: process.env.GITHUB_SHA ?? arg('sha') ?? 'local',
  previousSha: process.env.PREVIOUS_SHA ?? '',
  repository: process.env.GITHUB_REPOSITORY ?? '',
  serverUrl: process.env.GITHUB_SERVER_URL ?? 'https://github.com',
  runId: process.env.GITHUB_RUN_ID ?? '',
  comparisonId: process.env.COMPARISON_ID ?? `local-${Date.now()}`,
  environment: process.env.DEPLOYMENT_ENV ?? 'hackathon',
};

// ---------------------------------------------------------------------------
// Dash0 queries
// ---------------------------------------------------------------------------

interface PromSample {
  metric: Record<string, string>;
  value: [number, string];
}

interface PromResponse {
  status: 'success' | 'error';
  error?: string;
  data?: { resultType: string; result: PromSample[] };
}

async function promQuery(query: string, at: Date): Promise<PromSample[]> {
  const url = new URL(`${config.apiUrl}/api/prometheus/api/v1/query`);
  url.searchParams.set('query', query);
  url.searchParams.set('time', (at.getTime() / 1000).toFixed(3));
  url.searchParams.set('dataset', config.dataset);

  const res = await fetch(url, { headers: { Authorization: `Bearer ${config.token}` } });
  const body = (await res.json().catch(() => null)) as PromResponse | null;
  if (!res.ok || !body || body.status !== 'success' || !body.data) {
    throw new Error(`Dash0 query failed (${res.status}): ${body?.error ?? res.statusText}`);
  }
  return body.data.result;
}

function selector(): string {
  return `{otel_metric_name="dash0.spans.duration", service_name="${config.service}"}`;
}

function countSelector(): string {
  return `{otel_metric_name="dash0.spans", service_name="${config.service}"}`;
}

interface WindowStats {
  p95Ms: number;
  samples: number;
}

/** p95 and span count per operation for the window ending at `at`. */
async function windowStats(at: Date, minutes: number): Promise<Map<string, WindowStats>> {
  const by = config.groupLabel;
  const range = `${Math.max(1, Math.round(minutes))}m`;
  const [p95, counts] = await Promise.all([
    promQuery(
      `histogram_quantile(0.95, sum by (le, ${by}) (rate(${selector()}[${range}]))) * 1000`,
      at,
    ),
    promQuery(`sum by (${by}) (increase(${countSelector()}[${range}]))`, at),
  ]);

  const out = new Map<string, WindowStats>();
  for (const sample of p95) {
    const op = sample.metric[by] ?? '(all)';
    const value = Number.parseFloat(sample.value[1]);
    if (Number.isFinite(value)) out.set(op, { p95Ms: value, samples: 0 });
  }
  for (const sample of counts) {
    const op = sample.metric[by] ?? '(all)';
    const entry = out.get(op);
    if (entry) entry.samples = Math.round(Number.parseFloat(sample.value[1]) || 0);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

interface Comparison {
  operation: string;
  beforeMs: number;
  afterMs: number;
  deltaMs: number;
  deltaPct: number;
  beforeSamples: number;
  afterSamples: number;
  regressed: boolean;
}

function compare(before: Map<string, WindowStats>, after: Map<string, WindowStats>): Comparison[] {
  const rows: Comparison[] = [];
  for (const [operation, a] of after) {
    const b = before.get(operation);
    if (!b) continue; // New operation: nothing to compare against.
    const deltaMs = a.p95Ms - b.p95Ms;
    const deltaPct = b.p95Ms > 0 ? (deltaMs / b.p95Ms) * 100 : 0;
    const enoughData = a.samples >= config.minSamples && b.samples >= config.minSamples;
    rows.push({
      operation,
      beforeMs: b.p95Ms,
      afterMs: a.p95Ms,
      deltaMs,
      deltaPct,
      beforeSamples: b.samples,
      afterSamples: a.samples,
      regressed: enoughData && deltaPct >= config.thresholdPct && deltaMs >= config.minDeltaMs,
    });
  }
  return rows.sort((x, y) => y.deltaMs - x.deltaMs);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

function ms(n: number): string {
  return `${Math.round(n)}ms`;
}

function regressionLines(rows: Comparison[]): string {
  return rows
    .filter((r) => r.regressed)
    .slice(0, 8)
    .map(
      (r) =>
        `${r.operation}: p95 ${ms(r.beforeMs)} → ${ms(r.afterMs)} (+${Math.round(r.deltaPct)}%, n=${r.beforeSamples}/${r.afterSamples})`,
    )
    .join('\n');
}

function compareUrl(): string {
  if (!config.repository) return '';
  const base = `${config.serverUrl}/${config.repository}`;
  return config.previousSha
    ? `${base}/compare/${config.previousSha}...${config.commitSha}`
    : `${base}/commit/${config.commitSha}`;
}

function runUrl(): string {
  return config.repository && config.runId
    ? `${config.serverUrl}/${config.repository}/actions/runs/${config.runId}`
    : '';
}

/**
 * Starts the Agent0 RCA automation. Every value must be a string; each key
 * becomes a `{{key}}` placeholder in the automation's instruction.
 */
async function triggerAgent0(rows: Comparison[]): Promise<boolean> {
  if (!config.agent0WebhookUrl || !config.agent0WebhookSecret) {
    console.log('Agent0 webhook not configured — skipping RCA trigger.');
    return false;
  }
  const worst = rows.find((r) => r.regressed);
  const variables: Record<string, string> = {
    eventType: 'latency_regression',
    serviceName: config.service,
    environment: config.environment,
    comparisonId: config.comparisonId,
    commitSha: config.commitSha,
    previousSha: config.previousSha || 'unknown',
    repository: config.repository || 'unknown',
    compareUrl: compareUrl() || 'unavailable',
    ciRunUrl: runUrl() || 'unavailable',
    windowStart: config.windowStart.toISOString(),
    bakeMinutes: String(config.bakeMinutes),
    baselineMinutes: String(config.baselineMinutes),
    worstOperation: worst?.operation ?? '',
    worstBeforeP95Ms: worst ? String(Math.round(worst.beforeMs)) : '',
    worstAfterP95Ms: worst ? String(Math.round(worst.afterMs)) : '',
    regressions: regressionLines(rows),
  };

  const res = await fetch(config.agent0WebhookUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.agent0WebhookSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ variables }),
  });
  if (!res.ok) {
    console.error(`Agent0 webhook returned ${res.status}: ${await res.text().catch(() => '')}`);
    return false;
  }
  console.log('Agent0 RCA automation triggered.');
  return true;
}

/** Immediate Slack heads-up; Agent0 follows up with the root cause. */
async function notifySlack(rows: Comparison[], agent0Started: boolean): Promise<void> {
  if (!config.slackWebhookUrl) return;
  const sha = config.commitSha.slice(0, 7);
  const links = [
    compareUrl() && `<${compareUrl()}|diff>`,
    runUrl() && `<${runUrl()}|CI run>`,
  ]
    .filter(Boolean)
    .join(' · ');
  const text =
    `:rotating_light: *Latency regression for \`${config.service}\` @ \`${sha}\`* (${config.environment})\n` +
    '```' +
    regressionLines(rows) +
    '```\n' +
    (agent0Started
      ? ':mag: Agent0 is investigating the root cause and will post findings here.'
      : ':warning: Agent0 RCA was not triggered — investigate in Dash0.') +
    (links ? `\n${links}` : '');

  const res = await fetch(config.slackWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) console.error(`Slack webhook returned ${res.status}`);
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function writeOutput(key: string, value: string): void {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

function writeSummary(markdown: string): void {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}

function summaryTable(rows: Comparison[]): string {
  const header =
    '| Operation | p95 before | p95 after | Δ | n before/after | |\n|---|---:|---:|---:|---:|---|\n';
  const body = rows
    .slice(0, 15)
    .map(
      (r) =>
        `| \`${r.operation}\` | ${ms(r.beforeMs)} | ${ms(r.afterMs)} | ${r.deltaMs >= 0 ? '+' : ''}${Math.round(r.deltaPct)}% | ${r.beforeSamples}/${r.afterSamples} | ${r.regressed ? '🔴' : '🟢'} |`,
    )
    .join('\n');
  return header + body + '\n';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!config.apiUrl || !config.token) {
    console.error('DASH0_API_URL and DASH0_AUTH_TOKEN are required.');
    process.exit(2);
  }

  const afterEnd = new Date(config.windowStart.getTime() + config.bakeMinutes * 60_000);
  if (afterEnd.getTime() > Date.now() + 30_000) {
    console.warn(`Bake window ends in the future (${afterEnd.toISOString()}); using now.`);
  }
  const afterAt = new Date(Math.min(afterEnd.getTime(), Date.now()));

  console.log(
    `Latency gate for ${config.service}: baseline ${config.baselineMinutes}m before ` +
      `${config.windowStart.toISOString()} vs ${config.bakeMinutes}m after. ` +
      `Regression = +${config.thresholdPct}% and +${config.minDeltaMs}ms on p95, n ≥ ${config.minSamples}.`,
  );

  let rows: Comparison[];
  try {
    const [before, after] = await Promise.all([
      windowStats(config.windowStart, config.baselineMinutes),
      windowStats(afterAt, config.bakeMinutes),
    ]);
    rows = compare(before, after);
  } catch (err) {
    const message = (err as Error).message;
    console.warn(`Inconclusive: ${message}`);
    writeOutput('regressed', 'unknown');
    writeSummary(`## ⚪ Latency gate inconclusive\n\n${message}\n`);
    return;
  }

  const regressed = rows.filter((r) => r.regressed);
  console.log(summaryTable(rows));

  if (rows.length === 0) {
    writeOutput('regressed', 'unknown');
    console.warn('No comparable operations — is traffic reaching Dash0 in both windows?');
    writeSummary(
      `## ⚪ Latency gate: no data\n\nNo operation of \`${config.service}\` had spans in both windows.\n`,
    );
    return;
  }

  writeOutput('regressed', String(regressed.length > 0));

  if (regressed.length === 0) {
    writeSummary(`## 🟢 No latency regression\n\n${summaryTable(rows)}`);
    console.log('No latency regression.');
    return;
  }

  const agent0Started = await triggerAgent0(rows).catch((err: unknown) => {
    console.error(`Agent0 trigger failed: ${(err as Error).message}`);
    return false;
  });
  await notifySlack(rows, agent0Started).catch((err: unknown) => {
    console.error(`Slack notification failed: ${(err as Error).message}`);
  });

  writeSummary(
    `## 🔴 Latency regression in ${regressed.length} operation(s)\n\n` +
      `${summaryTable(rows)}\n` +
      (agent0Started
        ? 'Agent0 is running a root-cause analysis; findings will be posted to Slack.\n'
        : 'Agent0 RCA was not triggered (webhook not configured or failed).\n'),
  );

  if (config.failOnRegression) {
    console.error(`Latency regression in ${regressed.length} operation(s).`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('Latency gate crashed:', err);
  // A crash in the gate itself is inconclusive, not a regression.
  process.exit(0);
});
