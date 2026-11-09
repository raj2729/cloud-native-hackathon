'use server';
import { isAdmin } from '@/lib/admin-session';
import { checkDash0Mcp, type McpCheck } from '@/lib/dash0-mcp';
import { OPERATIONS } from '@/lib/observability';

export async function runMcpCheck(input: unknown): Promise<McpCheck> {
  const error = (message: string): McpCheck => ({ status: 'error', message, tools: [], checkedAt: Date.now() });
  if (!(await isAdmin())) return error('Admin access required. Sign in again.');
  if (!input || typeof input !== 'object') return error('Choose a valid operation and time window.');
  const args = input as Record<string, unknown>;
  const operation = OPERATIONS.find((value) => value === args.operation);
  if (!operation || ![15, 60, 240].includes(Number(args.minutes)) || typeof args.investigate !== 'boolean') return error('Choose a valid operation and time window.');
  return checkDash0Mcp(operation, Number(args.minutes), args.investigate);
}
