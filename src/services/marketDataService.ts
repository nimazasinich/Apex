/**
 * marketDataService.ts
 *
 * Unified market-data facade with the owner-approved source hierarchy:
 *   1) Binance USDⓈ-M Futures (public REST, no auth)
 *   2) KuCoin Futures (public REST, no auth)
 *   3) Owner-managed Hugging Face gateways:
 *      - Space-4 Short Hunter for verified OHLCV/orderbook/market snapshots.
 *      - Space-2 for its verified 1h historical transport and documented
 *        trading/orderbook fallback. Untrusted or cadence-mismatched payloads
 *        fail closed instead of being normalized into synthetic market data.
 * Operator-entered APIs are handled only by the specific last-resort services
 * that can represent the requested contract truthfully (for example CMC quotes).
 *
 * This module composes the exchange primitives that already exist in
 * exchangeClient.ts (per-symbol Binance/KuCoin calls) and hfSpaceIntel.ts
 * (news/fear-greed, already implemented and used elsewhere) rather than
 * re-implementing raw fetches. The bulk (all-symbols) KuCoin ticker fetch
 * that used to live directly in apexNextMarketRoutes.ts's fetchKuCoinTickers
 * is folded in here as the "secondary" tier — apexNextMarketRoutes.ts now
 * calls getTickers()/getCandles() instead of doing its own KuCoin-only fetch.
 */

import type { SymbolTicker, Candle, DataState, OrderBook, OrderBookLevel, OrderBookSummary } from '../types';
import { smartFetchJson, type SmartFetchPriority } from './proxyFetch';
import {
  binanceDepth,
  binanceKlines,
  binanceOpenInterest,
  toBinanceUsdmSymbol,
  kucoinContract,
  kucoinLevel2,
  toKuCoinFuturesSymbol,
} from './providers/publicExchangeClient';
import {
  getSpace2HistoricalCandles,
  getSpace4Market,
  getSpace4OrderBook,
  requestHfSpaceJson,
} from './hfSpacesClient';
import { MathEngine } from './mathEngine';
import { validateClosedCandles, type ClosedCandleDiagnostics } from './closedCandleValidator';
import { canonicalObservationMetadata, type ObservationMetadataV1 } from '../contracts/evidence/observationMetadata';
import {
  canonicalizeBinanceSymbol,
  canonicalizeKuCoinContractSymbol,
  sanitizeTickerUniverse,
} from '../lib/tickerUniverse';

export { fetchHfSpaceFearGreed as getFearGreed, fetchHfSpaceNews as getLatestNews } from './hfSpaceIntel';

const BINANCE_USDM_BASE =
  process.env.BINANCE_PROXY_BASE_URL || process.env.BINANCE_FUTURES_BASE || 'https://fapi.binance.com';
const KUCOIN_FUTURES_BASE = process.env.KUCOIN_FUTURES_BASE || 'https://api-futures.kucoin.com';

// Public exchange calls often traverse a local SOCKS/HTTP tunnel on Windows.
// The old 3.5–4 second budgets produced false UNAVAILABLE states before the
// tunnel/TLS handshake could complete. Keep them bounded and configurable,
// but use realistic defaults for proxied market-data traffic.
const MARKET_BULK_TIMEOUT_MS = Math.max(4_000, Number(process.env.MARKET_BULK_TIMEOUT_MS || 8_000));
const MARKET_CANDLE_TIMEOUT_MS = Math.max(5_500, Number(process.env.MARKET_CANDLE_TIMEOUT_MS || 9_000));
// Ticker bootstrap must not wait on a fan-out of per-symbol open-interest calls.
// OI enrichment is opportunistic for the market table; decision paths fetch
// their own evidence and fail closed when OI is unavailable.
const BINANCE_TICKER_OI_ENRICH_LIMIT = Math.max(0, Math.min(24, Number(process.env.BINANCE_TICKER_OI_ENRICH_LIMIT || 12)));
const BINANCE_TICKER_OI_ENRICH_BUDGET_MS = Math.max(500, Math.min(6_000, Number(process.env.BINANCE_TICKER_OI_ENRICH_BUDGET_MS || 2_200)));

export type MarketDataSource = 'binance' | 'kucoin' | 'hf_space_2' | 'hf_space_4';

export class MarketDataError extends Error {
  attempts: Array<{ source: MarketDataSource; error: string }>;
  constructor(message: string, attempts: Array<{ source: MarketDataSource; error: string }>) {
    super(message);
    this.name = 'MarketDataError';
    this.attempts = attempts;
  }
}

export interface TickersResult {
  tickers: SymbolTicker[];
  dataState: DataState;
  source: MarketDataSource;
}

export interface CandlesResult {
  candles: Candle[];
  dataState: DataState;
  source: MarketDataSource;
  /** True when a previously verified response is being served during a transient provider outage. */
  stale?: boolean;
  /** Age of the verified candle snapshot when stale=true. */
  ageMs?: number;
  metadata?: ObservationMetadataV1;
  validation?: ClosedCandleDiagnostics;
}

export interface OrderBookResult {
  book: OrderBook;
  summary: OrderBookSummary;
  dataState: DataState;
  source: MarketDataSource;
  obi: number;
  microPrice: number;
  spread: number;
  volumeUnit: 'base_asset' | 'contracts_unknown';
}

export interface PrimaryProviderProbe {
  status: DataState;
  latencyMs: number | null;
  route: string | null;
  reason: string | null;
}

export interface PrimaryProviderHealth {
  checkedAt: number;
  binance: PrimaryProviderProbe;
  kucoin: PrimaryProviderProbe;
}

export type CandleInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

// ── In-memory cache (per spec: 5s tickers, 30s candles) ────────────────────
interface CacheEntry<T> { data: T; timestamp: number; }
const cache = new Map<string, CacheEntry<any>>();
const inFlightMarketRequests = new Map<string, Promise<unknown>>();

function coalesceMarketRequest<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inFlightMarketRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const pending = factory().finally(() => {
    if (inFlightMarketRequests.get(key) === pending) inFlightMarketRequests.delete(key);
  });
  inFlightMarketRequests.set(key, pending);
  return pending;
}

function getCached<T>(key: string, ttlMs: number): T | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.timestamp > ttlMs) { cache.delete(key); return null; }
  return e.data as T;
}
function setCached<T>(key: string, data: T): void {
  const timestamp = Date.now();
  const candidate = data as T & { metadata?: ObservationMetadataV1 };
  const stored = candidate?.metadata
    ? { ...candidate, metadata: { ...candidate.metadata, cacheStoredAt: timestamp } }
    : data;
  cache.set(key, { data: stored, timestamp });
}
const TICKERS_TTL_MS = 5000;
const CANDLES_TTL_MS = 30000;
const MAX_STALE_CANDLE_AGE_MS = Number(process.env.APEX_MAX_STALE_CANDLE_AGE_MS || 15 * 60_000);
interface VerifiedCandleEntry { data: CandlesResult; sourceObservedAt: number; }
const lastVerifiedCandles = new Map<string, VerifiedCandleEntry>();

export function rememberVerifiedCandles(key: string, result: CandlesResult): CandlesResult {
  const sourceObservedAt = result.metadata?.sourceObservedAt;
  if (
    result.dataState !== 'live'
    || result.stale === true
    || result.validation?.accepted !== true
    || sourceObservedAt == null
    || !Number.isFinite(sourceObservedAt)
  ) return result;
  const existing = lastVerifiedCandles.get(key);
  if (!existing || sourceObservedAt > existing.sourceObservedAt) {
    lastVerifiedCandles.set(key, { data: { ...result, stale: false, ageMs: 0 }, sourceObservedAt });
  }
  return result;
}

