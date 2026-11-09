import Link from 'next/link';

/**
 * The four problems the platform exists to solve, each pointing at the surface
 * that solves it. This is the product thesis made navigable: a judge or a new
 * attendee can read the problem and click straight into the answer.
 */
const PROBLEMS = [
  {
    n: '01',
    who: 'Attendee',
    problem: 'You don’t know which talks are relevant to you.',
    answer: 'Your agenda, ranked',
    detail:
      'Every talk scored against your five interests and the text of your own profile, with the matched interests shown so you can see why.',
    href: '/agenda',
    cta: 'Open my agenda',
  },
  {
    n: '02',
    who: 'Attendee',
    problem: 'You don’t know which other people you should meet.',
    answer: 'People worth meeting',
    detail:
      'Attendees ranked by shared interests, profile similarity and the sessions you have both saved — with a one-line reason and a LinkedIn link.',
    href: '/people',
    cta: 'See my matches',
  },
  {
    n: '03',
    who: 'Attendee',
    problem: 'You don’t know what people with similar interests are attending.',
    answer: 'Peer signal',
    detail:
      'What the twenty attendees closest to your profile are actually going to, minus everything you have already saved.',
    href: '/agenda',
    cta: 'See peer picks',
  },
  {
    n: '04',
    who: 'Organizer',
    problem: 'You don’t know what’s attracting attention until the event is over.',
    answer: 'The live floor',
    detail:
      'Room occupancy and trending talks ranked by velocity, updating every few seconds — so you can move a room while the conference is still running.',
    href: '/live',
    cta: 'Open live view',
  },
];

export function ProblemGrid() {
  return (
    <section className="mt-20">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-dim">
        Four problems, four answers
      </h2>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {PROBLEMS.map((item) => (
          <article key={item.n} className="card card-hover p-5 flex flex-col">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs text-muted-dim tabular-nums">{item.n}</span>
              <span className="pill !text-[10px]">{item.who}</span>
            </div>

            <p className="mt-3 text-[0.95rem] leading-snug text-muted">
              &ldquo;{item.problem}&rdquo;
            </p>

            <h3 className="mt-4 font-medium text-accent">{item.answer}</h3>
            <p className="mt-1.5 text-sm text-muted leading-relaxed flex-1">{item.detail}</p>

            <Link
              href={item.href}
              className="text-xs text-accent hover:underline mt-4 self-start"
            >
              {item.cta} →
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
