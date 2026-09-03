/**
 * Typed, fail-closed clients for the two Really-amin Hugging Face Spaces.
 *
 * Space-4 is the first owner-managed futures gateway. Space-2 provides the
 * secondary owner-managed fallback for validated historical/orderbook data and
 * intelligence enrichment. Neither Space replaces Binance/KuCoin as primary.
 */

import type { Candle, OrderBook, OrderBookLevel } from '../types';
import { smartFetchJson, type SmartFetchPriority } from './proxyFetch';
import { HF_SPACE_2_ORIGIN, HF_SPACE_4_ORIGIN } from './hfSpaceIntel';
import { isApprovedHfSpaceContract } from './hfSpaceContracts';

export type HfSpaceId = 'space2' | 'space4';

export interface HfSpaceRequestResult {
  ok: boolean;
  status: number;
  json: any | null;
  error?: string;
  latencyMs: number;
  cached: boolean;
}

interface CacheEntry {
  json: any;
  storedAt: number;
  ttlMs: number;
}

interface CircuitEntry {
  failures: number;
  cooldownUntil: number;
}

const responseCache = new Map<string, CacheEntry>();
const circuits = new Map<HfSpaceId, CircuitEntry>();
const FAILURE_THRESHOLD = 2;
const COOLDOWN_MS = 30_000;

function cacheKey(space: HfSpaceId, method: string, path: string, body?: string): string {
  return `${space}:${method}:${path}:${body || ''}`;
}

function readCache(key: string): any | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > entry.ttlMs) {
    responseCache.delete(key);
    return null;
  }
  return entry.json;
}

function recordSuccess(space: HfSpaceId): void {
  circuits.delete(space);
}

function recordFailure(space: HfSpaceId): void {
  const previous = circuits.get(space) || { failures: 0, cooldownUntil: 0 };
  const failures = previous.failures + 1;
  circuits.set(space, {
    failures,
    cooldownUntil: failures >= FAILURE_THRESHOLD ? Date.now() + COOLDOWN_MS : 0,
  });
}

