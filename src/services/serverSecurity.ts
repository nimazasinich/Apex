/* Copied from apex-trading-engine/src/services/serverSecurity.ts */

import dns from 'node:dns';
import net from 'node:net';

/**
 * Explicit deployment profiles (GAP EXE-05). `local` preserves the historical
 * default behavior (operator token optional, relies on loopback/origin
 * checks) for a single-operator desktop deployment. `lan` is the same trust
 * model extended to an explicitly allow-listed trusted network. `production`
 * is the only profile that turns on hard requirements: a configured operator
 * token and TLS at the deployment boundary are both mandatory, and requests
 * fail closed (not silently degrade) if either is missing.
 */
export type DeploymentProfile = 'local' | 'lan' | 'production';

export function resolveDeploymentProfile(raw: string | undefined): DeploymentProfile {
  const value = (raw || '').trim().toLowerCase();
  if (value === 'production' || value === 'prod') return 'production';
  if (value === 'lan' || value === 'trusted-lan') return 'lan';
  return 'local';
}

export interface MutationAuthInput {
  method: string;
  path: string;
  origin?: string | null;
  referer?: string | null;
  operatorTokenHeader?: string | null;
  csrfHeader?: string | null;
  remoteAddress?: string | null;
  configuredOperatorToken: string;
  allowedOrigins: string[];
  requireCsrfHeader?: boolean;
  /** Deployment profile (see resolveDeploymentProfile). Defaults to 'local' when omitted, preserving prior behavior. */
  deploymentProfile?: DeploymentProfile;
  /** Whether the inbound request itself arrived over TLS (req.secure || trusted X-Forwarded-Proto). */
  requestIsSecure?: boolean;
}

export interface MutationAuthResult {
  ok: boolean;
  status: number;
  error?: string;
}

export interface RuntimeSecurityPosture {
  deploymentProfile: DeploymentProfile;
  operatorAuthRequired: boolean;
  operatorAuthConfigured: boolean;
  tlsRequired: boolean;
  requestIsSecure: boolean;
  mutationAuthEnabled: true;
  csrfOriginPolicyActive: true;
  hardeningSatisfied: boolean;
  killSwitches: {
    allTrading: boolean;
    newEntries: boolean;
    automatedExecution: boolean;
    exchangeScopeCount: number;
    symbolScopeCount: number;
    strategyScopeCount: number;
  };
  execution: {
    autonomousLiveExecutionEnabled: false;
    manualLiveExecutionArmedSessions: number;
  };
}

export function buildRuntimeSecurityPosture(input: {
  deploymentProfile: DeploymentProfile;
  operatorTokenConfigured: boolean;
  requestIsSecure: boolean;
  killSwitches: {
    allTrading: boolean;
    newEntries: boolean;
    automatedExecution: boolean;
    exchanges: string[];
    symbols: string[];
    strategies: string[];
  };
  manualLiveExecutionArmedSessions: number;
}): RuntimeSecurityPosture {
  const operatorAuthRequired = input.operatorTokenConfigured || input.deploymentProfile === 'production';
  const tlsRequired = input.deploymentProfile === 'production';
  return {
    deploymentProfile: input.deploymentProfile,
    operatorAuthRequired,
    operatorAuthConfigured: input.operatorTokenConfigured,
    tlsRequired,
    requestIsSecure: input.requestIsSecure,
    mutationAuthEnabled: true,
    csrfOriginPolicyActive: true,
    hardeningSatisfied: input.deploymentProfile !== 'production'
      || (input.operatorTokenConfigured && input.requestIsSecure),
    killSwitches: {
      allTrading: input.killSwitches.allTrading,
      newEntries: input.killSwitches.newEntries,
      automatedExecution: input.killSwitches.automatedExecution,
      exchangeScopeCount: input.killSwitches.exchanges.length,
      symbolScopeCount: input.killSwitches.symbols.length,
      strategyScopeCount: input.killSwitches.strategies.length,
    },
    execution: {
      autonomousLiveExecutionEnabled: false,
      manualLiveExecutionArmedSessions: Math.max(0, Math.floor(input.manualLiveExecutionArmedSessions || 0)),
    },
  };
}

