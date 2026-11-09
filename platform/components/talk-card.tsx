import Link from 'next/link';
import { label } from '@/lib/taxonomy';
import { Avatar } from './avatar';
import { MatchScore } from './match-score';
import type { RankedTalk } from '@/lib/types';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function liveState(startsAt: string, endsAt: string): 'past' | 'live' | 'upcoming' {
  const now = Date.now();
  if (Date.parse(endsAt) <= now) return 'past';
  if (Date.parse(startsAt) <= now) return 'live';
  return 'upcoming';
}

/** The one-line explanation of why this talk is in front of you. */
function whyLine(ranked: RankedTalk): string {
  const matched = ranked.matchedInterests.map(label);
  if (matched.length >= 2) {
    return `Matches your interest in ${matched.slice(0, 2).join(' and ')}`;
  }
  if (matched.length === 1) return `Matches your interest in ${matched[0]}`;
  if (ranked.signals.semantic) return 'Close to your profile — no exact tag match';
  return 'Related to what you work on';
}

export function TalkCard({
  ranked,
  saved = false,
  showWhy = true,
}: {
  ranked: RankedTalk;
  saved?: boolean;
  showWhy?: boolean;
}) {
  const { talk, score, matchedInterests } = ranked;
  const state = liveState(talk.startsAt, talk.endsAt);

  return (
    <Link href={`/talks/${talk.id}`} className="card card-hover block p-4">
      <div className="flex gap-4">
        <MatchScore score={score} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-dim mb-1.5 flex-wrap">
            {state === 'live' && (
              <span className="pill pill-hot">
                <span className="live-dot">●</span> live now
              </span>
            )}
            <span className="font-mono">
              {formatTime(talk.startsAt)}–{formatTime(talk.endsAt)}
            </span>
            <span>·</span>
            <span className="font-mono">{talk.rooms.join(' + ')}</span>
            <span>·</span>
            <span className="truncate">{talk.track}</span>
            {saved && <span className="pill pill-match !text-[10px]">saved</span>}
          </div>

          <h3 className="font-medium leading-snug">{talk.title}</h3>

          <div className="flex items-center gap-2 mt-2">
            <Avatar seed={talk.speaker.name} name={talk.speaker.name} size={22} />
            <span className="text-xs text-muted truncate">
              {talk.speaker.name} · {talk.speaker.company}
            </span>
          </div>

          <div className="flex flex-wrap gap-1 mt-2.5">
            {talk.tags.map((tag) => (
              <span
                key={tag}
                className={matchedInterests.includes(tag) ? 'pill pill-match' : 'pill'}
              >
                {label(tag)}
              </span>
            ))}
          </div>

          {showWhy && (
            <p className="text-xs text-muted-dim mt-2.5">
              {whyLine(ranked)}
              {typeof ranked.attendeeCount === 'number' && ranked.attendeeCount > 0 && (
                <> · {ranked.attendeeCount} going</>
              )}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
