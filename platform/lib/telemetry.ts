/**
 * Thin OpenTelemetry helpers. These degrade to plain function calls when no SDK
 * is registered, so nothing here can break a page render if Dash0 is not
 * configured.
 */
import { metrics, trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';

const TRACER_NAME = 'conference-platform';

export async function startSpan<T>(
  name: string,
  attributes: Attributes,
  fn: () => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    const started = Date.now();
    try {
      const result = await fn();
      span.setAttribute('app.duration_ms', Date.now() - started);
      if (Array.isArray(result)) span.setAttribute('app.result_count', result.length);
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

const meter = metrics.getMeter(TRACER_NAME);

/** Check-ins observed per room, recorded whenever the live dashboard renders. */
const roomOccupancy = meter.createGauge('app.room.occupancy', {
  description: 'People checked into a room in the last 25 minutes',
  unit: '{person}',
});

/** How long a recommendation query took, end to end. */
const recommendLatency = meter.createHistogram('app.recommend.latency', {
  description: 'Recommendation query duration',
  unit: 'ms',
});

/** Hits returned by a hybrid retrieval query. */
const searchHits = meter.createHistogram('app.search.hits', {
  description: 'Documents returned by a retrieval query',
  unit: '{document}',
});

export function recordRoomOccupancy(room: string, count: number, eventId: string): void {
  try {
    roomOccupancy.record(count, { 'app.room': room, 'app.event': eventId });
  } catch {
    // Metrics must never break a render.
  }
}

export function recordRecommendLatency(feature: string, ms: number, hits: number): void {
  try {
    recommendLatency.record(ms, { 'app.feature': feature });
    searchHits.record(hits, { 'app.feature': feature });
  } catch {
    // Ignored.
  }
}