export function buildDefaultOrigins(port: number): string[] {
  const p = Number.isFinite(port) && port > 0 ? port : 3000;
  return [
    `http://127.0.0.1:${p}`,
    `http://localhost:${p}`,
    `http://[::1]:${p}`,
  ];
}

export function parseCorsAllowlist(
  raw: string | undefined,
  port: number
): string[] {
  const defaults = buildDefaultOrigins(port);
  const extra = (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...defaults, ...extra])];
}

export function isOriginAllowed(
  origin: string | null | undefined,
  allowlist: string[]
): boolean {
  if (!origin) return false;
  return allowlist.includes(origin);
}

export function extractRequestOrigin(
  originHeader?: string | null,
  refererHeader?: string | null
): string | null {
  if (originHeader && originHeader.trim()) return originHeader.trim();
  if (!refererHeader) return null;
  try {
    return new URL(refererHeader).origin;
  } catch {
    return null;
  }
}

export function isLoopbackAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  const cleaned = address.replace(/^::ffff:/i, '');
  return (
    cleaned === '127.0.0.1' ||
    cleaned === '::1' ||
    cleaned === 'localhost'
  );
}

export function assertMutationAllowed(input: MutationAuthInput): MutationAuthResult {
  const method = (input.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return { ok: true, status: 200 };
  }

  const origin = extractRequestOrigin(input.origin, input.referer);
  const fromLoopback = isLoopbackAddress(input.remoteAddress);
  const originOk = origin ? isOriginAllowed(origin, input.allowedOrigins) : false;

  if (origin && !originOk) {
    return { ok: false, status: 403, error: 'origin_not_allowed' };
  }
  if (!origin && !fromLoopback) {
    return { ok: false, status: 403, error: 'origin_required' };
  }

  const requireCsrf = input.requireCsrfHeader !== false;
  if (requireCsrf && origin) {
    const csrf = (input.csrfHeader || '').trim();
    if (csrf !== '1') {
      return { ok: false, status: 403, error: 'csrf_required' };
    }
  }

  const configured = (input.configuredOperatorToken || '').trim();
  const profile = input.deploymentProfile ?? 'local';

  // Production is the only profile that hard-requires an operator token and
  // TLS. Fail closed (do not silently fall back to the local trust model) if
  // either prerequisite is missing, rather than accepting an insecure
  // production deployment.
  if (profile === 'production') {
    if (!configured) {
      return { ok: false, status: 503, error: 'operator_token_not_configured_for_production' };
    }
    if (!input.requestIsSecure) {
      return { ok: false, status: 403, error: 'tls_required_in_production' };
    }
  }

  // The operator token authenticates *remote and non-browser* callers (scripts,
  // curl, a reverse proxy). The local UI cannot hold it: a browser bundle has
  // nowhere to keep a shared secret, so injecting it via window/VITE_* would
  // publish it to every script on the page without adding any real protection.
  //
  // Outside `production`, a request that is provably the app's own UI — it came
  // from loopback AND carried an allow-listed Origin AND the CSRF header
  // (verified above) — is therefore exempt from the token check. That request
  // already satisfies the local trust model this profile is built on, and any
  // process on the machine could read the token from the environment anyway.
  //
  // Everything else (LAN clients, tokenless curl with no Origin, any request in
  // `production`) still has to present the token.
  const trustedLocalUi = profile !== 'production' && fromLoopback && (!origin || originOk);

  if (configured && !trustedLocalUi) {
    const provided = (input.operatorTokenHeader || '').trim();
    if (!provided || provided !== configured) {
      return { ok: false, status: 401, error: 'operator_token_required' };
    }
  }

  return { ok: true, status: 200 };
}

