import { createHash } from 'node:crypto';
import type { Event, PersonalDayPlan } from './types';

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function timestamp(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

// Fold by UTF-8 octets without breaking a Unicode character.
function fold(line: string): string {
  let result = '';
  let width = 0;
  for (const character of line) {
    const size = Buffer.byteLength(character);
    if (width + size > 75) { result += '\r\n '; width = 1; }
    result += character;
    width += size;
  }
  return result;
}

export function dayPlanCalendar(plan: PersonalDayPlan, event: Event, ownerId: string, now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Converge//Personal day plan//EN', 'CALSCALE:GREGORIAN'];
  for (const session of plan.sessions) {
    const talk = session.talk;
    const uid = createHash('sha256').update(JSON.stringify([ownerId, event.id, talk.id])).digest('hex');
    const description = [
      `${talk.speaker.name} · ${talk.speaker.company}`,
      `Why this fits you: ${session.whyAttend}`,
      `What you will learn: ${session.learningOutcome}`,
      ...(session.people.length ? [`People to meet: ${session.people.map((person) => person.name).join(', ')}`] : []),
    ].join('\n\n');
    lines.push('BEGIN:VEVENT', `UID:${uid}@converge`, `DTSTAMP:${timestamp(now.toISOString())}`,
      `DTSTART:${timestamp(talk.startsAt)}`, `DTEND:${timestamp(talk.endsAt)}`,
      `SUMMARY:${escapeText(talk.title)}`, `LOCATION:${escapeText([...talk.rooms, event.venue].filter(Boolean).join(' · '))}`,
      `DESCRIPTION:${escapeText(description)}`, 'CLASS:PRIVATE', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
