/**
 * The commit this server was built from. CI waits for `/api/version` to report
 * the pushed SHA before it starts the post-deploy latency window, and the same
 * value is the OTel `service.version`, so Dash0 can split latency by release.
 *
 * Set APP_VERSION explicitly, or rely on the SHA your host injects.
 */
export function appVersion(): string {
  return (
    process.env.APP_VERSION ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.RENDER_GIT_COMMIT ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.SOURCE_VERSION ||
    'dev'
  );
}
