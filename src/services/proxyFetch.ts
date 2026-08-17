/* Copied from apex-trading-engine/src/services/proxyFetch.ts */

/**
 * proxyFetch.ts — Smart direct/proxy fetch with health-based rotation.
 *
 * NODE-ONLY. Imported exclusively by server.ts. Never import from the browser
 * bundle (it requires `undici`).
 *
 * Behaviour (per spec):
 *   1. In auto mode, try a detected local loopback proxy first, then direct.
 *   2. On a network/transport failure (or geo-block 451/403), fall through to
 *      the configured proxy pool, rotating by health.
 *   3. Track failures per proxy (proxyId). Unhealthy proxies are temporarily
 *      skipped with exponential backoff.
 *   4. Bounded attempts; never an unbounded retry storm.
 *   5. Repeated identical warnings are throttled.
 *
 * It does NOT add API keys, does NOT authenticate, does NOT fabricate data.
 */

import dns from 'node:dns';
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

const PROXY_MODE = (process.env.PROXY_MODE || 'auto').trim().toLowerCase();

/** HTTP(S) CONNECT proxy URL for undici ProxyAgent. */
export function normalizeProxyUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^socks5h?:\/\//i.test(trimmed)) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // host:port shorthand — e.g. 127.0.0.1:10808
  if (/^[\w.-]+:\d+$/.test(trimmed)) return `http://${trimmed}`;
  return trimmed;
}

/** SOCKS5 proxy URL for socks-proxy-agent (NewsAPI and geo-blocked providers). */
export function normalizeSocksProxyUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^socks5h?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+:\d+$/.test(trimmed)) return `socks5://${trimmed}`;
  return trimmed;
}

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
  pushCsv(process.env.HTTPS_PROXY);
  pushCsv(process.env.HTTP_PROXY);
  pushCsv(process.env.ALL_PROXY);

  const socks = (process.env.SOCKS5_PROXY || process.env.SOCKS_PROXY_URL || process.env.SOCKS_PROXY || '').trim();
  if (socks) {
    const socksUrl = normalizeSocksProxyUrl(socks.startsWith('socks') ? socks : socks);
    if (socksUrl) {
      candidates.push(socksUrl);
      // Many local clients (Clash/V2Ray) expose HTTP CONNECT on the same host:port as SOCKS5.
      if (process.env.APEX_SOCKS_HTTP_FALLBACK !== 'false') {
        const hostPort = socksUrl.replace(/^socks5h?:\/\//i, '');
        if (hostPort) candidates.push(`http://${hostPort}`);
      }
    }
  }

  const localPort = (process.env.APEX_LOCAL_PROXY_PORT || process.env.LOCAL_PROXY_PORT || '').trim();
  if (localPort && /^\d+$/.test(localPort)) {
    candidates.push(`http://127.0.0.1:${localPort}`);
  }

  // Release archives intentionally do not ship a populated .env. Windows APEX
  // setups commonly expose either SOCKS5 or HTTP CONNECT on loopback port
  // 10808, so recover both safe local-only routes automatically. Operators can
  // still select one scheme through APEX_AUTO_LOCAL_PROXY_SCHEME. Missing
  // listeners fail locally and the direct route remains available; no remote
  // proxy, credential, or provider secret is embedded in the release.
  const hasExplicitProxy = candidates.length > 0;
  if (!hasExplicitProxy && process.env.APEX_AUTO_LOCAL_PROXY !== 'false') {
    const autoPort = (process.env.APEX_AUTO_LOCAL_PROXY_PORT || '10808').trim();
    const autoScheme = (process.env.APEX_AUTO_LOCAL_PROXY_SCHEME || 'both').trim().toLowerCase();
    if (/^\d+$/.test(autoPort)) {
      if (autoScheme === 'socks5' || autoScheme === 'both') {
        candidates.push(`socks5://127.0.0.1:${autoPort}`);
      }
      if (autoScheme === 'http' || autoScheme === 'both') {
        candidates.push(`http://127.0.0.1:${autoPort}`);
      }
    }
  }

  return [...new Set(candidates)];
}

const PROXY_POOL: string[] = parseProxyPool();

// Cloudflare can publish multiple IPv4 addresses for KuCoin. On this Windows
// runtime, one of those addresses can complete TCP but stall during TLS, so
// Node's normal first-address choice times out while curl still succeeds.
// Resolve all IPv4 records and prefer the responsive Cloudflare address family
// on this runtime; the sibling 172.64.* address can stall during TLS. The DNS
// interceptor keeps TLS/SNI on the original hostname.
const directDnsLookup = (origin: any, _options: any, callback: any): void => {
  const hostname = typeof origin === 'string' ? origin : origin.hostname;
  dns.lookup(
    hostname,
    { all: true, family: 4, order: 'ipv4first' },
    (err, addresses) => {
      callback(
        err,
        (addresses || []).map((address) => ({
          address: address.address,
          family: address.family,
          ttl: 60,
        })),
      );
    },
  );
};

const directDnsPick = (_origin: any, hostnameRecords: any): any => {
  const ipv4 = hostnameRecords?.records?.[4]?.ips || [];
  const addressOf = (ip: any) => typeof ip === 'string' ? ip : ip?.address;
  return ipv4.find((ip: any) => addressOf(ip)?.startsWith('104.')) || ipv4[0] || null;
};

