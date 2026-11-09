/**
 * Claude-powered enrichment: talk tagging, profile enrichment and match
 * rationales.
 *
 * Every function here has a deterministic keyword-based fallback and never
 * throws. If the API key is missing, the request fails, or the model declines,
 * the app degrades to slightly duller copy rather than losing a feature. All
 * results are written back into Elasticsearch by the caller so the live demo
 * never waits on a model.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { TAG_KEYWORDS, TAXONOMY, TAXONOMY_SET, label, type Interest } from './taxonomy';

const MODEL = 'claude-opus-5';

export const AI_ENABLED = process.env.AI_ENABLED !== 'false';

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!AI_ENABLED) return null;
  if (client) return client;
  try {
    // A bare constructor also picks up an `ant auth login` profile, so an unset
    // ANTHROPIC_API_KEY does not necessarily mean there are no credentials.
    client = new Anthropic({ maxRetries: 1 });
    return client;
  } catch {
    return null;
  }
}

/** Keep only slugs that exist in the taxonomy, de-duplicated and capped. */
function sanitiseTags(tags: unknown, limit = 5): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const slug = tag.trim().toLowerCase();
    if (TAXONOMY_SET.has(slug) && !out.includes(slug)) out.push(slug);
    if (out.length >= limit) break;
  }
  return out;
}

/** Deterministic tagging: score each taxonomy slug by keyword hits in the text. */
export function tagsFromKeywords(text: string, limit = 4): Interest[] {
  const haystack = ` ${text.toLowerCase()} `;
  const scored: { tag: Interest; score: number }[] = [];

  for (const tag of TAXONOMY) {
    const keywords = TAG_KEYWORDS[tag] ?? [];
    let score = 0;
    // The slug itself and its label are implicit keywords.
    for (const needle of [tag.replace(/-/g, ' '), label(tag).toLowerCase(), ...keywords]) {
      if (needle.length < 3) continue;
      if (haystack.includes(needle)) score += needle.includes(' ') ? 2 : 1;
    }
    if (score > 0) scored.push({ tag, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.tag);
}

// ---------------------------------------------------------------------------
// Talk tagging
// ---------------------------------------------------------------------------

const TalkTagsSchema = z.object({
  talks: z.array(
    z.object({
      id: z.string(),
      tags: z.array(z.string()),
    }),
  ),
});

export interface TaggableTalk {
  id: string;
  title: string;
  abstract: string;
}

/**
 * Tag a batch of talks in a single call. Returns a map of talk id -> tags,
 * falling back to keyword extraction for anything the model omits.
 */
export async function tagTalks(talks: TaggableTalk[]): Promise<Record<string, string[]>> {
  const fallback = (): Record<string, string[]> =>
    Object.fromEntries(talks.map((t) => [t.id, tagsFromKeywords(`${t.title} ${t.abstract}`)]));

  const anthropic = getClient();
  if (!anthropic || talks.length === 0) return fallback();

  const catalogue = talks
    .map((t) => `<talk id="${t.id}">\n${t.title}\n${t.abstract}\n</talk>`)
    .join('\n\n');

  try {
    const response = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: 'low', format: zodOutputFormat(TalkTagsSchema) },
      system:
        'You tag conference talks for a recommendation engine. Choose only from the provided ' +
        'vocabulary, using the exact slugs. Pick the 3-5 slugs that best describe what an ' +
        'attendee would learn. Prefer specific slugs over broad ones.',
      messages: [
        {
          role: 'user',
          content: `Vocabulary (use these exact slugs):\n${TAXONOMY.join(', ')}\n\nTalks:\n\n${catalogue}\n\nReturn tags for every talk id.`,
        },
      ],
    });

    if (response.stop_reason === 'refusal' || !response.parsed_output) return fallback();

    const result: Record<string, string[]> = {};
    for (const entry of response.parsed_output.talks) {
      const tags = sanitiseTags(entry.tags);
      if (tags.length) result[entry.id] = tags;
    }
    // Backfill anything the model skipped or returned empty.
    for (const talk of talks) {
      if (!result[talk.id]?.length) {
        result[talk.id] = tagsFromKeywords(`${talk.title} ${talk.abstract}`);
      }
    }
    return result;
  } catch (err) {
    console.warn(`! tagTalks fell back to keywords: ${(err as Error).message}`);
    return fallback();
  }
}

// ---------------------------------------------------------------------------
// Profile enrichment
// ---------------------------------------------------------------------------

const ProfileSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  derived_tags: z.array(z.string()),
});

export interface ProfileInput {
  name: string;
  interests: string[];
  linkedin?: string;
  github?: string;
  resumeText?: string;
}

