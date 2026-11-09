/**
 * Every query behind the four product features. Keeping them in one module
 * means Dash0 sees one clean span per feature, and means there is a single
 * place where ranking is defined.
 *
 * Ranking is additive: tag overlap + BM25 always contribute, and a semantic
 * retriever is fused in only when the e5 model is deployed. If the model never
 * comes up, every feature still works — results are just less nuanced.
 */
import { es, hitsToDocs, hitsToScoredDocs, INDEX, semanticReady } from './es';
import type {
  Attendance,
  Event,
  RankedPerson,
  RankedTalk,
  RoomLoad,
  SimilarAttendance,
  Talk,
  TrendingTalk,
  User,
} from './types';
import type { Attributes, Span } from '@opentelemetry/api';
import { recordRecommendLatency, setSpanAttributes, startSpan } from './telemetry';
import { log } from './log';

type SearchRequest = Parameters<typeof es.search>[0];

type RecommendFeature = 'talks' | 'people' | 'similar-attendance';

/**
 * Records the outcome of one recommendation request on its span and in the
 * latency / hits metrics. An empty result is also logged: it means an attendee
 * was given nothing to act on, which is the inclusion failure this product
 * exists to prevent.
 */
function recordRecommendOutcome(
  span: Span,
  feature: RecommendFeature,
  started: number,
  count: number,
  attributes: Attributes = {},
): void {
  setSpanAttributes(span, {
    'app.feature': feature,
    'app.recommend.result_count': count,
    'app.recommend.empty': count === 0,
    ...attributes,
  });
  recordRecommendLatency(feature, Date.now() - started, count);
  if (count === 0) log.warn('recommend.empty', { 'app.feature': feature, ...attributes });
}

/** The client's generated types do not cover `retriever` / `semantic` yet. */
function search<T>(body: Record<string, unknown>) {
  return es.search<T>(body as unknown as SearchRequest);
}

// ---------------------------------------------------------------------------
// Plain reads
// ---------------------------------------------------------------------------

export async function getEvent(eventId: string): Promise<Event | null> {
  try {
    const doc = await es.get<Omit<Event, 'id'>>({ index: INDEX.events, id: eventId });
    return doc._source ? { id: doc._id, ...doc._source } : null;
  } catch {
    return null;
  }
}

export async function listEvents(): Promise<Event[]> {
  const res = await es.search<Omit<Event, 'id'>>({
    index: INDEX.events,
    size: 20,
    sort: [{ startsAt: 'asc' }],
    query: { match_all: {} },
  });
  return hitsToDocs(res.hits.hits);
}

export async function getTalk(talkId: string): Promise<Talk | null> {
  try {
    const doc = await es.get<Omit<Talk, 'id'>>({ index: INDEX.talks, id: talkId });
    return doc._source ? { id: doc._id, ...doc._source } : null;
  } catch {
    return null;
  }
}

export async function listTalks(eventId: string, size = 200): Promise<Talk[]> {
  const res = await es.search<Omit<Talk, 'id'>>({
    index: INDEX.talks,
    size,
    sort: [{ startsAt: 'asc' }],
    query: { term: { eventId } },
  });
  return hitsToDocs(res.hits.hits);
}

export async function getTalksByIds(ids: string[]): Promise<Map<string, Talk>> {
  if (ids.length === 0) return new Map();
  const res = await es.search<Omit<Talk, 'id'>>({
    index: INDEX.talks,
    size: ids.length,
    query: { ids: { values: ids } },
  });
  const map = new Map<string, Talk>();
  for (const talk of hitsToDocs(res.hits.hits)) map.set(talk.id, talk);
  return map;
}