export function getStaleVerifiedCandles(key: string, now = Date.now()): CandlesResult | null {
  const entry = lastVerifiedCandles.get(key);
  if (!entry) return null;
  const ageMs = Math.max(0, now - entry.sourceObservedAt);
  if (ageMs > MAX_STALE_CANDLE_AGE_MS) {
    lastVerifiedCandles.delete(key);
    return null;
  }
  return {
    ...entry.data,
    dataState: 'degraded',
    stale: true,
    ageMs,
    metadata: entry.data.metadata ? {
      ...entry.data.metadata,
      qualityState: 'STALE',
      staleReason: 'last_known_good_replay',
      decisionEligible: false,
    } : undefined,
  };
}

export function __resetVerifiedCandleState(): void { lastVerifiedCandles.clear(); }

const CANDLE_INTERVAL_MS: Record<CandleInterval, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

function validatedCandleResult(input: {
  rows: Candle[];
  symbol: string;
  providerInstrumentId: string;
  intervalKey: CandleInterval;
  limit: number;
  source: MarketDataSource;
  dataState: DataState;
  stale?: boolean;
  ageMs?: number;
  now?: number;
}): CandlesResult | null {
  const receivedAt = input.now ?? Date.now();
  const intervalMs = CANDLE_INTERVAL_MS[input.intervalKey];
  const validated = validateClosedCandles({
    rows: input.rows,
    intervalMs,
    now: receivedAt,
    limit: input.limit,
    allowedGapIntervals: 3,
  });
  if (!validated.diagnostics.accepted || !validated.candles.length) return null;
  const first = validated.candles[0].timestamp;
  const last = validated.candles.at(-1)!.timestamp;
  const sourceObservedAt = last + intervalMs;
  const qualityState = input.stale ? 'STALE' : input.dataState === 'live' ? 'VALID' : 'DEGRADED';
  return {
    candles: validated.candles,
    dataState: input.dataState,
    source: input.source,
    stale: input.stale,
    ageMs: input.ageMs,
    validation: validated.diagnostics,
    metadata: canonicalObservationMetadata({
      sourceObservedAt,
      providerReadAt: receivedAt,
      receivedAt,
      cacheStoredAt: null,
      provider: input.source,
      venue: input.source === 'binance' ? 'BINANCE_USDM' : input.source === 'kucoin' ? 'KUCOIN_FUTURES' : input.source,
      canonicalInstrumentId: input.symbol,
      providerInstrumentId: input.providerInstrumentId,
      adapterVersion: `market_candle_adapter_v2+${validated.diagnostics.version}`,
      qualityState,
      staleReason: input.stale ? 'provider_transport_cache' : input.dataState === 'degraded' ? 'non_primary_or_degraded_provider' : null,
      lineageId: `candles:${input.source}:${input.providerInstrumentId}:${input.intervalKey}:${first}-${last}`,
      dependencyFamily: 'PRICE_CANDLES',
      parentLineageIds: [],
      decisionEligible: input.dataState === 'live' && input.stale !== true,
    }),
  };
}

/**
 * Parse the verified Space-4 Short Hunter OHLCV envelope fail-closed.
 *
 * Space-2 was observed returning 1-hour candles for a requested 1-minute
 * interval while still reporting success. Checking the actual timestamp
 * cadence here prevents that class of response from entering QStruct/ATR
 * calculations. Cached Space data is accepted only while fresh and while its
 * own no-trade guard remains clear.
 */
export function parseHfSpace4Candles(
  json: any,
  intervalKey: CandleInterval,
  limit: number,
  nowMs = Date.now(),
): Candle[] {
  const sourceMode = String(json?.sourceMode || '').toUpperCase();
  const dataState = String(json?.dataState || '').toUpperCase();
  if (
    json?.success !== true ||
    json?.noTradeGuard === true ||
    !['LIVE', 'CACHED'].includes(sourceMode) ||
    !['REAL', 'CACHED'].includes(dataState) ||
    !Array.isArray(json?.data)
  ) {
    return [];
  }

  const cacheAgeSeconds = Number(json?.cacheAgeSeconds);
  if (sourceMode === 'CACHED' && (!Number.isFinite(cacheAgeSeconds) || cacheAgeSeconds > 60)) {
    return [];
  }

  const expectedStepMs = CANDLE_INTERVAL_MS[intervalKey];
  const byTimestamp = new Map<number, Candle>();
  for (const row of json.data) {
    let timestamp = Number(row?.timestamp ?? row?.time ?? row?.[0]);
    if (timestamp > 0 && timestamp < 10_000_000_000) timestamp *= 1000;
    const candle: Candle = {
      timestamp,
      open: Number(row?.open ?? row?.[1]),
      high: Number(row?.high ?? row?.[2]),
      low: Number(row?.low ?? row?.[3]),
      close: Number(row?.close ?? row?.[4]),
      volume: Number(row?.volume ?? row?.[5]),
    };
    if (
      !Number.isFinite(candle.timestamp) || candle.timestamp <= 0 ||
      !Number.isFinite(candle.open) || candle.open <= 0 ||
      !Number.isFinite(candle.high) || candle.high <= 0 ||
      !Number.isFinite(candle.low) || candle.low <= 0 ||
      !Number.isFinite(candle.close) || candle.close <= 0 ||
      !Number.isFinite(candle.volume) || candle.volume < 0 ||
      candle.high < Math.max(candle.open, candle.close, candle.low) ||
      candle.low > Math.min(candle.open, candle.close, candle.high)
    ) {
      continue;
    }
    byTimestamp.set(timestamp, candle);
  }

  const candles = [...byTimestamp.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-Math.max(1, limit));
  if (candles.length < 2) return [];

  const deltas = candles.slice(1).map((c, i) => c.timestamp - candles[i].timestamp);
  if (deltas.some((delta) => delta <= 0 || delta % expectedStepMs !== 0)) return [];
  const exactCadenceRatio = deltas.filter((delta) => delta === expectedStepMs).length / deltas.length;
  if (exactCadenceRatio < 0.6) return [];

  const newestTimestamp = candles[candles.length - 1].timestamp;
  const maxAgeMs = Math.max(expectedStepMs * 3, 180_000);
  if (newestTimestamp < nowMs - maxAgeMs || newestTimestamp > nowMs + expectedStepMs * 2) return [];

  return candles;
}