export interface ComputeAuthInput {
  method: string;
  origin?: string | null;
  referer?: string | null;
  remoteAddress?: string | null;
  allowedOrigins: string[];
  deploymentProfile?: DeploymentProfile;
}

/**
 * Guard for the expensive read-only endpoints listed in `isComputeHeavyRoute`.
 *
 * `GET /api/market/backtest` runs a full strategy replay over up to 5000
 * candles and fans out to third-party market-data providers, but as a GET it
 * never reaches `assertMutationAllowed` (which returns early for safe methods),
 * so a rate limiter was its only protection.
 *
 * This is a single-operator desktop app, so the appropriate guard is the trust
 * model the rest of the app already uses — not a new credential:
 *   - a cross-origin caller is rejected outright (a page you visit in the same
 *     browser cannot silently drive your local engine);
 *   - in the default `local` profile the client must be on loopback;
 *   - `lan` and `production` are opt-in network exposures, so the operator's
 *     own allow-list decides and this guard steps aside.
 *
 * Same-origin browser GETs are unaffected: browsers send no Origin header for
 * them (and `Referrer-Policy: no-referrer` suppresses Referer), so they fall
 * through to the loopback check, which the local UI always satisfies.
 */
export function assertComputeHeavyAllowed(input: ComputeAuthInput): MutationAuthResult {
  const method = (input.method || 'GET').toUpperCase();
  // Mutating verbs already passed through assertMutationAllowed.
  if (method !== 'GET' && method !== 'HEAD') return { ok: true, status: 200 };

  const origin = extractRequestOrigin(input.origin, input.referer);
  if (origin && !isOriginAllowed(origin, input.allowedOrigins)) {
    return { ok: false, status: 403, error: 'origin_not_allowed' };
  }

  const profile = input.deploymentProfile ?? 'local';
  if (profile !== 'local') return { ok: true, status: 200 };

  if (!isLoopbackAddress(input.remoteAddress)) {
    return { ok: false, status: 403, error: 'local_client_required' };
  }
  return { ok: true, status: 200 };
}

export interface PrivateReadAuthInput {
  method: string;
  origin?: string | null;
  referer?: string | null;
  operatorTokenHeader?: string | null;
  remoteAddress?: string | null;
  configuredOperatorToken: string;
  allowedOrigins: string[];
  deploymentProfile?: DeploymentProfile;
  /** Whether the inbound request itself arrived over TLS (req.secure || trusted X-Forwarded-Proto). */
  requestIsSecure?: boolean;
}

/**
 * Guard for the private read plane classified by `isPrivateReadRoute`.
 *
 * `assertMutationAllowed` is only ever consulted for POST/PUT/PATCH/DELETE — the
 * middleware filters on method before calling it, and the function itself returns
 * early for safe methods — while `assertComputeHeavyAllowed` covers only the
 * expensive replay routes. Every GET that returns *account and operator state*
 * therefore had no authentication at all: portfolio and exchange-connection
 * status, execution readiness, testnet account and order history, decision
 * memory, and the whole `/api/operations/*` read surface. That held even in
 * `production`, where an operator token is otherwise mandatory. A missing read
 * guard is the silent kind of gap: nothing is mutated, so nothing looks wrong.
 *
 * This reuses the two trust models already in this file rather than introducing a
 * third one:
 *   - the cross-origin and loopback rules are `assertComputeHeavyAllowed`'s,
 *     because those are the ones written for GETs;
 *   - the `production` hard requirements and the operator-token comparison are
 *     `assertMutationAllowed`'s, including the `trustedLocalUi` exemption, so the
 *     local UI reads exactly as well as it already mutates.
 *
 * CSRF is deliberately not required. Browsers send no Origin header for
 * same-origin GETs and `Referrer-Policy: no-referrer` suppresses Referer, so a
 * same-origin read arrives with no origin at all and is judged on loopback — the
 * same path `assertComputeHeavyAllowed` already depends on. Demanding a custom
 * header on reads would break every plain `fetch` in the UI without adding any
 * protection the origin check does not already provide.
 */
