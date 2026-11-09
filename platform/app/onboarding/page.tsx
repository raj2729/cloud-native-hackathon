import { OnboardingForm } from '@/components/onboarding-form';
import { listEvents } from '@/lib/search';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const events = await listEvents();
  return (
    <div className="pt-10 max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Create your profile</h1>
      <p className="text-sm text-muted mt-2 leading-relaxed">
        Choose five interests and share some information about your work.
        Links are optional profile references; we do not scrape external accounts.
      </p>
      <OnboardingForm events={events.map(({ id, name }) => ({ id, name }))} />
    </div>
  );
}