function buildOrderBookLevels(rows: unknown[], multiplier = 1): OrderBookLevel[] {
  const parsed = rows
    .map((row: any) => ({
      price: Number(Array.isArray(row) ? row[0] : row?.price),
      volume: Number(Array.isArray(row) ? row[1] : row?.size ?? row?.volume) * multiplier,
    }))
    .filter((row) => Number.isFinite(row.price) && row.price > 0 && Number.isFinite(row.volume) && row.volume > 0);
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

function finalizeOrderBook(
  symbol: string,
  book: OrderBook,
  source: MarketDataSource,
  dataState: DataState,
  volumeUnit: OrderBookResult['volumeUnit'],
): OrderBookResult | null {
  if (!book.bids.length || !book.asks.length || book.bids[0].price >= book.asks[0].price) return null;
  const canonicalSymbol = canonicalizeBinanceSymbol(symbol.replace('-', ''));
  if (!canonicalSymbol) return null;
  const obi = MathEngine.calculateOBI(book);
  const microPrice = MathEngine.calculateMicroPrice(book);
  const spread = MathEngine.calculateSpread(book);
  const canValueInUsd = volumeUnit === 'base_asset';
  const bidDepthUsd = canValueInUsd
    ? book.bids.reduce((sum, level) => sum + level.price * level.volume, 0)
    : 0;
  const askDepthUsd = canValueInUsd
    ? book.asks.reduce((sum, level) => sum + level.price * level.volume, 0)
    : 0;
  return {
    book,
    summary: {
      symbol: canonicalSymbol,
      bidDepthUsd,
      askDepthUsd,
      imbalancePct: Number((obi * 100).toFixed(4)),
      dataState,
    },
    dataState,
    source,
    obi,
    microPrice,
    spread,
    volumeUnit,
  };
}

/**
 * Live order-book chain: Binance -> KuCoin -> Space-4 -> Space-2.
 *
 * KuCoin quantities are contract counts, so the contract multiplier is fetched
 * and applied before USD depth is calculated. Space-4 does not currently expose
 * that multiplier; its relative OBI remains useful, but USD depth is left at 0
 * and the result is degraded/no-trade rather than guessed.
 */
export async function getOrderBook(symbol: string, limit = 20, priority: SmartFetchPriority = 'interactive'): Promise<OrderBookResult> {
  const safeLimit = Math.max(5, Math.min(100, limit));
  const cacheKey = `orderbook_${symbol}_${safeLimit}`;
  const cached = getCached<OrderBookResult>(cacheKey, 3_000);
  if (cached) return cached;
  const attempts: Array<{ source: MarketDataSource; error: string }> = [];

  try {
    const response = await binanceDepth(symbol, safeLimit, priority);
    const data: any = response.ok ? response.data : null;
    const book: OrderBook = {
      bids: buildOrderBookLevels(Array.isArray(data?.bids) ? data.bids : []),
      asks: buildOrderBookLevels(Array.isArray(data?.asks) ? data.asks : []),
      dataSource: 'live',
    };
    const result = finalizeOrderBook(symbol, book, 'binance', response.ok && response.stale ? 'degraded' : 'live', 'base_asset');
    if (result) {
      setCached(cacheKey, result);
      return result;
    }
    attempts.push({ source: 'binance', error: response.ok ? 'invalid order book' : response.message });
  } catch (error: any) {
    attempts.push({ source: 'binance', error: error?.message || 'failed' });
  }

  try {
    const [depthResponse, contractResponse] = await Promise.all([
      kucoinLevel2(symbol, priority),
      kucoinContract(symbol, priority),
    ]);
    const data: any = depthResponse.ok ? depthResponse.data : null;
    const contract: any = contractResponse.ok ? contractResponse.data : null;
    const multiplier = Number(contract?.multiplier);
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      attempts.push({ source: 'kucoin', error: 'contract multiplier unavailable' });
    } else {
      const book: OrderBook = {
        bids: buildOrderBookLevels(Array.isArray(data?.bids) ? data.bids.slice(0, safeLimit) : [], multiplier),
        asks: buildOrderBookLevels(Array.isArray(data?.asks) ? data.asks.slice(0, safeLimit) : [], multiplier),
        dataSource: 'live',
      };
      const result = finalizeOrderBook(symbol, book, 'kucoin', (depthResponse.ok && depthResponse.stale) || (contractResponse.ok && contractResponse.stale) ? 'degraded' : 'live', 'base_asset');
      if (result) {
        setCached(cacheKey, result);
        return result;
      }
      attempts.push({ source: 'kucoin', error: depthResponse.ok ? 'invalid order book' : depthResponse.message });
    }
  } catch (error: any) {
    attempts.push({ source: 'kucoin', error: error?.message || 'failed' });
  }

  try {
    const parsed = await getSpace4OrderBook(symbol.replace(/-?USDT$/i, ''), safeLimit, priority);
    if (parsed) {
      const result = finalizeOrderBook(symbol, parsed.book, 'hf_space_4', 'degraded', parsed.volumeUnit);
      if (result) {
        setCached(cacheKey, result);
        return result;
      }
    }
    attempts.push({ source: 'hf_space_4', error: 'empty or untrusted order book' });
  } catch (error: any) {
    attempts.push({ source: 'hf_space_4', error: error?.message || 'failed' });
  }

  // Space-2 exposes a documented /api/trading/orderbook contract. Treat its
  // quantities as base-asset units only when the payload contains real positive
  // price/size pairs; otherwise reject it rather than guessing depth.
  try {
    const base = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(USDT|USDC|USD|PERP)$/i, '');
    const response = await requestHfSpaceJson(
      'space2',
      `/api/trading/orderbook?symbol=${encodeURIComponent(base)}&depth=${safeLimit}`,
      { timeoutMs: 8_000, cacheTtlMs: 3_000, priority },
    );
    const payload: any = response.json?.data ?? response.json;
    const book: OrderBook = {
      bids: buildOrderBookLevels(Array.isArray(payload?.bids) ? payload.bids.slice(0, safeLimit) : []),
      asks: buildOrderBookLevels(Array.isArray(payload?.asks) ? payload.asks.slice(0, safeLimit) : []),
      dataSource: 'live',
    };
    const result = response.ok ? finalizeOrderBook(symbol, book, 'hf_space_2', 'degraded', 'base_asset') : null;
    if (result) {
      setCached(cacheKey, result);
      return result;
    }
    attempts.push({ source: 'hf_space_2', error: response.ok ? 'empty or untrusted order book' : response.error || `HTTP ${response.status}` });
  } catch (error: any) {
    attempts.push({ source: 'hf_space_2', error: error?.message || 'failed' });
  }

  throw new MarketDataError(`All order-book providers failed for ${symbol}`, attempts);
}

export function isKuCoinUsdtMarginedContract(contract: any): boolean {
  const symbol = String(contract?.symbol || '').trim().toUpperCase();
  if (!symbol.endsWith('USDTM') || canonicalizeKuCoinContractSymbol(symbol) === null) return false;

  const settleCurrency = String(contract?.settleCurrency || '').trim().toUpperCase();
  const quoteCurrency = String(contract?.quoteCurrency || '').trim().toUpperCase();
  if (settleCurrency && settleCurrency !== 'USDT') return false;
  if (quoteCurrency && quoteCurrency !== 'USDT') return false;
  return true;
}

export function extractBinanceUsdtPerpetualSymbols(exchangeInfo: any): Set<string> {
  if (!Array.isArray(exchangeInfo?.symbols)) return new Set();
  return new Set(
    exchangeInfo.symbols
      .filter((market: any) =>
        typeof market?.symbol === 'string' &&
        market.status === 'TRADING' &&
        market.contractType === 'PERPETUAL' &&
        market.quoteAsset === 'USDT'
      )
      .map((market: any) => String(market.symbol).toUpperCase()),
  );
}

export function normalizeKuCoinContractMetrics(
  contract: any,
  lastPrice: number,
): { volume24h: number; openInterestUsd: number } {
  const volume24h = Number(contract?.volumeOf24h);
  const contracts = Number(contract?.openInterest);
  const multiplier = Number(contract?.multiplier);
  return {
    volume24h: Number.isFinite(volume24h) && volume24h >= 0 ? volume24h : 0,
    openInterestUsd:
      Number.isFinite(contracts) && contracts >= 0 &&
      Number.isFinite(multiplier) && multiplier > 0 &&
      Number.isFinite(lastPrice) && lastPrice > 0
        ? contracts * multiplier * lastPrice
        : 0,
  };
}

