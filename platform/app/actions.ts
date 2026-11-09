'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { es, INDEX } from '@/lib/es';
import { clearCurrentUser, getCurrentUser, setCurrentUserId } from '@/lib/session';
import { enrichProfile, tagTalks, tagsFromKeywords } from '@/lib/ai';
import { getTalk } from '@/lib/search';
import { isInterest } from '@/lib/taxonomy';
import { getInputMode } from '@/lib/input-mode';
import { errorAttrs, log } from '@/lib/log';
import {
  markSpanError,
  recordAttendanceAction,
  recordOnboarding,
  recordOrganizerPublish,
  setSpanAttributes,
  startSpan,
} from '@/lib/telemetry';
import type { Span } from '@opentelemetry/api';
import type { Event, Room, Talk, User } from '@/lib/types';

// Every action is wrapped in a span named `action.<name>`. `redirect()` works by
// throwing, so it is always called after the span has ended — otherwise every
// successful redirect would be recorded as a failed span.

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export async function switchUser(formData: FormData): Promise<void> {
  const userId = String(formData.get('userId') ?? '');
  if (!userId) return;
  await startSpan('action.switch_user', {}, async (span) => {
    setSpanAttributes(span, { 'app.user.seeded': !userId.startsWith('u-') });
    await setCurrentUserId(userId);
  });
  revalidatePath('/', 'layout');
  redirect('/agenda');
}

