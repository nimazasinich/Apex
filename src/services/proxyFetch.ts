/* Copied from apex-trading-engine/src/services/proxyFetch.ts */

/**
 * proxyFetch.ts — Smart direct/proxy fetch with health-based rotation.
 *
 * NODE-ONLY. Imported exclusively by server.ts. Never import from the browser
 * bundle (it requires `undici`).
 *
 * Behaviour (per spec):
 *   1. In auto mode, always try the direct network first. A proxy is not touched
 *      while direct connectivity is healthy.
 *   2. On a network/transport failure (or geo-block 451/403/418), fall through to
 *      the configured proxy pool, rotating by health. When no proxy is configured,
 *      APEX can lazily probe a local loopback tunnel only after direct has failed.
 *   3. Track failures per proxy (proxyId). Unhealthy proxies are temporarily
 *      skipped with exponential backoff.
 *   4. Bounded attempts; never an unbounded retry storm.
 *   5. Repeated identical warnings are throttled.
 *
 * It does NOT add API keys, does NOT authenticate, does NOT fabricate data.
 */

import dns from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

type Dispatcher = any;

const optionalRequire = createRequire(`${process.cwd()}/package.json`);
let cachedUndici: any | undefined;
let cachedSocksProxyAgent: any | undefined;

function loadUndici(): any | null {
  if (cachedUndici !== undefined) return cachedUndici;
  try {
    cachedUndici = optionalRequire('undici');
  } catch {
    cachedUndici = null;
  }
  return cachedUndici;
}

function loadSocksProxyAgent(): any | null {
  if (cachedSocksProxyAgent !== undefined) return cachedSocksProxyAgent;
  try {
    cachedSocksProxyAgent = optionalRequire('socks-proxy-agent').SocksProxyAgent;
  } catch {
    cachedSocksProxyAgent = null;
  }
  return cachedSocksProxyAgent;
}

// ── Configuration ────────────────────────────────────────────────────────────

const ENV_PROXY_MODE = (process.env.PROXY_MODE || 'auto').trim().toLowerCase();

import { normalizeProxyUrl, normalizeSocksProxyUrl, normalizeProxyConfig, type ProxyConfig } from './proxyConfig';
export { normalizeProxyUrl, normalizeSocksProxyUrl } from './proxyConfig';

export function isSocksProxyRoute(route: string): boolean {
  return /^socks5h?:\/\//i.test(route);
}