function tickerObservationMetadata(input: {
  source: 'binance' | 'kucoin' | 'hf_space_2';
  canonicalSymbol: string;
  providerSymbol: string;
  sourceObservedAt: number | null;
  providerReadAt: number;
  stale: boolean;
}): ObservationMetadataV1 {
  return canonicalObservationMetadata({
    sourceObservedAt: input.sourceObservedAt,
    providerReadAt: input.providerReadAt,
    receivedAt: input.providerReadAt,
    cacheStoredAt: null,
    provider: input.source,
    venue: input.source === 'binance' ? 'BINANCE_USDM' : input.source === 'kucoin' ? 'KUCOIN_FUTURES' : input.source,
    canonicalInstrumentId: input.canonicalSymbol,
    providerInstrumentId: input.providerSymbol,
    adapterVersion: 'market_ticker_adapter_v2',
    qualityState: input.sourceObservedAt === null ? 'MISSING' : input.stale ? 'STALE' : input.source === 'hf_space_2' ? 'DEGRADED' : 'VALID',
    staleReason: input.sourceObservedAt === null ? 'provider_event_time_missing' : input.stale ? 'provider_transport_cache' : null,
    lineageId: `ticker:${input.source}:${input.providerSymbol}:${input.sourceObservedAt ?? 'unknown'}`,
    dependencyFamily: 'DERIVATIVES_POSITIONING',
    parentLineageIds: [],
    decisionEligible: input.sourceObservedAt !== null && !input.stale && input.source !== 'hf_space_2',
  });
}

// ── Tier 1: Binance bulk tickers ────────────────────────────────────────────
// Binance has no bulk open-interest endpoint, so OI is fetched per-symbol in
// parallel (Promise.all) for the already volume-sorted, size-limited slice
// only — same pattern the candidates route uses for candles (see gotcha #4
// in the handoff doc: sequential loops here previously cost ~18s vs ~1.3s).
async function fetchBinanceTickersBulk(limit: number): Promise<{ tickers: SymbolTicker[] }> {
  const [tickerResp, fundingResp, exchangeInfoResp] = await Promise.all([
    smartFetchJson(`${BINANCE_USDM_BASE}/fapi/v1/ticker/24hr`, { timeoutMs: MARKET_BULK_TIMEOUT_MS, logKey: 'binance:ticker_24hr_bulk', priority: 'background', cacheTtlMs: 6_000 }),
    smartFetchJson(`${BINANCE_USDM_BASE}/fapi/v1/premiumIndex`, { timeoutMs: MARKET_BULK_TIMEOUT_MS, logKey: 'binance:premium_index_bulk', priority: 'background', cacheTtlMs: 10_000 }),
    smartFetchJson(`${BINANCE_USDM_BASE}/fapi/v1/exchangeInfo`, { timeoutMs: MARKET_BULK_TIMEOUT_MS, logKey: 'binance:exchange_info_bulk', priority: 'background', cacheTtlMs: 60_000 }),
  ]);
  if (!tickerResp.ok || !Array.isArray(tickerResp.json)) {
    throw new Error(tickerResp.error || 'Invalid Binance 24hr ticker payload');
  }

  const bulkStale = tickerResp.stale === true || fundingResp.stale === true || exchangeInfoResp.stale === true;
  const fundingMap = new Map<string, number>();
  if (fundingResp.ok && Array.isArray(fundingResp.json)) {
    for (const f of fundingResp.json) {
      const rate = parseFloat(String(f.lastFundingRate ?? '0'));
      if (f.symbol && Number.isFinite(rate)) fundingMap.set(String(f.symbol), rate);
    }
  }

  const tradableUsdtPerpetuals = exchangeInfoResp.ok
    ? extractBinanceUsdtPerpetualSymbols(exchangeInfoResp.json)
    : new Set<string>();
  const exchangeInfoAuthoritative = tradableUsdtPerpetuals.size > 0;

  const usdtRows = tickerResp.json
    .filter((t: any) =>
      typeof t.symbol === 'string' &&
      canonicalizeBinanceSymbol(t.symbol) !== null &&
      (!exchangeInfoAuthoritative || tradableUsdtPerpetuals.has(String(t.symbol).toUpperCase()))
    )
    .map((t: any) => ({
      binSymbol: String(t.symbol),
      canonicalSymbol: canonicalizeBinanceSymbol(t.symbol)!,
      lastPrice: parseFloat(String(t.lastPrice ?? '0')) || 0,
      priceChangePct: parseFloat(String(t.priceChangePercent ?? '0')) || 0,
      quoteVolume: parseFloat(String(t.quoteVolume ?? '0')) || 0,
      volume: parseFloat(String(t.volume ?? '0')) || 0,
      high: parseFloat(String(t.highPrice ?? '0')) || 0,
      low: parseFloat(String(t.lowPrice ?? '0')) || 0,
      sourceObservedAt: Number.isFinite(Number(t.closeTime)) ? Number(t.closeTime) : null,
    }))
    .filter((t: any) => t.lastPrice > 0)
    .sort((a: any, b: any) => b.quoteVolume - a.quoteVolume)
    .slice(0, limit);

  // Keep the wide market universe fast: open interest enrichment is bounded by
  // one short aggregate budget. Completed rows are kept; unfinished rows stay
  // explicitly unavailable (NaN) instead of blocking the Overview bootstrap or
  // being fabricated as zero. The underlying bounded requests may finish and
  // warm the normal provider cache after this snapshot returns.
  const oiFetchLimit = Math.min(BINANCE_TICKER_OI_ENRICH_LIMIT, usdtRows.length);
  const oiResults: any[] = new Array(usdtRows.length).fill(null);
  const oiWork = mapWithConcurrency(
    usdtRows.slice(0, oiFetchLimit).map((row: any, index: number) => ({ row, index })),
    4,
    async ({ row, index }) => {
      const value = await binanceOpenInterest(row.binSymbol, 'background').catch(() => null);
      oiResults[index] = value;
      return value;
    },
  );
  if (oiFetchLimit > 0) {
    await Promise.race([
      oiWork,
      new Promise<void>((resolve) => setTimeout(resolve, BINANCE_TICKER_OI_ENRICH_BUDGET_MS)),
    ]);
    void oiWork.catch(() => undefined);
  }

  const providerReadAt = Date.now();
  const tickers: SymbolTicker[] = usdtRows.map((row: any, i: number) => {
    const oiResult: any = oiResults[i];
    const oiBase = oiResult && oiResult.ok ? parseFloat(String(oiResult.data?.openInterest ?? '')) : Number.NaN;
    const fundingRate = fundingMap.has(row.binSymbol) ? fundingMap.get(row.binSymbol)! : Number.NaN;
    return {
      symbol: row.canonicalSymbol,
      lastPrice: row.lastPrice,
      turnover24h: row.quoteVolume,
      priceChange24hPct: Number(row.priceChangePct.toFixed(2)),
      volume24h: row.volume,
      high24h: row.high || row.lastPrice,
      low24h: row.low || row.lastPrice,
      fundingRate,
      openInterest: Number.isFinite(oiBase) && oiBase > 0 ? oiBase * row.lastPrice : Number.NaN,
      dataState: (bulkStale || row.sourceObservedAt === null ? 'degraded' : 'live') as DataState,
      timestamp: row.sourceObservedAt ?? 0,
      observationMetadata: tickerObservationMetadata({
        source: 'binance',
        canonicalSymbol: row.canonicalSymbol,
        providerSymbol: row.binSymbol,
        sourceObservedAt: row.sourceObservedAt,
        providerReadAt,
        stale: bulkStale,
      }),
    };
  });

  return { tickers };
}

