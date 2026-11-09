/**
 * Shown when Elasticsearch is unreachable or empty. A hackathon demo should
 * tell you exactly which command is missing rather than render a blank page.
 */
export function SetupNotice({
  message,
  seedHint = false,
}: {
  message: string;
  seedHint?: boolean;
}) {
  return (
    <div className="card mt-10 p-5 border-warn/30 bg-warn/5">
      <h2 className="font-medium text-warn">Elasticsearch is not ready</h2>
      <p className="text-sm text-muted mt-1.5">{message}</p>
      <ol className="mt-4 space-y-1.5 text-sm text-muted list-decimal list-inside">
        <li>
          <code className="font-mono text-xs text-foreground">docker compose up -d</code>
        </li>
        <li>
          <code className="font-mono text-xs text-foreground">npm run es:setup</code>
          <span className="text-muted-dim"> — license, inference endpoint, mappings</span>
        </li>
        <li>
          <code className="font-mono text-xs text-foreground">npm run es:seed</code>
          <span className="text-muted-dim"> — conference, talks, attendees</span>
        </li>
      </ol>
      {seedHint && (
        <p className="text-xs text-muted-dim mt-4">
          The indices exist but hold no attendees — step 3 is the one you want.
        </p>
      )}
    </div>
  );
}
