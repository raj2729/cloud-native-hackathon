import Link from 'next/link';
import { getCurrentUser } from '@/lib/session';
import {
  getMyTalkIds,
  getTalkAttendeeCounts,
  listEvents,
  recommendTalks,
  similarPeopleAttending,
} from '@/lib/search';
import { TalkCard } from '@/components/talk-card';
import { SimilarAttendanceStrip } from '@/components/similar-attendance-strip';
import { ChooseProfileNotice } from '@/components/choose-profile-notice';
import { SetupNotice } from '@/components/setup-notice';
import { label } from '@/lib/taxonomy';
import type { RankedTalk } from '@/lib/types';

export const dynamic = 'force-dynamic';

type View = 'match' | 'time';

function groupBySlot(talks: RankedTalk[]): { time: string; talks: RankedTalk[] }[] {
  const groups = new Map<string, RankedTalk[]>();
  for (const ranked of talks) {
    const key = ranked.talk.startsAt;
    const list = groups.get(key) ?? [];
    list.push(ranked);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => Date.parse(a) - Date.parse(b))
    .map(([time, list]) => ({
      time,
      talks: list.sort((x, y) => y.score - x.score),
    }));
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; event?: string }>;
}) {
  const params = await searchParams;
  const view: View = params.view === 'time' ? 'time' : 'match';

  const user = await getCurrentUser();
  if (!user) return <ChooseProfileNotice />;

  let events;
  try {
    events = await listEvents();
  } catch (err) {
    return <SetupNotice message={(err as Error).message} />;
  }
  if (events.length === 0) return <SetupNotice message="No conferences published yet." seedHint />;

  const event = events.find((e) => e.id === params.event) ?? events[0];

  const [ranked, savedIds, similar] = await Promise.all([
    recommendTalks(user, event.id),
    getMyTalkIds(user.id),
    similarPeopleAttending(user, event.id),
  ]);

  const counts = await getTalkAttendeeCounts(ranked.map((r) => r.talk.id));
  const withCounts = ranked.map((r) => ({ ...r, attendeeCount: counts.get(r.talk.id) ?? 0 }));

  const slots = groupBySlot(withCounts);
  const topMatch = withCounts[0];

  return (
    <div className="pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-dim">{event.venue}</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">{event.name}</h1>
          <p className="text-sm text-muted mt-1.5">
            Ranked for <span className="text-foreground">{user.name}</span> ·{' '}
            {user.interests.map(label).join(', ')}
          </p>
          <p className="text-xs text-muted-dim mt-1">
            You are not searching this agenda — it reordered itself around you.
          </p>
        </div>

        <div className="flex gap-1 p-1 card">
          {(['match', 'time'] as View[]).map((option) => (
            <Link
              key={option}
              href={`/agenda?view=${option}&event=${event.id}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                view === option
                  ? 'bg-surface-2 text-foreground'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {option === 'match' ? 'Best match' : 'By time'}
            </Link>
          ))}
        </div>
      </header>

      {topMatch && (
        <div className="card mt-6 p-4 flex items-center gap-4 border-accent-dim/50 bg-accent/5">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-accent">Your strongest match</p>
            <p className="font-medium mt-1 truncate">{topMatch.talk.title}</p>
            <p className="text-xs text-muted mt-0.5">
              {topMatch.score}% · {topMatch.talk.rooms[0]} ·{' '}
              {new Date(topMatch.talk.startsAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
          <Link href={`/talks/${topMatch.talk.id}`} className="btn btn-primary ml-auto shrink-0">
            Open
          </Link>
        </div>
      )}

      {similar.length > 0 && <SimilarAttendanceStrip rows={similar} />}

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-dim mb-4">
          {view === 'match' ? `All ${withCounts.length} talks, best match first` : 'Full schedule'}
        </h2>

        {view === 'match' ? (
          <div className="grid gap-3">
            {withCounts.map((r) => (
              <TalkCard key={r.talk.id} ranked={r} saved={savedIds.has(r.talk.id)} />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {slots.map((slot) => (
              <div key={slot.time}>
                <h3 className="font-mono text-xs text-muted-dim mb-2.5">
                  {new Date(slot.time).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </h3>
                <div className="grid gap-3">
                  {slot.talks.map((r) => (
                    <TalkCard key={r.talk.id} ranked={r} saved={savedIds.has(r.talk.id)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