export function assertPrivateReadAllowed(input: PrivateReadAuthInput): MutationAuthResult {
  const method = (input.method || 'GET').toUpperCase();
  // Mutating verbs on these same paths are already covered by assertMutationAllowed.
  if (method !== 'GET' && method !== 'HEAD') return { ok: true, status: 200 };

  const origin = extractRequestOrigin(input.origin, input.referer);
  const fromLoopback = isLoopbackAddress(input.remoteAddress);
  const originOk = origin ? isOriginAllowed(origin, input.allowedOrigins) : false;

  if (origin && !originOk) {
    return { ok: false, status: 403, error: 'origin_not_allowed' };
  }

  const configured = (input.configuredOperatorToken || '').trim();
  const profile = input.deploymentProfile ?? 'local';

  // Same fail-closed production posture as mutations: never degrade silently to
  // the local trust model when the token or TLS prerequisite is missing.
  if (profile === 'production') {
    if (!configured) {
      return { ok: false, status: 503, error: 'operator_token_not_configured_for_production' };
    }
    if (!input.requestIsSecure) {
      return { ok: false, status: 403, error: 'tls_required_in_production' };
    }
  }

  // `local` is the single-operator desktop profile, so an off-box reader is never
  // legitimate there even when no token is configured — otherwise a server bound
  // to a non-loopback interface would hand account state to the entire subnet.
  // `lan` and `production` are opt-in network exposures, so the operator's own
  // allow-list and token decide instead of this check.
  if (profile === 'local' && !fromLoopback) {
    return { ok: false, status: 403, error: 'local_client_required' };
  }

  const trustedLocalUi = profile !== 'production' && fromLoopback && (!origin || originOk);

  if (configured && !trustedLocalUi) {
    const provided = (input.operatorTokenHeader || '').trim();
    if (!provided || provided !== configured) {
      return { ok: false, status: 401, error: 'operator_token_required' };
    }
  }

  return { ok: true, status: 200 };
}

function normalizeIpLiteral(ip: string): string {
  return ip.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%[0-9a-z_.-]+$/i, '');
}

function parseIpv4Words(ip: string): [number, number, number, number] | null {
  const match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const words = match.slice(1).map(Number) as [number, number, number, number];
  return words.every((word) => Number.isInteger(word) && word >= 0 && word <= 255) ? words : null;
}