function parseProxyPool(): string[] {
  const candidates: string[] = [];
  const pushCsv = (raw?: string) => {
    if (!raw?.trim()) return;
    for (const part of raw.split(',')) {
      const normalized = normalizeProxyUrl(part);
      if (normalized) candidates.push(normalized);
    }
  };

  pushCsv(process.env.PROXY_POOL_URLS);
  pushCsv(process.env.APEX_LOCAL_PROXY);
  pushCsv(process.env.HTTPS_PROXY || process.env.https_proxy);
  pushCsv(process.env.HTTP_PROXY || process.env.http_proxy);
  pushCsv(process.env.ALL_PROXY || process.env.all_proxy);

  const socks = (process.env.SOCKS5_PROXY || process.env.SOCKS_PROXY_URL || process.env.SOCKS_PROXY
    || (process.env.ALL_PROXY && /^socks/i.test(process.env.ALL_PROXY) ? process.env.ALL_PROXY : '')
    || (process.env.all_proxy && /^socks/i.test(process.env.all_proxy) ? process.env.all_proxy : '')
    || '').trim();
  if (socks) {
    const socksUrl = normalizeSocksProxyUrl(socks);
    if (socksUrl && !candidates.includes(socksUrl)) {
      candidates.push(socksUrl);
      // Many local clients (Clash/V2Ray) expose HTTP CONNECT on the same host:port as SOCKS5.
      if (process.env.APEX_SOCKS_HTTP_FALLBACK !== 'false') {
        const hostPort = socksUrl.replace(/^socks5h?:\/\//i, '');
        if (hostPort && !candidates.includes(`http://${hostPort}`)) candidates.push(`http://${hostPort}`);
      }
    }
  }

  const localPort = (process.env.APEX_LOCAL_PROXY_PORT || process.env.LOCAL_PROXY_PORT || '').trim();
  if (localPort && /^\d+$/.test(localPort)) {
    candidates.push(`http://127.0.0.1:${localPort}`);
  }

  // Release archives intentionally do not ship a populated .env. Some Windows
  // APEX setups expose SOCKS5 or HTTP CONNECT on loopback port 10808, and this
  // block recovers those local-only routes — but it is OPT-IN.
  //
  // It used to be opt-out (on unless APEX_AUTO_LOCAL_PROXY=false). On a host
  // with no such listener that injected two dead loopback routes ahead of
  // 'direct' (see buildAttemptOrder), so every market-data call paid failed
  // proxy attempts before reaching a working direct route. Verified on the
  // target VPS: no listener on 10808, and direct HTTPS to all market-data
  // hosts succeeds in 203-540 ms. Defaulting to direct is therefore correct
  // for an unconfigured host.
  //
  // Operators who do run a loopback tunnel opt in with APEX_AUTO_LOCAL_PROXY=true
  // (port via APEX_AUTO_LOCAL_PROXY_PORT, scheme via APEX_AUTO_LOCAL_PROXY_SCHEME),
  // or configure an explicit proxy through SOCKS5_PROXY / HTTPS_PROXY / etc.
  // Ordering remains controlled by PROXY_MODE. No remote proxy, credential, or
  // provider secret is embedded in the release.
  const hasExplicitProxy = candidates.length > 0;
  if (!hasExplicitProxy && process.env.APEX_AUTO_LOCAL_PROXY === 'true') {
    const autoPort = (process.env.APEX_AUTO_LOCAL_PROXY_PORT || '10808').trim();
    const autoScheme = (process.env.APEX_AUTO_LOCAL_PROXY_SCHEME || 'both').trim().toLowerCase();
    if (/^\d+$/.test(autoPort)) {
      if (autoScheme === 'socks5' || autoScheme === 'both') {
        candidates.push(`socks5h://127.0.0.1:${autoPort}`);
      }
      if (autoScheme === 'http' || autoScheme === 'both') {
        candidates.push(`http://127.0.0.1:${autoPort}`);
      }
    }
  }

  return [...new Set(candidates)];
}

const PROXY_POOL: string[] = parseProxyPool();

/**
 * Lazy local discovery routes used only by PROXY_MODE=auto and only after a
 * direct request has produced a retryable transport/geo failure. This is the
 * important distinction from the old auto-local behaviour: these routes do not
 * receive a connection attempt while direct access is working.
 *
 * APEX_SMART_PROXY_DISCOVERY=false disables discovery. Operators can override
 * the loopback port/scheme without populating the main proxy pool.
 */
function parseSmartFallbackRoutes(): string[] {
  if (process.env.APEX_SMART_PROXY_DISCOVERY === 'false') return [];
  const port = (process.env.APEX_SMART_PROXY_PORT || process.env.APEX_AUTO_LOCAL_PROXY_PORT || '10808').trim();
  if (!/^\d+$/.test(port)) return [];
  const scheme = (process.env.APEX_SMART_PROXY_SCHEME || process.env.APEX_AUTO_LOCAL_PROXY_SCHEME || 'both').trim().toLowerCase();
  const routes: string[] = [];
  if (scheme === 'http' || scheme === 'both') routes.push(`http://127.0.0.1:${port}`);
  if (scheme === 'socks5' || scheme === 'both') routes.push(`socks5h://127.0.0.1:${port}`);
  return routes;
}

const SMART_FALLBACK_ROUTES = PROXY_POOL.length === 0 ? parseSmartFallbackRoutes() : [];

// Runtime settings override environment routing only after an explicit save.
let runtimeProxyConfig: ProxyConfig | null = null;
let proxyConfigRevision = 0;
let proxyConfigurationError: string | null = null;
function activeMode(): string { return runtimeProxyConfig?.mode ?? ENV_PROXY_MODE; }
function activePool(): string[] {
  const mode = activeMode();
  if (mode === 'off' || mode === 'direct_only') return [];
  if (mode === 'manual') {
    if (runtimeProxyConfig) return runtimeProxyConfig.address ? [runtimeProxyConfig.address] : [];
    // Explicit env addresses only: no implicit HTTP conversion or local discovery.
    return [...(process.env.PROXY_POOL_URLS || '').split(',').map(normalizeProxyUrl).filter(Boolean),
      normalizeSocksProxyUrl(process.env.SOCKS5_PROXY || process.env.SOCKS_PROXY_URL || process.env.SOCKS_PROXY || '')].filter(Boolean);
  }
  return PROXY_POOL;
}
export function getRuntimeProxyConfig(): ProxyConfig {
  if (runtimeProxyConfig) return { ...runtimeProxyConfig };
  const mode = activeMode();
  const address = mode === 'manual' ? activePool()[0] || '' : '';
  // Never disclose credentials inherited from an environment URL.
  let safeAddress = address;
  try { const url = new URL(address); url.username = ''; url.password = ''; safeAddress = `${url.protocol}//${url.host}`; } catch { safeAddress = ''; }
  return { mode: mode === 'manual' ? 'manual' : mode === 'off' || mode === 'direct_only' ? 'off' : 'auto', type: isSocksProxyRoute(address) ? 'socks5' : 'http', address: safeAddress };
}
export function applyRuntimeProxyConfig(value: unknown): void {
  runtimeProxyConfig = normalizeProxyConfig(value);
  proxyConfigurationError = null;
  proxyConfigRevision += 1;
  responseCache.clear();
  upstreamCircuits.clear();
  proxyHealth.clear();
}

/** Corrupt persisted configuration must not expose traffic through a direct fallback. */
export function blockInvalidProxyConfig(): void {
  runtimeProxyConfig = { mode: 'manual', type: 'socks5', address: '' };
  proxyConfigurationError = 'Saved proxy configuration is invalid. Provider requests are blocked until corrected in Settings.';
  proxyConfigRevision += 1;
  responseCache.clear();
  upstreamCircuits.clear();
}

// Smart DNS is deliberately scoped to the direct route and is used only when
// the operating-system resolver fails. It does not replace working DNS, alter
// the host machine's resolver, or touch requests that already succeed. The
// original hostname remains the TLS/SNI authority; only address resolution is
// retried through the configured resolvers.
const SMART_DNS_MODE = (process.env.APEX_SMART_DNS || 'auto').trim().toLowerCase();
const SMART_DNS_SERVERS = (process.env.APEX_SMART_DNS_SERVERS || '1.1.1.1,8.8.8.8')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const smartDnsResolvers = SMART_DNS_MODE === 'off'
  ? []
  : SMART_DNS_SERVERS.map((server) => {
      const resolver = new dns.Resolver();
      resolver.setServers([server]);
      return resolver;
    });
const smartDnsCache = new Map<string, { addresses: Array<{ address: string; family: number; ttl: number }>; expiresAt: number }>();

// Cloudflare can publish multiple IPv4 addresses for KuCoin. On this Windows
// runtime, one of those addresses can complete TCP but stall during TLS, so
// Node's normal first-address choice times out while curl still succeeds.
// Resolve all IPv4 records and prefer the responsive Cloudflare address family
// on this runtime; the sibling 172.64.* address can stall during TLS. The DNS
// interceptor keeps TLS/SNI on the original hostname.
function orderDirectAddresses(addresses: Array<{ address: string; family: number; ttl?: number }>): Array<{ address: string; family: number; ttl: number }> {
  return addresses
    .map((address) => ({ ...address, ttl: Math.max(15, Number(address.ttl) || 60) }))
    .sort((left, right) => Number(right.address.startsWith('104.')) - Number(left.address.startsWith('104.')));
}

function resolveWithSmartDns(
  hostname: string,
  callback: (error: NodeJS.ErrnoException | null, addresses?: Array<{ address: string; family: number; ttl: number }>) => void,
): void {
  const cached = smartDnsCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    callback(null, cached.addresses);
    return;
  }
  let resolverIndex = 0;
  let lastError: NodeJS.ErrnoException | null = null;
  const next = () => {
    const resolver = smartDnsResolvers[resolverIndex++];
    if (!resolver) {
      callback(lastError || Object.assign(new Error(`smart_dns_failed:${hostname}`), { code: 'ENOTFOUND' }));
      return;
    }
    (resolver.resolve4 as any)(hostname, { ttl: true }, (error: NodeJS.ErrnoException | null, records: Array<string | { address: string; ttl?: number }> = []) => {
      if (error || !records.length) {
        lastError = error;
        next();
        return;
      }
      const addresses = orderDirectAddresses(records.map((record) => ({
        address: typeof record === 'string' ? record : record.address,
        family: 4,
        ttl: typeof record === 'string' ? 60 : record.ttl,
      })));
      const minimumTtl = Math.min(...addresses.map((address) => address.ttl));
      smartDnsCache.set(hostname, { addresses, expiresAt: Date.now() + minimumTtl * 1000 });
      callback(null, addresses);
    });
  };
  next();
}

const directDnsLookup = (origin: any, _options: any, callback: any): void => {
  const hostname = typeof origin === 'string' ? origin : origin.hostname;
  if (SMART_DNS_MODE === 'always' && smartDnsResolvers.length) {
    resolveWithSmartDns(hostname, callback);
    return;
  }
  dns.lookup(
    hostname,
    { all: true, family: 4, order: 'ipv4first' },
    (err, addresses) => {
      if (!err && addresses.length) {
        callback(null, orderDirectAddresses(addresses));
        return;
      }
      if (SMART_DNS_MODE === 'auto' && smartDnsResolvers.length) {
        resolveWithSmartDns(hostname, callback);
        return;
      }
      callback(err, []);
    },
  );
};

// Fail-fast cap for the DIRECT route. The caller's timeoutMs (e.g. 20s) is the
// budget for the *whole* call, but a single direct attempt should give up much
// sooner so we surface UNAVAILABLE quickly instead of hanging — and so a real
// proxy (when configured) gets its turn promptly. Proxy routes keep the full
// caller timeout. Tunable via DIRECT_TIMEOUT_MS.
const DIRECT_TIMEOUT_MS = Number(process.env.DIRECT_TIMEOUT_MS || 7000);
// When a fallback route exists, reserve enough of the caller budget for it.
// This prevents a blocked direct route from consuming the entire request before
// the proxy ever gets a chance (the failure mode that made Binance look dead).
const DIRECT_WITH_PROXY_TIMEOUT_MS = Number(process.env.DIRECT_WITH_PROXY_TIMEOUT_MS || 2500);

// Per-route effective timeout: direct fails fast; proxy uses the full budget.
function timeoutForRoute(route: string, callerTimeoutMs: number): number {
  return route === 'direct'
    ? Math.min(callerTimeoutMs, DIRECT_TIMEOUT_MS)
    : callerTimeoutMs;
}

/** Smallest attempt worth making once the overall budget is nearly spent. */
const MIN_ROUTE_BUDGET_MS = 750;

