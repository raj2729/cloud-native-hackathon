import { isAdmin, secretMatches } from '@/lib/admin-session';
import { executeDiscovery } from '@/lib/discovery-service';
export const dynamic = 'force-dynamic';

/** Exercise the same measured pipeline as Discover, without fabricating samples. */
export async function POST(request: Request): Promise<Response> {
  const bearer = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!(await isAdmin()) && !secretMatches(bearer)) return Response.json({ error: 'Admin access required' }, { status: 401 });
  let input: unknown;
  try { input = await request.json(); }
  catch { return Response.json({ error: 'Expected a JSON search request' }, { status: 400 }); }
  const response = await executeDiscovery(input);
  if (response.error) return Response.json({ error: response.error }, { status: 400 });
  return Response.json({ sources: response.result?.sources.length ?? 0, generation: response.result?.generation,
    retrievalMs: response.result?.elapsedMs, warnings: response.result?.warnings }, { headers: { 'Cache-Control': 'no-store' } });
}
