/**
 * Deterministic initials avatar. No network images, so nothing in the demo
 * depends on an external host being reachable.
 */
const PALETTE = [
  ['#1e3a5f', '#8fbcff'],
  ['#3f2a4d', '#d8a7ff'],
  ['#14433a', '#6ee7b7'],
  ['#4a3418', '#fbbf24'],
  ['#4a1f2b', '#fda4af'],
  ['#1f3d4a', '#7dd3fc'],
  ['#2f3a1c', '#bef264'],
  ['#3a2518', '#fdba74'],
];

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 100000;
  return h;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => !/^(dr|mr|ms|mrs)\.?$/i.test(p));
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  seed,
  name,
  size = 36,
}: {
  seed: string;
  name: string;
  size?: number;
}) {
  const [bg, fg] = PALETTE[hash(seed || name) % PALETTE.length];
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center rounded-full shrink-0 font-semibold select-none"
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        fontSize: Math.round(size * 0.38),
        border: `1px solid ${fg}33`,
      }}
    >
      {initials(name)}
    </span>
  );
}
