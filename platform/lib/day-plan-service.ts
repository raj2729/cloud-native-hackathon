import { createHash } from 'node:crypto';
import { recommendTalks, getMyTalkIds, getDayPlanPeople, cacheDayPlan } from './search';
import { selectDaySessions, fallbackDayNarrative, talkDate } from './day-plan';
import { generateDayPlanNarrative, tagsFromKeywords } from './ai';
import { startSpan } from './telemetry';
import type { Event, PersonalDayPlan, RankedTalk, User } from './types';

/** Rebuild evidence on each visit; model prose is generated only by explicit actions. */
export async function prepareDayPlan(
  user: User, event: Event,
  options: { date?: string; generate?: boolean; ranked?: RankedTalk[]; savedIds?: Set<string> } = {},
): Promise<{ plan: PersonalDayPlan; dates: string[]; ranked: RankedTalk[]; savedIds: Set<string> }> {
  return startSpan('recommend.day-plan', {}, async () => {
    const preferences = user.planningPreferences?.eventId === event.id ? user.planningPreferences : undefined;
    const notes = preferences?.notes ?? '';
    const [ranked, savedIds] = await Promise.all([
      options.ranked ?? recommendTalks(user, event.id, { size: 200, context: notes }),
      options.savedIds ?? getMyTalkIds(user.id),
    ]);
    const dates = [...new Set(ranked.filter((entry) => entry.talk.eventId === event.id).map((entry) => talkDate(entry.talk)).filter(Boolean))].sort();
    const preferredDate = options.date ?? preferences?.date;
    const date = dates.find((value) => value === preferredDate) ?? dates[0] ?? event.startsAt.slice(0, 10);
    const goalTopics = tagsFromKeywords(notes, 8);
    const selected = selectDaySessions(ranked, user, event.id, date, savedIds, goalTopics);
    const people = await getDayPlanPeople(user, event.id, selected.sessions.map((session) => session.talk), goalTopics);
    for (const session of selected.sessions) session.people = people.get(session.talk.id) ?? [];
    const fallback = fallbackDayNarrative(user, selected.sessions);
    const evidence = {
      version: 'day-plan-v1', model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini', ai: process.env.AI_ENABLED !== 'false',
      profile: { headline: user.headline, summary: user.summary, interests: user.interests, derivedTags: user.derivedTags },
      eventId: event.id, date, notes,
      sessions: selected.sessions.map((session) => ({ talk: session.talk, saved: session.saved, matchedTopics: session.matchedTopics, goalTopics: session.goalTopics, people: session.people })),
    };
    const fingerprint = createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
    const cached = user.dayPlanCache?.fingerprint === fingerprint ? user.dayPlanCache.narrative : undefined;
    let narrative = cached ?? fallback;
    if (options.generate && selected.sessions.length) {
      narrative = await generateDayPlanNarrative(user, notes, selected.sessions, fallback);
      try { await cacheDayPlan(user.id, { fingerprint, narrative, generatedAt: new Date().toISOString() }); }
      catch { /* The evidence-based plan remains usable if the optional cache cannot be saved. */ }
    }
    for (const session of selected.sessions) {
      const copy = narrative.sessions.find((entry) => entry.talkId === session.talk.id);
      if (!copy) continue;
      session.whyAttend = copy.whyAttend;
      session.learningOutcome = copy.learningOutcome;
      for (const person of session.people) {
        const introduction = copy.people.find((entry) => entry.userId === person.id);
        if (introduction) { person.whyMeet = introduction.whyMeet; person.conversationStarter = introduction.conversationStarter; }
      }
    }
    return { plan: { date, notes, sessions: selected.sessions, conflictingSaved: selected.conflictingSaved,
      summary: narrative.summary, learningGoals: narrative.learningGoals, narrativeSource: narrative.source,
      needsRefresh: !cached && !options.generate,
    }, dates, ranked, savedIds };
  });
}