// Treat these upstream HTTP statuses as transport/geo failures worth retrying
// through a different route (proxy) rather than surfacing immediately.
const ROUTE_RETRYABLE_STATUS = new Set([403, 408, 418, 425, 429, 451, 500, 502, 503, 504, 520, 521, 522, 523, 524]);

// ── Pure backoff helper (exported for tests) ─────────────────────────────────

const PROXY_BASE_DELAY_MS = 500;
const PROXY_MAX_DELAY_MS = 30_000;

export function computeBackoffMs(failureCount: number): number {
  const exp = PROXY_BASE_DELAY_MS * 2 ** Math.max(0, failureCount);
  return Math.min(PROXY_MAX_DELAY_MS, exp) + Math.floor(Math.random() * 250);
}

// ── Proxy health state (per proxyId) ─────────────────────────────────────────

interface ProxyHealth {
  failureCount: number;
  cooldownUntil: number; // epoch ms; 0 = healthy
  lastUsed: number;
}

const proxyHealth = new Map<string, ProxyHealth>();
const dispatcherCache = new Map<string, Dispatcher>();
let directDispatcher: Dispatcher | undefined;

function getHealth(id: string): ProxyHealth {
  let h = proxyHealth.get(id);
  if (!h) {
    h = { failureCount: 0, cooldownUntil: 0, lastUsed: 0 };
    proxyHealth.set(id, h);
  }
  return h;
}

function isHealthy(id: string, now: number): boolean {
  const h = proxyHealth.get(id);
  return !h || h.cooldownUntil <= now;
}

function recordProxySuccess(id: string): void {
  const h = getHealth(id);
  h.failureCount = 0;
  h.cooldownUntil = 0;
  h.lastUsed = Date.now();
}

function recordProxyFailure(id: string): void {
  const h = getHealth(id);
  h.failureCount += 1;
  h.cooldownUntil = Date.now() + computeBackoffMs(h.failureCount);
  h.lastUsed = Date.now();
}

/**
 * Ordered list of route attempts for this call: 'direct' plus healthy proxies,
 * least-recently-used first so load spreads across the pool.
 */
function buildAttemptOrder(now: number): string[] {
  const mode = activeMode();
  if (mode === 'off' || mode === 'direct_only') return ['direct'];
  const pool = activePool();
  const configured = pool.length ? pool : (mode === 'auto' ? SMART_FALLBACK_ROUTES : []);
  const healthyProxies = configured.filter((p) => isHealthy(p, now)).sort(
    (a, b) => getHealth(a).lastUsed - getHealth(b).lastUsed
  );
  // If every proxy is cooling down, allow the single least-bad one as a last resort.
  const proxies =
    healthyProxies.length > 0
      ? healthyProxies
      : configured.slice().sort(
          (a, b) => getHealth(a).cooldownUntil - getHealth(b).cooldownUntil
        ).slice(0, 1);

  if (mode === 'manual') return proxies;
  if (!proxies.length) return ['direct'];
  if (mode === 'proxy_first') return [...proxies, 'direct'];
  // auto and direct_first are intentionally direct-first. Proxy routes are
  // therefore never touched when the provider is reachable directly.
  return ['direct', ...proxies];
}

function dispatcherFor(route: string): Dispatcher | undefined {
  if (route === 'direct') {
    const undici = loadUndici();
    if (!undici?.Agent) return undefined;
    if (!directDispatcher) {
      directDispatcher = new undici.Agent({
        connect: {
          lookup: directDnsLookup,
          autoSelectFamily: true,
          autoSelectFamilyAttemptTimeout: 250,
        },
      });
    }
    return directDispatcher;
  }
  const undici = loadUndici();
  let d = dispatcherCache.get(route);
  if (!d) {
    if (isSocksProxyRoute(route)) {
      const SocksProxyAgent = loadSocksProxyAgent();
      if (!SocksProxyAgent) throw new Error('missing_optional_dependency:socks-proxy-agent');
      d = new SocksProxyAgent(route) as unknown as Dispatcher;
    } else {
      if (!undici?.ProxyAgent) throw new Error('missing_optional_dependency:undici');
      d = new undici.ProxyAgent({ uri: route, proxyTunnel: true });
    }
    dispatcherCache.set(route, d);
  }
  return d;
}


// Node's global `fetch` embeds its own bundled (older) undici request-handler
// interface. When a dispatcher is constructed from the optional local `undici`
// package (a different, independently-versioned copy in node_modules), passing
// it to the *global* fetch throws `UND_ERR_INVALID_ARG: invalid onRequestStart
// method` — the two undici copies' internal Dispatcher/Handler contracts don't
// match across versions. The fix is to always dispatch through the same
// undici module that produced the dispatcher (its own `fetch` export), and
// only fall back to Node's global fetch when no local dispatcher was built.
// ---------------------------------------------------------------------------
// Test-only fetch seam (CP28 Task 0B, fork (b)).
//
// The `undici.fetch` dispatch below is load-bearing for production correctness
// (see the comment above), but it has an observability cost: for every route
// backed by a real Undici Dispatcher — the `direct` route (`undici.Agent`, built
// in dispatcherFor) and every HTTP/HTTPS proxy-pool route (`undici.ProxyAgent`) —
// the ambient `globalThis.fetch` binding is never consulted. A test or QA script
// that stubs `globalThis.fetch` to simulate provider failure/latency/timeout on
// those routes therefore exercises the REAL network instead, with no error, no
// warning, and a green result.
//
// This seam closes that hole without changing production behaviour by one byte:
// it is completely inert unless the process is explicitly a test runtime.
// `__setProxyFetchImpl` is the import-order-independent, deterministic path and
// is what regression tests and the mockability guard should use. The ambient
// `globalThis.fetch` detection is a best-effort convenience so existing tests
// that stub the global keep working project-wide without having to know which
// internal branch of fetchImplFor their request happens to take; it can only
// detect a stub installed AFTER this module was first imported.
// ---------------------------------------------------------------------------
const nativeGlobalFetch: typeof fetch = fetch;
let fetchOverride: typeof fetch | undefined;

function isTestFetchSeamEnabled(): boolean {
  return Boolean(process.env.VITEST) || process.env.APEX_TEST_FETCH_SEAM === '1';
}

/**
 * Test-only. Installs a fetch implementation used by EVERY route regardless of
 * dispatcher kind. Throws outside a test runtime so shipped code can never
 * redirect real outbound traffic through an injected implementation.
 */
export function __setProxyFetchImpl(impl: typeof fetch | undefined): void {
  if (!isTestFetchSeamEnabled()) {
    throw new Error('proxy_fetch_seam_forbidden: __setProxyFetchImpl requires VITEST or APEX_TEST_FETCH_SEAM=1');
  }
  fetchOverride = impl;
}

/** Test-only. Restores real transport selection. */
export function __resetProxyFetchImpl(): void {
  fetchOverride = undefined;
}

/** Test-only introspection, used by scripts/qa/verifyProxyFetchMockability.mjs. */
export function __proxyFetchSeamStatus(): { enabled: boolean; overrideInstalled: boolean; ambientStubDetected: boolean } {
  return {
    enabled: isTestFetchSeamEnabled(),
    overrideInstalled: fetchOverride !== undefined,
    ambientStubDetected: globalThis.fetch !== nativeGlobalFetch,
  };
}

function testSeamFetch(): typeof fetch | undefined {
  if (!isTestFetchSeamEnabled()) return undefined;
  if (fetchOverride) return fetchOverride;
  if (globalThis.fetch !== nativeGlobalFetch) return globalThis.fetch;
  return undefined;
}

