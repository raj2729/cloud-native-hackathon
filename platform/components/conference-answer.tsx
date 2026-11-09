import type { ReactNode } from 'react';
import type { DiscoverySource } from '@/lib/discovery';

export function SessionDetails({ source }: { source: DiscoverySource }) {
  const session = source.session;
  if (!session) return null;
  const format = (iso: string): string => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? 'Time to be confirmed' : new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
    }).format(date);
  };
  return <dl className="mt-3 grid gap-x-5 gap-y-1 text-sm text-muted sm:grid-cols-2">
    <div><dt className="inline font-medium text-foreground">Room: </dt><dd className="inline">{session.rooms?.join(' + ') || 'To be confirmed'}</dd></div>
    <div><dt className="inline font-medium text-foreground">Speaker: </dt><dd className="inline">{session.speaker}</dd></div>
    <div className="sm:col-span-2"><dt className="inline font-medium text-foreground">When: </dt><dd className="inline">{format(session.startsAt)} – {format(session.endsAt)} UTC</dd></div>
    <div><dt className="inline font-medium text-foreground">Track: </dt><dd className="inline">{session.track}</dd></div>
  </dl>;
}

function citedText(text: string): ReactNode {
  return text.split(/(\[S\d+\])/g).map((part, i) => /^\[S\d+\]$/.test(part)
    ? <a key={i} className="text-accent underline" href={`#source-${part.slice(1, -1)}`}>{part}</a> : part);
}

export function ConferenceAnswer({ answer, sources }: { answer: string; sources: DiscoverySource[] }) {
  const sections: { title: string; lines: string[] }[] = [];
  for (const line of answer.split('\n').map((line) => line.trim()).filter(Boolean)) {
    const heading = line.replace(/^[#*\s]+|[*:\s]+$/g, '');
    if (/^(Talks|People)$/i.test(heading)) sections.push({ title: heading, lines: [] });
    else {
      if (!sections.length) sections.push({ title: '', lines: [] });
      sections[sections.length - 1].lines.push(line);
    }
  }
  return <div className="space-y-6">{sections.map((section, i) => <section key={i} className="space-y-3">
    {section.title && <h4 className="text-lg font-semibold text-accent">{section.title}</h4>}
    <ul className="space-y-4">{section.lines.map((line, j) => {
      const citations = new Set([...line.matchAll(/\[(S\d+)\]/g)].map((match) => match[1]));
      const sessions = sources.filter((source) => source.kind === 'talk' && citations.has(source.citation));
      return <li key={j} className="rounded-xl bg-surface-2 p-4">
        <p className="leading-relaxed">{citedText(line.replace(/^(?:[-*•]|\d+\.)\s+/, ''))}</p>
        {sessions.map((source) => <SessionDetails key={source.citation} source={source} />)}
      </li>;
    })}</ul>
  </section>)}</div>;
}
