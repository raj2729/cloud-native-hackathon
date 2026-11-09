import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import {
  getEvent,
  getMyTalkIds,
  getTalk,
  getTalkAttendees,
  recommendTalks,
} from '@/lib/search';
import { checkInTalk, saveTalk, unsaveTalk } from '@/app/actions';
import { Avatar } from '@/components/avatar';
import { MatchScore } from '@/components/match-score';
import { label } from '@/lib/taxonomy';
import { requestNow } from '@/lib/now';

export const dynamic = 'force-dynamic';

function formatRange(startsAt: string, endsAt: string): string {
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  return `${new Date(startsAt).toLocaleTimeString([], opts)} – ${new Date(
    endsAt,
  ).toLocaleTimeString([], opts)}`;
}

export default async function TalkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const talk = await getTalk(id);
  if (!talk) notFound();

  const user = await getCurrentUser();
  const [event, attendees, savedIds] = await Promise.all([
    getEvent(talk.eventId),
    getTalkAttendees(talk.id, 10),
    user ? getMyTalkIds(user.id) : Promise.resolve(new Set<string>()),
  ]);

  // Pull this talk's own ranking so the detail page shows the same score as the
  // agenda rather than recomputing it differently.
  let ranked = null;
  if (user) {
    const all = await recommendTalks(user, talk.eventId);
    ranked = all.find((r) => r.talk.id === talk.id) ?? null;
  }

  const isSaved = savedIds.has(talk.id);
  const now = await requestNow();
  const isLive = Date.parse(talk.startsAt) <= now && Date.parse(talk.endsAt) > now;
  const matched = ranked?.matchedInterests ?? [];
  const others = attendees.filter((a) => a.id !== user?.id);

  return (
    <div className="pt-10">
      <Link href="/agenda" className="text-xs text-muted hover:text-foreground">
        ← Agenda
      </Link>

      <div className="mt-5 grid lg:grid-cols-[1fr_300px] gap-8 items-start">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-dim flex-wrap">
            {isLive && (
              <span className="pill pill-hot">
                <span className="live-dot">●</span> live now
              </span>
            )}
            <span className="font-mono">{formatRange(talk.startsAt, talk.endsAt)}</span>
            <span>·</span>
            <span className="font-mono">Room {talk.rooms.join(' + ')}</span>
            <span>·</span>
            <span>{talk.track}</span>
            {event && (
              <>
                <span>·</span>
                <span>{event.name}</span>
              </>
            )}
          </div>

          <h1 className="text-2xl font-semibold tracking-tight mt-3 leading-tight">
            {talk.title}
          </h1>

          <div className="flex flex-wrap gap-1.5 mt-4">
            {talk.tags.map((tag) => (
              <span key={tag} className={matched.includes(tag) ? 'pill pill-match' : 'pill'}>
                {label(tag)}
              </span>
            ))}
          </div>

          <p className="mt-6 leading-relaxed text-foreground/90">{talk.abstract}</p>

          <section className="card mt-8 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-dim">
              Speaker
            </h2>
            <div className="flex items-start gap-4 mt-3">
              <Avatar seed={talk.speaker.name} name={talk.speaker.name} size={52} />
              <div className="min-w-0">
                <h3 className="font-medium">{talk.speaker.name}</h3>
                <p className="text-sm text-muted">
                  {talk.speaker.title}
                  {talk.speaker.company && ` · ${talk.speaker.company}`}
                </p>
                {talk.speaker.bio && (
                  <p className="text-sm text-muted mt-3 leading-relaxed">{talk.speaker.bio}</p>
                )}
                <div className="flex gap-2 mt-3">
                  {talk.speaker.linkedin && (
                    <a
                      href={talk.speaker.linkedin}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="btn !py-1 !px-2.5 text-xs"
                    >
                      LinkedIn
                    </a>
                  )}
                  {talk.speaker.github && (
                    <a
                      href={talk.speaker.github}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="btn !py-1 !px-2.5 text-xs"
                    >
                      GitHub
                    </a>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          {ranked && (
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <MatchScore score={ranked.score} size={48} />
                <div>
                  <p className="text-sm font-medium">{ranked.score}% match</p>
                  <p className="text-xs text-muted mt-0.5">
                    {matched.length > 0
                      ? `on ${matched.map(label).join(', ')}`
                      : ranked.signals.semantic
                        ? 'semantic similarity, no tag overlap'
                        : 'loosely related'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {user ? (
            <div className="card p-4 space-y-2">
              {isSaved ? (
                <form action={unsaveTalk}>
                  <input type="hidden" name="talkId" value={talk.id} />
                  <button type="submit" className="btn w-full">
                    Saved — remove
                  </button>
                </form>
              ) : (
                <form action={saveTalk}>
                  <input type="hidden" name="talkId" value={talk.id} />
                  <button type="submit" className="btn btn-primary w-full">
                    Save to my agenda
                  </button>
                </form>
              )}
              <form action={checkInTalk}>
                <input type="hidden" name="talkId" value={talk.id} />
                <button type="submit" className="btn w-full">
                  I&apos;m in the room
                </button>
              </form>
              <p className="text-[11px] text-muted-dim leading-relaxed pt-1">
                Checking in feeds the live room count and the trending list.
              </p>
            </div>
          ) : (
            <div className="card p-4">
              <Link href="/" className="btn btn-primary w-full">
                Pick a profile to save talks
              </Link>
            </div>
          )}

          <div className="card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-dim">
              Who&apos;s going
            </h2>
            {others.length === 0 ? (
              <p className="text-xs text-muted mt-2">Nobody yet — be the first.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {others.slice(0, 7).map((person) => (
                  <li key={person.id} className="flex items-center gap-2.5">
                    <Avatar seed={person.avatarSeed} name={person.name} size={28} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{person.name}</p>
                      <p className="text-[11px] text-muted-dim truncate">{person.headline}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {user && others.length > 0 && (
              <Link
                href="/people"
                className="text-xs text-accent hover:underline mt-3 inline-block"
              >
                See who you should meet →
              </Link>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
