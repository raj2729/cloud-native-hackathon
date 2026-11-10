'use client';
import { useActionState } from 'react';
import { updateDayPlan, type PlanningResult } from '@/app/actions';

async function submit(_previous: PlanningResult, form: FormData): Promise<PlanningResult> {
  return updateDayPlan(form);
}
export function PlanningGoalsForm({ eventId, date, notes }: { eventId: string; date: string; notes: string }) {
  const [state, action, pending] = useActionState<PlanningResult, FormData>(submit, {});
  return <details className="card p-5" open={Boolean(notes) || undefined}>
    <summary className="cursor-pointer font-semibold">Add extra information to shape my day</summary>
    <form action={action} className="space-y-3 mt-4" aria-label="Personalise day plan">
      <input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="date" value={date} />
      <label htmlFor="day-goals" className="block text-sm text-muted">What are you working on, and what would make today useful?</label>
      <textarea id="day-goals" name="planningNotes" defaultValue={notes} rows={3} maxLength={2000} className="input" placeholder="I am building a customer-support agent. Prioritise practical tool calling, evaluations and people who have shipped similar systems." />
      <p className="text-xs text-muted">Optional · up to 2,000 characters. Used for your personal schedule, separately from your public profile. Clear the field to return to your profile interests.</p>
      {state.error && <p role="alert" className="text-sm text-warn">{state.error}</p>}
      <div className="flex items-center gap-3 flex-wrap"><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Updating your day…' : 'Update my day'}</button>{pending && <p role="status" className="text-sm text-muted">Choosing sessions and preparing introductions…</p>}</div>
    </form>
  </details>;
}
