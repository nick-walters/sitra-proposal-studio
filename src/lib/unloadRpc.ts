/**
 * Fire-and-forget RPC that survives page unload.
 *
 * A normal supabase-js call is an ordinary `fetch`, and the browser cancels
 * in-flight fetches as soon as the document unloads — which is exactly when a
 * lock release matters most. `fetch(..., { keepalive: true })` hands the
 * request to the network stack so it completes after the page is gone, and it
 * lets us set the `Authorization` / `apikey` headers PostgREST needs
 * (`navigator.sendBeacon` cannot set headers, so it is only used as a
 * last-resort fallback when `keepalive` is unavailable).
 */
export function unloadRpc(
  fnName: string,
  body: Record<string, unknown>,
  accessToken: string | null,
): void {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !anonKey) return;

  const endpoint = `${url}/rest/v1/rpc/${fnName}`;
  const payload = JSON.stringify(body);
  const token = accessToken || anonKey;

  try {
    void fetch(endpoint, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
      body: payload,
    }).catch(() => {
      /* unload — nothing to recover */
    });
  } catch {
    // Fallback: beacons cannot carry auth headers, so this only helps where
    // the anon role is sufficient. Better than dropping the request entirely.
    try {
      navigator.sendBeacon?.(
        `${endpoint}?apikey=${encodeURIComponent(anonKey)}`,
        new Blob([payload], { type: 'application/json' }),
      );
    } catch {
      /* ignore */
    }
  }
}
