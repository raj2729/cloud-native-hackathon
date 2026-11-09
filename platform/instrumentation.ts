/**
 * Next.js calls `register()` once per runtime before any other code. The OTel
 * Node SDK only works on the Node runtime, so it is imported conditionally.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node');
  }
}