export async function signOut(): Promise<void> {
  await startSpan('action.sign_out', {}, async () => {
    await clearCurrentUser();
  });
  revalidatePath('/', 'layout');
  redirect('/');
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export interface OnboardingResult {
  error?: string;
}

/** Validation failures: recorded on the span and logged, so confusing form steps show up in Dash0. */
function rejectOnboarding(
  span: Span,
  reason: string,
  error: string,
): OnboardingResult {
  markSpanError(span, reason);
  setSpanAttributes(span, { 'app.validation.reason': reason });
  log.warn('onboarding.rejected', { 'app.validation.reason': reason });
  recordOnboarding('error', false);
  return { error };
}

export async function createProfile(formData: FormData): Promise<OnboardingResult> {
  const name = String(formData.get('name') ?? '').trim();
  const interests = formData.getAll('interests').map(String).filter(isInterest);
  const linkedin = String(formData.get('linkedin') ?? '').trim();
  const github = String(formData.get('github') ?? '').trim();
  const resumeText = String(formData.get('resumeText') ?? '').trim();
  const inputMode = await getInputMode();

  const result = await startSpan(
    'action.create_profile',
    {
      'app.profile.interest_count': interests.length,
      'app.profile.has_linkedin': Boolean(linkedin),
      'app.profile.has_github': Boolean(github),
      'app.profile.has_resume': Boolean(resumeText),
      'app.a11y.input_mode': inputMode,
    },
    async (span): Promise<OnboardingResult | null> => {
      if (!name) {
        return rejectOnboarding(
          span,
          'missing_name',
          'Add your name so people know who they are matching with.',
        );
      }
      if (interests.length !== 5) {
        return rejectOnboarding(
          span,
          'wrong_interest_count',
          `Pick exactly 5 interests — you have ${interests.length}.`,
        );
      }
      if (!linkedin && !github && !resumeText) {
        return rejectOnboarding(
          span,
          'missing_signal',
          'Add at least one of LinkedIn, GitHub or a resume so we can match you to people.',
        );
      }

      const enriched = await enrichProfile({ name, interests, linkedin, github, resumeText });
      const aiEnriched = enriched.source === 'claude';

      const id = `u-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
      const profileText = [
        enriched.headline,
        enriched.summary,
        resumeText,
        `Interests: ${interests.join(', ')}`,
        enriched.derivedTags.length ? `Also: ${enriched.derivedTags.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 4000);

      const doc: Omit<User, 'id'> & { semantic?: string } = {
        name,
        headline: enriched.headline,
        summary: enriched.summary,
        interests,
        derivedTags: enriched.derivedTags,
        avatarSeed: id,
        isSeeded: false,
        links: {
          linkedin: linkedin || undefined,
          github: github || undefined,
          resumeText: resumeText || undefined,
        },
        profileText,
        createdAt: new Date().toISOString(),
      };

      if (await indexHasSemantic(INDEX.users)) doc.semantic = profileText;

      await es.index({ index: INDEX.users, id, document: doc, refresh: 'wait_for' });
      await setCurrentUserId(id);

      setSpanAttributes(span, {
        'app.ai.enriched': aiEnriched,
        'app.profile.derived_tag_count': enriched.derivedTags.length,
      });
      recordOnboarding('ok', aiEnriched);
      log.info('onboarding.completed', {
        'app.ai.enriched': aiEnriched,
        'app.a11y.input_mode': inputMode,
      });
      return null;
    },
  );

  if (result) return result;
  revalidatePath('/', 'layout');
  redirect('/agenda');
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

/** Writes one attendance row. Returns why it could not, or null on success. */
async function recordAttendance(
  talkId: string,
  state: 'saved' | 'checked_in',
): Promise<'no_user' | 'no_talk' | null> {
  const user = await getCurrentUser();
  if (!user) return 'no_user';
  const talk = await getTalk(talkId);
  if (!talk) return 'no_talk';

  // One document per (user, talk, state) so re-clicking does not inflate counts.
  await es.index({
    index: INDEX.attendance,
    id: `${user.id}:${talkId}:${state}`,
    document: {
      userId: user.id,
      talkId,
      eventId: talk.eventId,
      room: talk.rooms[0],
      state,
      at: new Date().toISOString(),
    },
    refresh: 'wait_for',
  });
  return null;
}

/**
 * Shared wrapper for save / unsave / check-in: one span, one metric and one log
 * line per attempt, tagged with the visitor's input mode for the keyboard
 * fairness SLO.
 */
async function attendanceAction(
  action: 'save' | 'unsave' | 'check_in',
  talkId: string,
  run: () => Promise<string | null>,
): Promise<void> {
  const inputMode = await getInputMode();
  await startSpan(
    `action.${action}`,
    { 'app.talk.id': talkId, 'app.a11y.input_mode': inputMode },
    async (span) => {
      try {
        const failure = await run();
        if (failure) {
          markSpanError(span, failure);
          setSpanAttributes(span, { 'app.failure.reason': failure });
          recordAttendanceAction(action, 'error', inputMode);
          log.warn(`attendance.${action}.failed`, {
            'app.failure.reason': failure,
            'app.talk.id': talkId,
            'app.a11y.input_mode': inputMode,
          });
          return;
        }
        recordAttendanceAction(action, 'ok', inputMode);
        log.info(`attendance.${action}`, {
          'app.talk.id': talkId,
          'app.a11y.input_mode': inputMode,
        });
      } catch (err) {
        recordAttendanceAction(action, 'error', inputMode);
        log.error(`attendance.${action}.error`, {
          ...errorAttrs(err),
          'app.talk.id': talkId,
          'app.a11y.input_mode': inputMode,
        });
        throw err;
      }
    },
  );
}

export async function saveTalk(formData: FormData): Promise<void> {
  const talkId = String(formData.get('talkId') ?? '');
  await attendanceAction('save', talkId, () => recordAttendance(talkId, 'saved'));
  revalidatePath('/agenda');
  revalidatePath(`/talks/${talkId}`);
  revalidatePath('/people');
}

export async function unsaveTalk(formData: FormData): Promise<void> {
  const talkId = String(formData.get('talkId') ?? '');
  await attendanceAction('unsave', talkId, async () => {
    const user = await getCurrentUser();
    if (!user) return 'no_user';
    if (!talkId) return 'no_talk';
    try {
      await es.deleteByQuery({
        index: INDEX.attendance,
        query: { bool: { filter: [{ term: { userId: user.id } }, { term: { talkId } }] } },
        refresh: true,
        conflicts: 'proceed',
      });
    } catch {
      // Nothing saved — nothing to do.
    }
    return null;
  });
  revalidatePath('/agenda');
  revalidatePath(`/talks/${talkId}`);
  revalidatePath('/people');
}

export async function checkInTalk(formData: FormData): Promise<void> {
  const talkId = String(formData.get('talkId') ?? '');
  await attendanceAction('check_in', talkId, async () => {
    const saved = await recordAttendance(talkId, 'saved');
    if (saved) return saved;
    return recordAttendance(talkId, 'checked_in');
  });
  revalidatePath('/live');
  revalidatePath(`/talks/${talkId}`);
  revalidatePath('/agenda');
}

// ---------------------------------------------------------------------------
// Organizer
// ---------------------------------------------------------------------------

async function indexHasSemantic(index: string): Promise<boolean> {
  try {
    const mapping = await es.indices.getMapping({ index });
    const props = Object.values(mapping)[0]?.mappings?.properties ?? {};
    return 'semantic' in props;
  } catch {
    return false;
  }
}

function parseRooms(raw: string): Room[] {
  // "R101:Main Hall:400" per line, or just "R101" for a bare room number.
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, name, capacity] = line.split(':').map((p) => p.trim());
      return {
        id,
        name: name || `Room ${id}`,
        capacity: Number.parseInt(capacity ?? '', 10) || 100,
      };
    })
    .filter((room) => Boolean(room.id));
}