// ── Tier 2: KuCoin bulk tickers ─────────────────────────────────────────────
// Uses KuCoin Futures public active-contract metadata and market statistics.
// Only USDT-margined contracts are admitted to the canonical USDT universe;
// inverse USD-margined contracts are intentionally excluded.
async function fetchKuCoinTickersBulk(limit: number): Promise<{ tickers: SymbolTicker[] }> {
  const response = await smartFetchJson(
    `${KUCOIN_FUTURES_BASE}/api/v1/contracts/active`,
    { timeoutMs: MARKET_BULK_TIMEOUT_MS, logKey: 'kucoin:contracts_active', priority: 'background', cacheTtlMs: 10_000 }
  );
  if (!response.ok || !response.json || !Array.isArray(response.json.data)) {
    throw new Error('Invalid KuCoin contracts payload');
  }

  const kucoinBulkStale = response.stale === true;
  const providerReadAt = Date.now();
  const responseObservedRaw = Number(response.json.timestamp ?? response.json.ts);
  const responseObservedAt = Number.isFinite(responseObservedRaw)
    ? (responseObservedRaw < 10_000_000_000 ? responseObservedRaw * 1000 : responseObservedRaw)
    : null;
  const tickers: SymbolTicker[] = response.json.data
    .filter((c: any) => isKuCoinUsdtMarginedContract(c))
    .map((c: any) => {
      const symbol = canonicalizeKuCoinContractSymbol(String(c.symbol || ''));
      if (!symbol) return null;
      const lastPrice = parseFloat(String(c.lastTradePrice || c.indexPrice || '0')) || 0;
      const turnover24h = parseFloat(String(c.turnoverOf24h || '0')) || 0;
      const changePct = parseFloat(String(c.priceChgPct || '0')) * 100;
      // KuCoin's contract payload reports volumeOf24h in base-asset units,
      // while openInterest is contract count and does require the multiplier.
      const metrics = normalizeKuCoinContractMetrics(c, lastPrice);
      const vol24h = metrics.volume24h;
      const fundingRaw = Number(c.fundingFeeRate);
      const fundingRate = Number.isFinite(fundingRaw) ? fundingRaw : 0;
      const highRaw = Number(c.highPrice);
      const lowRaw = Number(c.lowPrice);
      const complete = Number.isFinite(highRaw) && highRaw > 0 &&
        Number.isFinite(lowRaw) && lowRaw > 0 &&
        Number.isFinite(fundingRaw) && metrics.openInterestUsd > 0;
      const rowObservedRaw = Number(c.timestamp ?? c.ts ?? c.time);
      const rowObservedAt = Number.isFinite(rowObservedRaw)
        ? (rowObservedRaw < 10_000_000_000 ? rowObservedRaw * 1000 : rowObservedRaw)
        : responseObservedAt;
      return {
        symbol,
        lastPrice,
        turnover24h,
        priceChange24hPct: Number(changePct.toFixed(2)),
        volume24h: vol24h,
        high24h: Number.isFinite(highRaw) && highRaw > 0 ? highRaw : lastPrice,
        low24h: Number.isFinite(lowRaw) && lowRaw > 0 ? lowRaw : lastPrice,
        fundingRate,
        openInterest: metrics.openInterestUsd,
        dataState: (!kucoinBulkStale && lastPrice > 0 ? 'live' : 'degraded') as DataState,
        timestamp: rowObservedAt ?? 0,
        observationMetadata: tickerObservationMetadata({
          source: 'kucoin',
          canonicalSymbol: symbol,
          providerSymbol: String(c.symbol || ''),
          sourceObservedAt: rowObservedAt,
          providerReadAt,
          stale: kucoinBulkStale,
        }),
      };
    })
    .filter((t: SymbolTicker | null): t is SymbolTicker => t !== null && t.lastPrice > 0)
    .sort((a: SymbolTicker, b: SymbolTicker) => b.turnover24h - a.turnover24h)
    .slice(0, limit);

  return { tickers };
}

