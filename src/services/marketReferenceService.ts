/**
 * Public market-reference fallbacks used only to keep read-only UI charts and
 * market cards populated while the canonical Futures feeds are unavailable.
 *
 * IMPORTANT: data returned by this module is reference-only. It must never be
 * promoted to futures funding/open-interest evidence, candidate qualification,
 * trade-plan authorization, or autonomous execution.
 */
import type { Candle, DataState, SymbolTicker } from '../types';
import { smartFetchJson, type SmartFetchPriority } from './proxyFetch';

export type MarketReferenceSource = 'binance_spot' | 'coingecko' | 'coincap' | 'coinpaprika';

export interface ReferenceTickerResult {
  tickers: SymbolTicker[];
  dataState: DataState;
  source: MarketReferenceSource;
  referenceOnly: true;
}

export interface ReferenceCandlesResult {
  candles: Candle[];
  dataState: DataState;
  source: MarketReferenceSource;
  referenceOnly: true;
  stale?: boolean;
  ageMs?: number;
}

const COINGECKO_BASE = process.env.COINGECKO_BASE_URL || 'https://api.coingecko.com/api/v3';
const COINCAP_BASE = process.env.COINCAP_BASE_URL || 'https://api.coincap.io/v2';
const COINPAPRIKA_BASE = process.env.COINPAPRIKA_BASE_URL || 'https://api.coinpaprika.com/v1';
const BINANCE_SPOT_BASE = process.env.BINANCE_SPOT_BASE_URL || 'https://api.binance.com';

const ASSET_IDS: Record<string, { coingecko: string; coincap: string; coinpaprika: string }> = {
  BTC: { coingecko: 'bitcoin', coincap: 'bitcoin', coinpaprika: 'btc-bitcoin' },
  ETH: { coingecko: 'ethereum', coincap: 'ethereum', coinpaprika: 'eth-ethereum' },
  SOL: { coingecko: 'solana', coincap: 'solana', coinpaprika: 'sol-solana' },
  BNB: { coingecko: 'binancecoin', coincap: 'binance-coin', coinpaprika: 'bnb-binance-coin' },
  XRP: { coingecko: 'ripple', coincap: 'xrp', coinpaprika: 'xrp-xrp' },
  DOGE: { coingecko: 'dogecoin', coincap: 'dogecoin', coinpaprika: 'doge-dogecoin' },
  ADA: { coingecko: 'cardano', coincap: 'cardano', coinpaprika: 'ada-cardano' },
  AVAX: { coingecko: 'avalanche-2', coincap: 'avalanche', coinpaprika: 'avax-avalanche' },
  LINK: { coingecko: 'chainlink', coincap: 'chainlink', coinpaprika: 'link-chainlink' },
  DOT: { coingecko: 'polkadot', coincap: 'polkadot', coinpaprika: 'dot-polkadot' },
  TRX: { coingecko: 'tron', coincap: 'tron', coinpaprika: 'trx-tron' },
  LTC: { coingecko: 'litecoin', coincap: 'litecoin', coinpaprika: 'ltc-litecoin' },
  BCH: { coingecko: 'bitcoin-cash', coincap: 'bitcoin-cash', coinpaprika: 'bch-bitcoin-cash' },
  TON: { coingecko: 'the-open-network', coincap: 'toncoin', coinpaprika: 'ton-toncoin' },
  NEAR: { coingecko: 'near', coincap: 'near-protocol', coinpaprika: 'near-near-protocol' },
  ATOM: { coingecko: 'cosmos', coincap: 'cosmos', coinpaprika: 'atom-cosmos' },
  UNI: { coingecko: 'uniswap', coincap: 'uniswap', coinpaprika: 'uni-uniswap' },
  AAVE: { coingecko: 'aave', coincap: 'aave', coinpaprika: 'aave-new' },
  ARB: { coingecko: 'arbitrum', coincap: 'arbitrum', coinpaprika: 'arb-arbitrum' },
  OP: { coingecko: 'optimism', coincap: 'optimism', coinpaprika: 'op-optimism' },
  SUI: { coingecko: 'sui', coincap: 'sui', coinpaprika: 'sui-sui' },
  PEPE: { coingecko: 'pepe', coincap: 'pepe', coinpaprika: 'pepe-pepe' },
};

