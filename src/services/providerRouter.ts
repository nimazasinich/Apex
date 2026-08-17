/* Copied from apex-trading-engine/src/services/providerRouter.ts */

/**
 * providerRouter.ts — Public-provider routing, Last-Known-Good cache, scoped
 * cooldown, and Binance USD-M symbol-support gating.
 *
 * NODE-side module used by server.ts. The network primitive (a `smartFetchJson`
 * style function) is INJECTED, so the routing / LKG / cooldown / symbol-gate
 * logic here is pure and unit-testable without any live network.
 *
 * Hard rules honoured:
 *   - Public endpoints only; no API keys; no authenticated routes.
 *   - Never fabricate missing data (no fake neutral 1.0).
 *   - live  = fresh provider response
 *     degraded = valid cached LKG returned after a fresh failure
 *     unavailable = no fresh data and no valid LKG
 *   - Cached data is never reported as `live`.
 */

// ── Provider capability truth + routing priority ─────────────────────────────
// Routing lists only provider/category pairs with an executable implementation.
// Planned providers remain visible in the capability registry but can never be
// mistaken for a working failover merely because their name appears in an array.

import {
  PROVIDER_CAPABILITIES,
  PROVIDER_PRIORITY,
  type DataCategory,
  type ProviderTransport,
  type PublicProviderId,
} from '../contracts/providerCapabilities';

export { PROVIDER_CAPABILITIES, PROVIDER_PRIORITY } from '../contracts/providerCapabilities';
export type { DataCategory, ProviderTransport, PublicProviderId } from '../contracts/providerCapabilities';

export function assertProviderPriorityIntegrity(): true {
  for (const [category, providers] of Object.entries(PROVIDER_PRIORITY)) {
    for (const provider of providers) {
      const capability = PROVIDER_CAPABILITIES[provider as PublicProviderId];
      if (!capability?.registered || !capability.categories.includes(category)) {
        throw new Error(`unregistered_provider_priority:${category}:${provider}`);
      }
    }
  }
  return true;
}

// Fail at module initialization if a future edit advertises a nonexistent adapter.
assertProviderPriorityIntegrity();

export interface DataEnvelope<T> {
  value: T | null;
  status: 'live' | 'degraded' | 'unavailable';
  provider: string;
  category: string;
  symbol: string;
  updatedAt: number;
  reason?: string;
  latencyMs?: number;
}

// Minimal shape of the injected fetch primitive (matches proxyFetch.smartFetchJson).
export interface FetchResult {
  ok: boolean;
  status: number;
  json: any | null;
  route?: string;
  error?: string;
}
export type FetchJson = (
  url: string,
  opts?: { logKey?: string; timeoutMs?: number }
) => Promise<FetchResult>;

// ── TTLs (ms) ───────────────────────────────────────────────────────────────

export const LKG_TTL_MS: Record<string, number> = {
  ticker: 10_000,
  orderbook: 5_000,
  candles: 60_000,
  trades: 10_000,
  funding: 300_000,
  openInterest: 60_000,
  instruments: 300_000,
  longShortRatio: 300_000,
  takerBuySellRatio: 300_000,
};

const BINANCE_SYMBOL_CACHE_TTL_MS = 300_000; // 5 min
const BINANCE_SYMBOL_FAILURE_TTL_MS = Number(process.env.BINANCE_SYMBOL_FAILURE_TTL_MS || 120_000);
const BINANCE_EXCHANGE_INFO_TIMEOUT_MS = Number(process.env.BINANCE_EXCHANGE_INFO_TIMEOUT_MS || 5_000);
const BINANCE_SENTIMENT_TIMEOUT_MS = Number(process.env.BINANCE_SENTIMENT_TIMEOUT_MS || 5_000);

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase());
}

// Binance sentiment is optional enrichment. When the Binance symbol gate itself
// cannot be reached, skip per-symbol sentiment calls by default; otherwise a
// blocked/unreachable Binance host creates one exchangeInfo timeout plus two
// extra timeouts for every watched symbol.
const BINANCE_SENTIMENT_ENABLED = envFlag('BINANCE_SENTIMENT_ENABLED', true);
const BINANCE_SKIP_SENTIMENT_WHEN_SYMBOL_GATE_UNAVAILABLE = envFlag(
  'BINANCE_SKIP_SENTIMENT_WHEN_SYMBOL_GATE_UNAVAILABLE',
  true,
);

// ── Last-Known-Good cache ────────────────────────────────────────────────────

interface LkgEntry<T = any> {
  value: T;
  provider: string;
  storedAt: number;
}
const lkgCache = new Map<string, LkgEntry>();

function lkgKey(category: string, symbol: string): string {
  return `${category}:${symbol}`;
}

