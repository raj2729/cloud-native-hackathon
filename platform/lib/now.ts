/**
 * Request-time clock read.
 *
 * Every page here is rendered per request, so "now" is legitimate request data
 * rather than render state — but reading the clock *during* render is impure and
 * React's lint rules reject it. Awaiting this puts the read in the async data
 * phase alongside the Elasticsearch queries, where it belongs.
 */
export async function requestNow(): Promise<number> {
  return Date.now();
}