export async function getUsersByIds(ids: string[]): Promise<Map<string, User>> {
  if (ids.length === 0) return new Map();
  const res = await es.search<Omit<User, 'id'>>({
    index: INDEX.users,
    size: ids.length,
    query: { ids: { values: ids } },
  });
  const map = new Map<string, User>();
  for (const user of hitsToDocs(res.hits.hits)) map.set(user.id, user);
  return map;
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export async function getMyAttendance(userId: string): Promise<Attendance[]> {
  const res = await es.search<Omit<Attendance, 'id'>>({
    index: INDEX.attendance,
    size: 500,
    query: { term: { userId } },
  });
  return hitsToDocs(res.hits.hits);
}

/** Talk ids the user has saved or checked into. */
export async function getMyTalkIds(userId: string): Promise<Set<string>> {
  const rows = await getMyAttendance(userId);
  return new Set(rows.map((r) => r.talkId));
}

/** Who else is going to this talk. */
export async function getTalkAttendees(talkId: string, limit = 12): Promise<User[]> {
  const res = await es.search<Omit<Attendance, 'id'>>({
    index: INDEX.attendance,
    size: 200,
    query: { term: { talkId } },
  });
  const userIds = [...new Set(hitsToDocs(res.hits.hits).map((row) => row.userId))];
  const users = await getUsersByIds(userIds.slice(0, limit));
  return [...users.values()];
}

export async function getTalkAttendeeCounts(talkIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (talkIds.length === 0) return counts;
  const res = await es.search({
    index: INDEX.attendance,
    size: 0,
    query: { terms: { talkId: talkIds } },
    aggs: { per_talk: { terms: { field: 'talkId', size: talkIds.length } } },
  });
  const buckets = (res.aggregations?.per_talk as { buckets?: { key: string; doc_count: number }[] })
    ?.buckets ?? [];
  for (const bucket of buckets) counts.set(bucket.key, bucket.doc_count);
  return counts;
}

// ---------------------------------------------------------------------------
// Feature 1 — talks tagged and ranked against your interests
// ---------------------------------------------------------------------------

/**
 * The text we hand to the semantic retriever. A user's own words (resume,
 * headline, summary) describe them better than five slugs alone.
 */
export function profileQueryText(user: User): string {
  return [user.headline, user.summary, user.interests.join(', '), user.derivedTags.join(', ')]
    .filter(Boolean)
    .join('. ')
    .slice(0, 1200);
}

export async function recommendTalks(
  user: User,
  eventId: string,
  options: { size?: number } = {},
): Promise<RankedTalk[]> {
  const size = options.size ?? 60;
  const semantic = await semanticReady();

  return startSpan('recommend.talks', { 'app.semantic': semantic }, async (span) => {
    const started = Date.now();
    const interests = user.interests ?? [];
    const derived = user.derivedTags ?? [];
    const filter = [{ term: { eventId } }];

    // Lexical half: exact tag matches carry most of the weight, with a BM25
    // pass over title and abstract to catch talks whose tags are incomplete.
    const lexicalQuery = {
      bool: {
        filter,
        should: [
          { terms: { tags: interests, boost: 4 } },
          { terms: { tags: derived, boost: 1.5 } },
          {
            multi_match: {
              query: [...interests, ...derived].map((i) => i.replace(/-/g, ' ')).join(' '),
              fields: ['title^3', 'abstract', 'tags^2'],
              boost: 1,
            },
          },
        ],
        minimum_should_match: 0,
      },
    };

    const body: Record<string, unknown> = semantic
      ? {
          index: INDEX.talks,
          size,
          retriever: {
            rrf: {
              rank_window_size: Math.max(size, 50),
              rank_constant: 20,
              retrievers: [
                { standard: { query: lexicalQuery } },
                {
                  standard: {
                    filter,
                    query: { semantic: { field: 'semantic', query: profileQueryText(user) } },
                  },
                },
              ],
            },
          },
        }
      : { index: INDEX.talks, size, query: lexicalQuery };

    const res = await search<Omit<Talk, 'id'>>(body);
    const docs = hitsToScoredDocs<Omit<Talk, 'id'>>(res.hits.hits);
    const top = docs[0]?._score ?? 1;

    const ranked: RankedTalk[] = docs.map((doc, index) => {
      const tags = doc.tags ?? [];
      const matchedInterests = interests.filter((i) => tags.includes(i));
      const matchedDerived = derived.filter(
        (d) => tags.includes(d) && !(matchedInterests as string[]).includes(d),
      );

      // Blend relative retrieval rank with how much of the user's stated
      // interest the talk actually covers. A talk that no tag matched can still
      // score ~40 on semantic similarity alone, which is the point.
      const relative = top > 0 ? doc._score / top : 0;
      const coverage = interests.length
        ? Math.min(1, (matchedInterests.length + matchedDerived.length * 0.4) / 2.5)
        : 0;
      const score = Math.round(Math.min(100, 40 * relative + 60 * coverage));

      return {
        talk: doc,
        score,
        matchedInterests,
        signals: {
          tags: matchedInterests.length > 0,
          keyword: relative > 0,
          semantic: semantic && matchedInterests.length === 0 && index < size,
        },
      };
    });

    recordRecommendOutcome(span, 'talks', started, ranked.length, {
      'app.user.interest_count': interests.length,
      'app.recommend.top_score': ranked[0]?.score ?? 0,
      'app.recommend.tag_matches': ranked.filter((r) => r.signals.tags).length,
      'app.recommend.semantic_only': ranked.filter((r) => r.signals.semantic).length,
    });
    return ranked;
  });
}

// ---------------------------------------------------------------------------
// Feature 2 — people tagged against your interests
// ---------------------------------------------------------------------------

/**
 * Ordered similar users, most similar first. Used by features 2 and 3.
 *
 * `requireProfile` restricts results to people who wrote something about their
 * own work (a resume). Feature 2 sets it: there is no point introducing you to
 * someone whose entire profile is five tags, because we cannot explain the
 * match or give you anything to open with. Feature 3 leaves it off, since
 * aggregating what the whole room is attending wants maximum density.
 */
async function findSimilarUsers(
  user: User,
  size: number,
  options: { requireProfile?: boolean } = {},
): Promise<(User & { _score: number })[]> {
  const semantic = await semanticReady();
  const interests = user.interests ?? [];
  const derived = user.derivedTags ?? [];
  const excludeSelf = { bool: { must_not: [{ ids: { values: [user.id] } }] } };

  const profileFilter = options.requireProfile
    ? [{ exists: { field: 'links.resumeText' } }]
    : [];

  const lexicalQuery = {
    bool: {
      must_not: [{ ids: { values: [user.id] } }],
      filter: profileFilter,
      should: [
        { terms: { interests, boost: 4 } },
        { terms: { derivedTags: derived, boost: 1.5 } },
        { terms: { derivedTags: interests, boost: 2 } },
        {
          multi_match: {
            query: [...interests, ...derived].map((i) => i.replace(/-/g, ' ')).join(' '),
            fields: ['headline^2', 'summary', 'links.resumeText', 'profileText'],
          },
        },
        // Someone who wrote about their work in their own words is a more
        // confident match than someone with five tags and nothing else, so
        // having a resume is itself a ranking signal.
        { exists: { field: 'links.resumeText', boost: 4 } },
      ],
    },
  };

  const body: Record<string, unknown> = semantic
    ? {
        index: INDEX.users,
        size,
        retriever: {
          rrf: {
            rank_window_size: Math.max(size, 50),
            rank_constant: 20,
            retrievers: [
              { standard: { query: lexicalQuery } },
              {
                standard: {
                  filter: [excludeSelf, ...profileFilter],
                  query: { semantic: { field: 'semantic', query: profileQueryText(user) } },
                },
              },
            ],
          },
        },
      }
    : { index: INDEX.users, size, query: lexicalQuery };

  const res = await search<Omit<User, 'id'>>(body);
  return hitsToScoredDocs<Omit<User, 'id'>>(res.hits.hits).filter(
    (candidate) => candidate.id !== user.id,
  );
}

export async function findPeople(user: User, size = 12): Promise<RankedPerson[]> {
  return startSpan('recommend.people', {}, async (span) => {
    const started = Date.now();
    const candidates = await findSimilarUsers(user, size + 4, { requireProfile: true });
    setSpanAttributes(span, { 'app.people.candidate_count': candidates.length });
    if (candidates.length === 0) {
      recordRecommendOutcome(span, 'people', started, 0);
      return [];
    }

    const myTalkIds = await getMyTalkIds(user.id);
    const theirAttendance = await getAttendanceForUsers(candidates.map((c) => c.id));
    const sharedTalkIds = new Set<string>();
    for (const rows of theirAttendance.values()) {
      for (const talkId of rows) if (myTalkIds.has(talkId)) sharedTalkIds.add(talkId);
    }
    const talkMap = await getTalksByIds([...sharedTalkIds]);
    const top = candidates[0]._score || 1;

    const ranked = candidates.map((candidate) => {
      const sharedInterests = (user.interests ?? []).filter((i) =>
        (candidate.interests ?? []).includes(i),
      );
      const theirTalks = theirAttendance.get(candidate.id) ?? [];
      const sharedTalks = theirTalks
        .filter((id) => myTalkIds.has(id))
        .map((id) => talkMap.get(id))
        .filter((t): t is Talk => Boolean(t));

      const relative = candidate._score / top;
      const interestScore = Math.min(1, sharedInterests.length / 3);
      const sessionBonus = Math.min(1, sharedTalks.length / 2);
      const score = Math.round(
        Math.min(100, 35 * relative + 50 * interestScore + 15 * sessionBonus),
      );

      return { user: candidate, score, sharedInterests, sharedTalks };
    });

    const result = ranked.sort((a, b) => b.score - a.score).slice(0, size);
    recordRecommendOutcome(span, 'people', started, result.length, {
      'app.recommend.top_score': result[0]?.score ?? 0,
      'app.people.with_shared_talks': result.filter((r) => r.sharedTalks.length > 0).length,
    });
    return result;
  });
}

async function getAttendanceForUsers(userIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (userIds.length === 0) return map;
  const res = await es.search<Omit<Attendance, 'id'>>({
    index: INDEX.attendance,
    size: 2000,
    query: { terms: { userId: userIds } },
  });
  for (const row of hitsToDocs(res.hits.hits)) {
    const list = map.get(row.userId) ?? [];
    list.push(row.talkId);
    map.set(row.userId, list);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Feature 3 — what similar people are attending
// ---------------------------------------------------------------------------

/**
 * Collaborative filtering over the attendance index: find the people most like
 * you, aggregate what they are going to, and drop anything you already saved.
 */
export async function similarPeopleAttending(
  user: User,
  eventId: string,
  size = 6,
): Promise<SimilarAttendance[]> {
  return startSpan('recommend.similar-attendance', {}, async (span) => {
    const started = Date.now();
    const peers = await findSimilarUsers(user, 20);
    setSpanAttributes(span, { 'app.similar.peer_count': peers.length });
    if (peers.length === 0) {
      recordRecommendOutcome(span, 'similar-attendance', started, 0);
      return [];
    }

    const peerIds = peers.map((p) => p.id);
    const myTalkIds = await getMyTalkIds(user.id);

    const res = await es.search({
      index: INDEX.attendance,
      size: 0,
      query: {
        bool: {
          filter: [{ terms: { userId: peerIds } }, { term: { eventId } }],
        },
      },
      aggs: {
        per_talk: {
          terms: { field: 'talkId', size: size + myTalkIds.size + 10 },
          aggs: { peers: { terms: { field: 'userId', size: 6 } } },
        },
      },
    });

    const buckets =
      (
        res.aggregations?.per_talk as {
          buckets?: {
            key: string;
            doc_count: number;
            peers?: { buckets?: { key: string }[] };
          }[];
        }
      )?.buckets ?? [];

    const interesting = buckets.filter((b) => !myTalkIds.has(b.key)).slice(0, size);
    if (interesting.length === 0) {
      recordRecommendOutcome(span, 'similar-attendance', started, 0, {
        'app.similar.bucket_count': buckets.length,
      });
      return [];
    }

    const talkMap = await getTalksByIds(interesting.map((b) => b.key));
    const peerMap = new Map(peers.map((p) => [p.id, p as User]));

    const result = interesting
      .map((bucket) => {
        const talk = talkMap.get(bucket.key);
        if (!talk) return null;
        const peerUsers = (bucket.peers?.buckets ?? [])
          .map((p) => peerMap.get(p.key))
          .filter((u): u is User => Boolean(u));
        return { talk, peerCount: bucket.doc_count, peers: peerUsers };
      })
      .filter((row): row is SimilarAttendance => row !== null);

    recordRecommendOutcome(span, 'similar-attendance', started, result.length, {
      'app.similar.bucket_count': buckets.length,
    });
    return result;
  });
}

// ---------------------------------------------------------------------------
// Feature 4 — live room counts and trending talks
// ---------------------------------------------------------------------------

const OCCUPANCY_WINDOW_MIN = 25;
const TREND_WINDOW_MIN = 10;

export async function getRoomLoads(eventId: string): Promise<RoomLoad[]> {
  return startSpan('live.rooms', {}, async () => {
    const [event, talks] = await Promise.all([getEvent(eventId), listTalks(eventId)]);
    if (!event) return [];

    const res = await es.search({
      index: INDEX.attendance,
      size: 0,
      query: {
        bool: {
          filter: [
            { term: { eventId } },
            { term: { state: 'checked_in' } },
            { range: { at: { gte: `now-${OCCUPANCY_WINDOW_MIN}m` } } },
          ],
        },
      },
      aggs: { per_room: { terms: { field: 'room', size: 50 } } },
    });

    const buckets =
      (res.aggregations?.per_room as { buckets?: { key: string; doc_count: number }[] })?.buckets ??
      [];
    const counts = new Map(buckets.map((b) => [b.key, b.doc_count]));
    const now = Date.now();

    return event.rooms.map((room) => {
      const count = counts.get(room.id) ?? 0;
      const nowPlaying = talks.find(
        (talk) =>
          talk.rooms.includes(room.id) &&
          Date.parse(talk.startsAt) <= now &&
          Date.parse(talk.endsAt) > now,
      );
      return {
        room,
        count,
        utilisation: room.capacity > 0 ? Math.min(1, count / room.capacity) : 0,
        nowPlaying,
      };
    });
  });
}

/**
 * Trending ranks by velocity — check-ins in the last window minus the window
 * before it — so a talk that is heating up right now beats one that filled up
 * an hour ago.
 */
export async function getTrendingTalks(eventId: string, size = 6): Promise<TrendingTalk[]> {
  return startSpan('live.trending', {}, async () => {
    const res = await es.search({
      index: INDEX.attendance,
      size: 0,
      query: {
        bool: {
          filter: [
            { term: { eventId } },
            { range: { at: { gte: `now-${TREND_WINDOW_MIN * 2}m` } } },
          ],
        },
      },
      aggs: {
        per_talk: {
          terms: { field: 'talkId', size: 40 },
          aggs: {
            recent: { filter: { range: { at: { gte: `now-${TREND_WINDOW_MIN}m` } } } },
            previous: {
              filter: {
                range: {
                  at: { gte: `now-${TREND_WINDOW_MIN * 2}m`, lt: `now-${TREND_WINDOW_MIN}m` },
                },
              },
            },
          },
        },
      },
    });

    const buckets =
      (
        res.aggregations?.per_talk as {
          buckets?: {
            key: string;
            recent?: { doc_count: number };
            previous?: { doc_count: number };
          }[];
        }
      )?.buckets ?? [];

    const scored = buckets
      .map((b) => ({
        talkId: b.key,
        recent: b.recent?.doc_count ?? 0,
        previous: b.previous?.doc_count ?? 0,
      }))
      .filter((b) => b.recent > 0)
      .sort((a, b) => b.recent - b.previous - (a.recent - a.previous) || b.recent - a.recent)
      .slice(0, size);

    if (scored.length === 0) return [];
    const talkMap = await getTalksByIds(scored.map((s) => s.talkId));

    return scored
      .map((s) => {
        const talk = talkMap.get(s.talkId);
        if (!talk) return null;
        return { talk, recent: s.recent, previous: s.previous, velocity: s.recent - s.previous };
      })
      .filter((row): row is TrendingTalk => row !== null);
  });
}

/** Talks running right now, for the live dashboard header. */
export async function getNowPlaying(eventId: string): Promise<Talk[]> {
  const nowIso = new Date().toISOString();
  const res = await es.search<Omit<Talk, 'id'>>({
    index: INDEX.talks,
    size: 10,
    sort: [{ startsAt: 'asc' }],
    query: {
      bool: {
        filter: [
          { term: { eventId } },
          { range: { startsAt: { lte: nowIso } } },
          { range: { endsAt: { gt: nowIso } } },
        ],
      },
    },
  });
  return hitsToDocs(res.hits.hits);
}