export interface EnrichedProfile {
  headline: string;
  summary: string;
  derivedTags: string[];
}

/**
 * Turn whatever signals a user gave us (any one of LinkedIn / GitHub / resume)
 * into a headline, a short summary and extra tags beyond their five picks.
 */
export async function enrichProfile(input: ProfileInput): Promise<EnrichedProfile> {
  const signalText = [
    input.resumeText ?? '',
    input.github ? `GitHub: ${input.github}` : '',
    input.linkedin ? `LinkedIn: ${input.linkedin}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const fallback = (): EnrichedProfile => ({
    headline: input.interests.length
      ? `Works on ${input.interests.slice(0, 2).map(label).join(' & ')}`
      : 'Conference attendee',
    summary: signalText
      ? signalText.slice(0, 240)
      : `Interested in ${input.interests.map(label).join(', ')}.`,
    derivedTags: tagsFromKeywords(`${signalText} ${input.interests.join(' ')}`, 6).filter(
      (t) => !input.interests.includes(t),
    ),
  });

  const anthropic = getClient();
  if (!anthropic) return fallback();

  try {
    const response = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low', format: zodOutputFormat(ProfileSchema) },
      system:
        'You build attendee profiles for a conference matchmaking app. Write in plain, ' +
        'specific language and never invent facts that are not supported by the input. ' +
        'derived_tags must use only the provided vocabulary slugs and must exclude slugs the ' +
        'attendee already selected.',
      messages: [
        {
          role: 'user',
          content:
            `Vocabulary: ${TAXONOMY.join(', ')}\n\n` +
            `Name: ${input.name}\n` +
            `Selected interests: ${input.interests.join(', ') || '(none)'}\n` +
            `Other signals:\n${signalText || '(none provided)'}\n\n` +
            'Return: headline (under 12 words, what they work on), summary (1-2 sentences, ' +
            'what they would want to talk about at a conference), derived_tags (up to 5 ' +
            'additional relevant slugs).',
        },
      ],
    });

    if (response.stop_reason === 'refusal' || !response.parsed_output) return fallback();

    const parsed = response.parsed_output;
    return {
      headline: parsed.headline?.trim() || fallback().headline,
      summary: parsed.summary?.trim() || fallback().summary,
      derivedTags: sanitiseTags(parsed.derived_tags, 6).filter(
        (t) => !input.interests.includes(t),
      ),
    };
  } catch (err) {
    console.warn(`! enrichProfile fell back: ${(err as Error).message}`);
    return fallback();
  }
}

// ---------------------------------------------------------------------------
// Match rationale
// ---------------------------------------------------------------------------

export interface RationaleInput {
  me: { name: string; headline: string; interests: string[] };
  them: { name: string; headline: string; interests: string[] };
  sharedInterests: string[];
  sharedTalkTitles: string[];
}

/** One sentence on why these two should talk. */
export async function matchRationale(input: RationaleInput): Promise<string> {
  const fallback = (): string => {
    const shared = input.sharedInterests.map(label);
    if (shared.length && input.sharedTalkTitles.length) {
      return `You both care about ${shared.slice(0, 2).join(' and ')}, and you are both going to "${input.sharedTalkTitles[0]}".`;
    }
    if (shared.length > 1) {
      return `You share ${shared.length} interests, including ${shared.slice(0, 2).join(' and ')}.`;
    }
    if (shared.length === 1) return `You are both interested in ${shared[0]}.`;
    if (input.sharedTalkTitles.length) {
      return `You are both attending "${input.sharedTalkTitles[0]}".`;
    }
    return 'Your profiles sit close together in the same problem space.';
  };

  const anthropic = getClient();
  if (!anthropic) return fallback();

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      output_config: { effort: 'low' },
      system:
        'You write one-sentence introductions for a conference matchmaking app. Be concrete ' +
        'and specific about the shared technical ground. No greetings, no exclamation marks, ' +
        'no more than 30 words. Address the reader as "you". Never invent shared history.',
      messages: [
        {
          role: 'user',
          content:
            `You: ${input.me.name} — ${input.me.headline} (${input.me.interests.join(', ')})\n` +
            `Them: ${input.them.name} — ${input.them.headline} (${input.them.interests.join(', ')})\n` +
            `Shared interests: ${input.sharedInterests.join(', ') || 'none exactly'}\n` +
            `Talks you are both attending: ${input.sharedTalkTitles.join('; ') || 'none'}\n\n` +
            'Write the one sentence explaining why they are worth meeting.',
        },
      ],
    });

    if (response.stop_reason === 'refusal') return fallback();
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join(' ')
      .trim();
    return text || fallback();
  } catch {
    return fallback();
  }
}
