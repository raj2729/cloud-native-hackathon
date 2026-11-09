'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Polls the server component tree on an interval. Deliberately not websockets:
 * `router.refresh()` re-runs the Elasticsearch aggregations and diffs the
 * result into the existing DOM, which is enough for a 5-second dashboard and
 * removes a whole class of connection bug from the demo.
 */
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return null;
}