function fetchImplFor(dispatcher: Dispatcher | undefined): typeof fetch {
  const seam = testSeamFetch();
  if (seam) return seam;
  if (!dispatcher) return fetch;
  // socks-proxy-agent is a Node HTTP Agent, not an Undici Dispatcher.
  // Passing it as `dispatcher` fails before any SOCKS connection is made.
  if (typeof dispatcher.addRequest === 'function') {
    return ((input: string | URL | Request, init: RequestInit = {}) => fetchThroughSocks(String(input), init, dispatcher)) as typeof fetch;
  }
  const undici = loadUndici();
  return typeof undici?.fetch === 'function' ? (undici.fetch as typeof fetch) : fetch;
}

/** Node HTTP transport for the existing SOCKS agent; TLS validation stays enabled. */
function fetchThroughSocks(url: string, init: RequestInit, agent: any, redirects = 0): Promise<Response> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(target, {
      agent, method: init.method, headers: Object.fromEntries(new Headers(init.headers)), signal: init.signal ?? undefined,
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
        res.resume();
        if (redirects >= 5) { reject(new Error('too_many_redirects')); return; }
        const next = new URL(res.headers.location, target);
        if (!['http:', 'https:'].includes(next.protocol)) { reject(new Error('invalid_redirect_protocol')); return; }
        const headers = new Headers(init.headers);
        if (next.origin !== target.origin) { headers.delete('authorization'); headers.delete('cookie'); }
        const switchToGet = res.statusCode === 303 || ([301, 302].includes(res.statusCode!) && init.method === 'POST');
        if (switchToGet) { headers.delete('content-type'); headers.delete('content-length'); }
        resolve(fetchThroughSocks(next.href, { ...init, headers, ...(switchToGet ? { method: 'GET', body: undefined } : {}) }, agent, redirects + 1));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
          else if (value !== undefined) headers.set(key, String(value));
        }
        const status = res.statusCode || 502;
        try {
          let payload = Buffer.concat(chunks);
          const encoding = headers.get('content-encoding');
          if (payload.length && encoding === 'gzip') payload = gunzipSync(payload);
          if (payload.length && encoding === 'deflate') payload = inflateSync(payload);
          if (payload.length && encoding === 'br') payload = brotliDecompressSync(payload);
          resolve(new Response([204, 205, 304].includes(status) || init.method === 'HEAD' ? null : payload, { status, headers }));
        } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    if (init.body != null) req.write(init.body);
    req.end();
  });
}

function describeFetchError(err: any): string {
  const parts = [err?.message || 'transport_error'];
  const append = (value: any) => {
    if (!value) return;
    if (value.code) parts.push(String(value.code));
    if (value.errno && value.errno !== value.code) parts.push(String(value.errno));
    if (value.syscall) parts.push(String(value.syscall));
    if (value.hostname) parts.push(String(value.hostname));
    if (value.address) parts.push(String(value.address));
  };
  // Node HTTP agents (including socks-proxy-agent) often put the useful code on
  // the top-level error, while undici usually nests it under cause. Preserve both
  // so diagnostics can distinguish DNS, refused tunnel, TLS, and timeout faults.
  append(err);
  append(err?.cause);
  append(err?.cause?.cause);
  return [...new Set(parts.filter(Boolean))].join(' ');
}

// ── Warning throttle ─────────────────────────────────────────────────────────

const WARN_THROTTLE_MS = 60_000;
const lastWarn = new Map<string, number>();

function throttledWarn(key: string, msg: string): void {
  const now = Date.now();
  const prev = lastWarn.get(key) || 0;
  if (now - prev >= WARN_THROTTLE_MS) {
    lastWarn.set(key, now);
    console.warn(msg);
  }
}

// ── Adaptive governor, in-flight dedup, short-TTL cache ──────────────────────
//
// A single FIFO queue caused background scanner fan-out to block interactive
// charts and historical backtests. This governor uses three traffic classes,
// reserves capacity for user-facing work, sheds excess background work early,
// and reuses a recently verified cached response during short transport gaps.

export type SmartFetchPriority = 'critical' | 'interactive' | 'background';
export type SmartFetchCacheMode = 'none' | 'fresh' | 'stale-if-error';

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  const value = Number.isFinite(raw) ? raw : fallback;
  return Math.max(min, Math.min(max, value));
}

const GOVERNOR_MAX_CONCURRENCY = envNumber('PROXY_MAX_CONCURRENCY', 6, 2, 16);
const GOVERNOR_RESERVED_INTERACTIVE = envNumber(
  'PROXY_RESERVED_INTERACTIVE',
  2,
  1,
  Math.max(1, GOVERNOR_MAX_CONCURRENCY - 1),
);
const GOVERNOR_BACKGROUND_CONCURRENCY = envNumber(
  'PROXY_BACKGROUND_CONCURRENCY',
  Math.max(1, GOVERNOR_MAX_CONCURRENCY - GOVERNOR_RESERVED_INTERACTIVE),
  1,
  Math.max(1, GOVERNOR_MAX_CONCURRENCY - GOVERNOR_RESERVED_INTERACTIVE),
);
const GOVERNOR_MAX_QUEUE = envNumber('PROXY_MAX_QUEUE', 80, 8, 500);
const GOVERNOR_BACKGROUND_MAX_QUEUE = envNumber('PROXY_BACKGROUND_MAX_QUEUE', 12, 2, GOVERNOR_MAX_QUEUE);
const GOVERNOR_QUEUE_TIMEOUT_CRITICAL_MS = envNumber('PROXY_QUEUE_TIMEOUT_CRITICAL_MS', 8_000, 1_000, 60_000);
const GOVERNOR_QUEUE_TIMEOUT_INTERACTIVE_MS = envNumber('PROXY_QUEUE_TIMEOUT_INTERACTIVE_MS', 5_000, 750, 30_000);
const GOVERNOR_QUEUE_TIMEOUT_BACKGROUND_MS = envNumber('PROXY_QUEUE_TIMEOUT_BACKGROUND_MS', 1_250, 250, 10_000);
const GOVERNOR_LOG = process.env.PROXY_DEBUG_LOG === 'true';

const CACHE_TTL_TICKER_MS = envNumber('CACHE_TTL_TICKER_MS', 4_000, 0, 300_000);
const CACHE_TTL_KLINES_MS = envNumber('CACHE_TTL_KLINES_MS', 10_000, 0, 300_000);
const CACHE_TTL_DEPTH_MS = envNumber('CACHE_TTL_DEPTH_MS', 4_000, 0, 300_000);
const CACHE_TTL_PREMIUM_MS = envNumber('CACHE_TTL_PREMIUM_MS', 8_000, 0, 300_000);
const CACHE_TTL_DEFAULT_MS = envNumber('CACHE_TTL_DEFAULT_MS', 5_000, 0, 300_000);
const STALE_CACHE_GRACE_MS = envNumber('CACHE_STALE_GRACE_MS', 45_000, 0, 900_000);

const UPSTREAM_FAILURE_THRESHOLD = envNumber('UPSTREAM_CIRCUIT_FAILURE_THRESHOLD', 3, 2, 20);
const UPSTREAM_CIRCUIT_BASE_MS = envNumber('UPSTREAM_CIRCUIT_BASE_MS', 20_000, 5_000, 300_000);
const UPSTREAM_CIRCUIT_MAX_MS = envNumber('UPSTREAM_CIRCUIT_MAX_MS', 120_000, UPSTREAM_CIRCUIT_BASE_MS, 900_000);