export function storeLkg(category: string, symbol: string, provider: string, value: any): void {
  lkgCache.set(lkgKey(category, symbol), { value, provider, storedAt: Date.now() });
}

export function readLkg(category: string, symbol: string): LkgEntry | null {
  const entry = lkgCache.get(lkgKey(category, symbol));
  if (!entry) return null;
  const ttl = LKG_TTL_MS[category] ?? 60_000;
  if (Date.now() - entry.storedAt > ttl) return null; // expired → not a valid LKG
  return entry;
}

// ── Scoped cooldown with exponential backoff (provider:endpoint:symbol) ──────

const COOLDOWN_BASE_MS = 500;
const COOLDOWN_MAX_MS = 30_000;

interface CooldownEntry {
  failureCount: number;
  until: number;
}
const cooldowns = new Map<string, CooldownEntry>();

export function cooldownKey(provider: string, endpoint: string, symbol: string): string {
  return `${provider}:${endpoint}:${symbol}`;
}

export function backoffDelayMs(failureCount: number): number {
  return (
    Math.min(COOLDOWN_MAX_MS, COOLDOWN_BASE_MS * 2 ** Math.max(0, failureCount)) +
    Math.floor(Math.random() * 250)
  );
}

export function isCoolingDown(key: string, now: number = Date.now()): boolean {
  const e = cooldowns.get(key);
  return Boolean(e && e.until > now);
}

export function recordFailureCooldown(key: string): void {
  const e = cooldowns.get(key) || { failureCount: 0, until: 0 };
  e.failureCount += 1;
  e.until = Date.now() + backoffDelayMs(e.failureCount);
  cooldowns.set(key, e);
}

export function clearCooldown(key: string): void {
  cooldowns.delete(key);
}

// ── Binance USD-M symbol-support gate ───────────────────────────────────────

interface BinanceSymbolCache {
  symbols: Set<string>;
  fetchedAt: number;
}
let binanceSymbols: BinanceSymbolCache | null = null;
let binanceSymbolInflight: Promise<Set<string> | null> | null = null;
let binanceSymbolLastFailureAt = 0;

const BINANCE_FUTURES_BASE =
  process.env.BINANCE_FUTURES_BASE || 'https://fapi.binance.com';

/**
 * Returns the set of TRADING USD-M perpetual symbols, cached with TTL.
 * Returns null if the support list cannot be established (caller must then treat
 * support as "unknown" and proceed cautiously rather than hard-blocking).
 */
export async function getBinanceSupportedSymbols(
  fetchJson: FetchJson
): Promise<Set<string> | null> {
  const now = Date.now();
  if (binanceSymbols && now - binanceSymbols.fetchedAt < BINANCE_SYMBOL_CACHE_TTL_MS) {
    return binanceSymbols.symbols;
  }
  // Negative-cache exchangeInfo transport failures. Without this, every symbol
  // scan immediately retries /fapi/v1/exchangeInfo when the host is geo-blocked
  // or the runtime has no outbound exchange access, producing log storms.
  if (!binanceSymbols && now - binanceSymbolLastFailureAt < BINANCE_SYMBOL_FAILURE_TTL_MS) {
    return null;
  }
  if (binanceSymbolInflight) return binanceSymbolInflight;

  binanceSymbolInflight = (async () => {
    const res = await fetchJson(`${BINANCE_FUTURES_BASE}/fapi/v1/exchangeInfo`, {
      logKey: 'binance:exchangeInfo',
      timeoutMs: BINANCE_EXCHANGE_INFO_TIMEOUT_MS,
    });
    if (!res.ok || !res.json || !Array.isArray(res.json.symbols)) {
      binanceSymbolLastFailureAt = Date.now();
      binanceSymbolInflight = null;
      return binanceSymbols ? binanceSymbols.symbols : null; // keep stale set if we had one
    }
    const set = new Set<string>();
    for (const s of res.json.symbols) {
      if (s && s.status === 'TRADING' && typeof s.symbol === 'string') set.add(s.symbol);
    }
    binanceSymbols = { symbols: set, fetchedAt: Date.now() };
    binanceSymbolLastFailureAt = 0;
    binanceSymbolInflight = null;
    return set;
  })();

  return binanceSymbolInflight;
}

/**
 * Resolve whether a symbol is supported on Binance USD-M.
 * - true  → supported
 * - false → definitively NOT supported (skip fetch, skip cooldown, no warning)
 * - null  → support list unavailable; caller may attempt the fetch
 */
export async function isBinanceSymbolSupported(
  symbol: string,
  fetchJson: FetchJson
): Promise<boolean | null> {
  const set = await getBinanceSupportedSymbols(fetchJson);
  if (!set) return null;
  return set.has(symbol);
}

// ── Sentiment routing (the concrete wired path) ──────────────────────────────

