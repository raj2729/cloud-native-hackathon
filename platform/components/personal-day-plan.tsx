import Link from 'next/link';
import { Avatar } from './avatar';
import { PlanningGoalsForm } from './planning-goals-form';
import { saveTalk, unsaveTalk } from '@/app/actions';
import { label } from '@/lib/taxonomy';
import type { Event, PersonalDayPlan } from '@/lib/types';

function time(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(iso));
}
export function PersonalDayPlanView({ plan, event, dates, now }: { plan: PersonalDayPlan; event: Event; dates: string[]; now: number }) {
  const people = new Set(plan.sessions.flatMap((session) => session.people.map((person) => person.id)));
  const minutes = plan.sessions.reduce((sum, session) => sum + (Date.parse(session.talk.endsAt) - Date.parse(session.talk.startsAt)) / 60000, 0);
  return <div className="mt-6 space-y-7">
    <div className="flex items-center justify-between gap-3 flex-wrap"><p className="text-sm text-muted">Your personalised conference calendar</p><a className="btn" href={`/api/calendar?event=${encodeURIComponent(event.id)}&date=${plan.date}`}>Export calendar (.ics)</a></div>
    <PlanningGoalsForm key={`${event.id}:${plan.date}:${plan.notes}`} eventId={event.id} date={plan.date} notes={plan.notes} />
    <form className="flex items-end flex-wrap gap-3" aria-label="Choose schedule day">
      <input type="hidden" name="view" value="plan" /><input type="hidden" name="event" value={event.id} />
      <label className="text-sm" htmlFor="plan-date">Conference day<select id="plan-date" name="date" className="input mt-2" defaultValue={plan.date}>{(dates.length ? dates : [plan.date]).map((date) => <option value={date} key={date}>{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}</option>)}</select></label>
      <button className="btn">Show day</button><p className="text-xs text-muted pb-2">All session times are shown in UTC.</p>
    </form>
    <section className="card p-6 space-y-4 border-accent-dim" aria-labelledby="day-summary">
      <div className="flex justify-between gap-3 flex-wrap"><h2 id="day-summary" className="text-xl font-semibold">Your day at a glance</h2><span className="pill">{plan.narrativeSource === 'openai' ? 'Personalised with AI' : 'Based on your profile'}</span></div>
      <p className="leading-relaxed text-foreground/90">{plan.summary}</p>
      <div className="flex flex-wrap gap-2"><span className="pill pill-match">{plan.sessions.length} talks</span><span className="pill">{Math.round(minutes)} min of learning</span><span className="pill">{people.size} people worth meeting</span></div>
      {!!plan.learningGoals.length && <div><h3 className="font-medium mb-2">What you will explore</h3><ul className="list-disc pl-5 space-y-2 text-sm text-muted">{plan.learningGoals.map((goal, index) => <li key={index}>{goal}</li>)}</ul></div>}
      {plan.needsRefresh && <p className="text-xs text-muted">Use “Update my day” above to tailor the summary and introductions to your latest goals.</p>}
    </section>
    {!!plan.conflictingSaved.length && <aside className="card p-4 text-sm" aria-label="Saved talk conflicts"><h2 className="font-medium text-warn">Some saved talks overlap</h2><p className="text-muted mt-2">Your plan prioritises saved sessions and chooses a route without overlapping talks. These saved alternatives could not fit:</p><ul className="mt-2 list-disc pl-5 space-y-1">{plan.conflictingSaved.map((talk) => <li key={talk.id}><Link className="text-accent underline" href={`/talks/${talk.id}`}>{talk.title}</Link></li>)}</ul></aside>}
    <section aria-labelledby="your-schedule" className="space-y-5">
      <div><h2 id="your-schedule" className="text-xl font-semibold">Your suggested schedule</h2><p className="text-sm text-muted mt-2">Select a talk to expand your learning summary and people to meet. All times are UTC.</p></div>
      {!plan.sessions.length && <p className="card p-5 text-muted">There are no talks scheduled on this day. Choose another conference or day.</p>}
      <ol className="space-y-3 border-l-2 border-line pl-3 sm:pl-6">{plan.sessions.map((session, index) => {
        const talk = session.talk;
        const status = Date.parse(talk.endsAt) <= now ? 'Finished' : Date.parse(talk.startsAt) <= now ? 'Happening now' : 'Upcoming';
        const previous = plan.sessions[index - 1]?.talk;
        const gap = previous ? Math.round((Date.parse(talk.startsAt) - Date.parse(previous.endsAt)) / 60000) : 0;
        return <li key={talk.id}>
          {gap > 0 && <p className="text-xs text-muted mb-3 pl-4">{gap} min between sessions · a chance to take a break or continue a conversation</p>}
          <details className="card group overflow-hidden">
            <summary className="cursor-pointer p-4 sm:p-5 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2">
              <span className="inline-flex flex-col gap-2 w-[calc(100%-1.5rem)] align-top">
                <span className="flex flex-wrap gap-2 items-center text-xs text-muted"><span className="font-mono text-accent"><time dateTime={talk.startsAt}>{time(talk.startsAt)}</time>–<time dateTime={talk.endsAt}>{time(talk.endsAt)}</time></span><span className="pill">{talk.rooms.join(' + ')}</span><span>{status}</span>{session.saved && <span className="pill pill-match">Saved</span>}</span>
                <span className="font-semibold text-base sm:text-lg">{talk.title}</span>
                <span className="text-sm text-muted">{talk.speaker.name} · {talk.track}</span>
                <span className="text-xs text-muted">{session.people.length} people to meet · <span className="group-open:hidden">Expand details</span><span className="hidden group-open:inline">Collapse details</span></span>
              </span>
            </summary>
            <article className="p-4 sm:p-6 border-t border-line" aria-labelledby={`plan-talk-${talk.id}`}>

            <div className="flex items-start gap-4 justify-between flex-wrap">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-xs text-muted"><span className="font-mono text-accent"><time dateTime={talk.startsAt}>{time(talk.startsAt)}</time>–<time dateTime={talk.endsAt}>{time(talk.endsAt)}</time></span><span className="pill">{talk.rooms.join(' + ')}</span><span>{status}</span></div>
                <h3 id={`plan-talk-${talk.id}`} className="font-semibold text-lg mt-3"><Link className="hover:underline" href={`/talks/${talk.id}`}>{talk.title}</Link></h3>
                <p className="text-sm text-muted mt-2">{talk.speaker.name} · {talk.speaker.company} · {talk.track}</p>
              </div>
              <form action={session.saved ? unsaveTalk : saveTalk}><input name="talkId" type="hidden" value={talk.id} /><button className="btn" aria-label={`${session.saved ? 'Unsave' : 'Save'} ${talk.title}`}>{session.saved ? 'Saved · remove' : 'Save talk'}</button></form>
            </div>
            <div className="grid md:grid-cols-2 gap-5 mt-5">
              <div><h4 className="text-sm font-semibold text-accent">Why this fits you</h4><p className="text-sm leading-relaxed text-muted mt-2">{session.whyAttend}</p><div className="flex gap-1 flex-wrap mt-3">{[...new Set([...session.goalTopics, ...session.matchedTopics])].map((topic) => <span className="pill pill-match" key={topic}>{label(topic)}</span>)}</div></div>
              <div><h4 className="text-sm font-semibold text-accent">What you will learn</h4><p className="text-sm leading-relaxed text-muted mt-2">{session.learningOutcome}</p></div>
            </div>
            <div className="mt-6 border-t border-line pt-5"><h4 className="font-semibold text-sm">People to meet at this talk</h4>
              {!session.people.length ? <p className="text-sm text-muted mt-2">No opted-in attendees with shared professional topics have saved or checked into this session yet.</p> : <ul className="grid lg:grid-cols-3 gap-3 mt-3">{session.people.map((person) => <li key={person.id} className="rounded-xl bg-surface-2 p-4 space-y-3">
                <div className="flex items-start gap-3"><Avatar seed={person.avatarSeed} name={person.name} size={34} /><div><p className="font-medium text-sm">{person.name}</p><p className="text-xs text-muted mt-1">{person.headline}</p></div></div>
                <span className="pill">{person.attendance === 'checked_in' ? 'Checked in to this session' : 'Saved this session'}</span>
                <p className="text-sm text-muted leading-relaxed">{person.whyMeet}</p>
                <div className="flex flex-wrap gap-1">{person.sharedTopics.slice(0, 3).map((topic) => <span key={topic} className="pill pill-match">{label(topic)}</span>)}</div>
                <p className="text-xs leading-relaxed"><span className="font-semibold text-accent">Start with: </span>{person.conversationStarter}</p>
              </li>)}</ul>}
            </div>
          </article></details>
        </li>;
      })}</ol>
    </section>
  </div>;
}