function canonicalBase(symbol: string): string {
  return String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/USDTM?$/, '').replace(/USDCM?$/, '').replace(/^XBT$/, 'BTC');
}

function canonicalSymbol(symbol: string): string {
  return `${canonicalBase(symbol)}-USDT`;
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function referenceTicker(input: {
  symbol: string;
  price: number;
  change24hPct?: number | null;
  volume24h?: number | null;
  turnover24h?: number | null;
  high24h?: number | null;
  low24h?: number | null;
  sparkline?: number[];
  /** Actual upstream quote/event time. Zero means the provider omitted it. */
  sourceObservedAt?: number | null;
}): SymbolTicker {
  const price = input.price;
  return {
    symbol: canonicalSymbol(input.symbol),
    lastPrice: price,
    turnover24h: input.turnover24h ?? 0,
    priceChange24hPct: input.change24hPct ?? 0,
    volume24h: input.volume24h ?? 0,
    high24h: input.high24h ?? price,
    low24h: input.low24h ?? price,
    // Explicitly unavailable for spot/reference sources. NaN is rendered as —
    // by the UI and cannot be mistaken for a real zero funding/OI observation.
    fundingRate: Number.NaN,
    openInterest: Number.NaN,
    dataState: 'degraded',
    timestamp: Number.isFinite(input.sourceObservedAt) && Number(input.sourceObservedAt) > 0
      ? Number(input.sourceObservedAt)
      : 0,
    sparkline1h: (input.sparkline || []).filter((value) => Number.isFinite(value) && value > 0).slice(-24),
  };
}

function intervalMs(interval: string): number {
  switch (interval) {
    case '1m': return 60_000;
    case '5m': return 5 * 60_000;
    case '15m': return 15 * 60_000;
    case '4h': return 4 * 60 * 60_000;
    case '1d': return 24 * 60 * 60_000;
    case '1h':
    default: return 60 * 60_000;
  }
}

function aggregatePricePoints(
  points: Array<{ timestamp: number; price: number; volume?: number }>,
  interval: string,
  limit: number,
): Candle[] {
  const bucketMs = intervalMs(interval);
  const buckets = new Map<number, Candle>();
  for (const point of points) {
    if (!Number.isFinite(point.timestamp) || !Number.isFinite(point.price) || point.price <= 0) continue;
    const bucket = Math.floor(point.timestamp / bucketMs) * bucketMs;
    const existing = buckets.get(bucket);
    if (!existing) {
      buckets.set(bucket, {
        timestamp: bucket,
        open: point.price,
        high: point.price,
        low: point.price,
        close: point.price,
        volume: Number.isFinite(point.volume) ? Number(point.volume) : 0,
      });
    } else {
      existing.high = Math.max(existing.high, point.price);
      existing.low = Math.min(existing.low, point.price);
      existing.close = point.price;
      if (Number.isFinite(point.volume)) existing.volume = Math.max(existing.volume, Number(point.volume));
    }
  }
  return [...buckets.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-limit);
}

export async function getReferenceTickers(limit = 40, priority: SmartFetchPriority = 'interactive'): Promise<ReferenceTickerResult | null> {
  const safeLimit = Math.max(4, Math.min(120, Math.floor(limit || 40)));

  // Attached API pack primary public reference: CoinGecko.
  const gecko = await smartFetchJson(
    `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${safeLimit}&page=1&sparkline=true&price_change_percentage=24h`,
    { timeoutMs: 8_000, priority, logKey: 'reference:coingecko:markets', cacheTtlMs: 20_000 },
  );
  if (gecko.ok && Array.isArray(gecko.json)) {
    const tickers = gecko.json.map((row: any) => {
      const price = toNumber(row?.current_price);
      const symbol = String(row?.symbol || '').toUpperCase();
      if (!price || !symbol) return null;
      return referenceTicker({
        symbol,
        price,
        change24hPct: toNumber(row?.price_change_percentage_24h),
        volume24h: null,
        turnover24h: toNumber(row?.total_volume),
        high24h: toNumber(row?.high_24h),
        low24h: toNumber(row?.low_24h),
        sparkline: Array.isArray(row?.sparkline_in_7d?.price) ? row.sparkline_in_7d.price.map(Number) : [],
        sourceObservedAt: Date.parse(String(row?.last_updated || '')),
      });
    }).filter((row: SymbolTicker | null): row is SymbolTicker => row !== null);
    if (tickers.length) return { tickers, dataState: 'degraded', source: 'coingecko', referenceOnly: true };
  }

  // Keyless fallback from the same attached pack: CoinCap.
  const coincap = await smartFetchJson(
    `${COINCAP_BASE}/assets?limit=${safeLimit}`,
    { timeoutMs: 8_000, priority, logKey: 'reference:coincap:assets', cacheTtlMs: 20_000 },
  );
  if (coincap.ok && Array.isArray(coincap.json?.data)) {
    const tickers = coincap.json.data.map((row: any) => {
      const price = toNumber(row?.priceUsd);
      const symbol = String(row?.symbol || '').toUpperCase();
      if (!price || !symbol) return null;
      return referenceTicker({
        symbol,
        price,
        change24hPct: toNumber(row?.changePercent24Hr),
        volume24h: toNumber(row?.volumeUsd24Hr) && price ? Number(row.volumeUsd24Hr) / price : null,
        turnover24h: toNumber(row?.volumeUsd24Hr),
        sourceObservedAt: toNumber(row?.timestamp) ?? toNumber(coincap.json?.timestamp),
      });
    }).filter((row: SymbolTicker | null): row is SymbolTicker => row !== null);
    if (tickers.length) return { tickers, dataState: 'degraded', source: 'coincap', referenceOnly: true };
  }

  // Last keyless fallback: CoinPaprika. Its all-tickers payload is larger, so
  // it is intentionally attempted only after the lighter providers fail.
  const paprika = await smartFetchJson(
    `${COINPAPRIKA_BASE}/tickers?quotes=USD`,
    { timeoutMs: 9_000, priority, logKey: 'reference:coinpaprika:tickers', cacheTtlMs: 30_000 },
  );
  if (paprika.ok && Array.isArray(paprika.json)) {
    const tickers = paprika.json.slice(0, safeLimit).map((row: any) => {
      const price = toNumber(row?.quotes?.USD?.price);
      const symbol = String(row?.symbol || '').toUpperCase();
      if (!price || !symbol) return null;
      const turnover = toNumber(row?.quotes?.USD?.volume_24h);
      return referenceTicker({
        symbol,
        price,
        change24hPct: toNumber(row?.quotes?.USD?.percent_change_24h),
        turnover24h: turnover,
        volume24h: turnover && price ? turnover / price : null,
        sourceObservedAt: Date.parse(String(row?.last_updated || '')),
      });
    }).filter((row: SymbolTicker | null): row is SymbolTicker => row !== null);
    if (tickers.length) return { tickers, dataState: 'degraded', source: 'coinpaprika', referenceOnly: true };
  }

  return null;
}

export async function getReferenceCandles(
  symbol: string,
  interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' = '1h',
  limit = 120,
  priority: SmartFetchPriority = 'interactive',
): Promise<ReferenceCandlesResult | null> {
  const safeLimit = Math.max(30, Math.min(300, Math.floor(limit || 120)));
  const base = canonicalBase(symbol);

  // First reference path: Binance Spot. This is deliberately not treated as
  // Futures evidence, but it preserves exact OHLC cadence when the futures host
  // is geo-blocked while the public spot host is still reachable.
  const spotSymbol = `${base}USDT`;
  const spot = await smartFetchJson(
    `${BINANCE_SPOT_BASE}/api/v3/klines?symbol=${encodeURIComponent(spotSymbol)}&interval=${encodeURIComponent(interval)}&limit=${safeLimit}`,
    { timeoutMs: 7_000, priority, logKey: `reference:binance-spot:${spotSymbol}:${interval}`, cacheTtlMs: 15_000 },
  );
  if (spot.ok && Array.isArray(spot.json)) {
    const candles = spot.json.map((row: any) => ({
      timestamp: Number(row?.[0]),
      open: Number(row?.[1]),
      high: Number(row?.[2]),
      low: Number(row?.[3]),
      close: Number(row?.[4]),
      volume: Number(row?.[5]),
    })).filter((row: Candle) => Number.isFinite(row.timestamp) && Number.isFinite(row.close) && row.close > 0).slice(-safeLimit);
    if (candles.length) return { candles, dataState: 'degraded', source: 'binance_spot', referenceOnly: true, stale: spot.stale === true, ageMs: spot.cacheAgeMs };
  }

  const ids = ASSET_IDS[base];
  if (!ids) return null;

  // CoinCap supports fixed history cadences. 4h is built from real 1h points.
  const coincapInterval = interval === '4h' ? 'h1' : ({ '1m': 'm1', '5m': 'm5', '15m': 'm15', '1h': 'h1', '1d': 'd1' } as Record<string, string>)[interval];
  if (coincapInterval) {
    const end = Date.now();
    const start = end - intervalMs(interval) * safeLimit * 2;
    const coincap = await smartFetchJson(
      `${COINCAP_BASE}/assets/${encodeURIComponent(ids.coincap)}/history?interval=${coincapInterval}&start=${start}&end=${end}`,
      { timeoutMs: 8_000, priority, logKey: `reference:coincap:history:${base}:${interval}`, cacheTtlMs: 20_000 },
    );
    if (coincap.ok && Array.isArray(coincap.json?.data)) {
      const points = coincap.json.data.map((row: any) => ({ timestamp: Number(row?.time), price: Number(row?.priceUsd) }));
      const candles = aggregatePricePoints(points, interval, safeLimit);
      if (candles.length) return { candles, dataState: 'degraded', source: 'coincap', referenceOnly: true, stale: coincap.stale === true, ageMs: coincap.cacheAgeMs };
    }
  }

  // CoinGecko market_chart is a final read-only display fallback. OHLC values
  // are aggregated from observed price samples; it is never fed into decisions.
  const days = Math.max(1, Math.min(90, Math.ceil((intervalMs(interval) * safeLimit) / 86_400_000) + 1));
  const gecko = await smartFetchJson(
    `${COINGECKO_BASE}/coins/${encodeURIComponent(ids.coingecko)}/market_chart?vs_currency=usd&days=${days}`,
    { timeoutMs: 8_000, priority, logKey: `reference:coingecko:history:${base}:${interval}`, cacheTtlMs: 20_000 },
  );
  if (gecko.ok && Array.isArray(gecko.json?.prices)) {
    const volumeByTs = new Map<number, number>((Array.isArray(gecko.json?.total_volumes) ? gecko.json.total_volumes : []).map((row: any) => [Number(row?.[0]), Number(row?.[1])]));
    const points = gecko.json.prices.map((row: any) => ({ timestamp: Number(row?.[0]), price: Number(row?.[1]), volume: volumeByTs.get(Number(row?.[0])) }));
    const candles = aggregatePricePoints(points, interval, safeLimit);
    if (candles.length) return { candles, dataState: 'degraded', source: 'coingecko', referenceOnly: true, stale: gecko.stale === true, ageMs: gecko.cacheAgeMs };
  }

  return null;
}

export async function getReferenceTickerForSymbol(symbol: string, priority: SmartFetchPriority = 'interactive'): Promise<{ ticker: SymbolTicker; source: MarketReferenceSource } | null> {
  const target = canonicalSymbol(symbol);
  const universe = await getReferenceTickers(120, priority);
  const ticker = universe?.tickers.find((row) => row.symbol === target) || null;
  if (ticker && universe) return { ticker, source: universe.source };

  const candles = await getReferenceCandles(symbol, '1h', 48, priority);
  if (!candles?.candles.length) return null;
  const first = candles.candles[0];
  const last = candles.candles[candles.candles.length - 1];
  const high = Math.max(...candles.candles.map((row) => row.high));
  const low = Math.min(...candles.candles.map((row) => row.low));
  const volume = candles.candles.reduce((sum, row) => sum + (Number.isFinite(row.volume) ? row.volume : 0), 0);
  return {
    source: candles.source,
    ticker: referenceTicker({
      symbol,
      price: last.close,
      change24hPct: first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0,
      high24h: high,
      low24h: low,
      volume24h: volume,
      turnover24h: candles.candles.reduce((sum, row) => sum + row.close * (Number.isFinite(row.volume) ? row.volume : 0), 0),
      sparkline: candles.candles.map((row) => row.close),
      sourceObservedAt: last.timestamp,
    }),
  };
}
