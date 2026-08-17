/* Copied from apex-trading-engine/src/services/apiMutate.ts */

/**
 * Client-side helper for mutating (POST/PUT/PATCH/DELETE) API calls.
 *
 * It deliberately does NOT attach an operator token. `APEX_OPERATOR_TOKEN`
 * authenticates *remote / non-browser* callers (scripts, curl, a reverse
 * proxy) and is a server-side secret. A browser bundle has nowhere to hold a
 * shared secret — injecting it via `window.*` or a `VITE_*` build variable
 * would publish it to every script on the page (and into a world-readable
 * asset) without adding any real protection.
 *
 * The local UI authenticates instead by *being the local UI*: it is same-origin
 * (so it carries an allow-listed Origin) and it sends the `X-APEX-CSRF` header
 * below. `assertMutationAllowed` on the server treats a loopback request with
 * an allow-listed Origin and this CSRF header as the trusted operator, so no
 * token round-trip is required for normal desktop use. See serverSecurity.ts.
 */
export function mutationHeaders(
  extra?: Record<string, string>
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-APEX-CSRF': '1',
    ...(extra || {}),
  };
}

export async function apiMutate(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = {
    ...mutationHeaders(),
    ...(init.headers as Record<string, string> | undefined),
  };
  return fetch(url, { ...init, method: init.method || 'POST', headers });
}
