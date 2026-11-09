/**
 * Structured logs → Dash0 via the OpenTelemetry logs API.
 *
 * Records are emitted inside whatever span is active, so the SDK stamps them
 * with trace and span ids and Dash0 shows each log line within its trace. With
 * no SDK registered the OTel logger is a no-op and only the console copy is
 * written. Like the rest of the telemetry helpers, nothing here can throw.
 *
 * Attributes must be ids, counts, enums or booleans — never names, emails,
 * profile text or model prompts.
 */
import { logs, SeverityNumber, type Attributes } from '@opentelemetry/api';

const LOGGER_NAME = 'conference-platform';

type Level = 'debug' | 'info' | 'warn' | 'error';

const SEVERITY: Record<Level, SeverityNumber> = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

function emit(level: Level, event: string, attributes: Attributes = {}): void {
  try {
    logs.getLogger(LOGGER_NAME).emit({
      severityNumber: SEVERITY[level],
      severityText: level.toUpperCase(),
      body: event,
      attributes: { 'event.name': event, ...attributes },
    });
  } catch {
    // Telemetry must never break a render.
  }

  if (level !== 'debug') {
    const line = `[${level}] ${event} ${JSON.stringify(attributes)}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }
}

export const log = {
  debug: (event: string, attributes?: Attributes): void => emit('debug', event, attributes),
  info: (event: string, attributes?: Attributes): void => emit('info', event, attributes),
  warn: (event: string, attributes?: Attributes): void => emit('warn', event, attributes),
  error: (event: string, attributes?: Attributes): void => emit('error', event, attributes),
};

/** Error details safe to attach to a log: the class and message, no stack or payload. */
export function errorAttrs(err: unknown): Attributes {
  const e = err instanceof Error ? err : new Error(String(err));
  return { 'error.type': e.name, 'error.message': e.message.slice(0, 300) };
}