export const SYMBOL_NOT_SUPPORTED = 'symbol_not_supported_by_binance_usdm';

/**
 * Route a Binance public sentiment endpoint with symbol-gating, scoped cooldown,
 * and LKG fallback. `category` is 'longShortRatio' | 'takerBuySellRatio'.
 */
export async function routeBinanceSentiment(
  category: 'longShortRatio' | 'takerBuySellRatio',
  endpoint: string,
  symbol: string,
  url: string,
  fetchJson: FetchJson
): Promise<DataEnvelope<any>> {
  const started = Date.now();
  const ck = cooldownKey('binance', endpoint, symbol);

  const envelope = (
    status: DataEnvelope<any>['status'],
    value: any,
    provider: string,
    reason?: string
  ): DataEnvelope<any> => ({
    value,
    status,
    provider,
    category,
    symbol,
    updatedAt: Date.now(),
    reason,
    latencyMs: Date.now() - started,
  });

  if (!BINANCE_SENTIMENT_ENABLED) {
    const lkg = readLkg(category, symbol);
    if (lkg) return envelope('degraded', lkg.value, lkg.provider, 'binance_sentiment_disabled_lkg');
    return envelope('unavailable', null, 'binance', 'binance_sentiment_disabled');
  }

  // 1) Symbol-support gate — unsupported symbols never call the endpoint,
  //    never trigger cooldown, never spam warnings. If the gate is unreachable,
  //    do not fan out into per-symbol endpoint timeouts unless explicitly opted in.
  const supported = await isBinanceSymbolSupported(symbol, fetchJson);
  if (supported === false) {
    return envelope('unavailable', null, 'binance', SYMBOL_NOT_SUPPORTED);
  }
  if (supported === null && BINANCE_SKIP_SENTIMENT_WHEN_SYMBOL_GATE_UNAVAILABLE) {
    const lkg = readLkg(category, symbol);
    if (lkg) return envelope('degraded', lkg.value, lkg.provider, 'symbol_gate_unavailable_lkg');
    return envelope('unavailable', null, 'binance', 'symbol_gate_unavailable');
  }

  // 2) Scoped cooldown → serve LKG (degraded) if present, else unavailable.
  if (isCoolingDown(ck)) {
    const lkg = readLkg(category, symbol);
    if (lkg) return envelope('degraded', lkg.value, lkg.provider, 'cooldown_active_lkg');
    return envelope('unavailable', null, 'binance', 'cooldown_active');
  }

  // 3) Fresh fetch.
  const res = await fetchJson(url, {
    logKey: `binance:${endpoint}:${symbol}`,
    timeoutMs: BINANCE_SENTIMENT_TIMEOUT_MS,
  });
  if (res.ok && res.json) {
    storeLkg(category, symbol, 'binance', res.json);
    clearCooldown(ck);
    return envelope('live', res.json, 'binance');
  }

  // 4) Fresh failure → record scoped cooldown, fall back to LKG (degraded) or unavailable.
  recordFailureCooldown(ck);
  const lkg = readLkg(category, symbol);
  if (lkg) return envelope('degraded', lkg.value, lkg.provider, 'fresh_failed_lkg');
  return envelope('unavailable', null, 'binance', res.error || 'fresh_failed_no_lkg');
}

// ── State maintenance (memory-leak prevention) ───────────────────────────────

export function pruneProviderRouterState(activeSymbols?: string[]): void {
  const now = Date.now();
  const active = activeSymbols ? new Set(activeSymbols) : null;

  for (const [key, entry] of lkgCache) {
    const ttl = LKG_TTL_MS[key.split(':')[0]] ?? 60_000;
    const symbol = key.slice(key.indexOf(':') + 1);
    const expired = now - entry.storedAt > ttl * 4; // generous grace before eviction
    const inactive = active ? !active.has(symbol) : false;
    if (expired || inactive) lkgCache.delete(key);
  }

  for (const [key, e] of cooldowns) {
    if (e.until <= now) cooldowns.delete(key);
  }

  if (binanceSymbols && now - binanceSymbols.fetchedAt > BINANCE_SYMBOL_CACHE_TTL_MS * 2) {
    binanceSymbols = null;
  }
}

export function clearProviderRouterSymbol(symbol: string): void {
  for (const key of lkgCache.keys()) {
    if (key.slice(key.indexOf(':') + 1) === symbol) lkgCache.delete(key);
  }
  for (const key of cooldowns.keys()) {
    if (key.endsWith(`:${symbol}`)) cooldowns.delete(key);
  }
}

/** Test/diagnostic helper — fully reset module state. */
export function __resetProviderRouterState(): void {
  lkgCache.clear();
  cooldowns.clear();
  binanceSymbols = null;
  binanceSymbolInflight = null;
  binanceSymbolLastFailureAt = 0;
}