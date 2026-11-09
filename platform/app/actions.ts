'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { es, INDEX } from '@/lib/es';
import { clearCurrentUser, getCurrentUser, setCurrentUserId } from '@/lib/session';
import { enrichProfile, tagTalks, tagsFromKeywords } from '@/lib/ai';
import { getTalk } from '@/lib/search';
import { isInterest } from '@/lib/taxonomy';
import type { Event, Room, Talk, User } from '@/lib/types';

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export async function switchUser(formData: FormData): Promise<void> {
  const userId = String(formData.get('userId') ?? '');
  if (!userId) return;
  await setCurrentUserId(userId);
  revalidatePath('/', 'layout');
  redirect('/agenda');
}

export async function signOut(): Promise<void> {
  await clearCurrentUser();
  revalidatePath('/', 'layout');
  redirect('/');
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export interface OnboardingResult {
  error?: string;
}

export async function createProfile(formData: FormData): Promise<OnboardingResult> {
  const name = String(formData.get('name') ?? '').trim();
  const interests = formData.getAll('interests').map(String).filter(isInterest);
  const linkedin = String(formData.get('linkedin') ?? '').trim();
  const github = String(formData.get('github') ?? '').trim();
  const resumeText = String(formData.get('resumeText') ?? '').trim();

  if (!name) return { error: 'Add your name so people know who they are matching with.' };
  if (interests.length !== 5) {
    return { error: `Pick exactly 5 interests — you have ${interests.length}.` };
  }
  if (!linkedin && !github && !resumeText) {
    return {
      error: 'Add at least one of LinkedIn, GitHub or a resume so we can match you to people.',
    };
  }

  const enriched = await enrichProfile({ name, interests, linkedin, github, resumeText });

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
  revalidatePath('/', 'layout');
  redirect('/agenda');
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

async function recordAttendance(talkId: string, state: 'saved' | 'checked_in'): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const talk = await getTalk(talkId);
  if (!talk) return;

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
}

export async function saveTalk(formData: FormData): Promise<void> {
  await recordAttendance(String(formData.get('talkId') ?? ''), 'saved');
  revalidatePath('/agenda');
  revalidatePath(`/talks/${formData.get('talkId')}`);
  revalidatePath('/people');
}

export async function unsaveTalk(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const talkId = String(formData.get('talkId') ?? '');
  if (!user || !talkId) return;
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
  revalidatePath('/agenda');
  revalidatePath(`/talks/${talkId}`);
  revalidatePath('/people');
}

export async function checkInTalk(formData: FormData): Promise<void> {
  const talkId = String(formData.get('talkId') ?? '');
  await recordAttendance(talkId, 'saved');
  await recordAttendance(talkId, 'checked_in');
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

export async function createEvent(formData: FormData): Promise<{ error?: string }> {
  const name = String(formData.get('name') ?? '').trim();
  const venue = String(formData.get('venue') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const startsAt = String(formData.get('startsAt') ?? '');
  const endsAt = String(formData.get('endsAt') ?? '');
  const rooms = parseRooms(String(formData.get('rooms') ?? ''));

  if (!name) return { error: 'The conference needs a name.' };
  if (rooms.length === 0) {
    return { error: 'Add at least one room, one per line, as ID:Name:Capacity.' };
  }
  if (!startsAt || !endsAt) return { error: 'Set a start and end time.' };

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
  revalidatePath('/organizer');
  revalidatePath('/agenda');
  return {};
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

  if (!eventId) return { error: 'Choose which conference this talk belongs to.' };
  if (!title) return { error: 'The talk needs a title.' };
  if (!abstract) return { error: 'Add a description so we can tag and match it.' };
  if (rooms.length === 0) return { error: 'Add at least one room number.' };
  if (!startsAt || !endsAt) return { error: 'Set a start and end time.' };
  if (!speaker.name) return { error: 'Add the speaker name.' };

  // Tags come from Claude, which is what makes a brand-new talk immediately
  // matchable against every attendee's interests.
  const manualTags = String(formData.get('tags') ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const id = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}-${Date.now().toString(36)}`;

  let tags = manualTags.filter(isInterest);
  if (tags.length === 0) {
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
  revalidatePath('/organizer');
  revalidatePath('/agenda');
  return { tags };
}

export async function deleteTalk(formData: FormData): Promise<void> {
  const talkId = String(formData.get('talkId') ?? '');
  if (!talkId) return;
  try {
    await es.delete({ index: INDEX.talks, id: talkId, refresh: 'wait_for' });
  } catch {
    // Already gone.
  }
  revalidatePath('/organizer');
  revalidatePath('/agenda');
}
