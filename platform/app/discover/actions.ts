'use server';

import { executeDiscovery } from '@/lib/discovery-service';
import { getCurrentUser } from '@/lib/session';
import type { DiscoveryResult } from '@/lib/discovery';

export async function runDiscovery(input: unknown): Promise<{ result?: DiscoveryResult; error?: string }> {
  return executeDiscovery(input, await getCurrentUser());
}