// Fail-fast cap for the DIRECT route. The caller's timeoutMs (e.g. 20s) is the
// budget for the *whole* call, but a single direct attempt should give up much
// sooner so we surface UNAVAILABLE quickly instead of hanging — and so a real
// proxy (when configured) gets its turn promptly. Proxy routes keep the full
// caller timeout. Tunable via DIRECT_TIMEOUT_MS.
const DIRECT_TIMEOUT_MS = Number(process.env.DIRECT_TIMEOUT_MS || 7000);

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
const ROUTE_RETRYABLE_STATUS = new Set([403, 451, 408, 425, 500, 502, 503, 504]);

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
  const healthyProxies = PROXY_POOL.filter((p) => isHealthy(p, now)).sort(
    (a, b) => getHealth(a).lastUsed - getHealth(b).lastUsed
  );
  // If every proxy is cooling down, allow the single least-bad one as a last resort.
  const proxies =
    healthyProxies.length > 0
      ? healthyProxies
      : PROXY_POOL.slice().sort(
          (a, b) => getHealth(a).cooldownUntil - getHealth(b).cooldownUntil
        ).slice(0, 1);

  if (!proxies.length) return ['direct'];
  if (PROXY_MODE === 'direct_first') return ['direct', ...proxies];
  // proxy_first and auto prefer the loopback tunnel. A missing local listener
  // fails quickly, while direct-first can exhaust the short market-data budget
  // before a working proxy receives an attempt.
  return [...proxies, 'direct'];
}

function dispatcherFor(route: string): Dispatcher | undefined {
  const undici = loadUndici();
  if (route === 'direct') {
    // Node 22 provides a standards-compliant global fetch. When the optional
    // locked `undici` dependency has not been installed yet, fall back to that
    // direct dispatcher instead of making dependency-light QA and read-only
    // runtimes fail at import time. Installed production builds still use the
    // DNS-pinning Undici dispatcher below.
    if (!undici?.Agent || !undici?.interceptors?.dns) return undefined;
    let d = dispatcherCache.get('direct');
    if (!d) {
      d = new undici.Agent({
        connect: { timeout: 10_000 },
      }).compose([
        undici.interceptors.dns({
          affinity: 4,
          dualStack: false,
          lookup: directDnsLookup,
          pick: directDnsPick,
        }),
      ]);
      dispatcherCache.set('direct', d);
    }
    return d;
  }
  let d = dispatcherCache.get(route);
  if (!d) {
    if (isSocksProxyRoute(route)) {
      const SocksProxyAgent = loadSocksProxyAgent();
      if (!SocksProxyAgent) throw new Error('missing_optional_dependency:socks-proxy-agent');
      d = new SocksProxyAgent(route) as unknown as Dispatcher;
    } else {
      if (!undici?.ProxyAgent) throw new Error('missing_optional_dependency:undici');
      d = new undici.ProxyAgent(route);
    }
    dispatcherCache.set(route, d);
  }
  return d;
}


function describeFetchError(err: any): string {
  const parts = [err?.message || 'transport_error'];
  const cause = err?.cause;
  if (cause?.code) parts.push(cause.code);
  if (cause?.errno && cause.errno !== cause.code) parts.push(String(cause.errno));
  if (cause?.syscall) parts.push(cause.syscall);
  if (cause?.hostname) parts.push(cause.hostname);
  return parts.join(' ');
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
  let order = buildAttemptOrder(now);
  if (proxyOnly && PROXY_POOL.length > 0) {
    order = order.filter((route) => route !== 'direct');
  }

  let last: SmartFetchResult = {
    ok: false,
    status: 0,
    json: null,
    route: 'direct',
    error: 'no_route',
  };

  // timeoutMs is the budget for the whole call, not per route: a retryable
  // status followed by a hanging fallback route must not stack timeouts.
  const deadline = now + timeoutMs;
  const remainingBudget = () => deadline - Date.now();

  for (const route of order) {
    const routeBudget = Math.min(timeoutForRoute(route, timeoutMs), remainingBudget());
    if (routeBudget < MIN_ROUTE_BUDGET_MS) {
      last = { ...last, error: last.error === 'no_route' ? 'budget_exhausted' : last.error };
      break;
    }
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'User-Agent': 'APEX-Trading-Engine/1.0',
          Accept: 'application/json',
          ...headers,
        },
        body,
        signal: AbortSignal.timeout(routeBudget),
        // @ts-ignore Node fetch accepts an Undici Dispatcher; undefined uses Node's default dispatcher.
        dispatcher: dispatcherFor(route),
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

      if (isDnsLike(last.error)) {
        for (let attempt = 1; attempt <= quickRetries; attempt++) {
          if (remainingBudget() < MIN_ROUTE_BUDGET_MS + retryDelayMs) break;
          await new Promise((r) => setTimeout(r, retryDelayMs));
          try {
            const retryRes = await fetch(url, {
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
              // @ts-ignore Node fetch accepts an Undici Dispatcher.
              dispatcher: dispatcherFor(route),
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
  const key = governorCacheKey(url, opts);
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
  const circuitKey = opts.circuitKey || circuitKeyFor(logKey, url);

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
}

/**
 * Human-readable reason for a transport failure (status 0), including what the
 * operator should check. Surfaced in provider `reason` fields so the
 * Intelligence panel explains itself instead of just saying "Request timeout".
 */
export function describeUpstreamUnreachable(host: string, error?: string | null): string {
  const pool = getProxyPoolInfo();
  const detail = String(error || '').slice(0, 120);
  if (pool.poolSize === 0) {
    return `${host} unreachable on the direct network. Start the local proxy or configure PROXY_POOL_URLS/SOCKS5_PROXY, then restart the server.${detail ? ` (${detail})` : ''}`;
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
} {
  const now = Date.now();
  return {
    mode: PROXY_MODE,
    poolSize: PROXY_POOL.length,
    healthy: PROXY_POOL.filter((p) => isHealthy(p, now)).length,
    maxConcurrency: GOVERNOR_MAX_CONCURRENCY,
  };
}
