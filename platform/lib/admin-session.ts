import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE = 'convergeAdmin';
const MAX_AGE = 8 * 60 * 60;
export function secretMatches(candidate: string): boolean {
  const secret = process.env.ADMIN_ACCESS_TOKEN;
  if (!secret || !candidate || candidate.length > 512) return false;
  // Fixed-size hashes keep comparison time independent of the supplied length.
  const hash = (value: string): Buffer => createHmac('sha256', secret).update(value).digest();
  return timingSafeEqual(hash(candidate), hash(secret));
}
function signature(expires: string): string {
  return createHmac('sha256', process.env.ADMIN_ACCESS_TOKEN ?? '').update(`admin:${expires}`).digest('hex');
}
export async function isAdmin(): Promise<boolean> {
  if (!process.env.ADMIN_ACCESS_TOKEN) return false;
  const value = (await cookies()).get(COOKIE)?.value ?? '';
  const [expires, sig] = value.split('.');
  if (!expires || !sig || !/^\d+$/.test(expires) || !/^[a-f0-9]{64}$/.test(sig) || Number(expires) <= Date.now()) return false;
  const expected = signature(expires);
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
export async function setAdminSession(): Promise<void> {
  const expires = String(Date.now() + MAX_AGE * 1000);
  (await cookies()).set(COOKIE, `${expires}.${signature(expires)}`, {
    httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' && process.env.ADMIN_COOKIE_SECURE !== 'false', path: '/', maxAge: MAX_AGE,
  });
}
export async function clearAdminSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
