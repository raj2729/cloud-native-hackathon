/**
 * The match percentage, drawn as a ring. Deliberately prominent: watching these
 * numbers reshuffle when you switch personas is the clearest demonstration that
 * the ranking is real.
 */
export function MatchScore({ score, size = 44 }: { score: number; size?: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const stroke = 3.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  const colour =
    clamped >= 70 ? 'var(--accent)' : clamped >= 40 ? 'var(--warn)' : 'var(--muted-dim)';

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      title={`${clamped}% match to your interests`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 400ms ease' }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-semibold tabular-nums"
        style={{ fontSize: size * 0.28, color: colour }}
      >
        {clamped}
      </span>
    </div>
  );
}