export async function requestHfSpaceJson(
  space: HfSpaceId,
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    timeoutMs?: number;
    cacheTtlMs?: number;
    priority?: SmartFetchPriority;
  } = {},
): Promise<HfSpaceRequestResult> {
  const method = options.method || 'GET';
  if (!isApprovedHfSpaceContract(space, method, path)) {
    return {
      ok: false,
      status: 0,
      json: null,
      error: `${space}_contract_not_allowed`,
      latencyMs: 0,
      cached: false,
    };
  }
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const key = cacheKey(space, method, path, body);
  const inferredPriority: SmartFetchPriority = options.priority
    ?? (/backtest\/historical/i.test(path) ? 'critical' : /short-hunter|defi|sentiment/i.test(path) ? 'background' : 'interactive');
  const cached = readCache(key);
  const circuit = circuits.get(space);
  if (circuit && circuit.cooldownUntil > Date.now() && inferredPriority !== 'critical') {
    if (cached !== null) {
      return { ok: true, status: 200, json: cached, latencyMs: 0, cached: true };
    }
    return {
      ok: false,
      status: 0,
      json: null,
      error: `${space}_cooldown_active`,
      latencyMs: 0,
      cached: false,
    };
  }

  const origin = space === 'space2' ? HF_SPACE_2_ORIGIN : HF_SPACE_4_ORIGIN;
  const url = `${origin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  const startedAt = Date.now();
  const response = await smartFetchJson(url, {
    method,
    body,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    timeoutMs: options.timeoutMs ?? (space === 'space4' ? 8_000 : 10_000),
    logKey: `hf_${space}:${method}:${path.split('?')[0]}`,
    priority: inferredPriority,
    cacheTtlMs: options.cacheTtlMs,
  });
  const latencyMs = Date.now() - startedAt;

  if (!response.ok || response.json == null) {
    recordFailure(space);
    if (cached !== null) {
      return { ok: true, status: 200, json: cached, latencyMs, cached: true };
    }
    return {
      ok: false,
      status: response.status,
      json: null,
      error: response.error || `http_${response.status}`,
      latencyMs,
      cached: false,
    };
  }

  const servedStale = response.stale === true;
  if (!servedStale) recordSuccess(space);
  if (!servedStale && method === 'GET' && (options.cacheTtlMs ?? 0) > 0) {
    responseCache.set(key, {
      json: response.json,
      storedAt: Date.now(),
      ttlMs: options.cacheTtlMs!,
    });
  }
  return {
    ok: true,
    status: response.status,
    json: response.json,
    latencyMs,
    cached: servedStale,
  };
}

function finitePositive(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTimestamp(value: unknown): number {
  if (typeof value === 'number') return value < 10_000_000_000 ? value * 1000 : value;
  const raw = String(value || '').trim();
  if (!raw) return NaN;
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  }
  // Space-2 returns Binance UTC timestamps without a zone suffix.
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  return Date.parse(normalized);
}

function isTrustedShortHunterEnvelope(json: any, maxFreshnessMs = 30_000): boolean {
  const sourceMode = String(json?.sourceMode || '').toUpperCase();
  const dataState = String(json?.dataState || '').toUpperCase();
  if (
    json?.success !== true ||
    json?.noTradeGuard === true ||
    !['LIVE', 'CACHED'].includes(sourceMode) ||
    !['REAL', 'CACHED'].includes(dataState)
  ) {
    return false;
  }
  const cacheAgeSeconds = Number(json?.cacheAgeSeconds);
  if (sourceMode === 'CACHED' && (!Number.isFinite(cacheAgeSeconds) || cacheAgeSeconds > 60)) {
    return false;
  }
  const freshnessMs = Number(json?.freshnessMs);
  return !Number.isFinite(freshnessMs) || freshnessMs <= maxFreshnessMs;
}

function buildBookSide(rows: unknown[], multiplier = 1): OrderBookLevel[] {
  const parsed = rows
    .map((row: any) => ({
      price: finitePositive(Array.isArray(row) ? row[0] : row?.price),
      volume: finitePositive(Array.isArray(row) ? row[1] : row?.size ?? row?.volume),
    }))
    .filter((row): row is { price: number; volume: number } => row.price !== null && row.volume !== null)
    .map((row) => ({ ...row, volume: row.volume * multiplier }));
  const total = parsed.reduce((sum, row) => sum + row.volume, 0);
  let cumulative = 0;
  return parsed.map((row) => {
    cumulative += row.volume;
    return {
      price: row.price,
      volume: row.volume,
      cumulative,
      percentage: total > 0 ? (cumulative / total) * 100 : 0,
    };
  });
}

export interface Space4OrderBook {
  book: OrderBook;
  provider: string;
  sourceMode: 'LIVE' | 'CACHED';
  dataState: 'REAL' | 'CACHED';
  freshnessMs: number | null;
  rawDepth: number;
  volumeUnit: 'base_asset' | 'contracts_unknown';
}

export function parseSpace4OrderBook(json: any): Space4OrderBook | null {
  if (!isTrustedShortHunterEnvelope(json) || !Array.isArray(json?.data?.bids) || !Array.isArray(json?.data?.asks)) {
    return null;
  }
  const multiplier = finitePositive(json?.data?.contractMultiplier);
  const bids = buildBookSide(json.data.bids, multiplier ?? 1);
  const asks = buildBookSide(json.data.asks, multiplier ?? 1);
  if (!bids.length || !asks.length || bids[0].price >= asks[0].price) return null;
  return {
    book: { bids, asks, dataSource: 'degraded' },
    provider: String(json?.providerUsed || json?.provider || json?.data?.source || 'hf_space_4'),
    sourceMode: String(json.sourceMode).toUpperCase() as 'LIVE' | 'CACHED',
    dataState: String(json.dataState).toUpperCase() as 'REAL' | 'CACHED',
    freshnessMs: Number.isFinite(Number(json?.freshnessMs)) ? Number(json.freshnessMs) : null,
    rawDepth: bids.length + asks.length,
    volumeUnit: multiplier ? 'base_asset' : 'contracts_unknown',
  };
}

export interface Space4Funding {
  currentFundingRate: number;
  nextFundingTime: number | null;
  history: Array<{ fundingTime: number | null; fundingRate: number }>;
  historyTimestampsComplete: boolean;
  provider: string;
}

export function parseSpace4Funding(json: any): Space4Funding | null {
  if (!isTrustedShortHunterEnvelope(json)) return null;
  const currentFundingRate = Number(json?.data?.currentFundingRate);
  if (!Number.isFinite(currentFundingRate)) return null;
  const rawHistory = Array.isArray(json?.data?.history) ? json.data.history : [];
  const history = rawHistory
    .map((row: any) => ({
      fundingTime: Number.isFinite(parseTimestamp(row?.fundingTime)) ? parseTimestamp(row.fundingTime) : null,
      fundingRate: Number(row?.fundingRate),
    }))
    .filter((row: { fundingTime: number | null; fundingRate: number }) => Number.isFinite(row.fundingRate));
  return {
    currentFundingRate,
    nextFundingTime: Number.isFinite(parseTimestamp(json?.data?.nextFundingTime))
      ? parseTimestamp(json.data.nextFundingTime)
      : null,
    history,
    historyTimestampsComplete: history.length > 0 && history.every(
      (row: { fundingTime: number | null; fundingRate: number }) => row.fundingTime !== null,
    ),
    provider: String(json?.providerUsed || json?.provider || json?.data?.source || 'hf_space_4'),
  };
}

export interface Space4OpenInterest {
  openInterest: number;
  history: unknown[];
  provider: string;
}

export function parseSpace4OpenInterest(json: any): Space4OpenInterest | null {
  if (!isTrustedShortHunterEnvelope(json)) return null;
  const openInterest = finitePositive(json?.data?.openInterest);
  if (openInterest === null) return null;
  return {
    openInterest,
    history: Array.isArray(json?.data?.history) ? json.data.history : [],
    provider: String(json?.providerUsed || json?.provider || json?.data?.source || 'hf_space_4'),
  };
}

export interface Space4Market {
  symbol: string;
  lastPrice: number;
  bestBidPrice: number | null;
  bestAskPrice: number | null;
  fundingRate: number | null;
  openInterest: number | null;
  provider: string;
}

export function parseSpace4Market(json: any): Space4Market | null {
  if (!isTrustedShortHunterEnvelope(json)) return null;
  const ticker = json?.data?.ticker || json?.data;
  const lastPrice = finitePositive(ticker?.lastPrice ?? ticker?.price ?? json?.data?.lastPrice);
  if (lastPrice === null) return null;
  return {
    symbol: String(json?.symbol || ticker?.symbol || '').toUpperCase(),
    lastPrice,
    bestBidPrice: finitePositive(ticker?.bestBidPrice),
    bestAskPrice: finitePositive(ticker?.bestAskPrice),
    fundingRate: finiteNumber(json?.data?.fundingRate),
    openInterest: finitePositive(json?.data?.openInterest),
    provider: String(json?.providerUsed || json?.provider || ticker?.provider || 'hf_space_4'),
  };
}

export async function getSpace4OrderBook(symbol: string, limit = 20, priority: SmartFetchPriority = 'interactive'): Promise<Space4OrderBook | null> {
  const response = await requestHfSpaceJson(
    'space4',
    `/api/short-hunter/orderbook/${encodeURIComponent(symbol)}?limit=${Math.max(5, Math.min(100, limit))}`,
    { timeoutMs: 8_000, cacheTtlMs: 3_000, priority },
  );
  return response.ok ? parseSpace4OrderBook(response.json) : null;
}

export async function getSpace4Funding(symbol: string): Promise<Space4Funding | null> {
  const response = await requestHfSpaceJson(
    'space4',
    `/api/short-hunter/funding/${encodeURIComponent(symbol)}`,
    { timeoutMs: 8_000, cacheTtlMs: 30_000 },
  );
  return response.ok ? parseSpace4Funding(response.json) : null;
}

export async function getSpace4OpenInterest(symbol: string): Promise<Space4OpenInterest | null> {
  const response = await requestHfSpaceJson(
    'space4',
    `/api/short-hunter/open-interest/${encodeURIComponent(symbol)}`,
    { timeoutMs: 8_000, cacheTtlMs: 15_000 },
  );
  return response.ok ? parseSpace4OpenInterest(response.json) : null;
}

export async function getSpace4Market(symbol: string): Promise<Space4Market | null> {
  const response = await requestHfSpaceJson(
    'space4',
    `/api/short-hunter/market/${encodeURIComponent(symbol)}`,
    { timeoutMs: 8_000, cacheTtlMs: 5_000 },
  );
  return response.ok ? parseSpace4Market(response.json) : null;
}

export async function getSpace4Snapshot(symbol: string, limit = 120, orderbookLimit = 20): Promise<any | null> {
  const response = await requestHfSpaceJson(
    'space4',
    `/api/short-hunter/snapshot/${encodeURIComponent(symbol)}?limit=${Math.max(30, Math.min(1000, limit))}&orderbook_limit=${Math.max(5, Math.min(100, orderbookLimit))}`,
    { timeoutMs: 10_000, cacheTtlMs: 5_000 },
  );
  return response.ok && isTrustedShortHunterEnvelope(response.json, 60_000) ? response.json : null;
}

export interface Space2HistoricalResult {
  candles: Candle[];
  exchange: string;
}

export function parseSpace2HistoricalCandles(
  json: any,
  intervalMs: number,
  limit: number,
  nowMs = Date.now(),
): Space2HistoricalResult | null {
  if (json?.success !== true && !Array.isArray(json?.data)) return null;
  const rawCandles = Array.isArray(json?.candles) ? json.candles : Array.isArray(json?.data) ? json.data : null;
  if (!rawCandles || rawCandles.length === 0) return null;
  const exchange = String(json?.exchange || json?.source || 'hf_space_2').toLowerCase();
  // Reject unrecognized exchange sources — only vetted venues are trusted for backtest data.
  const ALLOWED_EXCHANGES = ['binance', 'kucoin', 'hf_space_2', 'hf_space_4', 'tabdeal'];
  if (!ALLOWED_EXCHANGES.some((e) => exchange === e || exchange.startsWith('hf_space'))) return null;
  const byTimestamp = new Map<number, Candle>();
  for (const row of rawCandles) {
    const candle: Candle = {
      timestamp: parseTimestamp(row?.timestamp ?? row?.open_time ?? row?.[0]),
      open: Number(row?.open ?? row?.[1]),
      high: Number(row?.high ?? row?.[2]),
      low: Number(row?.low ?? row?.[3]),
      close: Number(row?.close ?? row?.[4]),
      volume: Number(row?.volume ?? row?.[5]),
    };
    if (
      !Number.isFinite(candle.timestamp) ||
      !Number.isFinite(candle.open) || candle.open <= 0 ||
      !Number.isFinite(candle.high) || candle.high < Math.max(candle.open, candle.close) ||
      !Number.isFinite(candle.low) || candle.low > Math.min(candle.open, candle.close) ||
      !Number.isFinite(candle.close) || candle.close <= 0 ||
      !Number.isFinite(candle.volume) || candle.volume < 0
    ) continue;
    // Historical/backtest consumers must never receive the still-open candle.
    if (candle.timestamp + intervalMs <= nowMs) byTimestamp.set(candle.timestamp, candle);
  }
  const candles = [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-limit);
  if (candles.length < 2) return null;
  // Reject series with cadence gaps — a missing candle means the series is not contiguous.
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].timestamp - candles[i - 1].timestamp > intervalMs * 1.5) return null;
  }
  return { candles, exchange };
}

export async function getSpace2HistoricalCandles(
  symbol: string,
  timeframe = '1h',
  limit = 500,
): Promise<Space2HistoricalResult | null> {
  const normalized = symbol.replace(/[^a-z0-9]/gi, '').toUpperCase();
  const safeLimit = Math.max(2, Math.min(1000, limit));
  // Try canonical /api/ohlcv first, then fallback to /api/history
  const response = await requestHfSpaceJson(
    'space2',
    `/api/ohlcv?symbol=${encodeURIComponent(normalized)}&timeframe=${encodeURIComponent(timeframe)}&limit=${safeLimit}`,
    { timeoutMs: 10_000, cacheTtlMs: 60_000, priority: 'critical' },
  );
  if (response.ok) {
    const parsed = parseSpace2HistoricalCandles(response.json, timeframe === '1d' ? 86_400_000 : 3_600_000, safeLimit);
    if (parsed) return parsed;
  }
  const fb = await requestHfSpaceJson(
    'space2',
    `/api/history?symbol=${encodeURIComponent(normalized)}&interval=${encodeURIComponent(timeframe)}&limit=${safeLimit}`,
    { timeoutMs: 10_000, cacheTtlMs: 60_000, priority: 'critical' },
  );
  return fb.ok ? parseSpace2HistoricalCandles(fb.json, timeframe === '1d' ? 86_400_000 : 3_600_000, safeLimit) : null;
}

export interface Space2DefiResult {
  source: 'defillama';
  rows: any[];
}

export async function getSpace2DefiProtocols(limit = 20): Promise<Space2DefiResult | null> {
  const safeLimit = Math.max(1, Math.min(100, limit));
  const response = await requestHfSpaceJson('space2', `/api/defi/protocols?limit=${safeLimit}`, {
    timeoutMs: 10_000,
    cacheTtlMs: 5 * 60_000,
  });
  if (!response.ok || response.json?.success !== true || response.json?.source !== 'defillama' || !Array.isArray(response.json?.protocols)) return null;
  return { source: 'defillama', rows: response.json.protocols.slice(0, safeLimit) };
}

export async function getSpace2DefiYields(limit = 20): Promise<Space2DefiResult | null> {
  const safeLimit = Math.max(1, Math.min(100, limit));
  const response = await requestHfSpaceJson('space2', `/api/defi/yields?limit=${safeLimit}`, {
    timeoutMs: 10_000,
    cacheTtlMs: 5 * 60_000,
  });
  if (!response.ok || response.json?.success !== true || response.json?.source !== 'defillama' || !Array.isArray(response.json?.pools)) return null;
  return { source: 'defillama', rows: response.json.pools.slice(0, safeLimit) };
}

export interface Space2Sentiment {
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  confidence: number;
  reportedConfidence: number;
  model: string;
  source: string;
}

export async function analyzeSpace2Sentiment(
  text: string,
  mode: 'crypto' | 'financial' | 'social' | 'news' = 'crypto',
): Promise<Space2Sentiment | null> {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 8_000) return null;
  const response = await requestHfSpaceJson('space2', '/api/sentiment', {
    method: 'POST',
    body: { text: trimmed, mode },
    timeoutMs: 10_000,
  });
  const json = response.json;
  const sentiment = String(json?.sentiment || '');
  if (!response.ok || json?.success !== true || !['Bullish', 'Bearish', 'Neutral'].includes(sentiment)) return null;
  const sampleConfidence = Number(json?.samples?.[0]?.score);
  const reportedConfidence = Number(json?.confidence);
  const confidence = Number.isFinite(sampleConfidence)
    ? sampleConfidence
    : Number.isFinite(reportedConfidence)
      ? reportedConfidence
      : NaN;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  return {
    sentiment: sentiment as Space2Sentiment['sentiment'],
    confidence,
    reportedConfidence: Number.isFinite(reportedConfidence) ? reportedConfidence : confidence,
    model: String(json?.model || 'unknown'),
    source: String(json?.source || 'space2'),
  };
}

export function pruneHfSpacesClientState(): void {
  const now = Date.now();
  for (const [key, entry] of responseCache) {
    if (now - entry.storedAt > entry.ttlMs * 4) responseCache.delete(key);
  }
  for (const [space, circuit] of circuits) {
    if (circuit.cooldownUntil > 0 && circuit.cooldownUntil <= now) circuits.delete(space);
  }
}
