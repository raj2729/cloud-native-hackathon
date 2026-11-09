'use client';

import { useActionState, useState } from 'react';
import { createProfile, type OnboardingResult } from '@/app/actions';
import { TAXONOMY_GROUPS, label } from '@/lib/taxonomy';

const REQUIRED_INTERESTS = 5;

async function submit(_prev: OnboardingResult, formData: FormData): Promise<OnboardingResult> {
  return createProfile(formData);
}

export function OnboardingForm({ events }: { events: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<OnboardingResult, FormData>(submit, {});
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(interest: string) {
    setSelected((current) =>
      current.includes(interest)
        ? current.filter((i) => i !== interest)
        : current.length >= REQUIRED_INTERESTS
          ? current
          : [...current, interest],
    );
  }

  const remaining = REQUIRED_INTERESTS - selected.length;

  return (
    <form action={action} className="mt-8 space-y-8">
      <div>
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input id="name" name="name" className="input" placeholder="Jordan Ellis" required />
      </div>

      <fieldset>
        <div className="flex items-baseline justify-between">
          <legend className="label !mb-0">Pick exactly 5 interests</legend>
          <span
            className={`text-xs tabular-nums ${
              remaining === 0 ? 'text-good' : 'text-muted-dim'
            }`}
          >
            {remaining === 0 ? 'all 5 chosen' : `${remaining} to go`}
          </span>
        </div>

        {selected.map((interest) => (
          <input key={interest} type="hidden" name="interests" value={interest} />
        ))}

        <div className="mt-4 space-y-5">
          {TAXONOMY_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-[11px] uppercase tracking-wider text-muted-dim mb-2">
                {group.title}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {group.interests.map((interest) => {
                  const isOn = selected.includes(interest);
                  const isFull = selected.length >= REQUIRED_INTERESTS && !isOn;
                  return (
                    <button
                      key={interest}
                      type="button"
                      onClick={() => toggle(interest)}
                      disabled={isFull}
                      className={`pill !text-xs !px-2.5 !py-1 transition-colors ${
                        isOn ? 'pill-match' : ''
                      } ${isFull ? 'opacity-35' : 'hover:border-line-strong cursor-pointer'}`}
                    >
                      {label(interest)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="label !mb-0">
          Your work — any one of these is enough, all three works better
        </legend>

        <div>
          <label className="label !text-[10px] !normal-case" htmlFor="linkedin">
            LinkedIn URL
          </label>
          <input
            id="linkedin"
            name="linkedin"
            className="input"
            placeholder="https://linkedin.com/in/your-name"
          />
        </div>

        <div>
          <label className="label !text-[10px] !normal-case" htmlFor="github">
            GitHub URL
          </label>
          <input
            id="github"
            name="github"
            className="input"
            placeholder="https://github.com/your-handle"
          />
        </div>

        <div>
          <label className="label !text-[10px] !normal-case" htmlFor="resumeText">
            Resume — paste the relevant part
          </label>
          <textarea
            id="resumeText"
            name="resumeText"
            rows={5}
            className="input font-sans"
            placeholder="Staff engineer, 7 years. I own the retrieval pipeline over 4M documents — chunking, embeddings, hybrid search. Previously data engineering. Want to talk to anyone who has migrated embedding models without downtime."
          />
          <p className="text-[11px] text-muted-dim mt-1.5">
            This is the strongest signal of the three — it is free text, so semantic search has
            something real to work with.
          </p>
        </div>
      </fieldset>

      <label className="block text-sm">Conference
        <select name="eventId" className="input mt-2" required>
          {events.map((event) => <option value={event.id} key={event.id}>{event.name}</option>)}
        </select>
      </label>
      <label className="flex items-start gap-3 text-sm text-muted">
        <input type="checkbox" name="discoveryOptIn" className="mt-1 size-4" />
        Make my profile discoverable at the selected conference, including in assistant answers.
      </label>

      {state.error && (
        <p className="text-sm text-hot card p-3 border-hot/30 bg-hot/5">{state.error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={pending || selected.length !== REQUIRED_INTERESTS}
        >
          {pending ? 'Building your profile…' : 'Create profile & see my agenda'}
        </button>
        {pending && (
          <span className="text-xs text-muted-dim">
            Preparing your profile from the information you provided.
          </span>
        )}
      </div>
    </form>
  );
}