function ttlForUrl(url: string, override?: number): number {
  if (Number.isFinite(override) && Number(override) >= 0) return Number(override);
  const u = url.toLowerCase();
  if (u.includes('kline') || u.includes('candle')) return CACHE_TTL_KLINES_MS;
  if (u.includes('depth') || u.includes('level2') || u.includes('orderbook') || u.includes('order-book')) return CACHE_TTL_DEPTH_MS;
  if (u.includes('premium') || u.includes('funding')) return CACHE_TTL_PREMIUM_MS;
  if (u.includes('ticker')) return CACHE_TTL_TICKER_MS;
  return CACHE_TTL_DEFAULT_MS;
}

function inferPriority(url: string, opts: SmartFetchOptions): SmartFetchPriority {
  if (opts.priority) return opts.priority;
  const key = `${opts.logKey || ''} ${url}`.toLowerCase();
  if (/backtest|historical|order-submit|order-preview|account-snapshot/.test(key)) return 'critical';
  if (/ticker_24hr_bulk|premium_index_bulk|contracts[_-]active|short[_-]hunter|openinterest|universe|scanner|candidate/.test(key)) return 'background';
  return 'interactive';
}

function warningGroup(logKey: string, url: string): string {
  const key = `${logKey} ${url}`.toLowerCase();
  if (key.includes('binance')) return key.includes('bulk') || key.includes('premium') ? 'binance:bulk' : 'binance:market';
  if (key.includes('kucoin')) return key.includes('contracts_active') || key.includes('contracts-active') ? 'kucoin:bulk' : 'kucoin:market';
  if (key.includes('hf_space2') || key.includes('hf_space_2')) return 'hf_space2';
  if (key.includes('hf_space4') || key.includes('hf_space_4')) return 'hf_space4';
  try { return new URL(url).hostname; } catch { return logKey.split(':').slice(0, 2).join(':') || 'upstream'; }
}

function circuitKeyFor(logKey: string, url: string): string {
  return warningGroup(logKey, url);
}

interface CacheEntry {
  result: SmartFetchResult;
  storedAt: number;
  expiresAt: number;
}

interface UpstreamCircuit {
  failures: number;
  openUntil: number;
  lastFailureAt: number;
  nextCriticalProbeAt: number;
}

const responseCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<SmartFetchResult>>();
const upstreamCircuits = new Map<string, UpstreamCircuit>();

function isRetryableFailure(result: SmartFetchResult): boolean {
  if (result.ok) return false;
  if (ROUTE_RETRYABLE_STATUS.has(result.status)) return true;
  if (!result.error) return result.status === 0 || result.status >= 500;
  return result.status === 0 || /transport_error|timeout|aborted|bad_json|budget_exhausted|http_5\d\d/i.test(result.error);
}

function getUsableCachedResult(key: string, staleGraceMs = STALE_CACHE_GRACE_MS, now = Date.now()): SmartFetchResult | null {
  const cached = responseCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt > now) return { ...cached.result, stale: false, cacheAgeMs: now - cached.storedAt };
  if (now - cached.expiresAt <= staleGraceMs) {
    return { ...cached.result, stale: true, cacheAgeMs: now - cached.storedAt, governorReason: 'stale_cache_fallback' };
  }
  return null;
}

function recordUpstreamSuccess(key: string): void {
  upstreamCircuits.delete(key);
}

function recordUpstreamFailure(key: string): void {
  const now = Date.now();
  const previous = upstreamCircuits.get(key);
  const withinWindow = previous && now - previous.lastFailureAt < 60_000;
  const failures = withinWindow ? previous.failures + 1 : 1;
  const exponent = Math.max(0, failures - UPSTREAM_FAILURE_THRESHOLD);
  const cooldown = failures >= UPSTREAM_FAILURE_THRESHOLD
    ? Math.min(UPSTREAM_CIRCUIT_MAX_MS, UPSTREAM_CIRCUIT_BASE_MS * 2 ** exponent)
    : 0;
  upstreamCircuits.set(key, {
    failures,
    openUntil: cooldown ? now + cooldown : 0,
    lastFailureAt: now,
    nextCriticalProbeAt: previous?.nextCriticalProbeAt || 0,
  });
}

function isCircuitOpen(key: string, priority: SmartFetchPriority, now = Date.now()): boolean {
  const circuit = upstreamCircuits.get(key);
  if (!circuit || circuit.openUntil <= now) return false;
  if (priority === 'critical' && circuit.nextCriticalProbeAt <= now) {
    circuit.nextCriticalProbeAt = now + 5_000;
    return false;
  }
  return true;
}

interface QueueEntry {
  priority: SmartFetchPriority;
  sequence: number;
  grant: () => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

let activeCount = 0;
let activeBackgroundCount = 0;
let queueSequence = 0;
const waitQueue: QueueEntry[] = [];

function priorityRank(priority: SmartFetchPriority): number {
  return priority === 'critical' ? 0 : priority === 'interactive' ? 1 : 2;
}

function canRun(priority: SmartFetchPriority): boolean {
  if (activeCount >= GOVERNOR_MAX_CONCURRENCY) return false;
  if (priority === 'background' && activeBackgroundCount >= GOVERNOR_BACKGROUND_CONCURRENCY) return false;
  return true;
}

function queueCount(priority: SmartFetchPriority): number {
  return waitQueue.reduce((count, entry) => count + (entry.priority === priority ? 1 : 0), 0);
}

function queueTimeoutFor(priority: SmartFetchPriority, requestBudgetMs: number): number {
  const configured = priority === 'critical'
    ? GOVERNOR_QUEUE_TIMEOUT_CRITICAL_MS
    : priority === 'interactive'
      ? GOVERNOR_QUEUE_TIMEOUT_INTERACTIVE_MS
      : GOVERNOR_QUEUE_TIMEOUT_BACKGROUND_MS;
  return Math.max(250, Math.min(configured, Math.max(250, requestBudgetMs - MIN_ROUTE_BUDGET_MS)));
}

function sortQueue(): void {
  waitQueue.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.sequence - b.sequence);
}

function drainQueue(): void {
  sortQueue();
  while (activeCount < GOVERNOR_MAX_CONCURRENCY && waitQueue.length) {
    const index = waitQueue.findIndex((entry) => canRun(entry.priority));
    if (index < 0) break;
    const [next] = waitQueue.splice(index, 1);
    clearTimeout(next.timeoutHandle);
    next.grant();
  }
}

function acquireSlot(priority: SmartFetchPriority, timeoutMs: number): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const grant = () => {
      activeCount += 1;
      if (priority === 'background') activeBackgroundCount += 1;
      resolve(() => releaseSlot(priority));
    };
    if (canRun(priority)) {
      grant();
      return;
    }
    if (priority === 'background' && queueCount('background') >= GOVERNOR_BACKGROUND_MAX_QUEUE) {
      reject(new Error('backpressure'));
      return;
    }
    if (waitQueue.length >= GOVERNOR_MAX_QUEUE) {
      reject(new Error(priority === 'background' ? 'backpressure' : 'queue_full'));
      return;
    }
    const entry: QueueEntry = {
      priority,
      sequence: queueSequence++,
      grant,
      reject,
      timeoutHandle: setTimeout(() => {
        const index = waitQueue.indexOf(entry);
        if (index !== -1) waitQueue.splice(index, 1);
        reject(new Error(priority === 'background' ? 'backpressure' : 'queue_timeout'));
      }, timeoutMs),
    };
    waitQueue.push(entry);
    sortQueue();
  });
}

function releaseSlot(priority: SmartFetchPriority): void {
  activeCount = Math.max(0, activeCount - 1);
  if (priority === 'background') activeBackgroundCount = Math.max(0, activeBackgroundCount - 1);
  drainQueue();
}

