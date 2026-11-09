import './env';
/**
 * Puts live traffic on the conference floor so the dashboard actually moves.
 * Without this, /live renders correct-but-static numbers and reads as fake.
 *
 * Every tick, a few crowd attendees check into whichever talk is running now,
 * weighted towards talks that match their interests. One talk is given a
 * deliberate surge so the trending list has a visible leader.
 *
 *   npx tsx scripts/simulate.ts            # run until interrupted
 *   npx tsx scripts/simulate.ts --once     # single burst, then exit
 */
import { es, hitsToDocs, INDEX } from '../lib/es';
import type { Talk, User } from '../lib/types';

const ONCE = process.argv.includes('--once');
const TICK_MS = 3_000;
const CHECKINS_PER_TICK = 4;

async function liveTalks(): Promise<Talk[]> {
  const now = new Date().toISOString();
  const res = await es.search<Omit<Talk, 'id'>>({
    index: INDEX.talks,
    size: 20,
    query: {
      bool: {
        filter: [{ range: { startsAt: { lte: now } } }, { range: { endsAt: { gt: now } } }],
      },
    },
  });
  return hitsToDocs(res.hits.hits);
}

/** Upcoming talks are a reasonable fallback so the simulator is never idle. */
async function upcomingTalks(): Promise<Talk[]> {
  const res = await es.search<Omit<Talk, 'id'>>({
    index: INDEX.talks,
    size: 12,
    sort: [{ startsAt: 'asc' }],
    query: { range: { endsAt: { gt: new Date().toISOString() } } },
  });
  return hitsToDocs(res.hits.hits);
}

async function crowd(): Promise<User[]> {
  const res = await es.search<Omit<User, 'id'>>({
    index: INDEX.users,
    size: 200,
    query: { prefix: { 'name.keyword': '' } },
  });
  return hitsToDocs(res.hits.hits).filter((u) => u.id.startsWith('crowd-'));
}

function pickWeighted(talks: Talk[], user: User): Talk {
  const scored = talks.map((talk) => ({
    talk,
    weight: 1 + talk.tags.filter((t) => user.interests.includes(t as never)).length * 3,
  }));
  const total = scored.reduce((sum, s) => sum + s.weight, 0);
  let roll = Math.random() * total;
  for (const entry of scored) {
    roll -= entry.weight;
    if (roll <= 0) return entry.talk;
  }
  return talks[0];
}

async function tick(talks: Talk[], users: User[], surgeTalk: Talk | null): Promise<number> {
  const operations: object[] = [];
  const at = new Date().toISOString();

  for (let i = 0; i < CHECKINS_PER_TICK; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    if (!user) continue;
    // One in three check-ins goes to the surge talk, which is what gives the
    // trending list a clear mover during a demo.
    const talk = surgeTalk && Math.random() < 0.34 ? surgeTalk : pickWeighted(talks, user);
    operations.push(
      { index: { _index: INDEX.attendance, _id: `${user.id}:${talk.id}:checked_in` } },
      {
        userId: user.id,
        talkId: talk.id,
        eventId: talk.eventId,
        room: talk.rooms[0],
        state: 'checked_in',
        at,
      },
    );
  }

  if (operations.length === 0) return 0;
  await es.bulk({ operations, refresh: true });
  return operations.length / 2;
}

async function main(): Promise<void> {
  await es.cluster.health({ wait_for_status: 'yellow', timeout: '30s' });

  const users = await crowd();
  if (users.length === 0) {
    console.error('No crowd attendees found. Run `npm run es:seed` first.');
    process.exit(1);
  }

  let talks = await liveTalks();
  let usingUpcoming = false;
  if (talks.length === 0) {
    talks = await upcomingTalks();
    usingUpcoming = true;
  }
  if (talks.length === 0) {
    console.error('No talks found. Run `npm run es:seed` first.');
    process.exit(1);
  }

  const surgeTalk = talks[0] ?? null;
  console.log(
    `Simulating ${CHECKINS_PER_TICK} check-ins every ${TICK_MS / 1000}s across ` +
      `${talks.length} ${usingUpcoming ? 'upcoming' : 'live'} talks, ${users.length} attendees.`,
  );
  if (surgeTalk) console.log(`Surging: "${surgeTalk.title}"`);
  console.log('Open http://localhost:3000/live — Ctrl-C to stop.\n');

  let total = 0;
  const run = async () => {
    try {
      // Re-read the live set periodically so the simulator follows the schedule.
      if (total % 40 === 0) {
        const fresh = await liveTalks();
        if (fresh.length > 0) talks = fresh;
      }
      const n = await tick(talks, users, surgeTalk);
      total += n;
      process.stdout.write(`\r  ${total} check-ins written`);
    } catch (err) {
      console.error('\ntick failed:', (err as Error).message);
    }
  };

  await run();
  if (ONCE) {
    console.log('\nDone.');
    return;
  }

  const interval = setInterval(run, TICK_MS);
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('\nStopped.');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Simulator failed:', err?.meta?.body?.error ?? err);
  process.exit(1);
});
