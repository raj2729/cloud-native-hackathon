import { z } from 'zod';
import type { Operation } from './observability';

const vectorSchema = z.object({ status: z.literal('success'), data: z.object({ resultType: z.literal('vector'), result: z.array(z.object({ value: z.tuple([z.number(), z.string()]) })) }) });
export interface Dash0Panel { key: string; label: string; value: number | null; error?: string }
export interface Dash0Summary { status: 'unconfigured' | 'connected' | 'partial' | 'error'; panels: Dash0Panel[]; message: string }

export function buildDash0Queries(minutes: number, operation: Operation): { key: string; label: string; query: string }[] {
  const service = JSON.stringify(process.env.OTEL_SERVICE_NAME ?? 'converge');
  const scope = `service_name=${service},app_operation=${JSON.stringify(operation)}`;
  const counter = (metric: string, extra = ''): string => `sum(increase({otel_metric_name="${metric}",${scope}${extra}}[${minutes}m]))`;
  const total = counter('app.operation.requests');
  const slo = (name: string): string => `100 * (${counter('app.operation.slo', `,app_slo="${name}",app_good="true"`)} or vector(0)) / ${counter('app.operation.slo', `,app_slo="${name}"`)}`;
  return [
    { key: 'requests', label: 'Operations', query: total },
    { key: 'p95', label: 'p95 latency (ms)', query: `histogram_quantile(0.95, sum(rate({otel_metric_name="app.operation.duration",${scope}}[${minutes}m])))` },
    { key: 'errors', label: 'Error rate (%)', query: `100 * (${counter('app.operation.requests', ',app_outcome="error"')} or vector(0)) / ${total}` },
    { key: 'fallbacks', label: 'Excerpt fallback rate (%)', query: `100 * (${counter('app.operation.requests', ',app_outcome="fallback"')} or vector(0)) / ${total}` },
    { key: 'latencySli', label: 'Within latency target (%)', query: slo('latency') },
    { key: 'availabilitySli', label: 'Successful operations (%)', query: slo('availability') },
  ];
}

export async function getDash0Summary(minutes: number, operation: Operation): Promise<Dash0Summary> {
  const endpoint = process.env.DASH0_API_ENDPOINT;
  const token = process.env.DASH0_API_TOKEN;
  if (!endpoint || !token) return { status: 'unconfigured', panels: [], message: 'Add a Dash0 API endpoint and a Reading token to enable live Dash0 panels.' };
  let base: URL;
  try {
    base = new URL(endpoint);
    if (base.protocol !== 'https:' || !base.hostname.endsWith('.dash0.com') || base.username || base.password) throw new Error();
  } catch { return { status: 'error', panels: [], message: 'Use the HTTPS Dash0 API host from Organisation Settings → Endpoints.' }; }
  const panels = await Promise.all(buildDash0Queries(minutes, operation).map(async ({ key, label, query }): Promise<Dash0Panel> => {
    try {
      const url = new URL('/api/prometheus/api/v1/query', base);
      url.search = new URLSearchParams({ query, dataset: process.env.DASH0_DATASET ?? 'default', timeout: '5s' }).toString();
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(6000), redirect: 'error' });
      if (!response.ok) return { key, label, value: null, error: `Dash0 returned HTTP ${response.status}` };
      const body = vectorSchema.safeParse(await response.json());
      if (!body.success) return { key, label, value: null, error: 'Unexpected Dash0 metric response' };
      const raw = body.data.data.result[0]?.value[1];
      const value = raw === undefined ? null : Number(raw);
      return { key, label, value: value !== null && Number.isFinite(value) ? value : null };
    } catch { return { key, label, value: null, error: 'Dash0 query unavailable or timed out' }; }
  }));
  const failures = panels.filter((p) => p.error).length;
  return { status: failures === panels.length ? 'error' : failures ? 'partial' : 'connected', panels,
    message: failures ? 'Some Dash0 queries failed. Check the API host, Reading permission and dataset access.' : 'Queried from Dash0. Empty metrics mean no samples in this window; they do not indicate healthy service.' };
}

export function safeDashboardUrl(value: string | undefined): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null; } catch { return null; }
}
