export const OPERATIONS = ['discovery', 'retrieval', 'generation'] as const;
export type Operation = typeof OPERATIONS[number];
export type OperationOutcome = 'ok' | 'error' | 'fallback';
export const TARGETS: Record<Operation, number> = { discovery: 15_000, retrieval: 3_000, generation: 12_000 };
export const SLO_TARGET = 0.99;
export const AVAILABILITY_TARGET = 0.995;

export interface OperationRecord {
  id: string;
  at: string;
  operation: Operation;
  outcome: OperationOutcome;
  durationMs: number;
  provider: string;
  traceId?: string;
  requestId: string;
  serviceVersion: string;
}
export interface ObservabilitySnapshot {
  minutes: number;
  operation: Operation;
  total: number;
  errors: number;
  fallbacks: number;
  goodLatency: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  histogram: { label: string; count: number }[];
  timeline: { at: number; count: number; p95: number | null; errors: number; fallbacks: number }[];
  incidents: OperationRecord[];
  recent: OperationRecord[];
}

export function sliState(good: number, total: number, target: number): {
  ratio: number | null; budgetRemaining: number | null; state: 'no-data' | 'meeting' | 'breached';
} {
  if (total <= 0) return { ratio: null, budgetRemaining: null, state: 'no-data' };
  const ratio = good / total;
  return { ratio, budgetRemaining: 1 - (total - good) / (total * (1 - target)), state: ratio >= target ? 'meeting' : 'breached' };
}
