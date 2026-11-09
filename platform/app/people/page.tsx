import Link from 'next/link';
import { getCurrentUser } from '@/lib/session';
import { findPeople, listEvents } from '@/lib/search';
import { matchRationale } from '@/lib/ai';
import { Avatar } from '@/components/avatar';
import { MatchScore } from '@/components/match-score';
import { ChooseProfileNotice } from '@/components/choose-profile-notice';
import { SetupNotice } from '@/components/setup-notice';
import { label } from '@/lib/taxonomy';

export const dynamic = 'force-dynamic';

export default async function PeoplePage() {
  const user = await getCurrentUser();
  if (!user) return <ChooseProfileNotice />;

  let people;
  try {
    [people] = await Promise.all([findPeople(user, 9), listEvents()]);
  } catch (err) {
    return <SetupNotice message={(err as Error).message} />;
  }

  // Rationales only for the top three: it is the part people read, and three
  // short calls keep the page fast.
  const rationales = await Promise.all(
    people.slice(0, 3).map((person) =>
      matchRationale({
        me: { name: user.name, headline: user.headline, interests: user.interests },
        them: {
          name: person.user.name,
          headline: person.user.headline,
          interests: person.user.interests,
        },
        sharedInterests: person.sharedInterests,
        sharedTalkTitles: person.sharedTalks.map((t) => t.title),
      }),
    ),
  );

  return (
    <div className="pt-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">People worth meeting</h1>
        <p className="text-sm text-muted mt-1.5 max-w-2xl">
          Matched on your five interests, the text of your profile, and the talks you have both
          saved. Ranked for <span className="text-foreground">{user.name}</span>.
        </p>
        <p className="text-xs text-muted-dim mt-1.5">
          The second question nobody can answer at a conference: of the hundred people in the
          room, which three should you actually talk to.
        </p>
      </header>

      {people.length === 0 ? (
        <div className="card mt-8 p-5">
          <p className="text-sm text-muted">
            No other attendees are indexed yet. Run{' '}
            <code className="font-mono text-xs text-foreground">npm run es:seed</code> to load the
            demo crowd.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {people.map((person, index) => (
            <article key={person.user.id} className="card p-4 flex gap-4">
              <div className="flex flex-col items-center gap-2 shrink-0">
                <Avatar seed={person.user.avatarSeed} name={person.user.name} size={44} />
                <MatchScore score={person.score} size={34} />
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="font-medium leading-snug">{person.user.name}</h2>
                <p className="text-xs text-muted mt-0.5">{person.user.headline}</p>

                {rationales[index] && (
                  <p className="text-sm text-foreground/90 mt-2.5 leading-relaxed">
                    {rationales[index]}
                  </p>
                )}

                <div className="flex flex-wrap gap-1 mt-2.5">
                  {person.user.interests.map((interest) => (
                    <span
                      key={interest}
                      className={
                        person.sharedInterests.includes(interest) ? 'pill pill-match' : 'pill'
                      }
                    >
                      {label(interest)}
                    </span>
                  ))}
                </div>

                {person.sharedTalks.length > 0 && (
                  <p className="text-xs text-muted-dim mt-2.5">
                    Both going to{' '}
                    {person.sharedTalks.slice(0, 2).map((talk, i) => (
                      <span key={talk.id}>
                        {i > 0 && ', '}
                        <Link href={`/talks/${talk.id}`} className="text-accent hover:underline">
                          {talk.title.length > 42 ? `${talk.title.slice(0, 42)}…` : talk.title}
                        </Link>
                      </span>
                    ))}
                  </p>
                )}

                <div className="flex gap-2 mt-3">
                  {person.user.links.linkedin && (
                    <a
                      href={person.user.links.linkedin}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="btn !py-1 !px-2.5 text-xs"
                    >
                      Connect on LinkedIn
                    </a>
                  )}
                  {person.user.links.github && (
                    <a
                      href={person.user.links.github}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="btn !py-1 !px-2.5 text-xs"
                    >
                      GitHub
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