function governorCacheKey(url: string, opts: SmartFetchOptions): string {
  if (opts.cacheKey) return `custom:${opts.cacheKey}`;
  const method = String(opts.method || 'GET').toUpperCase();
  const headers = Object.entries(opts.headers || {})
    .map(([key, value]) => [key.toLowerCase(), String(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const material = JSON.stringify({
    method,
    url,
    body: opts.body || '',
    headers,
    authScope: opts.authScope || '',
  });
  return createHash('sha256').update(material).digest('hex');
}

function cachePolicyFor(opts: SmartFetchOptions): {
  method: string;
  mode: SmartFetchCacheMode;
  deduplicate: boolean;
} {
  const method = String(opts.method || 'GET').toUpperCase();
  const idempotent = method === 'GET' || method === 'HEAD';
  const mode = opts.cacheMode || (idempotent ? 'stale-if-error' : 'none');
  return {
    method,
    mode,
    deduplicate: opts.deduplicate ?? idempotent,
  };
}

export function getGovernorStats(): {
  maxConcurrency: number;
  backgroundConcurrency: number;
  active: number;
  activeBackground: number;
  queued: number;
  queuedCritical: number;
  queuedInteractive: number;
  queuedBackground: number;
  cacheSize: number;
  inFlight: number;
  openCircuits: number;
} {
  const now = Date.now();
  return {
    maxConcurrency: GOVERNOR_MAX_CONCURRENCY,
    backgroundConcurrency: GOVERNOR_BACKGROUND_CONCURRENCY,
    active: activeCount,
    activeBackground: activeBackgroundCount,
    queued: waitQueue.length,
    queuedCritical: queueCount('critical'),
    queuedInteractive: queueCount('interactive'),
    queuedBackground: queueCount('background'),
    cacheSize: responseCache.size,
    inFlight: inFlight.size,
    openCircuits: [...upstreamCircuits.values()].filter((circuit) => circuit.openUntil > now).length,
  };
}

export function clearGovernorCache(): void {
  responseCache.clear();
}

// ── Public result type ───────────────────────────────────────────────────────

export interface SmartFetchResult {
  ok: boolean;
  status: number;
  json: any | null;
  route: 'direct' | string;
  error?: string;
  stale?: boolean;
  cacheAgeMs?: number;
  governorReason?: string;
}

export interface SmartFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  logKey?: string;
  proxyOnly?: boolean;
  body?: string;
  priority?: SmartFetchPriority;
  /** GET/HEAD default to stale-if-error; mutating methods default to none. */
  cacheMode?: SmartFetchCacheMode;
  /** Override the derived key when the caller owns a safe semantic key. */
  cacheKey?: string;
  /** Non-secret caller/session scope when a response is identity-specific. */
  authScope?: string;
  /** GET/HEAD deduplicate by default; mutating methods do not. */
  deduplicate?: boolean;
  cacheTtlMs?: number;
  staleGraceMs?: number;
  circuitKey?: string;
}

export interface ProxyProviderProbeTarget {
  provider: string;
  url: string;
}

export interface ProxyProviderProbeResult {
  provider: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  route: 'direct' | 'proxy' | 'none';
  routeLabel: string;
  error: string | null;
}

function safeProxyRouteLabel(route: string): string {
  if (route === 'direct') return 'Direct network';
  try {
    const url = new URL(route);
    return `${url.protocol}//${url.host}`;
  } catch {
    return 'Configured proxy';
  }
}

function probeOrderForConfig(config: ProxyConfig): string[] {
  if (config.mode === 'off') return ['direct'];
  if (config.mode === 'manual') return config.address ? [config.address] : [];
  const environmentRoutes = PROXY_POOL.length ? PROXY_POOL : SMART_FALLBACK_ROUTES;
  return ['direct', ...environmentRoutes];
}

/** Browser-safe policy projection used by regression tests and operator UI copy. */
export function proxyProbeRouteKinds(value: unknown): Array<'direct' | 'proxy'> {
  const config = normalizeProxyConfig(value);
  return probeOrderForConfig(config).map((route) => route === 'direct' ? 'direct' : 'proxy');
}

/**
 * Test an unsaved proxy draft against fixed server-selected providers without
 * mutating runtime routing. Manual mode never falls back to direct; Off never
 * tries a proxy; Auto remains direct-first.
 */
export async function probeProxyConfiguration(
  value: unknown,
  targets: readonly ProxyProviderProbeTarget[],
  timeoutMs = 8_000,
): Promise<{ config: ProxyConfig; checkedAt: number; results: ProxyProviderProbeResult[] }> {
  const config = normalizeProxyConfig(value);
  const routes = probeOrderForConfig(config);
  const results = await Promise.all(targets.map(async (target): Promise<ProxyProviderProbeResult> => {
    const startedAt = Date.now();
    let last: ProxyProviderProbeResult = {
      provider: target.provider,
      ok: false,
      status: 0,
      latencyMs: 0,
      route: 'none',
      routeLabel: routes.length ? safeProxyRouteLabel(routes[0]) : 'No permitted route',
      error: routes.length ? 'probe_failed' : 'manual_proxy_not_configured',
    };
    const deadline = startedAt + Math.max(2_000, timeoutMs);
    for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
      const route = routes[routeIndex];
      const remaining = deadline - Date.now();
      if (remaining < MIN_ROUTE_BUDGET_MS) break;
      const hasLaterFallback = route === 'direct' && routes.slice(routeIndex + 1).some((candidate) => candidate !== 'direct');
      const routeBudget = Math.min(
        timeoutForRoute(route, timeoutMs),
        hasLaterFallback ? DIRECT_WITH_PROXY_TIMEOUT_MS : remaining,
        remaining,
      );
      if (routeBudget < MIN_ROUTE_BUDGET_MS) break;
      try {
        const dispatcher = dispatcherFor(route);
        const fetchImpl = fetchImplFor(dispatcher);
        const response = await fetchImpl(target.url, {
          method: 'GET',
          headers: { 'User-Agent': 'APEX-Trading-Engine/1.0', Accept: 'application/json' },
          signal: AbortSignal.timeout(routeBudget),
          // @ts-ignore Node/undici fetch accepts its matching dispatcher.
          ...(dispatcher ? { dispatcher } : {}),
        });
        await response.arrayBuffer().catch(() => undefined);
        last = {
          provider: target.provider,
          ok: response.ok,
          status: response.status,
          latencyMs: Date.now() - startedAt,
          route: route === 'direct' ? 'direct' : 'proxy',
          routeLabel: safeProxyRouteLabel(route),
          error: response.ok ? null : `http_${response.status}`,
        };
        if (response.ok || config.mode !== 'auto') return last;
      } catch (error) {
        last = {
          provider: target.provider,
          ok: false,
          status: 0,
          latencyMs: Date.now() - startedAt,
          route: route === 'direct' ? 'direct' : 'proxy',
          routeLabel: safeProxyRouteLabel(route),
          error: describeFetchError(error),
        };
        if (config.mode !== 'auto') return last;
      }
    }
    return last;
  }));
  return { config, checkedAt: Date.now(), results };
}

/**
 * Fetch JSON with direct-first then proxy-pool rotation.
 * Returns a structured result; never throws on network failure.
 * This is the raw network call — use `smartFetchJson` (below) in application
 * code; it adds concurrency limiting, in-flight dedup, and short-TTL caching
 * on top of this.
 */
async function smartFetchJsonRaw(
  url: string,
  opts: SmartFetchOptions = {}
): Promise<SmartFetchResult> {
  const { method = 'GET', headers = {}, timeoutMs = 20_000, logKey = url, proxyOnly = false, body } = opts;
  const now = Date.now();
  const revision = proxyConfigRevision;
  let order = buildAttemptOrder(now);
  if (proxyOnly && order.some((route) => route !== 'direct')) {
    order = order.filter((route) => route !== 'direct');
  }

  let last: SmartFetchResult = {
    ok: false,
    status: 0,
    json: null,
    route: 'direct',
    error: proxyConfigurationError ? 'invalid_proxy_configuration' : activeMode() === 'manual' ? 'manual_proxy_not_configured' : 'no_route',
  };

  // timeoutMs is the budget for the whole call, not per route: a retryable
  // status followed by a hanging fallback route must not stack timeouts.
  const deadline = now + timeoutMs;
  const remainingBudget = () => deadline - Date.now();

  for (let routeIndex = 0; routeIndex < order.length; routeIndex += 1) {
    if (revision !== proxyConfigRevision) return { ...last, error: 'proxy_configuration_changed' };
    const route = order[routeIndex];
    const hasLaterFallback = route === 'direct' && order.slice(routeIndex + 1).some((candidate) => candidate !== 'direct');
    const routeBudget = Math.min(
      timeoutForRoute(route, timeoutMs),
      hasLaterFallback ? DIRECT_WITH_PROXY_TIMEOUT_MS : remainingBudget(),
      remainingBudget(),
    );
    if (routeBudget < MIN_ROUTE_BUDGET_MS) {
      last = { ...last, error: last.error === 'no_route' ? 'budget_exhausted' : last.error };
      break;
    }
    let dispatcher: Dispatcher | undefined;
    let fetchImpl: typeof fetch = fetch;
    try {
      dispatcher = dispatcherFor(route);
      fetchImpl = fetchImplFor(dispatcher);
      const res = await fetchImpl(url, {
        method,
        headers: {
          'User-Agent': 'APEX-Trading-Engine/1.0',
          Accept: 'application/json',
          ...headers,
        },
        body,
        signal: AbortSignal.timeout(routeBudget),
        // @ts-ignore Node/undici fetch accepts an Undici Dispatcher; undefined uses the default dispatcher.
        ...(dispatcher ? { dispatcher } : {}),
      });

      if (res.ok) {
        let json: any = null;
        try {
          json = await res.json();
        } catch {
          last = { ok: false, status: res.status, json: null, route, error: 'bad_json' };
          if (route !== 'direct') recordProxyFailure(route);
          continue;
        }
        if (route !== 'direct') recordProxySuccess(route);
        return { ok: true, status: res.status, json, route };
      }

      // Non-OK. If it's a route-level failure (geo/transport), try the next route.
      last = { ok: false, status: res.status, json: null, route, error: `http_${res.status}` };
      if (route !== 'direct') recordProxyFailure(route);
      if (!ROUTE_RETRYABLE_STATUS.has(res.status)) {
        // A genuine application error (e.g. 400 bad symbol) — don't burn the pool.
        return last;
      }
    } catch (err: any) {
      last = {
        ok: false,
        status: 0,
        json: null,
        route,
        error: describeFetchError(err),
      };

      // If this looks like a DNS/ENOTFOUND-like transport failure, attempt a
      // small number of quick retries before giving up. This reduces spurious
      // cooldowns for transient resolver hiccups.
      const quickRetries = 2;
      const retryDelayMs = 300;
      const isDnsLike = (s: string | undefined) => {
        if (!s) return false;
        return /ENOTFOUND|getaddrinfo|EAI_AGAIN|ENETUNREACH|EAI_NONAME/i.test(s);
      };

      if (isDnsLike(last.error) && !hasLaterFallback) {
        for (let attempt = 1; attempt <= quickRetries; attempt++) {
          if (revision !== proxyConfigRevision || remainingBudget() < MIN_ROUTE_BUDGET_MS + retryDelayMs) break;
          await new Promise((r) => setTimeout(r, retryDelayMs));
          if (revision !== proxyConfigRevision) return { ...last, error: 'proxy_configuration_changed' };
          try {
            const retryRes = await fetchImpl(url, {
              method,
              headers: {
                'User-Agent': 'APEX-Trading-Engine/1.0',
                Accept: 'application/json',
                ...headers,
              },
              body,
              signal: AbortSignal.timeout(
                Math.max(MIN_ROUTE_BUDGET_MS, Math.min(routeBudget, remainingBudget())),
              ),
              // @ts-ignore Node/undici fetch accepts an Undici Dispatcher.
              ...(dispatcher ? { dispatcher } : {}),
            });

            if (retryRes.ok) {
              let json: any = null;
              try {
                json = await retryRes.json();
              } catch {
                last = { ok: false, status: retryRes.status, json: null, route, error: 'bad_json' };
                if (route !== 'direct') recordProxyFailure(route);
                break;
              }
              if (route !== 'direct') recordProxySuccess(route);
              return { ok: true, status: retryRes.status, json, route };
            }

            last = { ok: false, status: retryRes.status, json: null, route, error: `http_${retryRes.status}` };
            if (route !== 'direct') recordProxyFailure(route);
            if (!ROUTE_RETRYABLE_STATUS.has(retryRes.status)) return last;
          } catch (retryErr: any) {
            last = { ok: false, status: 0, json: null, route, error: describeFetchError(retryErr) };
            // continue to next quick attempt
          }
        }
      }

      if (route !== 'direct') recordProxyFailure(route);
    }
  }

  const priority = inferPriority(url, opts);
  if (priority !== 'background' || GOVERNOR_LOG) {
    throttledWarn(`${warningGroup(logKey, url)}:routes`, `[Proxy Route] all routes failed for ${warningGroup(logKey, url)}: ${last.error}`);
  }
  return last;
}

/**
 * Governed entry point used by all application code. Adds, on top of
 * `smartFetchJsonRaw`:
 *   - short-TTL cache for successful responses (endpoint-aware TTL)
 *   - in-flight de-duplication (identical concurrent requests share one call)
 *   - a bounded concurrency queue so a burst of panel mounts can't open more
 *     than PROXY_MAX_CONCURRENCY simultaneous tunnels through the proxy pool
 * Never throws; never caches a failed/errored/fabricated result.
 */
export async function smartFetchJson(
  url: string,
  opts: SmartFetchOptions = {}
): Promise<SmartFetchResult> {
  const key = `${proxyConfigRevision}:${governorCacheKey(url, opts)}`;
  const policy = cachePolicyFor(opts);
  const logKey = opts.logKey || url;
  const startedAt = Date.now();
  const requestBudgetMs = Math.max(1_000, Number(opts.timeoutMs || 20_000));
  const priority = inferPriority(url, opts);
  const cacheTtlMs = ttlForUrl(url, opts.cacheTtlMs);
  const cacheEnabled = policy.mode !== 'none' && cacheTtlMs > 0;
  const staleEnabled = cacheEnabled && policy.mode === 'stale-if-error';
  const staleGraceMs = staleEnabled && Number.isFinite(opts.staleGraceMs)
    ? Math.max(0, Number(opts.staleGraceMs))
    : staleEnabled ? STALE_CACHE_GRACE_MS : 0;
  const circuitKey = `${proxyConfigRevision}:${opts.circuitKey || circuitKeyFor(logKey, url)}`;

  const cached = cacheEnabled ? getUsableCachedResult(key, staleGraceMs) : null;
  if (cached && !cached.stale) {
    if (GOVERNOR_LOG) console.log(`[Governor] cache_hit key=${logKey} ageMs=${cached.cacheAgeMs || 0}`);
    return cached;
  }

  const existing = policy.deduplicate ? inFlight.get(key) : undefined;
  if (existing) {
    if (GOVERNOR_LOG) console.log(`[Governor] dedup key=${logKey}`);
    return existing;
  }

  if (isCircuitOpen(circuitKey, priority)) {
    if (cached) return { ...cached, governorReason: 'circuit_open_stale_cache' };
    return {
      ok: false,
      status: 0,
      json: null,
      route: 'direct',
      error: 'circuit_open',
      governorReason: circuitKey,
    };
  }

  const run = (async (): Promise<SmartFetchResult> => {
    let release: (() => void) | null = null;
    const queuedAt = Date.now();
    const queueTimeoutMs = queueTimeoutFor(priority, requestBudgetMs);
    try {
      release = await acquireSlot(priority, queueTimeoutMs);
    } catch (err: any) {
      const reason = ['queue_timeout', 'queue_full', 'backpressure'].includes(err?.message) ? err.message : 'queue_full';
      const stale = staleEnabled ? getUsableCachedResult(key, staleGraceMs) : null;
      if (stale) {
        if (GOVERNOR_LOG) console.log(`[Governor] stale_cache_hit key=${logKey} reason=${reason}`);
        return { ...stale, governorReason: reason };
      }
      if (priority !== 'background') {
        throttledWarn(
          `${warningGroup(logKey, url)}:queue`,
          `[Governor] ${reason} group=${warningGroup(logKey, url)} priority=${priority} queuedMs=${Date.now() - queuedAt} active=${activeCount} waiting=${waitQueue.length}`,
        );
      } else if (GOVERNOR_LOG) {
        console.log(`[Governor] shed_background key=${logKey} reason=${reason}`);
      }
      return {
        ok: false,
        status: 0,
        json: null,
        route: 'direct',
        error: reason,
        governorReason: priority,
      };
    }

    const queueMs = Date.now() - queuedAt;
    try {
      const remainingBudgetMs = requestBudgetMs - (Date.now() - startedAt);
      if (remainingBudgetMs < MIN_ROUTE_BUDGET_MS) {
        const stale = staleEnabled ? getUsableCachedResult(key, staleGraceMs) : null;
        if (stale) return { ...stale, governorReason: 'budget_exhausted_before_fetch' };
        return {
          ok: false,
          status: 0,
          json: null,
          route: 'direct',
          error: 'budget_exhausted_before_fetch',
          governorReason: priority,
        };
      }

      const fetchStartedAt = Date.now();
      const result = await smartFetchJsonRaw(url, { ...opts, timeoutMs: remainingBudgetMs, priority });
      if (GOVERNOR_LOG) {
        console.log(`[Governor] route=${result.route} ok=${result.ok} status=${result.status} priority=${priority} queueMs=${queueMs} fetchMs=${Date.now() - fetchStartedAt} key=${logKey}`);
      }

      if (result.ok) {
        const storedAt = Date.now();
        if (cacheEnabled) responseCache.set(key, { result, storedAt, expiresAt: storedAt + cacheTtlMs });
        recordUpstreamSuccess(circuitKey);
        return { ...result, stale: false, cacheAgeMs: 0 };
      }

      if (isRetryableFailure(result)) {
        recordUpstreamFailure(circuitKey);
        const stale = staleEnabled ? getUsableCachedResult(key, staleGraceMs) : null;
        if (stale) {
          if (GOVERNOR_LOG) console.log(`[Governor] stale_cache_hit key=${logKey} reason=${result.error || result.status}`);
          return { ...stale, governorReason: result.error || `http_${result.status}` };
        }
      }
      return result;
    } finally {
      release?.();
    }
  })();

  if (policy.deduplicate) inFlight.set(key, run);
  try {
    return await run;
  } finally {
    if (policy.deduplicate) inFlight.delete(key);
    if (GOVERNOR_LOG) console.log(`[Governor] done key=${logKey} totalMs=${Date.now() - startedAt}`);
  }
}

// ── State maintenance (memory-leak prevention) ───────────────────────────────

export function pruneProxyState(): void {
  const now = Date.now();
  const STALE_MS = 30 * 60_000;
  for (const [id, h] of proxyHealth) {
    if (h.cooldownUntil <= now && now - h.lastUsed > STALE_MS) proxyHealth.delete(id);
  }
  for (const [k, t] of lastWarn) {
    if (now - t > STALE_MS) lastWarn.delete(k);
  }
  for (const [k, entry] of responseCache) {
    if (entry.expiresAt + STALE_CACHE_GRACE_MS <= now) responseCache.delete(k);
  }
  for (const [k, circuit] of upstreamCircuits) {
    if (circuit.openUntil <= now && now - circuit.lastFailureAt > STALE_MS) upstreamCircuits.delete(k);
  }
  for (const [hostname, entry] of smartDnsCache) {
    if (entry.expiresAt <= now) smartDnsCache.delete(hostname);
  }
}

/**
 * Human-readable reason for a transport failure (status 0), including what the
 * operator should check. Surfaced in provider `reason` fields so the
 * Intelligence panel explains itself instead of just saying "Request timeout".
 */
export function describeUpstreamUnreachable(host: string, error?: string | null): string {
  const pool = getProxyPoolInfo();
  const detail = String(error || '').slice(0, 120);
  if (pool.poolSize === 0 && pool.discoveryRoutes === 0) {
    return `${host} unreachable on the direct network. Start the local proxy or configure PROXY_POOL_URLS/SOCKS5_PROXY, then restart the server.${detail ? ` (${detail})` : ''}`;
  }
  if (pool.poolSize === 0 && pool.discoveryRoutes > 0) {
    return `${host} unreachable directly, and none of the ${pool.discoveryRoutes} lazy loopback proxy candidates were reachable.${detail ? ` (${detail})` : ''}`;
  }
  if (pool.healthy === 0) {
    return `${host} unreachable — all ${pool.poolSize} proxy routes are cooling down. Check that your local proxy on port 10808 is running.${detail ? ` (${detail})` : ''}`;
  }
  return `${host} unreachable via proxy (${pool.healthy}/${pool.poolSize} healthy).${detail ? ` (${detail})` : ''}`;
}

export function getProxyPoolInfo(): {
  mode: string;
  poolSize: number;
  healthy: number;
  maxConcurrency: number;
  smartDns: 'off' | 'auto' | 'always';
  smartProxyDiscovery: boolean;
  discoveryRoutes: number;
  configurationError: string | null;
  routes: Array<{
    address: string;
    transport: 'socks5' | 'http';
    healthy: boolean;
    failureCount: number;
    cooldownUntil: number;
    lastUsed: number | null;
  }>;
} {
  const now = Date.now();
  const routes = activePool().map((route) => {
    const health = proxyHealth.get(route);
    return {
      address: safeProxyRouteLabel(route),
      transport: isSocksProxyRoute(route) ? 'socks5' as const : 'http' as const,
      healthy: isHealthy(route, now),
      failureCount: health?.failureCount ?? 0,
      cooldownUntil: health?.cooldownUntil ?? 0,
      lastUsed: health?.lastUsed ? health.lastUsed : null,
    };
  });
  return {
    mode: activeMode(),
    configurationError: proxyConfigurationError,
    poolSize: activePool().length,
    healthy: activePool().filter((p) => isHealthy(p, now)).length,
    maxConcurrency: GOVERNOR_MAX_CONCURRENCY,
    smartDns: SMART_DNS_MODE === 'off' || SMART_DNS_MODE === 'always' ? SMART_DNS_MODE : 'auto',
    smartProxyDiscovery: activeMode() === 'auto' && activePool().length === 0 && SMART_FALLBACK_ROUTES.length > 0,
    discoveryRoutes: activeMode() === 'auto' && activePool().length === 0 ? SMART_FALLBACK_ROUTES.length : 0,
    routes,
  };
}
