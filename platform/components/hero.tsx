import Link from 'next/link';

const CAPABILITIES = ['AI recommendations', 'Smart networking', 'Live analytics'];

/**
 * Converging lines, drawn rather than imported: five scattered paths resolving
 * into one point. It is the product thesis as a picture — many attendees, many
 * talks, one relevant intersection each.
 */
function ConvergeMark() {
  return (
    <svg
      viewBox="0 0 220 120"
      className="w-full h-full"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="converge-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
          <stop offset="55%" stopColor="var(--accent)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.95" />
        </linearGradient>
      </defs>

      {[8, 34, 60, 86, 112].map((y, i) => (
        <path
          key={y}
          d={`M0 ${y} C 90 ${y}, 120 ${60}, 206 60`}
          fill="none"
          stroke="url(#converge-fade)"
          strokeWidth={i === 2 ? 1.6 : 1}
          strokeLinecap="round"
        />
      ))}

      <circle cx="207" cy="60" r="3.5" fill="var(--accent)" />
      <circle cx="207" cy="60" r="8" fill="var(--accent)" fillOpacity="0.18" />
    </svg>
  );
}

export function Hero() {
  return (
    <section className="pt-14">
      <div className="grid lg:grid-cols-[1fr_240px] gap-10 items-center">
        <div>
          <h1 className="text-[2.6rem] leading-[1.08] font-semibold tracking-tight">
            Converge
          </h1>
          <p className="mt-3 text-xl text-muted">
            Your conference. Your interests. Your people.
          </p>

          <p className="mt-5 max-w-2xl leading-relaxed text-foreground/90">
            An AI-powered conference companion that connects people to the right talks, the
            right attendees, and the right opportunities — in real time.
          </p>

          <div className="flex flex-wrap gap-1.5 mt-5">
            {CAPABILITIES.map((capability) => (
              <span key={capability} className="pill pill-match">
                {capability}
              </span>
            ))}
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/discover" className="btn btn-primary">
              Search or ask the conference
            </Link>
            <Link href="/onboarding" className="btn btn-primary">
              Create your profile
            </Link>
            <Link href="/live" className="btn">
              See the live floor
            </Link>
          </div>
        </div>

        <div className="hidden lg:block h-28 opacity-90">
          <ConvergeMark />
        </div>
      </div>

      <blockquote className="mt-14 border-l-2 border-accent-dim pl-5 max-w-3xl">
        <p className="text-lg leading-relaxed">
          Instead of making attendees search for interesting things at a conference,{' '}
          <span className="text-accent">make the conference discover what is interesting to
          each attendee.</span>
        </p>
      </blockquote>
    </section>
  );
}
