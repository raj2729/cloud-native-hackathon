/**
 * How the current visitor is navigating — keyboard, pointer or touch — as set by
 * `components/dash0-rum.tsx` in the `a11y_input` cookie. It describes the
 * session's interaction style, not the person, and has four values, so it is
 * safe as a metric attribute. It powers the keyboard-fairness SLO: keyboard
 * users must succeed as often as everyone else.
 */
import { cookies } from 'next/headers';
import type { InputMode } from './telemetry';

export const INPUT_MODE_COOKIE = 'a11y_input';

const MODES: ReadonlySet<string> = new Set(['keyboard', 'pointer', 'touch']);

export async function getInputMode(): Promise<InputMode> {
  try {
    const value = (await cookies()).get(INPUT_MODE_COOKIE)?.value;
    return value && MODES.has(value) ? (value as InputMode) : 'unknown';
  } catch {
    return 'unknown';
  }
}
