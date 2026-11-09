import { Discovery } from '@/components/discovery';
import { listEvents } from '@/lib/search';
import type { Event } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function DiscoverPage() {
  let events: Event[] = [];
  try { events = await listEvents(); } catch { /* The form explains unavailable data. */ }
  return <Discovery events={events.map(({ id, name }) => ({ id, name }))} />;
}
