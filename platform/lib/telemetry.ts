/**
 * Thin OpenTelemetry helpers. These degrade to plain function calls when no SDK
 * is registered, so nothing here can break a page render if Dash0 is not
 * configured.
 *
 * Attribute values are ids, counts, enums or booleans only — never names,
 * emails, profile text or model prompts.
 */
import {
  metrics,
  trace,
  SpanKind,
  SpanStatusCode,
  type Attributes,
  type Span,
} from '@opentelemetry/api';

const TRACER_NAME = 'converge';

/** Applies attributes to a span, ignoring any error so instrumentation never breaks a caller. */
export function setSpanAttributes(span: Span, attributes: Attributes): void {
  try {
    span.setAttributes(attributes);
  } catch {
    // Ignored.
  }
}

/**
 * Runs `fn` inside a span. The span is passed in so callers can attach results
 * known only at the end (counts, scores, fallbacks). A thrown error marks the
 * span as failed and is rethrown unchanged.
 */
export async function startSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
  kind: SpanKind = SpanKind.INTERNAL,
): Promise<T> {
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(name, { attributes, kind }, async (span) => {
    const started = Date.now();
    try {
      const result = await fn(span);
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

/**
 * Marks the active span as failed without throwing — for actions that return
 * `{ error }` to the form instead of raising.
 */
export function markSpanError(span: Span, message: string): void {
  try {
    span.setStatus({ code: SpanStatusCode.ERROR, message });
  } catch {
    // Ignored.
  }
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

/** Recommendation requests, split by whether the attendee got anything back. */
const recommendRequests = meter.createCounter('app.recommend.requests', {
  description: 'Recommendation requests, by feature and whether the result was empty',
  unit: '{request}',
});

/** Save, unsave and check-in attempts — the platform equivalent of registering. */
const attendanceActions = meter.createCounter('app.attendance.actions', {
  description: 'Attendance actions by kind, outcome and input mode',
  unit: '{action}',
});

/** Profile creations through /onboarding. */
const onboardingCompleted = meter.createCounter('app.onboarding.completed', {
  description: 'Onboarding submissions by outcome',
  unit: '{profile}',
});

/** Events and talks published from /organizer. */
const organizerPublishes = meter.createCounter('app.organizer.publishes', {
  description: 'Organizer publish attempts by kind and outcome',
  unit: '{publish}',
});

/** Claude calls, split by operation and whether the deterministic fallback was used. */
const aiCalls = meter.createCounter('app.ai.calls', {
  description: 'Claude calls by operation and fallback',
  unit: '{call}',
});

/** Claude token usage by operation and direction. */
const aiTokens = meter.createCounter('app.ai.tokens', {
  description: 'Claude tokens by operation and type',
  unit: '{token}',
});

export type InputMode = 'keyboard' | 'pointer' | 'touch' | 'unknown';
export type Outcome = 'ok' | 'error';

function safely(record: () => void): void {
  try {
    record();
  } catch {
    // Metrics must never break a render.
  }
}

export function recordRoomOccupancy(room: string, count: number, eventId: string): void {
  safely(() => roomOccupancy.record(count, { 'app.room': room, 'app.event': eventId }));
}

export function recordRecommendLatency(feature: string, ms: number, hits: number): void {
  safely(() => {
    recommendLatency.record(ms, { 'app.feature': feature });
    searchHits.record(hits, { 'app.feature': feature });
    recommendRequests.add(1, { 'app.feature': feature, 'app.recommend.empty': hits === 0 });
  });
}

export function recordAttendanceAction(
  action: 'save' | 'unsave' | 'check_in',
  result: Outcome,
  inputMode: InputMode,
): void {
  safely(() =>
    attendanceActions.add(1, {
      'app.action': action,
      'app.result': result,
      'app.a11y.input_mode': inputMode,
    }),
  );
}

export function recordOnboarding(result: Outcome, aiEnriched: boolean): void {
  safely(() => onboardingCompleted.add(1, { 'app.result': result, 'app.ai.enriched': aiEnriched }));
}

export function recordOrganizerPublish(kind: 'event' | 'talk', result: Outcome): void {
  safely(() => organizerPublishes.add(1, { 'app.kind': kind, 'app.result': result }));
}

export function recordAiCall(
  operation: string,
  fallback: boolean,
  inputTokens = 0,
  outputTokens = 0,
): void {
  safely(() => {
    aiCalls.add(1, { 'app.ai.operation': operation, 'app.ai.fallback': fallback });
    if (inputTokens > 0) {
      aiTokens.add(inputTokens, { 'app.ai.operation': operation, 'gen_ai.token.type': 'input' });
    }
    if (outputTokens > 0) {
      aiTokens.add(outputTokens, { 'app.ai.operation': operation, 'gen_ai.token.type': 'output' });
    }
  });
}
