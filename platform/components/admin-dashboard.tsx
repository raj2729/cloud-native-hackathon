'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { OPERATIONS, TARGETS, SLO_TARGET, AVAILABILITY_TARGET, sliState, type ObservabilitySnapshot, type Operation } from '@/lib/observability';
import type { Dash0Summary } from '@/lib/dash0';
import { adminLogout } from '@/app/admin/login/actions';
import { McpInvestigation } from './mcp-investigation';

const percent = (value: number | null): string => value === null ? 'No data' : `${(value * 100).toFixed(2)}%`;
const milliseconds = (value: number | null): string => value === null ? 'No data' : `${(value / 1000).toFixed(2)}s`;
const time = (at: string | number): string => new Date(at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' });

function LatencyChart({ snapshot }: { snapshot: ObservabilitySnapshot }) {
  const values = snapshot.timeline.filter((point) => point.p95 !== null);
  if (!values.length) return <p className="text-muted text-sm py-10">No latency samples in this window. Run a conference search to start collecting measurements.</p>;
  const max = Math.max(...values.map((p) => p.p95 ?? 0), TARGETS[snapshot.operation], 1);
  const start = snapshot.timeline[0].at;
  const end = snapshot.timeline[snapshot.timeline.length - 1].at;
  const x = (at: number): number => 20 + (at - start) / Math.max(1, end - start) * 600;
  const y = (value: number): number => 175 - value / max * 145;
  const segments: string[] = []; let current: string[] = [];
  for (const point of snapshot.timeline) {
    if (point.p95 === null) { if (current.length) segments.push(current.join(' ')); current = []; }
    else current.push(`${x(point.at)},${y(point.p95)}`);
  }
  if (current.length) segments.push(current.join(' '));
  return <>
    <svg viewBox="0 0 650 205" className="w-full" role="img" aria-label={`p95 ${snapshot.operation} latency over ${snapshot.minutes} minutes; dashed line shows the ${TARGETS[snapshot.operation] / 1000} second target`}>
      <line x1="20" x2="620" y1={y(TARGETS[snapshot.operation])} y2={y(TARGETS[snapshot.operation])} stroke="var(--warn)" strokeDasharray="6 5" />
      {segments.map((points, i) => <polyline key={i} points={points} fill="none" stroke="var(--accent)" strokeWidth="2.5" />)}
      {values.map((point) => <circle key={point.at} cx={x(point.at)} cy={y(point.p95!)} r="3" fill="var(--accent)"><title>{time(point.at)} UTC · p95 {milliseconds(point.p95)} · {point.count} operations</title></circle>)}
      <text x="20" y="198" fill="var(--muted)" fontSize="12">{time(start)} UTC</text><text x="620" y="198" textAnchor="end" fill="var(--muted)" fontSize="12">{time(end)} UTC</text>
    </svg>
    <p className="text-xs text-muted">Blue: p95 per {snapshot.minutes === 15 ? '10s' : snapshot.minutes === 60 ? '1m' : '5m'} interval · Dashed: {TARGETS[snapshot.operation] / 1000}s target · Gaps: no requests. New samples appear when requests complete.</p>
    <details className="text-sm mt-4"><summary className="cursor-pointer text-accent">View chart data</summary><div className="overflow-x-auto mt-3"><table className="w-full text-left"><thead><tr><th>Time (UTC)</th><th>Operations</th><th>p95</th><th>Errors / fallbacks</th></tr></thead><tbody>{snapshot.timeline.map((point) => <tr key={point.at}><td>{time(point.at)}</td><td>{point.count}</td><td>{milliseconds(point.p95)}</td><td>{point.errors} / {point.fallbacks}</td></tr>)}</tbody></table></div></details>
  </>;
}


export function AdminDashboard({ initialSnapshot, initialDash0, minutes, operation, dashboardUrl, slackUrl, mcpUrl, otelConfigured, initialUpdatedAt }: {
  initialSnapshot: ObservabilitySnapshot | null; initialDash0: Dash0Summary | null;
  minutes: number; operation: Operation; dashboardUrl: string | null; slackUrl: string | null;
  mcpUrl: string | null; otelConfigured: boolean; initialUpdatedAt: number;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [remote, setRemote] = useState(initialDash0);
  const [paused, setPaused] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [appError, setAppError] = useState('');
  const [remoteError, setRemoteError] = useState('');
  const pending = useRef(new Set<string>());
  const controllers = useRef(new Set<AbortController>());
  const refresh = useCallback(async (source: 'app' | 'dash0'): Promise<void> => {
    if (pending.current.has(source) || document.hidden) return;
    pending.current.add(source);
    const controller = new AbortController(); controllers.current.add(controller);
    try {
      const params = new URLSearchParams({ minutes: String(minutes), operation, source });
      const response = await fetch(`/api/admin/observability?${params}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(response.status === 401 ? 'Admin session expired. Sign in again.' : `${source === 'app' ? 'Application' : 'Dash0'} metrics could not refresh.`);
      const data = await response.json() as { snapshot?: ObservabilitySnapshot; dash0?: Dash0Summary; updatedAt: number };
      if (source === 'app' && data.snapshot) { setSnapshot(data.snapshot); setUpdatedAt(data.updatedAt); setAppError(''); }
      if (source === 'dash0' && data.dash0) { setRemote(data.dash0); setRemoteError(''); }
    } catch (error) {
      if (!controller.signal.aborted) (source === 'app' ? setAppError : setRemoteError)(error instanceof Error ? error.message : 'Refresh failed.');
    } finally { pending.current.delete(source); controllers.current.delete(controller); }
  }, [minutes, operation]);
  useEffect(() => {
    if (paused) return;
    const application = setInterval(() => void refresh('app'), 2000);
    const dash0 = setInterval(() => void refresh('dash0'), 15000);
    const visible = (): void => { if (!document.hidden) { void refresh('app'); void refresh('dash0'); } };
    document.addEventListener('visibilitychange', visible);
    const active = controllers.current;
    return () => { clearInterval(application); clearInterval(dash0); document.removeEventListener('visibilitychange', visible); active.forEach((controller) => controller.abort()); };
  }, [paused, refresh]);
  const latencySli = sliState(snapshot?.goodLatency ?? 0, snapshot?.total ?? 0, SLO_TARGET);
  const availability = sliState((snapshot?.total ?? 0) - (snapshot?.errors ?? 0) - (snapshot?.fallbacks ?? 0), snapshot?.total ?? 0, AVAILABILITY_TARGET);
  return <div className="py-10 space-y-7">
    <header className="flex items-start justify-between gap-4 flex-wrap"><div>
      <p className="text-accent text-sm mb-2">Converge operations · Admin</p>
      <h1 className="text-3xl font-semibold">Conference service health</h1>
      <p className="text-muted text-sm mt-3">Track search and answer latency, catch degraded answers, and investigate what changed.</p>
    </div><form action={adminLogout}><button className="btn">Sign out of admin</button></form></header>
    <div className="flex gap-2 flex-wrap text-sm">
      <span className="pill">OTel export: {otelConfigured ? 'Configured · delivery checked in Dash0' : 'Not configured'}</span>
      <span className="pill">Dash0 API: {remote?.status ?? 'unavailable'}</span>
      <span className="pill">App polling: 2s · Dash0 polling: 15s</span>
      {dashboardUrl && <a className="btn" href={dashboardUrl} target="_blank" rel="noreferrer">Open Dash0 dashboard ↗</a>}
    </div>
    <section className="card p-4 flex flex-wrap items-center justify-between gap-3" aria-label="Live update controls">
      <div className="text-sm"><p className="font-medium">{paused ? 'Updates paused' : appError ? 'Reconnecting to application metrics' : 'Live application metrics'}</p><p className="text-muted mt-1">Last successful app update: <time>{time(updatedAt)} UTC</time>. Dash0 export runs every 10s.</p></div>
      <div className="flex gap-2"><button type="button" className="btn" onClick={() => setPaused((value) => !value)}>{paused ? 'Resume live updates' : 'Pause live updates'}</button><button type="button" className="btn" onClick={() => { void refresh('app'); void refresh('dash0'); }}>Refresh now</button></div>
      {(appError || remoteError) && <p role="status" className="text-warn text-sm w-full">{appError || remoteError} Last successful measurements remain visible.</p>}
    </section>
    <form className="card p-4 flex gap-4 items-end flex-wrap">
      <label className="text-sm">Window<select className="input mt-2" name="minutes" defaultValue={minutes}><option value="15">Last 15 minutes</option><option value="60">Last hour</option><option value="240">Last 4 hours</option></select></label>
      <label className="text-sm">Operation<select className="input mt-2" name="operation" defaultValue={operation}>{OPERATIONS.map((value) => <option key={value} value={value}>{value === 'discovery' ? 'End-to-end discovery' : value === 'retrieval' ? 'Elasticsearch retrieval' : 'AI answer generation'}</option>)}</select></label>
      <button className="btn btn-primary">Apply filters</button>
      <Link className="btn" href="/discover">Generate search traffic</Link>
    </form>
    {!snapshot && <p role="status" className="card p-5 text-warn">Operational records are unavailable. Run npm run es:setup to create the monitoring index, then use Discover. No measurements are fabricated.</p>}
    <section aria-label="Operational overview" className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[
        ['Operations', snapshot ? String(snapshot.total) : 'Unavailable', `Completed ${operation} operations`],
        ['p95 latency', milliseconds(snapshot?.p95 ?? null), `p50 ${milliseconds(snapshot?.p50 ?? null)} · p99 ${milliseconds(snapshot?.p99 ?? null)}`],
        ['Errors', snapshot ? String(snapshot.errors) : 'Unavailable', 'Operations that threw an error'],
        ['Excerpt fallbacks', snapshot ? String(snapshot.fallbacks) : 'Unavailable', 'Sources returned without a generated answer'],
      ].map(([label, value, note]) => <article className="card p-5" key={label}><h2 className="text-sm text-muted">{label}</h2><p className="text-3xl font-semibold mt-3">{value}</p><p className="text-xs text-muted mt-3">{note}</p></article>)}
    </section>
    {snapshot && <section className="grid lg:grid-cols-2 gap-5" aria-label="Latency charts">
      <article className="card p-5"><h2 className="font-semibold mb-4">Real-time latency</h2><LatencyChart snapshot={snapshot} /></article>
      <article className="card p-5"><h2 className="font-semibold">Latency histogram</h2><p className="text-sm text-muted mt-2 mb-5">Non-overlapping duration buckets · {snapshot.total} operations</p><div className="space-y-3">{snapshot.histogram.map((bucket) => <div key={bucket.label} className="grid grid-cols-[5rem_1fr_3rem] gap-3 items-center text-sm"><span>{bucket.label}</span><meter className="w-full" min={0} max={Math.max(1, snapshot.total)} value={bucket.count} aria-label={`${bucket.label} operations`}>{bucket.count}</meter><span>{bucket.count}</span></div>)}</div></article>
    </section>}
    <section aria-labelledby="slo-heading" className="space-y-4"><h2 id="slo-heading" className="text-xl font-semibold">Reliability targets</h2>
      <p className="text-sm text-muted">Observed SLIs over the selected window. Configure the corresponding rolling 28-day SLOs in Dash0 for production alerting. A fallback counts as degraded service.</p>
      <div className="grid md:grid-cols-2 gap-4">{[
        { name: 'Latency', sli: latencySli, target: SLO_TARGET, detail: `Successful ${operation} completed within ${TARGETS[operation] / 1000}s` },
        { name: 'Availability', sli: availability, target: AVAILABILITY_TARGET, detail: 'Completed without an error or excerpt fallback' },
      ].map(({ name, sli, target, detail }) => <article key={name} className="card p-5"><div className="flex justify-between gap-3"><h3 className="font-semibold">{name}</h3><span className={`pill ${sli.state === 'breached' ? 'pill-hot' : ''}`}>{sli.state === 'no-data' ? 'No data' : sli.state === 'meeting' ? 'Meeting target' : 'Target breached'}</span></div><p className="text-2xl mt-3">{percent(sli.ratio)} <span className="text-sm text-muted">/ {percent(target)} target</span></p><p className="text-sm text-muted mt-2">{detail}</p><p className="text-xs text-muted mt-3">Window error budget remaining: {percent(sli.budgetRemaining)}. Negative values mean the window budget is exhausted.</p></article>)}</div>
    </section>
    <section className="card p-5 space-y-4" aria-labelledby="dash0-heading"><h2 id="dash0-heading" className="text-xl font-semibold">Dash0 live metrics</h2>
      <p className="text-sm text-muted">{remote?.message ?? 'Dash0 queries are unavailable.'}</p>
      {remote?.panels.length ? <div className="grid sm:grid-cols-3 gap-3">{remote.panels.map((panel) => <div className="rounded-xl bg-surface-2 p-4" key={panel.key}><p className="text-xs text-muted">{panel.label}</p><p className="text-xl mt-2">{panel.error ? 'Unavailable' : panel.value === null ? 'No data' : panel.value.toFixed(2)}</p>{panel.error && <p className="text-xs text-warn mt-2">{panel.error}</p>}</div>)}</div> : <p className="text-sm">The charts above use real application measurements stored in Elasticsearch. This panel reads Dash0 through a server-side API connection.</p>}
    </section>
    <section aria-labelledby="triage-heading" className="space-y-4"><h2 id="triage-heading" className="text-xl font-semibold">Triage queue</h2><p className="text-sm text-muted">Latest errors, excerpt fallbacks and latency breaches. Correlate operations by request ID and investigate the trace in Dash0.</p>
      {!snapshot?.incidents.length ? <p className="card p-5 text-sm text-muted">{snapshot?.total ? 'No incidents observed in this operation and window.' : 'No traffic to assess yet.'}</p> : <div className="space-y-3">{snapshot.incidents.map((incident) => <article key={incident.id} className="card p-5 space-y-3"><div className="flex gap-3 justify-between flex-wrap"><h3 className="font-medium">{incident.outcome === 'fallback' ? 'Answer generation degraded' : incident.outcome === 'error' ? 'Operation failed' : 'Latency target exceeded'}</h3><span className="pill pill-hot">{incident.operation} · {milliseconds(incident.durationMs)}</span></div><p className="text-sm text-muted">{time(incident.at)} UTC · Provider: {incident.provider} · Version {incident.serviceVersion}</p><p className="text-sm">{incident.outcome === 'fallback' ? 'Check model access, API rate limits, provider status, timeouts and citation validation.' : incident.outcome === 'error' ? 'Check Elasticsearch connectivity and the failing operation span.' : 'Compare retrieval and generation spans for the same request to locate the delay.'}</p><div className="text-xs text-muted break-all">Request: <code>{incident.requestId}</code>{incident.traceId && <> · Trace: <code>{incident.traceId}</code></>}</div>{dashboardUrl && <a href={dashboardUrl} target="_blank" rel="noreferrer" className="text-sm text-accent underline">Investigate in Dash0 using the request or trace ID</a>}</article>)}</div>}
    </section>
    <section aria-labelledby="integrations-heading" className="space-y-4"><h2 id="integrations-heading" className="text-xl font-semibold">Response and delivery</h2><div className="grid md:grid-cols-3 gap-4">
      <article className="card p-5"><h3 className="font-semibold">Slack alerts</h3><p className="text-sm text-muted mt-3">Route Dash0 check rules and SLO burn alerts to a Slack notification channel. Each incident stays in a thread for triage.</p><p className="text-xs text-muted mt-3">{slackUrl ? 'Channel link configured; delivery is verified in Dash0.' : 'Awaiting Dash0 Slack notification channel setup.'}</p>{slackUrl && <a href={slackUrl} target="_blank" rel="noreferrer" className="btn mt-4">Open alert channel ↗</a>}<a className="block text-sm text-accent underline mt-4" href="https://www.dash0.com/docs/dash0/monitoring/alerting/send-alert-check-notifications" target="_blank" rel="noreferrer">Set up notification routing</a></article>
      <article className="card p-5"><h3 className="font-semibold">CI release gate</h3><p className="text-sm text-muted mt-3">Run the manual Dash0 release-gate workflow before a release. It checks latency and availability SLIs; missing telemetry fails the gate.</p><p className="text-xs text-muted mt-3">Workflow: Dash0 Release Gate. Requires GitHub Actions secrets for the Dash0 Reading token and API host.</p></article>
      <McpInvestigation operation={operation} minutes={minutes} endpoint={mcpUrl} />
    </div></section>
    <details className="card p-5 text-sm space-y-3"><summary className="cursor-pointer font-medium">Integration setup and API</summary><p className="mt-4 text-muted">Configure server environment values in .env.local, then restart the app. In Dash0, use Organisation Settings → Endpoints and Auth Tokens.</p><ul className="list-disc pl-5 space-y-2 text-muted"><li>DASH0_ENDPOINT and DASH0_AUTH_TOKEN: OTLP/HTTP traces and metrics ingestion.</li><li>DASH0_API_ENDPOINT and DASH0_API_TOKEN: Dash0 API host and Reading token.</li><li>DASH0_DATASET and OTEL_SERVICE_NAME: select the dataset and service.</li><li>DASH0_DASHBOARD_URL: link to your saved dashboard. DASH0_SLACK_CHANNEL_URL: link to the alerts channel.</li><li>DASH0_MCP_ENDPOINT: regional MCP endpoint, with authentication configured in your client.</li><li>Authenticated admin JSON API: /api/admin/observability?minutes=15&amp;operation=discovery</li></ul><p className="text-muted">No search text, resumes or credentials are stored in operational records. Read the setup guide at platform/docs/observability.md.</p></details>
  </div>;
}
