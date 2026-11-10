import { label } from './taxonomy';
import type { DayPlanNarrative, DayPlanPerson, DayPlanSession, RankedTalk, Talk, User } from './types';

export function talkDate(talk: Talk): string {
  const start = new Date(talk.startsAt);
  return Number.isNaN(start.getTime()) ? '' : start.toISOString().slice(0, 10);
}

/** Weighted interval scheduling avoids collisions even when sessions have unequal durations. */
export function selectDaySessions(
  ranked: RankedTalk[], user: User, eventId: string, date: string,
  savedIds: Set<string>, goalTopics: string[] = [],
): { sessions: DayPlanSession[]; conflictingSaved: Talk[] } {
  const candidates = ranked.filter(({ talk }) => talk.eventId === eventId && talkDate(talk) === date && Date.parse(talk.endsAt) > Date.parse(talk.startsAt))
    .sort((a, b) => Date.parse(a.talk.endsAt) - Date.parse(b.talk.endsAt) || a.talk.id.localeCompare(b.talk.id));
  const best = [0]; const previous: number[] = []; const included: boolean[] = [];
  for (let i = 0; i < candidates.length; i++) {
    let compatible = i - 1;
    while (compatible >= 0 && Date.parse(candidates[compatible].talk.endsAt) > Date.parse(candidates[i].talk.startsAt)) compatible--;
    previous[i] = compatible;
    const goalOverlap = goalTopics.filter((tag) => candidates[i].talk.tags.includes(tag)).length;
    // Explicit saved choices come first; day-specific goals add priority beyond broad interests.
    const weight = Math.max(1, candidates[i].score) + Math.min(3, goalOverlap) * 20 + (savedIds.has(candidates[i].talk.id) ? 10000 : 0);
    const take = weight + best[compatible + 1];
    included[i] = take > best[i];
    best.push(Math.max(take, best[i]));
  }
  const selected: RankedTalk[] = [];
  for (let i = candidates.length - 1; i >= 0;) {
    if (included[i]) { selected.push(candidates[i]); i = previous[i]; }
    else i--;
  }
  selected.sort((a, b) => Date.parse(a.talk.startsAt) - Date.parse(b.talk.startsAt));
  const ids = new Set(selected.map((entry) => entry.talk.id));
  const topics = [...user.interests, ...user.derivedTags];
  const sessions = selected.map(({ talk }): DayPlanSession => {
    const matchedTopics = [...new Set(topics.filter((tag) => talk.tags.includes(tag)))];
    const goals = goalTopics.filter((tag) => talk.tags.includes(tag));
    const connection = (goals.length ? goals : matchedTopics).slice(0, 3).map(label).join(', ');
    return {
      talk, matchedTopics, goalTopics: goals, saved: savedIds.has(talk.id), people: [],
      whyAttend: connection
        ? `${goals.length ? 'Your extra goals highlight' : 'Your profile includes'} ${connection}. This session explores ${talk.tags.filter((tag) => matchedTopics.includes(tag) || goals.includes(tag)).slice(0, 3).map(label).join(', ')}${savedIds.has(talk.id) ? ', and you have already saved it' : ''}.`
        : `A broader exploration of ${talk.tags.slice(0, 2).map(label).join(' and ') || talk.track}, alongside your main interests${savedIds.has(talk.id) ? '. You have already saved this session' : ''}.`,
      learningOutcome: talk.abstract.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').slice(0, 450),
    };
  });
  return { sessions, conflictingSaved: candidates.filter((entry) => savedIds.has(entry.talk.id) && !ids.has(entry.talk.id)).map((entry) => entry.talk) };
}

export function matchSessionPeople(
  viewer: User, candidates: (Pick<User, 'id' | 'name' | 'headline' | 'summary' | 'interests' | 'derivedTags' | 'avatarSeed'> & { discoveryOptIn?: boolean; eventIds?: string[] })[],
  attendance: Map<string, 'saved' | 'checked_in'>, eventId: string, goalTopics: string[] = [],
): DayPlanPerson[] {
  const viewerTopics = [...new Set([...goalTopics, ...viewer.interests, ...viewer.derivedTags])];
  return candidates.filter((person) => person.id !== viewer.id && person.discoveryOptIn === true && person.eventIds?.includes(eventId) && attendance.has(person.id))
    .map((person) => ({ person, shared: viewerTopics.filter((tag) => [...person.interests, ...person.derivedTags].includes(tag)) }))
    .filter(({ shared }) => shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length || a.person.id.localeCompare(b.person.id))
    .slice(0, 3).map(({ person, shared }) => ({
      id: person.id, name: person.name, headline: person.headline, summary: person.summary,
      avatarSeed: person.avatarSeed, sharedTopics: shared, attendance: attendance.get(person.id)!,
      whyMeet: `You both list ${shared.slice(0, 3).map(label).join(', ')} in your interests or professional topics. ${person.headline}.`,
      conversationStarter: `What have you learned from working with ${label(shared[0])}, and what are you hoping to take away from this session?`,
    }));
}

export function fallbackDayNarrative(user: User, sessions: DayPlanSession[]): DayPlanNarrative {
  const topics = [...new Set(sessions.flatMap((session) => [...session.goalTopics, ...session.matchedTopics]))].slice(0, 6);
  const people = new Set(sessions.flatMap((session) => session.people.map((person) => person.id)));
  return {
    summary: sessions.length
      ? `Your day brings together ${sessions.length} sessions${topics.length ? ` on ${topics.slice(0, 4).map(label).join(', ')}` : ` across ${[...new Set(sessions.map((session) => session.talk.track))].join(', ')}`}. ${people.size ? `${people.size} attendees with shared professional interests have saved or checked into these talks; use the introductions below to start a conversation.` : 'Use the breaks to discuss what you learned with other attendees.'}`
      : `There are no scheduled talks for this day to plan around, ${user.name.split(' ')[0]}. Choose another day or conference.`,
    learningGoals: topics.length ? topics.map((tag) => `Explore ${label(tag)} through ${sessions.find((session) => session.talk.tags.includes(tag))?.talk.title ?? 'the selected sessions'}.`) : sessions.slice(0, 4).map((session) => `Explore ${session.talk.title}.`),
    sessions: sessions.map((session) => ({ talkId: session.talk.id, whyAttend: session.whyAttend, learningOutcome: session.learningOutcome,
      people: session.people.map((person) => ({ userId: person.id, whyMeet: person.whyMeet, conversationStarter: person.conversationStarter })) })),
    source: 'profile',
  };
}