async function mapWithConcurrency<T, R>(
  rows: T[],
  concurrency: number,
  mapper: (row: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(rows.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, rows.length)) }, async () => {
    while (cursor < rows.length) {
      const index = cursor++;
      results[index] = await mapper(rows[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Tier 3: owner-managed Hugging Face fallback ─────────────────────────────
//
// Bulk ticker fallback intentionally composes TWO truthful owner-managed
// contracts instead of filling missing futures fields with zeroes:
//   * Space-2 /api/market supplies real cached 24h market statistics.
//   * Space-4 Short Hunter supplies real futures funding + open interest.
// A row is admitted only when both contracts provide every SymbolTicker field.
// Missing data means "no row", never a guessed/sentinel market number.

export const HF_FALLBACK_ENRICHMENT_CONCURRENCY = 4;
export const HF_FALLBACK_CACHE_TTL_MS = 30_000;

export interface HfFallbackCycleTelemetry {
  lastStartedAt: number | null;
  lastCompletedAt: number | null;
  lastDurationMs: number | null;
  requestedRows: number;
  returnedRows: number;
  maxConcurrency: number;
  cacheTtlMs: number;
  cadence: 'DEGRADED_FALLBACK';
  lastError: string | null;
}

const hfFallbackCycleTelemetry: HfFallbackCycleTelemetry = {
  lastStartedAt: null, lastCompletedAt: null, lastDurationMs: null, requestedRows: 0, returnedRows: 0,
  maxConcurrency: HF_FALLBACK_ENRICHMENT_CONCURRENCY, cacheTtlMs: HF_FALLBACK_CACHE_TTL_MS,
  cadence: 'DEGRADED_FALLBACK', lastError: null,
};

export function getHfFallbackCycleTelemetry(): HfFallbackCycleTelemetry {
  return { ...hfFallbackCycleTelemetry };
}

const VERIFIED_FALLBACK_BASE_ASSETS = new Set([
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'DOT',
  'MATIC', 'LTC', 'BCH', 'ATOM', 'TRX', 'ETC', 'AAVE', 'UNI', 'XLM', 'XMR',
  'ALGO', 'DASH', 'EOS', 'XTZ', 'BSV',
]);

interface Space2MarketTickerRow {
  baseAsset: string;
  lastPrice: number;
  turnover24hUsd: number;
  priceChange24hPct: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

function strictFinite(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function strictPositive(value: unknown): number | null {
  const parsed = strictFinite(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function hfBaseAsset(raw: unknown): string | null {
  let symbol = String(raw || '').trim().toUpperCase().replace(/[\s_\-/]/g, '');
  if (!symbol) return null;
  if (symbol.endsWith('USDTM')) symbol = symbol.slice(0, -5);
  else if (symbol.endsWith('USDT')) symbol = symbol.slice(0, -4);
  if (symbol === 'XBT') symbol = 'BTC';
  return VERIFIED_FALLBACK_BASE_ASSETS.has(symbol) ? symbol : null;
}

/**
 * Parse Space-2's documented REAL-DATA-ONLY `/api/market` contract.
 * The Space returns null for unavailable metrics; those rows fail closed here.
 */
export function parseSpace2MarketTickers(json: any, limit: number): Space2MarketTickerRow[] {
  if (json?.success !== true || !Array.isArray(json?.data)) return [];
  const now = Date.now();
  const maxAgeMs = 15 * 60_000;
  const rows: Space2MarketTickerRow[] = [];

  for (const raw of json.data) {
    const baseAsset = hfBaseAsset(raw?.symbol);
    const lastPrice = strictPositive(raw?.price ?? raw?.lastPrice ?? raw?.current_price);
    const turnover24hUsd = strictPositive(raw?.volume_24h ?? raw?.total_volume ?? raw?.turnover_24h);
    const priceChange24hPct = strictFinite(raw?.change_24h ?? raw?.price_change_24h ?? raw?.price_change_percentage_24h);
    const high24h = strictPositive(raw?.high_24h ?? raw?.high24h);
    const low24h = strictPositive(raw?.low_24h ?? raw?.low24h);
    const timestampRaw = strictFinite(raw?.last_updated ?? raw?.timestamp ?? json?.timestamp);
    const timestamp = timestampRaw !== null && timestampRaw < 10_000_000_000 ? timestampRaw * 1000 : timestampRaw;

    if (
      !baseAsset || lastPrice === null || turnover24hUsd === null || priceChange24hPct === null ||
      high24h === null || low24h === null || timestamp === null || timestamp <= 0 ||
      high24h < Math.max(lastPrice, low24h) || low24h > Math.min(lastPrice, high24h) ||
      now - timestamp > maxAgeMs || timestamp > now + 60_000
    ) continue;

    rows.push({
      baseAsset,
      lastPrice,
      turnover24hUsd,
      priceChange24hPct,
      high24h,
      low24h,
      timestamp,
    });
    if (rows.length >= Math.max(1, Math.min(20, limit))) break;
  }
  return rows;
}

async function fetchHfSpaceTickersBulk(limit: number): Promise<{ tickers: SymbolTicker[] }> {
  const safeLimit = Math.max(1, Math.min(20, limit));
  const startedAt = Date.now();
  hfFallbackCycleTelemetry.lastStartedAt = startedAt;
  hfFallbackCycleTelemetry.lastCompletedAt = null;
  hfFallbackCycleTelemetry.lastDurationMs = null;
  hfFallbackCycleTelemetry.requestedRows = 0;
  hfFallbackCycleTelemetry.returnedRows = 0;
  hfFallbackCycleTelemetry.lastError = null;
  try {
    const market = await requestHfSpaceJson(
      'space2',
      `/api/market?limit=${safeLimit}`,
      { timeoutMs: 10_000, cacheTtlMs: HF_FALLBACK_CACHE_TTL_MS, priority: 'background' },
    );
    const marketRows = market.ok ? parseSpace2MarketTickers(market.json, safeLimit) : [];
    hfFallbackCycleTelemetry.requestedRows = marketRows.length;
    if (!marketRows.length) throw new Error('Space-2 market payload is empty, stale, or incomplete');

    const enriched = await mapWithConcurrency(marketRows, HF_FALLBACK_ENRICHMENT_CONCURRENCY, async (row): Promise<SymbolTicker | null> => {
    // Space-4 is the approved futures complement. Funding can legitimately be
    // exactly zero, so null — not falsiness — is the missing-data sentinel.
    const futures = await getSpace4Market(row.baseAsset);
    if (!futures || futures.fundingRate === null || futures.openInterest === null || futures.openInterest <= 0) {
      return null;
    }
    const baseVolume24h = row.turnover24hUsd / row.lastPrice;
    if (!Number.isFinite(baseVolume24h) || baseVolume24h <= 0) return null;

    return {
      symbol: canonicalizeBinanceSymbol(`${row.baseAsset}USDT`)!,
      lastPrice: row.lastPrice,
      turnover24h: row.turnover24hUsd,
      priceChange24hPct: row.priceChange24hPct,
      volume24h: baseVolume24h,
      high24h: row.high24h,
      low24h: row.low24h,
      fundingRate: futures.fundingRate,
      fundingQuality: 'VALID',
      openInterest: futures.openInterest,
      dataState: 'degraded',
      timestamp: row.timestamp,
      observationMetadata: tickerObservationMetadata({
        source: 'hf_space_2',
        canonicalSymbol: canonicalizeBinanceSymbol(`${row.baseAsset}USDT`)!,
        providerSymbol: row.baseAsset,
        sourceObservedAt: row.timestamp,
        providerReadAt: Date.now(),
        stale: false,
      }),
    };
    });

    const tickers = enriched.filter((row): row is SymbolTicker => row !== null);
    hfFallbackCycleTelemetry.returnedRows = tickers.length;
    if (!tickers.length) {
      throw new Error('Owner-managed HF market rows lacked verified futures funding/open-interest enrichment');
    }
    return { tickers };
  } catch (error) {
    hfFallbackCycleTelemetry.lastError = error instanceof Error ? error.message.slice(0, 240) : 'hf_fallback_cycle_failed';
    throw error;
  } finally {
    const completedAt = Date.now();
    hfFallbackCycleTelemetry.lastCompletedAt = completedAt;
    hfFallbackCycleTelemetry.lastDurationMs = Math.max(0, completedAt - startedAt);
  }
}

/**
 * Probe the two public futures providers independently.
 *
 * The market-data hierarchy intentionally stops after the first usable source,
 * so the winning source cannot also be used as evidence that the provider which
 * was never attempted is degraded. These lightweight public endpoints produce
 * a real per-provider health observation through the same direct/smart-DNS/proxy
 * transport used by market reads.
 */
export async function probePrimaryProviderHealth(): Promise<PrimaryProviderHealth> {
  const probe = async (url: string, logKey: string): Promise<PrimaryProviderProbe> => {
    const startedAt = Date.now();
    const result = await smartFetchJson(url, {
      timeoutMs: MARKET_BULK_TIMEOUT_MS,
      logKey,
      priority: 'interactive',
      cacheMode: 'none',
      deduplicate: false,
    });
    const latencyMs = Math.max(0, Date.now() - startedAt);
    return {
      status: result.ok ? 'live' : 'unavailable',
      latencyMs,
      route: result.route || null,
      reason: result.ok ? null : result.error || `HTTP ${result.status}`,
    };
  };

  const [binance, kucoin] = await Promise.all([
    probe(`${BINANCE_USDM_BASE}/fapi/v1/ping`, 'binance:health_ping'),
    probe(`${KUCOIN_FUTURES_BASE}/api/v1/timestamp`, 'kucoin:health_timestamp'),
  ]);
  return { checkedAt: Date.now(), binance, kucoin };
}

// ── Public: getTickers ──────────────────────────────────────────────────────
// All normal UI routes share one 80-market snapshot. This prevents Overview,
// sentiment, scanner and symbol-detail requests from launching duplicate
// exchange/provider chains during the same initial render.
export async function getTickers(limit = 40): Promise<TickersResult> {
  const safeLimit = Math.max(1, Math.min(120, Math.floor(Number(limit) || 40)));
  const masterLimit = safeLimit > 80 ? 120 : 80;
  const masterKey = `tickers_${masterLimit}`;
  const result = await coalesceMarketRequest<TickersResult>(masterKey, () => getTickersUncached(masterLimit));
  return { ...result, tickers: sanitizeTickerUniverse(result.tickers).slice(0, safeLimit) };
}

async function getTickersUncached(limit = 40): Promise<TickersResult> {
  const cacheKey = `tickers_${limit}`;
  const cached = getCached<TickersResult>(cacheKey, TICKERS_TTL_MS);
  if (cached) return cached;

  const attempts: Array<{ source: MarketDataSource; error: string }> = [];

  try {
    const { tickers } = await fetchBinanceTickersBulk(limit);
    if (tickers.length) {
      const state: DataState = tickers.every((ticker) => ticker.dataState === 'live') ? 'live' : 'degraded';
      const out: TickersResult = { tickers, dataState: state, source: 'binance' };
      setCached(cacheKey, out);
      return out;
    }
    attempts.push({ source: 'binance', error: 'empty result' });
  } catch (e: any) {
    attempts.push({ source: 'binance', error: e?.message || 'failed' });
  }

  try {
    const { tickers } = await fetchKuCoinTickersBulk(limit);
    if (tickers.length) {
      const state: DataState = tickers.every((ticker) => ticker.dataState === 'live') ? 'live' : 'degraded';
      const out: TickersResult = { tickers, dataState: state, source: 'kucoin' };
      setCached(cacheKey, out);
      return out;
    }
    attempts.push({ source: 'kucoin', error: 'empty result' });
  } catch (e: any) {
    attempts.push({ source: 'kucoin', error: e?.message || 'failed' });
  }

  try {
    const { tickers } = await fetchHfSpaceTickersBulk(limit);
    if (tickers.length) {
      const out: TickersResult = { tickers, dataState: 'degraded', source: 'hf_space_2' };
      setCached(cacheKey, out);
      return out;
    }
    attempts.push({ source: 'hf_space_2', error: 'empty owner-managed HF result' });
  } catch (e: any) {
    attempts.push({ source: 'hf_space_2', error: e?.message || 'failed' });
  }

  throw new MarketDataError('All ticker tiers (binance, kucoin, owner-managed HF Spaces) failed', attempts);
}

// ── Public: getCandles ──────────────────────────────────────────────────────
// KuCoin Futures /api/v1/kline/query uses granularity in seconds.
// Keep this contract separate from CANDLE_INTERVAL_MS, which is used for
// closed-candle checks and timestamp arithmetic.
export const KUCOIN_KLINE_GRANULARITY_SECONDS: Record<CandleInterval, number> = {
  '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400,
};
export const KUCOIN_KLINE_PAGE_SIZE = 200;

export async function getCandles(
  symbol: string,
  intervalKey: CandleInterval = '1h',
  limit = 30,
  priority: SmartFetchPriority = 'interactive',
): Promise<CandlesResult> {
  const safeLimit = Math.max(2, Math.min(1000, Math.floor(Number(limit) || 30)));
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  const key = `candles_${normalizedSymbol}_${intervalKey}_${safeLimit}_${priority === 'background' ? 'bg' : 'fg'}`;
  return coalesceMarketRequest<CandlesResult>(key, () => getCandlesUncached(normalizedSymbol, intervalKey, safeLimit, priority));
}

async function getCandlesUncached(
  symbol: string,
  intervalKey: CandleInterval = '1h',
  limit = 30,
  priority: SmartFetchPriority = 'interactive',
): Promise<CandlesResult> {
  const cacheKey = `candles_${symbol}_${intervalKey}_${limit}`;
  const cached = getCached<CandlesResult>(cacheKey, CANDLES_TTL_MS);
  if (cached) return cached;

  const attempts: Array<{ source: MarketDataSource; error: string }> = [];

  // Tier 1: Binance — symbols like "BTC-USDT" pass straight through
  // binanceKlines's own toBinanceUsdmSymbol converter.
  try {
    const r = await binanceKlines(symbol, intervalKey, limit, priority);
    if (r.ok && Array.isArray((r as any).data) && (r as any).data.length) {
      const candles: Candle[] = (r as any).data.map((row: any) => ({
        timestamp: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      })).filter((c: Candle) => Number.isFinite(c.close) && c.close > 0);
      if (candles.length) {
        const out = validatedCandleResult({ rows: candles, symbol, providerInstrumentId: toBinanceUsdmSymbol(symbol), intervalKey, limit, source: 'binance', dataState: r.ok && r.stale ? 'degraded' : 'live', stale: r.ok && r.stale === true, ageMs: r.ok ? r.cacheAgeMs : undefined });
        if (!out) throw new Error('binance_closed_candle_validation_failed');
        setCached(cacheKey, out);
        return rememberVerifiedCandles(cacheKey, out);
      }
    }
    attempts.push({ source: 'binance', error: r.ok ? 'empty candles' : (r as any).message || 'failed' });
  } catch (e: any) {
    attempts.push({ source: 'binance', error: e?.message || 'failed' });
  }

  // Tier 2: KuCoin — uses the same toKuCoinFuturesSymbol mapper as the rest
  // of the app (the one that already correctly handles BTC-USDT → XBTUSDTM).
  try {
    const kuSymbol = toKuCoinFuturesSymbol(symbol);
    const granularitySeconds = KUCOIN_KLINE_GRANULARITY_SECONDS[intervalKey] ?? 3600;
    const response = await smartFetchJson(
      `${KUCOIN_FUTURES_BASE}/api/v1/kline/query?symbol=${encodeURIComponent(kuSymbol)}&granularity=${granularitySeconds}`,
      { timeoutMs: MARKET_CANDLE_TIMEOUT_MS, logKey: `kucoin:kline:${kuSymbol}`, priority, cacheTtlMs: 12_000 }
    );
    if (response.ok && response.json && Array.isArray(response.json.data) && response.json.data.length) {
      const candles: Candle[] = response.json.data.map((row: any) => ({
        timestamp: parseInt(String(row[0]), 10),
        open: parseFloat(String(row[1])),
        high: parseFloat(String(row[2])),
        low: parseFloat(String(row[3])),
        close: parseFloat(String(row[4])),
        volume: parseFloat(String(row[5])),
      }))
        .filter((c: Candle) => Number.isFinite(c.timestamp) && Number.isFinite(c.close) && c.close > 0)
        .sort((a: Candle, b: Candle) => a.timestamp - b.timestamp)
        .slice(-limit);
      if (candles.length) {
        const out = validatedCandleResult({ rows: candles, symbol, providerInstrumentId: kuSymbol, intervalKey, limit, source: 'kucoin', dataState: response.stale ? 'degraded' : 'live', stale: response.stale === true, ageMs: response.cacheAgeMs });
        if (!out) throw new Error('kucoin_closed_candle_validation_failed');
        setCached(cacheKey, out);
        return rememberVerifiedCandles(cacheKey, out);
      }
    }
    attempts.push({ source: 'kucoin', error: 'empty or invalid payload' });
  } catch (e: any) {
    attempts.push({ source: 'kucoin', error: e?.message || 'failed' });
  }

  // Tier 3: verified Space-4 Short Hunter OHLCV. Space-2's generic OHLCV
  // surfaces are deliberately excluded: live audit found empty-success
  // responses and a 1m request returning a 1h cadence.
  try {
    const hfSymbol = symbol.replace(/-?USDT$/i, '');
    const response = await requestHfSpaceJson(
      'space4',
      `/api/short-hunter/ohlcv/${encodeURIComponent(hfSymbol)}?interval=${intervalKey}&limit=${limit}`,
      {
        timeoutMs: 8_000,
        cacheTtlMs: 15_000,
        priority: priority === 'critical' ? 'critical' : 'background',
      },
    );
    const candles = response.ok
      ? parseHfSpace4Candles(response.json, intervalKey, limit)
      : [];
    if (candles.length) {
      const out = validatedCandleResult({ rows: candles, symbol, providerInstrumentId: hfSymbol, intervalKey, limit, source: 'hf_space_4', dataState: 'degraded' });
      if (!out) throw new Error('hf_space_4_closed_candle_validation_failed');
      setCached(cacheKey, out);
      return rememberVerifiedCandles(cacheKey, out);
    }
    attempts.push({ source: 'hf_space_4', error: 'empty or unparseable payload' });
  } catch (e: any) {
    attempts.push({ source: 'hf_space_4', error: e?.message || 'failed' });
  }

  // Tier 4: Space-2 historical transport. Only its live-verified 1h contract is
  // enabled, and its parser removes the still-open candle before returning.
  if (intervalKey === '1h') {
    try {
      const historical = await getSpace2HistoricalCandles(symbol, intervalKey, limit);
      if (historical?.candles.length) {
        const out = validatedCandleResult({ rows: historical.candles, symbol, providerInstrumentId: symbol, intervalKey, limit, source: 'hf_space_2', dataState: 'degraded' });
        if (!out) throw new Error('hf_space_2_closed_candle_validation_failed');
        setCached(cacheKey, out);
        return rememberVerifiedCandles(cacheKey, out);
      }
      attempts.push({ source: 'hf_space_2', error: 'empty or untrusted historical payload' });
    } catch (e: any) {
      attempts.push({ source: 'hf_space_2', error: e?.message || 'failed' });
    }
  }

  const stale = getStaleVerifiedCandles(cacheKey);
  if (stale) {
    setCached(cacheKey, stale);
    return stale;
  }

  throw new MarketDataError(`All market-data tiers failed to return candles for ${symbol}`, attempts);
}

/**
 * Fetch a longer verified Binance history by walking backwards with `endTime`.
 * Binance caps a single kline response at 1,000 rows, so requesting 2,000–5,000
 * bars must be paginated server-side. The result is still closed-candle-only,
 * deduplicated, ordered, and bounded by the caller's requested horizon.
 */
async function getPaginatedBinanceHistory(
  symbol: string,
  intervalKey: CandleInterval,
  limit: number,
): Promise<CandlesResult | null> {
  const normalized = toBinanceUsdmSymbol(symbol);
  const target = Math.max(2, Math.min(5_000, Math.floor(limit)));
  const rows = new Map<number, Candle>();
  let endTime: number | undefined;
  let stale = false;
  let ageMs = 0;

  for (let page = 0; page < Math.ceil(target / 1_000); page += 1) {
    const batch = Math.min(1_000, target - rows.size);
    if (batch <= 0) break;
    const params = new URLSearchParams({ symbol: normalized, interval: intervalKey, limit: String(batch) });
    if (endTime != null) params.set('endTime', String(endTime));
    const response = await smartFetchJson(
      `${BINANCE_USDM_BASE}/fapi/v1/klines?${params.toString()}`,
      {
        timeoutMs: Math.max(MARKET_CANDLE_TIMEOUT_MS, 12_000),
        logKey: `binance:historical:${normalized}:${intervalKey}:${page}`,
        priority: 'critical',
        cacheTtlMs: 30_000,
      },
    );
    if (!response.ok || !Array.isArray(response.json) || response.json.length === 0) break;
    stale = stale || response.stale === true;
    ageMs = Math.max(ageMs, response.cacheAgeMs || 0);
    const parsed = response.json.map((row: any) => ({
      timestamp: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    })).filter((candle: Candle) => (
      Number.isFinite(candle.timestamp)
      && Number.isFinite(candle.open)
      && Number.isFinite(candle.high)
      && Number.isFinite(candle.low)
      && Number.isFinite(candle.close)
      && candle.close > 0
    ));
    if (!parsed.length) break;
    parsed.forEach((candle: Candle) => rows.set(candle.timestamp, candle));
    const oldest = Math.min(...parsed.map((candle: Candle) => candle.timestamp));
    endTime = oldest - 1;
    if (parsed.length < batch) break;
  }

  return validatedCandleResult({
    rows: [...rows.values()], symbol, providerInstrumentId: normalized, intervalKey, limit: target,
    source: 'binance', dataState: stale ? 'degraded' : 'live', stale, ageMs,
  });
}

/**
 * Fetch longer KuCoin Futures history using the public `to` cursor. The current
 * `/api/v1/kline/query` contract returns at most 200 rows per request, so long
 * validation windows must page backward explicitly. Binance remains the primary
 * provider; this is the deterministic secondary path when Binance cannot supply
 * the requested research horizon.
 */
async function getPaginatedKuCoinHistory(
  symbol: string,
  intervalKey: CandleInterval,
  limit: number,
): Promise<CandlesResult | null> {
  const kuSymbol = toKuCoinFuturesSymbol(symbol);
  const target = Math.max(2, Math.min(5_000, Math.floor(limit)));
  const granularitySeconds = KUCOIN_KLINE_GRANULARITY_SECONDS[intervalKey] ?? 3600;
  const rows = new Map<number, Candle>();
  let endTime: number | undefined;
  let stale = false;
  let ageMs = 0;
  const maxPages = Math.ceil(target / KUCOIN_KLINE_PAGE_SIZE) + 1;

  for (let page = 0; page < maxPages && rows.size < target; page += 1) {
    const params = new URLSearchParams({
      symbol: kuSymbol,
      granularity: String(granularitySeconds),
    });
    if (endTime != null) params.set('to', String(endTime));
    const response = await smartFetchJson(
      `${KUCOIN_FUTURES_BASE}/api/v1/kline/query?${params.toString()}`,
      {
        timeoutMs: Math.max(MARKET_CANDLE_TIMEOUT_MS, 12_000),
        logKey: `kucoin:historical:${kuSymbol}:${intervalKey}:${page}`,
        priority: 'critical',
        cacheTtlMs: 30_000,
      },
    );
    const payload = response.json?.data;
    if (!response.ok || !Array.isArray(payload) || payload.length === 0) break;
    stale = stale || response.stale === true;
    ageMs = Math.max(ageMs, response.cacheAgeMs || 0);
    const parsed = payload.map((row: any) => ({
      timestamp: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    })).filter((candle: Candle) => (
      Number.isFinite(candle.timestamp)
      && Number.isFinite(candle.open)
      && Number.isFinite(candle.high)
      && Number.isFinite(candle.low)
      && Number.isFinite(candle.close)
      && candle.close > 0
    ));
    if (!parsed.length) break;
    parsed.forEach((candle: Candle) => rows.set(candle.timestamp, candle));
    const oldest = Math.min(...parsed.map((candle: Candle) => candle.timestamp));
    if (!Number.isFinite(oldest) || oldest <= 0) break;
    const nextEndTime = oldest - 1;
    if (endTime != null && nextEndTime >= endTime) break;
    endTime = nextEndTime;
    if (payload.length < KUCOIN_KLINE_PAGE_SIZE) break;
  }

  return validatedCandleResult({
    rows: [...rows.values()], symbol, providerInstrumentId: kuSymbol, intervalKey, limit: target,
    source: 'kucoin', dataState: stale ? 'degraded' : 'live', stale, ageMs,
  });
}

/** Backtest-safe candles with the still-open interval removed for every source. */
export async function getHistoricalCandles(
  symbol: string,
  intervalKey: CandleInterval = '1h',
  limit = 500,
): Promise<CandlesResult> {
  const safeLimit = Math.max(2, Math.min(5_000, Math.floor(Number(limit) || 500)));
  let bestPaginated: CandlesResult | null = null;

  // Long research windows are paginated in provider priority order. A complete
  // Binance result wins immediately. If Binance cannot supply the full horizon,
  // KuCoin Futures gets the same opportunity before tertiary fallbacks.
  if (safeLimit > 499) {
    try {
      const binance = await getPaginatedBinanceHistory(symbol, intervalKey, safeLimit);
      if (binance) {
        bestPaginated = binance;
        if (binance.candles.length >= safeLimit) return binance;
      }
    } catch {
      // Continue to the public KuCoin Futures secondary path.
    }
    try {
      const kucoin = await getPaginatedKuCoinHistory(symbol, intervalKey, safeLimit);
      if (kucoin) {
        if (!bestPaginated || kucoin.candles.length > bestPaginated.candles.length) bestPaginated = kucoin;
        if (kucoin.candles.length >= safeLimit) return kucoin;
      }
    } catch {
      // Continue to the existing verified multi-provider fallback chain.
    }
  }

  let result: CandlesResult;
  try {
    result = await getCandles(symbol, intervalKey, Math.min(1_000, safeLimit + 1), 'critical');
  } catch (error) {
    if (bestPaginated?.candles.length && bestPaginated.candles.length >= 2) return bestPaginated;
    throw error;
  }
  const intervalMs = CANDLE_INTERVAL_MS[intervalKey];
  const now = Date.now();
  const closed = result.candles
    .filter((candle) => candle.timestamp + intervalMs <= now)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-safeLimit);

  // If neither exchange completed the full requested horizon, preserve the
  // longest verified closed-candle history rather than silently shortening it.
  if (bestPaginated && bestPaginated.candles.length > closed.length) return bestPaginated;
  if (closed.length < 2) {
    throw new MarketDataError(`Insufficient closed candles for ${symbol}`, [
      { source: result.source, error: 'fewer than two closed candles' },
    ]);
  }
  return { ...result, candles: closed };
}
