import { connection } from 'next/server';
import { appVersion } from '@/lib/version';

/** Reports the running build so CI can tell when a deploy is actually live. */
export async function GET(): Promise<Response> {
  // Read at request time, never baked into a prerendered response.
  await connection();
  return Response.json(
    { version: appVersion() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
