import Link from 'next/link';

export function ChooseProfileNotice() {
  return (
    <div className="pt-20 max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">Who are you?</h1>
      <p className="text-muted mt-3 leading-relaxed">
        Everything here ranks around one person&apos;s interests. Pick an existing attendee to
        browse as, or create a profile with your own five interests.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/" className="btn btn-primary">
          Pick an attendee
        </Link>
        <Link href="/onboarding" className="btn">
          Create a profile
        </Link>
      </div>
    </div>
  );
}
