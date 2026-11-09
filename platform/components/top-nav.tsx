import Link from 'next/link';
import { getCurrentUser } from '@/lib/session';
import { Avatar } from './avatar';

const LINKS = [
  { href: '/agenda', label: 'Agenda' },
  { href: '/people', label: 'People' },
  { href: '/live', label: 'Live' },
  { href: '/organizer', label: 'Organizer' },
];

export async function TopNav() {
  const user = await getCurrentUser();

  return (
    <header className="relative z-20 border-b border-line">
      <nav className="w-full max-w-6xl mx-auto px-5 h-14 flex items-center gap-6">
        <Link href="/" className="font-semibold tracking-tight shrink-0">
          Confluence
        </Link>

        <div className="flex items-center gap-1 text-sm text-muted overflow-x-auto">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-2.5 py-1.5 rounded-lg hover:text-foreground hover:bg-surface-2 transition-colors whitespace-nowrap"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto shrink-0">
          {user ? (
            <Link
              href="/"
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border border-line hover:border-line-strong transition-colors"
              title="Switch who you are browsing as"
            >
              <Avatar seed={user.avatarSeed} name={user.name} size={26} />
              <span className="text-xs text-muted hidden sm:inline">
                {user.name.split(' ')[0]}
              </span>
            </Link>
          ) : (
            <Link href="/" className="btn !py-1.5 !px-3 text-xs">
              Choose a profile
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
