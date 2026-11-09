import { listEvents, listTalks } from '@/lib/search';
import { SetupNotice } from '@/components/setup-notice';
import { EventForm } from '@/components/event-form';
import { TalkForm } from '@/components/talk-form';
import { deleteTalk } from '@/app/actions';
import { label } from '@/lib/taxonomy';

export const dynamic = 'force-dynamic';

export default async function OrganizerPage() {
  let events;
  try {
    events = await listEvents();
  } catch (err) {
    return <SetupNotice message={(err as Error).message} />;
  }

  const talks = events.length > 0 ? await listTalks(events[0].id) : [];

  return (
    <div className="pt-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Organizer</h1>
        <p className="text-sm text-muted mt-1.5 max-w-2xl">
          Publish a conference, then add talks to it. A new talk is tagged by Claude the moment
          you save it, so it is immediately matchable against every attendee&apos;s interests —
          no manual tagging step.
        </p>
      </header>

      <div className="mt-8 grid lg:grid-cols-2 gap-8 items-start">
        <section className="card p-5">
          <h2 className="font-medium">Publish a conference</h2>
          <EventForm />
        </section>

        <section className="card p-5">
          <h2 className="font-medium">Add a talk</h2>
          {events.length === 0 ? (
            <p className="text-sm text-muted mt-3">Publish a conference first.</p>
          ) : (
            <TalkForm
              events={events.map((e) => ({
                id: e.id,
                name: e.name,
                rooms: e.rooms.map((r) => r.id),
              }))}
            />
          )}
        </section>
      </div>

      {events.length > 0 && (
        <section className="mt-12">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-dim">
            {events[0].name} — {talks.length} talks
          </h2>
          <div className="mt-4 space-y-2">
            {talks.map((talk) => (
              <div key={talk.id} className="card p-3.5 flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{talk.title}</p>
                  <p className="text-xs text-muted-dim mt-0.5 font-mono">
                    {new Date(talk.startsAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    · {talk.rooms.join(' + ')} · {talk.speaker.name}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {talk.tags.map((tag) => (
                      <span key={tag} className="pill !text-[10px]">
                        {label(tag)}
                      </span>
                    ))}
                  </div>
                </div>
                <form action={deleteTalk} className="shrink-0">
                  <input type="hidden" name="talkId" value={talk.id} />
                  <button type="submit" className="btn !py-1 !px-2.5 text-xs">
                    Delete
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
