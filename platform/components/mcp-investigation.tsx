'use client';
import { useState } from 'react';
import { runMcpCheck } from '@/app/admin/mcp/actions';
import type { McpCheck } from '@/lib/dash0-mcp';
import type { Operation } from '@/lib/observability';

export function McpInvestigation({ operation, minutes, endpoint }: { operation: Operation; minutes: number; endpoint: string | null }) {
  const [result, setResult] = useState<McpCheck | null>(null);
  const [pending, setPending] = useState(false);
  async function check(investigate: boolean): Promise<void> {
    if (pending) return;
    setPending(true);
    try { setResult(await runMcpCheck({ operation, minutes, investigate })); }
    catch { setResult({ status: 'error', tools: [], checkedAt: Date.now(), message: 'MCP request failed. Please retry.' }); }
    finally { setPending(false); }
  }
  return <article className="card p-5 space-y-3">
    <h3 className="font-semibold">MCP investigation</h3>
    <p className="text-sm text-muted">Query Dash0 monitoring data through its MCP server. This panel can check the connection and run a read-only latency investigation for the selected operation.</p>
    <p className="text-xs text-muted">{endpoint ? 'Dash0 endpoint configured. Credentials stay on the server.' : 'Configure DASH0_MCP_ENDPOINT to connect.'}</p>
    <div className="flex flex-wrap gap-2"><button type="button" className="btn" disabled={pending || !endpoint} onClick={() => void check(false)}>Check MCP connection</button><button type="button" className="btn" disabled={pending || !endpoint} onClick={() => void check(true)}>Investigate latency</button></div>
    {pending && <p role="status" className="text-sm text-accent">Connecting to Dash0 MCP…</p>}
    {result && <div aria-live="polite" className="space-y-3 text-sm">
      <p className={result.status === 'error' ? 'text-warn' : 'text-accent'}>{result.message}</p>
      {!!result.tools.length && <details><summary className="cursor-pointer">Available read-only tools ({result.tools.length})</summary><ul className="mt-2 space-y-1 text-xs break-all">{result.tools.map((tool) => <li key={tool}>{tool}</li>)}</ul></details>}
      {result.observation && <details open><summary className="cursor-pointer font-medium">Latency evidence from MCP</summary><pre tabIndex={0} aria-label="MCP latency query evidence" className="text-xs whitespace-pre-wrap break-all overflow-auto max-h-72 mt-3 rounded-lg bg-surface-2 p-3">{result.observation}</pre></details>}
    </div>}
    <a className="block text-sm text-accent underline" href="https://www.dash0.com/hub/integrations/int_dash0_mcp/overview" target="_blank" rel="noreferrer">Dash0 MCP setup</a>
  </article>;
}
