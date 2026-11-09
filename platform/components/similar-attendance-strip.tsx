import Link from 'next/link';
import { Avatar } from './avatar';
import type { SimilarAttendance } from '@/lib/types';

/**
 * Feature 3: collaborative filtering made visible. These are talks the people
 * most like you are going to, with their faces attached, excluding anything you
 * already saved.
 */
export function SimilarAttendanceStrip({ rows }: { rows: SimilarAttendance[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-dim">
        People like you are going to
      </h2>
      <p className="text-xs text-muted-dim mt-1">
        Aggregated from the attendance of the twenty attendees closest to your profile.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <Link
            key={row.talk.id}
            href={`/talks/${row.talk.id}`}
            className="card card-hover p-4 flex flex-col"
          >
            <div className="flex items-center gap-2 text-xs text-muted-dim">
              <span className="font-mono">
                {new Date(row.talk.startsAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span>·</span>
              <span className="font-mono">{row.talk.rooms[0]}</span>
            </div>

            <h3 className="font-medium text-sm leading-snug mt-2 flex-1">{row.talk.title}</h3>

            <div className="flex items-center gap-2 mt-3">
              <div className="flex -space-x-2">
                {row.peers.slice(0, 4).map((peer) => (
                  <span key={peer.id} title={peer.name} className="ring-2 ring-surface rounded-full">
                    <Avatar seed={peer.avatarSeed} name={peer.name} size={22} />
                  </span>
                ))}
              </div>
              <span className="text-xs text-accent font-medium">
                {row.peerCount} like you
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
