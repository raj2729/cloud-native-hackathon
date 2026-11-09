import Link from 'next/link';
import { listUsers, getCurrentUserId } from '@/lib/session';
import { listEvents } from '@/lib/search';
import { switchUser, signOut } from './actions';
import { Avatar } from '@/components/avatar';
import { label } from '@/lib/taxonomy';
import { SetupNotice } from '@/components/setup-notice';
import type { User } from '@/lib/types';

export const dynamic = 'force-dynamic';

function groupByCluster(users: User[]): { cluster: string; users: User[] }[] {
  const groups = new Map<string, User[]>();
  for (const user of users) {
    const key = user.isSeeded ? (user.cluster ?? 'Attendees') : 'Created here';
    const list = groups.get(key) ?? [];
    list.push(user);
    groups.set(key, list);
  }
  // Show profiles created in this session first, then the curated clusters,
  // then the crowd.
  return [...groups.entries()]
    .map(([cluster, list]) => ({ cluster, users: list }))
    .sort((a, b) => {
      const rank = (c: string) => (c === 'Created here' ? 0 : c.includes('crowd') ? 2 : 1);
      return rank(a.cluster) - rank(b.cluster) || a.cluster.localeCompare(b.cluster);
    });
}

export default async function HomePage() {
  let users: User[] = [];
  let eventCount = 0;
  let esError: string | null = null;

  try {
    const [allUsers, events] = await Promise.all([listUsers(), listEvents()]);
    users = allUsers;
    eventCount = events.length;
  } catch (err) {
    esError = (err as Error).message;
  }

  const currentUserId = await getCurrentUserId();
  const curated = users.filter((u) => !u.id.startsWith('crowd-'));
  const groups = groupByCluster(curated);

  return (
    <div className="pt-12">
      <section className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight leading-tight">
          The two hardest questions at a conference
        </h1>
        <p className="mt-4 text-muted leading-relaxed">
          Which of the twenty-four talks is worth your next hour, and which of the hundred
          people in the room is worth your next conversation. Confluence answers both from
          five interests and a link to your work.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/onboarding" className="btn btn-primary">
            Create your profile
          </Link>
          <Link href="/live" className="btn">
            See the live floor
          </Link>
        </div>
      </section>

      {esError ? (
        <SetupNotice message={esError} />
      ) : users.length === 0 ? (
        <SetupNotice message="No attendees indexed yet." seedHint />
      ) : (
        <section className="mt-14">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Browse as someone</h2>
              <p className="text-sm text-muted mt-1">
                No passwords — pick a profile and every page re-ranks around their interests.
                {eventCount > 0 && ` ${users.length} attendees indexed.`}
              </p>
            </div>
            {currentUserId && (
              <form action={signOut}>
                <button type="submit" className="btn !py-1.5 !px-3 text-xs">
                  Sign out
                </button>
              </form>
            )}
          </div>

          <div className="mt-6 space-y-8">
            {groups.map((group) => (
              <div key={group.cluster}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-dim mb-3">
                  {group.cluster}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.users.map((user) => (
                    <form key={user.id} action={switchUser}>
                      <input type="hidden" name="userId" value={user.id} />
                      <button
                        type="submit"
                        className={`card card-hover w-full text-left p-4 ${
                          user.id === currentUserId ? '!border-accent-dim' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <Avatar seed={user.avatarSeed} name={user.name} size={38} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">{user.name}</span>
                              {user.id === currentUserId && (
                                <span className="pill pill-match !text-[10px]">you</span>
                              )}
                            </div>
                            <p className="text-xs text-muted mt-0.5 line-clamp-2">
                              {user.headline}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {user.interests.slice(0, 3).map((interest) => (
                                <span key={interest} className="pill">
                                  {label(interest)}
                                </span>
                              ))}
                              {user.interests.length > 3 && (
                                <span className="pill">+{user.interests.length - 3}</span>
                              )}
                            </div>
                            <div className="flex gap-2 mt-2 text-[10px] text-muted-dim">
                              {user.links.linkedin && <span>LinkedIn</span>}
                              {user.links.github && <span>GitHub</span>}
                              {user.links.resumeText && <span>Resume</span>}
                            </div>
                          </div>
                        </div>
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
