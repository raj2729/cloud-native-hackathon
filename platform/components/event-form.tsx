'use client';

import { useActionState } from 'react';
import { createEvent } from '@/app/actions';

type State = { error?: string; done?: boolean };

async function submit(_prev: State, formData: FormData): Promise<State> {
  const result = await createEvent(formData);
  return result.error ? { error: result.error } : { done: true };
}

/** Default the date pickers to today so the form is one click from valid. */
function todayAt(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventForm() {
  const [state, action, pending] = useActionState<State, FormData>(submit, {});

  return (
    <form action={action} className="mt-4 space-y-4">
      <div>
        <label className="label" htmlFor="ev-name">
          Name
        </label>
        <input id="ev-name" name="name" className="input" placeholder="DevConf 2026" required />
      </div>

      <div>
        <label className="label" htmlFor="ev-venue">
          Venue
        </label>
        <input
          id="ev-venue"
          name="venue"
          className="input"
          placeholder="Metropolitan Conference Centre, Hall A"
        />
      </div>

      <div>
        <label className="label" htmlFor="ev-desc">
          Description
        </label>
        <textarea id="ev-desc" name="description" rows={2} className="input font-sans" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="ev-start">
            Starts
          </label>
          <input
            id="ev-start"
            name="startsAt"
            type="datetime-local"
            className="input"
            defaultValue={todayAt(9)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="ev-end">
            Ends
          </label>
          <input
            id="ev-end"
            name="endsAt"
            type="datetime-local"
            className="input"
            defaultValue={todayAt(18)}
            required
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="ev-rooms">
          Rooms — one per line
        </label>
        <textarea
          id="ev-rooms"
          name="rooms"
          rows={4}
          className="input font-mono text-xs"
          placeholder={'R101:Main Hall:400\nR202:Platform Track:180\nR310:Security Track:120'}
          required
        />
        <p className="text-[11px] text-muted-dim mt-1.5">
          Format <code className="font-mono">ID:Name:Capacity</code>. Capacity drives the live
          occupancy bars.
        </p>
      </div>

      {state.error && <p className="text-sm text-hot">{state.error}</p>}
      {state.done && <p className="text-sm text-good">Conference published.</p>}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? 'Publishing…' : 'Publish conference'}
      </button>
    </form>
  );
}