function isBlockedIpv4(words: [number, number, number, number]): boolean {
  const [a, b, c] = words;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

function parseIpv6Words(ip: string): number[] | null {
  let source = ip;
  const embeddedIpv4 = source.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (embeddedIpv4) {
    const ipv4 = parseIpv4Words(embeddedIpv4);
    if (!ipv4) return null;
    source = source.slice(0, -embeddedIpv4.length) + `${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }

  const halves = source.split('::');
  if (halves.length > 2) return null;
  const parseHalf = (value: string): number[] | null => {
    if (!value) return [];
    const tokens = value.split(':');
    const result: number[] = [];
    for (const token of tokens) {
      if (!/^[0-9a-f]{1,4}$/i.test(token)) return null;
      result.push(Number.parseInt(token, 16));
    }
    return result;
  };
  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] ?? '');
  if (!left || !right) return null;
  if (halves.length === 1) return left.length === 8 ? left : null;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...new Array(missing).fill(0), ...right];
}

function embeddedIpv4FromIpv6(words: number[]): [number, number, number, number] {
  return [words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff];
}

function isBlockedIpv6(words: number[]): boolean {
  const allZeroPrefix = words.slice(0, 6).every((word) => word === 0);
  const isUnspecified = words.every((word) => word === 0);
  const isLoopback = words.slice(0, 7).every((word) => word === 0) && words[7] === 1;
  if (isUnspecified || isLoopback) return true;

  // IPv4-compatible and IPv4-mapped IPv6 literals must inherit IPv4 policy.
  if (allZeroPrefix || (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff)) {
    return isBlockedIpv4(embeddedIpv4FromIpv6(words));
  }
  // Well-known NAT64 prefix. Block it when it embeds a non-public IPv4 target.
  if (words[0] === 0x0064 && words[1] === 0xff9b && words.slice(2, 6).every((word) => word === 0)) {
    return isBlockedIpv4(embeddedIpv4FromIpv6(words));
  }

  if ((words[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((words[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((words[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 deprecated site-local
  if ((words[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (words[0] === 0x0100 && words.slice(1, 4).every((word) => word === 0)) return true; // 100::/64 discard-only
  if (words[0] === 0x2001 && words[1] === 0x0db8) return true; // documentation
  if (words[0] === 0x2001 && (words[1] === 0x0000 || words[1] === 0x0002)) return true; // Teredo / benchmarking
  if (words[0] === 0x2002) return true; // deprecated 6to4 tunnelling
  return false;
}

export function isBlockedIpLiteral(ip: string): boolean {
  const cleaned = normalizeIpLiteral(ip);
  const family = net.isIP(cleaned);
  if (!family) return true;
  if (family === 4) {
    const words = parseIpv4Words(cleaned);
    return !words || isBlockedIpv4(words);
  }
  const words = parseIpv6Words(cleaned);
  return !words || isBlockedIpv6(words);
}

export function hostMatchesAllowlist(
  hostname: string,
  allowlist: string[]
): boolean {
  const normalizeHost = (value: string) => value.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const host = normalizeHost(hostname);
  return allowlist.some((entry) => normalizeHost(entry) === host);
}

export interface SafeUrlResult {
  ok: boolean;
  reason?: string;
  url?: URL;
}

export function assertSafeOutboundUrlShape(
  rawUrl: string,
  privateHostAllowlist: string[] = []
): SafeUrlResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'protocol_not_allowed' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'credentials_in_url' };
  }
  const host = url.hostname;
  if (hostMatchesAllowlist(host, privateHostAllowlist)) {
    return { ok: true, url };
  }
  const ipHost = normalizeIpLiteral(host);
  if (net.isIP(ipHost) && isBlockedIpLiteral(ipHost)) {
    return { ok: false, reason: 'blocked_ip' };
  }
  return { ok: true, url };
}

export async function assertSafeOutboundUrlResolved(
  rawUrl: string,
  privateHostAllowlist: string[] = [],
  lookup: typeof dns.promises.lookup = dns.promises.lookup
): Promise<SafeUrlResult> {
  const shape = assertSafeOutboundUrlShape(rawUrl, privateHostAllowlist);
  if (!shape.ok || !shape.url) return shape;
  const url = shape.url;
  if (hostMatchesAllowlist(url.hostname, privateHostAllowlist)) {
    return { ok: true, url };
  }
  const ipHost = normalizeIpLiteral(url.hostname);
  if (net.isIP(ipHost)) {
    return isBlockedIpLiteral(ipHost)
      ? { ok: false, reason: 'blocked_ip' }
      : { ok: true, url };
  }
  try {
    const results = await lookup(url.hostname, { all: true });
    if (!results.length) return { ok: false, reason: 'dns_empty' };
    for (const row of results) {
      if (isBlockedIpLiteral(row.address)) {
        return { ok: false, reason: 'blocked_resolved_ip' };
      }
    }
    return { ok: true, url };
  } catch {
    return { ok: false, reason: 'dns_failed' };
  }
}

export class MutationRateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly nowFn: () => number = () => Date.now()
  ) {}

  allow(key: string): boolean {
    const now = this.nowFn();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (current.count >= this.limit) return false;
    current.count += 1;
    return true;
  }

  prune(): void {
    const now = this.nowFn();
    for (const [key, value] of this.buckets) {
      if (value.resetAt <= now) this.buckets.delete(key);
    }
  }
}

/**
 * Security-response headers applied to every response. Kept as an explicit
 * map so the policy is unit-testable without booting the HTTP server.
 *
 * The SPA policy is dev-aware. In the integrated dev server the UI is served
 * through Vite middleware, which needs two things the production policy
 * deliberately withholds:
 *   - an inline script tag (the @vitejs/plugin-react refresh preamble)
 *   - a websocket connection for HMR, on a port that is not the page origin
 *
 * Production is unchanged and stays strict: no inline scripts, no websockets,
 * no external hosts. `dev` is never inferred from user input — only from the
 * server's own startup mode — so a request cannot talk the policy down.
 */
export function buildSecurityHeaders(
  pathname: string,
  options: { dev?: boolean } = {},
): Record<string, string> {
  const dev = options.dev ?? process.env.APEX_VITE_MIDDLEWARE === '1';
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'X-XSS-Protection': '0',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
  const scriptSrc = dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'";
  const connectSrc = dev ? "connect-src 'self' ws: wss:" : "connect-src 'self'";
  headers['Content-Security-Policy'] = pathname.startsWith('/api/')
    ? "default-src 'none'; frame-ancestors 'none'"
    : `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; ` +
      `img-src 'self' data:; ${connectSrc}; frame-ancestors 'none'; ` +
      "object-src 'none'; base-uri 'self'";
  return headers;
}

/** Central definition for GET/POST routes that execute expensive replay work. */
export function isComputeHeavyRoute(pathname: string): boolean {
  return (
    pathname === '/api/market/backtest' ||
    pathname === '/api/market/backtest/production-input' ||
    pathname === '/api/liquidity-hunter/shadow/evaluate' ||
    pathname === '/api/strategies/multi-backtest' ||
    pathname === '/api/strategies/autopilot/cycle' ||
    (pathname.startsWith('/api/strategies/') && (pathname.endsWith('/validate') || pathname.endsWith('/optimize') || pathname.endsWith('/fusion-preview')))
  );
}

/**
 * Central definition for the GET routes that return private account, execution
 * or operator state, and therefore must not be readable without authentication.
 *
 * Scoped by route family rather than by individual path so a route added under
 * one of these prefixes is guarded by default instead of silently joining the
 * public read plane. Verified against the current route table: every GET under
 * these four prefixes returns private data, and no public route falls inside
 * them.
 *
 * Comparing against `family` exactly or `family + '/'` — never a bare
 * `startsWith(family)` — keeps the boundary at a path segment, so a future
 * `/api/operations-public` cannot be captured by the `/api/operations` entry.
 *
 * Deliberately NOT included:
 *   - the public market-data plane (`/api/market/*`, `/api/binance/*`,
 *     `/api/hf-space/*`, `/api/supplemental/*`, `/api/intelligence/*`),
 *     `/api/system/health`, `/api/readiness` and `/api/icon/*`. A price, candle
 *     or order book is not a secret, and guarding every GET would break the read
 *     plane the UI loads before it has any credential.
 *   - `/api/security/bootstrap`, which is the discovery endpoint the UI reads to
 *     learn *whether* an operator token is required. Gating it behind that same
 *     token would deadlock the Settings security panel.
 */
export function isPrivateReadRoute(pathname: string): boolean {
  const families = ['/api/account', '/api/execution', '/api/decision-memory', '/api/operations'];
  return families.some((family) => pathname === family || pathname.startsWith(`${family}/`));
}

export function sanitizeSecretPresence<T extends Record<string, unknown>>(
  obj: T,
  secretKeys: string[]
): T {
  const clone = { ...obj };
  for (const key of secretKeys) {
    if (key in clone) {
      const present = Boolean(
        typeof clone[key] === 'string' && String(clone[key]).trim()
      );
      delete clone[key];
      (clone as any)[`has${key[0].toUpperCase()}${key.slice(1)}`] = present;
    }
  }
  return clone;
}
