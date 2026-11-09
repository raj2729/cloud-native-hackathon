import { OnboardingForm } from '@/components/onboarding-form';

export const dynamic = 'force-dynamic';

export default function OnboardingPage() {
  return (
    <div className="pt-10 max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Create your profile</h1>
      <p className="text-sm text-muted mt-2 leading-relaxed">
        Five interests, and at least one link to your work. Claude reads whatever you give it to
        widen your profile beyond the five tags, which is what lets us match you to talks and
        people you would not have found by keyword.
      </p>
      <OnboardingForm />
    </div>
  );
}
