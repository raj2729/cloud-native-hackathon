/**
 * "Acting as" session. There is no password: a cookie holds the id of the user
 * you are currently browsing as, which makes switching between demo personas
 * instant. Onboarding a brand-new profile sets the same cookie.
 */
import { cookies } from 'next/headers';
import { es, hitsToDocs, INDEX } from './es';
import type { User } from './types';

const COOKIE = 'actingAs';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function getCurrentUserId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

export async function setCurrentUserId(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, userId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearCurrentUser(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getUserById(userId: string): Promise<User | null> {
  try {
    const doc = await es.get<Omit<User, 'id'>>({ index: INDEX.users, id: userId });
    if (!doc.found || !doc._source) return null;
    return { id: doc._id, ...doc._source };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  return getUserById(userId);
}

/** Everyone available in the switcher, newest profiles first. */
export async function listUsers(size = 60): Promise<User[]> {
  const res = await es.search<Omit<User, 'id'>>({
    index: INDEX.users,
    size,
    sort: [{ isSeeded: 'asc' }, { createdAt: 'desc' }],
    query: { match_all: {} },
  });
  return hitsToDocs(res.hits.hits);
}