/** Organizer validation failure: span error + warning log + metric, then the message for the form. */
function rejectPublish(
  span: Span,
  kind: 'event' | 'talk',
  reason: string,
  error: string,
): { error: string } {
  markSpanError(span, reason);
  setSpanAttributes(span, { 'app.validation.reason': reason });
  log.warn(`organizer.${kind}.rejected`, { 'app.validation.reason': reason });
  recordOrganizerPublish(kind, 'error');
  return { error };
}

export async function createEvent(formData: FormData): Promise<{ error?: string }> {
  const name = String(formData.get('name') ?? '').trim();
  const venue = String(formData.get('venue') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const startsAt = String(formData.get('startsAt') ?? '');
  const endsAt = String(formData.get('endsAt') ?? '');
  const rooms = parseRooms(String(formData.get('rooms') ?? ''));

  return startSpan('action.create_event', { 'app.event.room_count': rooms.length }, async (span) => {
    if (!name) return rejectPublish(span, 'event', 'missing_name', 'The conference needs a name.');
    if (rooms.length === 0) {
      return rejectPublish(
        span,
        'event',
        'missing_rooms',
        'Add at least one room, one per line, as ID:Name:Capacity.',
      );
    }
    if (!startsAt || !endsAt) {
      return rejectPublish(span, 'event', 'missing_times', 'Set a start and end time.');
    }

    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const doc: Omit<Event, 'id'> = {
      name,
      slug: id,
      venue,
      description,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      rooms,
      createdAt: new Date().toISOString(),
    };

    await es.index({ index: INDEX.events, id, document: doc, refresh: 'wait_for' });
    setSpanAttributes(span, { 'app.event.id': id });
    recordOrganizerPublish('event', 'ok');
    log.info('organizer.event.published', {
      'app.event.id': id,
      'app.event.room_count': rooms.length,
    });
    revalidatePath('/organizer');
    revalidatePath('/agenda');
    return {};
  });
}

export async function createTalk(formData: FormData): Promise<{ error?: string; tags?: string[] }> {
  const eventId = String(formData.get('eventId') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const abstract = String(formData.get('abstract') ?? '').trim();
  const track = String(formData.get('track') ?? '').trim() || 'General';
  const rooms = String(formData.get('rooms') ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  const startsAt = String(formData.get('startsAt') ?? '');
  const endsAt = String(formData.get('endsAt') ?? '');

  const speaker = {
    name: String(formData.get('speakerName') ?? '').trim(),
    title: String(formData.get('speakerTitle') ?? '').trim(),
    company: String(formData.get('speakerCompany') ?? '').trim(),
    bio: String(formData.get('speakerBio') ?? '').trim(),
    photoUrl: '',
    linkedin: String(formData.get('speakerLinkedin') ?? '').trim(),
    github: String(formData.get('speakerGithub') ?? '').trim(),
  };

  return startSpan(
    'action.create_talk',
    { 'app.event.id': eventId, 'app.talk.room_count': rooms.length },
    async (span): Promise<{ error?: string; tags?: string[] }> => {
      if (!eventId) {
        return rejectPublish(
          span,
          'talk',
          'missing_event',
          'Choose which conference this talk belongs to.',
        );
      }
      if (!title) return rejectPublish(span, 'talk', 'missing_title', 'The talk needs a title.');
      if (!abstract) {
        return rejectPublish(
          span,
          'talk',
          'missing_abstract',
          'Add a description so we can tag and match it.',
        );
      }
      if (rooms.length === 0) {
        return rejectPublish(span, 'talk', 'missing_rooms', 'Add at least one room number.');
      }
      if (!startsAt || !endsAt) {
        return rejectPublish(span, 'talk', 'missing_times', 'Set a start and end time.');
      }
      if (!speaker.name) {
        return rejectPublish(span, 'talk', 'missing_speaker', 'Add the speaker name.');
      }

      // Tags come from Claude, which is what makes a brand-new talk immediately
      // matchable against every attendee's interests.
      const manualTags = String(formData.get('tags') ?? '')
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      const id = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}-${Date.now().toString(36)}`;

      let tags = manualTags.filter(isInterest);
      const autoTagged = tags.length === 0;
      if (autoTagged) {
        const tagged = await tagTalks([{ id, title, abstract }]);
        tags = (tagged[id] ?? tagsFromKeywords(`${title} ${abstract}`)) as typeof tags;
      }

      const doc: Omit<Talk, 'id'> & { semantic?: string } = {
        eventId,
        title,
        abstract,
        tags,
        rooms,
        track,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        speaker,
        createdAt: new Date().toISOString(),
      };

      if (await indexHasSemantic(INDEX.talks)) {
        doc.semantic = `${title}. ${abstract} Topics: ${tags.join(', ')}.`;
      }

      await es.index({ index: INDEX.talks, id, document: doc, refresh: 'wait_for' });
      setSpanAttributes(span, {
        'app.talk.id': id,
        'app.talk.auto_tagged': autoTagged,
        'app.talk.tag_count': tags.length,
      });
      recordOrganizerPublish('talk', 'ok');
      log.info('organizer.talk.published', {
        'app.talk.id': id,
        'app.talk.auto_tagged': autoTagged,
        'app.talk.tag_count': tags.length,
      });
      if (tags.length === 0) {
        // An untagged talk can never be recommended to anyone.
        log.warn('organizer.talk.untagged', { 'app.talk.id': id });
      }
      revalidatePath('/organizer');
      revalidatePath('/agenda');
      return { tags };
    },
  );
}

export async function deleteTalk(formData: FormData): Promise<void> {
  const talkId = String(formData.get('talkId') ?? '');
  if (!talkId) return;
  await startSpan('action.delete_talk', { 'app.talk.id': talkId }, async () => {
    try {
      await es.delete({ index: INDEX.talks, id: talkId, refresh: 'wait_for' });
      log.info('organizer.talk.deleted', { 'app.talk.id': talkId });
    } catch {
      // Already gone.
    }
  });
  revalidatePath('/organizer');
  revalidatePath('/agenda');
}
