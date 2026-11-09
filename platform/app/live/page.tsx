import Link from 'next/link';
import { getNowPlaying, getRoomLoads, getTrendingTalks, listEvents } from '@/lib/search';
import { recordRoomOccupancy } from '@/lib/telemetry';
import { SetupNotice } from '@/components/setup-notice';
import { AutoRefresh } from '@/components/auto-refresh';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function barColour(utilisation: number): string {
  if (utilisation >= 0.85) return 'var(--hot)';
  if (utilisation >= 0.5) return 'var(--warn)';
  return 'var(--accent)';
}

export default async function LivePage() {
  let events;
  try {
    events = await listEvents();
  } catch (err) {
    return <SetupNotice message={(err as Error).message} />;
  }
  if (events.length === 0) return <SetupNotice message="No conferences published yet." seedHint />;

  const event = events[0];
  const [rooms, trending, nowPlaying] = await Promise.all([
    getRoomLoads(event.id),
    getTrendingTalks(event.id),
    getNowPlaying(event.id),
  ]);

  // The same numbers the page renders are emitted as metrics, so the Dash0
  // dashboard and this screen can never disagree.
  for (const load of rooms) recordRoomOccupancy(load.room.id, load.count, event.id);

  const totalInRooms = rooms.reduce((sum, r) => sum + r.count, 0);
  const updatedAt = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="pt-10">
      <AutoRefresh seconds={5} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-accent flex items-center gap-1.5">
            <span className="live-dot">●</span> Live floor
          </p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">{event.name}</h1>
          <p className="text-sm text-muted mt-1.5">
            {totalInRooms} people checked in across {rooms.length} rooms · refreshed {updatedAt}
          </p>
          <p className="text-xs text-muted-dim mt-1 max-w-xl">
            What is attracting attention right now — not in the post-event report.
          </p>
        </div>
        {nowPlaying.length > 0 && (
          <p className="text-xs text-muted-dim max-w-xs">
            {nowPlaying.length} talk{nowPlaying.length === 1 ? '' : 's'} running right now
          </p>
        )}
      </header>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-dim">
          Room occupancy
        </h2>
        <p className="text-xs text-muted-dim mt-1">
          Check-ins in the last 25 minutes, aggregated in Elasticsearch.
        </p>

        <div className="mt-5 space-y-4">
          {rooms.map((load) => (
            <div key={load.room.id}>
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <div className="min-w-0">
                  <span className="font-mono text-sm">{load.room.id}</span>
                  <span className="text-xs text-muted ml-2 truncate">
                    {load.room.name.replace(/^Room \d+ — /, '')}
                  </span>
                  {load.nowPlaying && (
                    <Link
                      href={`/talks/${load.nowPlaying.id}`}
                      className="text-xs text-accent hover:underline ml-2"
                    >
                      {load.nowPlaying.title.length > 46
                        ? `${load.nowPlaying.title.slice(0, 46)}…`
                        : load.nowPlaying.title}
                    </Link>
                  )}
                </div>
                <span className="text-sm tabular-nums shrink-0">
                  <span className="font-semibold">{load.count}</span>
                  <span className="text-muted-dim"> / {load.room.capacity}</span>
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden border border-line">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.max(load.utilisation * 100, load.count > 0 ? 1.5 : 0)}%`,
                    background: barColour(load.utilisation),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-dim">
          Trending now
        </h2>
        <p className="text-xs text-muted-dim mt-1">
          Ranked by velocity — check-ins in the last 10 minutes against the 10 before, so a talk
          filling up right now beats one that filled up an hour ago.
        </p>

        {trending.length === 0 ? (
          <div className="card mt-5 p-5">
            <p className="text-sm text-muted">
              No check-ins in the last 20 minutes. Run{' '}
              <code className="font-mono text-xs text-foreground">npm run simulate</code> to put
              traffic on the floor.
            </p>
          </div>
        ) : (
          <ol className="mt-5 space-y-2">
            {trending.map((row, index) => (
              <li key={row.talk.id}>
                <Link href={`/talks/${row.talk.id}`} className="card card-hover p-4 flex gap-4 items-center">
                  <span className="font-mono text-lg text-muted-dim tabular-nums w-6 shrink-0">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm leading-snug">{row.talk.title}</p>
                    <p className="text-xs text-muted-dim mt-1 font-mono">
                      {row.talk.rooms[0]} · {row.talk.speaker.name}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums">{row.recent}</p>
                    <p
                      className="text-xs tabular-nums"
                      style={{
                        color: row.velocity > 0 ? 'var(--good)' : 'var(--muted-dim)',
                      }}
                    >
                      {row.velocity > 0 ? `+${row.velocity}` : row.velocity}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
