import { z } from 'zod';
import { discoverConference } from '@/lib/search';
import { answerConferenceQuestion } from '@/lib/ai';
import type { User } from '@/lib/types';
import type { DiscoveryResult } from '@/lib/discovery';
import { randomUUID } from 'node:crypto';
import { observeOperation } from '@/lib/operation-tracking';

const schema = z.object({
  query: z.string().trim().min(2).max(1000),
  kind: z.enum(['all', 'talks', 'people']),
  eventId: z.string().min(1).max(100),
  tag: z.string().max(100),
  assistant: z.boolean(),
});

export async function executeDiscovery(input: unknown, viewer: User | null = null): Promise<{ result?: DiscoveryResult; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: 'Enter a question between 2 and 1,000 characters and choose a conference.' };
  const requestId = randomUUID();
  try {
    return await observeOperation('discovery', requestId, async () => {
    const result = await observeOperation('retrieval', requestId, () => discoverConference(parsed.data, viewer), () => ({ outcome: 'ok', provider: 'elasticsearch' }));
    if (parsed.data.assistant) {
      const generated = await observeOperation('generation', requestId, () => answerConferenceQuestion(parsed.data.query, result.sources), (answer) => ({
        outcome: answer.generation === 'extractive' && result.sources.length > 0 ? 'fallback' : 'ok',
        provider: answer.generation === 'extractive' ? (process.env.OPENAI_API_KEY ? 'openai' : 'elastic') : answer.generation,
      }));
      result.answer = generated.answer;
      result.generation = generated.generation;
    }
    return { result };
    }, (response) => ({ outcome: response.result.generation === 'extractive' && response.result.sources.length > 0 ? 'fallback' : 'ok' }));
  } catch {
    // Cluster errors can contain infrastructure details; keep them server-side.
    return { error: 'Conference search is unavailable. Check the Elasticsearch connection and seeded indices, then try again.' };
  }
}
