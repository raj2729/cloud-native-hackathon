import { isAdmin, secretMatches } from '@/lib/admin-session';
import { getObservabilitySnapshot } from '@/lib/search';
import { getDash0Summary } from '@/lib/dash0';
import { OPERATIONS } from '@/lib/observability';
export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!(await isAdmin()) && !secretMatches(bearer)) return Response.json({ error: 'Admin access required' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const minutes = Number(params.get('minutes') ?? 15);
  const operation = params.get('operation') ?? 'discovery';
  const source = params.get('source') ?? 'all';
  if (!['app', 'dash0', 'all'].includes(source)) return Response.json({ error: 'Invalid metric source' }, { status: 400 });
  if (![15, 60, 240].includes(minutes) || !OPERATIONS.includes(operation as typeof OPERATIONS[number])) return Response.json({ error: 'Invalid time window or operation' }, { status: 400 });
  try {
    if (source === 'app') return Response.json({ snapshot: await getObservabilitySnapshot(minutes, operation as typeof OPERATIONS[number]), updatedAt: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
    if (source === 'dash0') return Response.json({ dash0: await getDash0Summary(minutes, operation as typeof OPERATIONS[number]), updatedAt: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
    const [snapshot, dash0] = await Promise.all([getObservabilitySnapshot(minutes, operation as typeof OPERATIONS[number]), getDash0Summary(minutes, operation as typeof OPERATIONS[number])]);
    return Response.json({ snapshot, dash0, updatedAt: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Operational records unavailable. Run es:setup and generate search traffic.' }, { status: 503 }); }
}
