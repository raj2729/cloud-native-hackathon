import { randomUUID } from 'node:crypto';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { persistOperation } from './search';
import { recordOperationMetrics } from './telemetry';
import type { Operation, OperationOutcome } from './observability';
import { appVersion } from './version';

export async function observeOperation<T>(
  operation: Operation, requestId: string, fn: () => Promise<T>,
  describe: (result: T) => { outcome: OperationOutcome; provider?: string } = () => ({ outcome: 'ok' }),
): Promise<T> {
  return trace.getTracer('converge').startActiveSpan(`conference.${operation}`, async (span) => {
    const started = performance.now();
    let outcome: OperationOutcome = 'error';
    let provider = 'none';
    try {
      const result = await fn();
      ({ outcome, provider = 'none' } = describe(result));
      if (outcome !== 'ok') span.setStatus({ code: SpanStatusCode.ERROR, message: outcome === 'fallback' ? 'Generation returned source excerpts' : 'Operation failed' });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Conference operation failed' });
      throw error;
    } finally {
      const durationMs = Math.round(performance.now() - started);
      span.setAttributes({ 'app.operation': operation, 'app.outcome': outcome, 'app.provider': provider, 'app.request_id': requestId });
      recordOperationMetrics(operation, outcome, durationMs, provider);
      const traceId = span.spanContext().traceId;
      span.end();
      // Bounded best-effort storage; no question, resume, token or error body is persisted.
      await persistOperation({ id: randomUUID(), at: new Date().toISOString(), operation, outcome, durationMs, provider, requestId,
        traceId: /^0+$/.test(traceId) ? undefined : traceId, serviceVersion: appVersion() });
    }
  });
}
