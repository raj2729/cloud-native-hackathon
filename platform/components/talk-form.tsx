'use client';

import { useActionState } from 'react';
import { createTalk } from '@/app/actions';
import { label } from '@/lib/taxonomy';

type State = { error?: string; tags?: string[] };

async function submit(_prev: State, formData: FormData): Promise<State> {
  return createTalk(formData);
}

function inAnHour(offsetMinutes: number): string {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TalkForm({
  events,
}: {
  events: { id: string; name: string; rooms: string[] }[];
}) {
  const [state, action, pending] = useActionState<State, FormData>(submit, {});

  return (
    <form action={action} className="mt-4 space-y-4">
      <div>
        <label className="label" htmlFor="tk-event">
          Conference
        </label>
        <select id="tk-event" name="eventId" className="input" required>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="tk-title">
          Topic / title
        </label>
        <input
          id="tk-title"
          name="title"
          className="input"
          placeholder="Hybrid Retrieval in Production"
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="tk-abstract">
          Description
        </label>
        <textarea
          id="tk-abstract"
          name="abstract"
          rows={4}
          className="input font-sans"
          placeholder="What will an attendee learn? This text is what Claude tags and what semantic search matches against, so specifics beat marketing."
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="tk-rooms">
            Room numbers
          </label>
          <input
            id="tk-rooms"
            name="rooms"
            className="input font-mono text-xs"
            placeholder={events[0]?.rooms.slice(0, 2).join(', ') || 'R101, R202'}
            defaultValue={events[0]?.rooms[0] ?? ''}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="tk-track">
            Track
          </label>
          <input id="tk-track" name="track" className="input" placeholder="AI & Retrieval" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="tk-start">
            Starts
          </label>
          <input
            id="tk-start"
            name="startsAt"
            type="datetime-local"
            className="input"
            defaultValue={inAnHour(10)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="tk-end">
            Ends
          </label>
          <input
            id="tk-end"
            name="endsAt"
            type="datetime-local"
            className="input"
            defaultValue={inAnHour(50)}
            required
          />
        </div>
      </div>

      <fieldset className="space-y-3 pt-2 border-t border-line">
        <legend className="label !mb-0 pt-3">Speaker</legend>
        <div className="grid grid-cols-2 gap-3">
          <input name="speakerName" className="input" placeholder="Ada Okonkwo" required />
          <input name="speakerTitle" className="input" placeholder="Principal Engineer" />
        </div>
        <input name="speakerCompany" className="input" placeholder="Northwind Labs" />
        <textarea
          name="speakerBio"
          rows={3}
          className="input font-sans"
          placeholder="Short bio shown on the talk page."
        />
        <div className="grid grid-cols-2 gap-3">
          <input name="speakerLinkedin" className="input" placeholder="LinkedIn URL" />
          <input name="speakerGithub" className="input" placeholder="GitHub URL" />
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="tk-tags">
          Tags — leave empty to let Claude choose
        </label>
        <input
          id="tk-tags"
          name="tags"
          className="input font-mono text-xs"
          placeholder="vector-search, rag"
        />
      </div>

      {state.error && <p className="text-sm text-hot">{state.error}</p>}
      {state.tags && state.tags.length > 0 && (
        <div className="card p-3 bg-good/5 border-good/30">
          <p className="text-xs text-good font-medium">Talk added and tagged</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {state.tags.map((tag) => (
              <span key={tag} className="pill pill-match !text-[10px]">
                {label(tag)}
              </span>
            ))}
          </div>
        </div>
      )}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? 'Tagging with Claude…' : 'Add talk'}
      </button>
    </form>
  );
}
