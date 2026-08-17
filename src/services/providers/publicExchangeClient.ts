/* Extracted from the legacy exchangeClient facade to make the read-only boundary explicit. */

/**
 * publicExchangeClient.ts — Read-only public exchange fetcher for health checks and server routes.
 * Uses the same IPv4-aware fetch path as proxyFetch (smartFetchJson) so /api/health
 * matches live market-data connectivity on hosts with broken IPv6 stacks.
 *
 * Response contract:
 *   ok: true  → { ok, exchange, route, url, data }       data = unwrapped exchange payload
 *   ok: false → { ok, exchange, route, url, reason, message, status? }
 *
 * KuCoin envelope ({ code:'200000', data:{...} }) is unwrapped here so callers
 * never access json.data.data. Binance responses are returned as-is.
 */

import { smartFetchJson, type SmartFetchPriority } from '../proxyFetch';

// ─── Types ────────────────────────────────────────────────────────────────────

type ExchangeFailureReason =
  | 'exchange_forbidden_or_geo_blocked'
  | 'dns_or_network_unreachable'
  | 'timeout'
  | 'bad_status'
  | 'bad_json'
  | 'bad_symbol'
  | 'bad_exchange_code'
  | 'unknown_fetch_failed';

export interface ExchangeErrorBody {
  ok: false;
  exchange: 'kucoin' | 'binance';
  route: string;
  url: string;
  status?: number;
  reason: ExchangeFailureReason;
  message: string;
}

export interface ExchangeOkBody<T = unknown> {
  ok: true;
  exchange: 'kucoin' | 'binance';
  route: string;
  url: string;
  data: T;
  stale?: boolean;
  cacheAgeMs?: number;
}

export type ExchangeResult<T = unknown> = ExchangeOkBody<T> | ExchangeErrorBody;

// ─── Constants ────────────────────────────────────────────────────────────────

const KUCOIN_FUTURES_BASE =
  process.env.KUCOIN_FUTURES_BASE || 'https://api-futures.kucoin.com';
const KUCOIN_UTA_BASE =
  process.env.KUCOIN_UTA_BASE || 'https://api.kucoin.com';
/** Configurable Binance USD-M base — use BINANCE_PROXY_BASE_URL for geo-restricted relays. */
const BINANCE_USDM_BASE =
  process.env.BINANCE_PROXY_BASE_URL ||
  process.env.BINANCE_FUTURES_BASE ||
  'https://fapi.binance.com';

// ─── Error classifiers ────────────────────────────────────────────────────────

function classifyFetchError(err: unknown): ExchangeFailureReason {
  const msg =
    err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes('timeout') || msg.includes('aborted') || msg.includes('aborterror'))
    return 'timeout';
  if (
    msg.includes('enotfound') ||
    msg.includes('eai_again') ||
    msg.includes('dns')
  )
    return 'dns_or_network_unreachable';
  if (
    msg.includes('econnrefused') ||
    msg.includes('network') ||
    msg.includes('fetch failed')
  )
    return 'dns_or_network_unreachable';
  return 'unknown_fetch_failed';
}

function classifyStatus(status: number): ExchangeFailureReason {
  if (status === 403 || status === 451 || status === 418)
    return 'exchange_forbidden_or_geo_blocked';
  if (status === 400 || status === 404) return 'bad_symbol';
  return 'bad_status';
}

// ─── Core fetcher ─────────────────────────────────────────────────────────────

async function fetchRaw<T>(
  exchange: 'kucoin' | 'binance',
  route: string,
  url: string,
  method: 'GET' | 'POST' = 'GET',
  timeoutMs = 8000,
  priority: SmartFetchPriority = 'interactive',
): Promise<ExchangeOkBody<T> | ExchangeErrorBody> {
  try {
    const result = await smartFetchJson(url, {
      method,
      headers: {
        accept: 'application/json',
        'user-agent': 'apex-futures-terminal/1.0',
      },
      timeoutMs,
      logKey: `${exchange}:${route}`,
      priority,
    });

    if (!result.ok) {
      const errMsg = result.error || `HTTP ${result.status}`;
      if (result.status === 0) {
        return {
          ok: false,
          exchange,
          route,
          url,
          reason: classifyFetchError(new Error(errMsg)),
          message: errMsg,
        };
      }
      return {
        ok: false,
        exchange,
        route,
        url,
        status: result.status,
        reason: result.error === 'bad_json' ? 'bad_json' : classifyStatus(result.status),
        message: errMsg,
      };
    }

    return { ok: true, exchange, route, url, data: result.json as T, stale: result.stale === true, cacheAgeMs: result.cacheAgeMs };
  } catch (err) {
    return {
      ok: false,
      exchange,
      route,
      url,
      reason: classifyFetchError(err),
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Fetch from KuCoin and unwrap the { code, data } envelope.
 * Returns ok:false if code !== '200000'.
 */
async function fetchKuCoin<T>(
  route: string,
  url: string,
  method: 'GET' | 'POST' = 'GET',
  timeoutMs = 8000,
  priority: SmartFetchPriority = 'interactive',
): Promise<ExchangeOkBody<T> | ExchangeErrorBody> {
  const raw = await fetchRaw<{ code: string; data: T; msg?: string }>(
    'kucoin',
    route,
    url,
    method,
    timeoutMs,
    priority,
  );
  if (!raw.ok) return raw as ExchangeErrorBody;

  const { code, data, msg } = raw.data;
  if (code !== '200000') {
    return {
      ok: false,
      exchange: 'kucoin',
      route,
      url,
      reason: 'bad_exchange_code',
      message: msg || `KuCoin returned code ${code}`,
    };
  }
  return { ok: true, exchange: 'kucoin', route, url, data, stale: raw.stale === true, cacheAgeMs: raw.cacheAgeMs };
}

// ─── Query string builder ─────────────────────────────────────────────────────

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).length > 0) {
      sp.set(k, String(v));
    }
  }
  return sp.toString();
}

// ─── Symbol converters ────────────────────────────────────────────────────────

/**
 * Canonical instrument identity used to compare symbols across representations
 * (app-internal ticker, KuCoin Futures contract symbol, Binance symbol, etc.)
 * without relying on prefix matching, which silently mismatches BTC vs XBT.
 *
 *   canonicalInstrumentId('BTC-USDT')  -> 'BTC-USDT'
 *   canonicalInstrumentId('BTCUSDT')   -> 'BTC-USDT'
 *   canonicalInstrumentId('XBTUSDTM')  -> 'BTC-USDT'
 *   canonicalInstrumentId('ETH-USDT')  -> 'ETH-USDT'
 *   canonicalInstrumentId('ETHUSDTM')  -> 'ETH-USDT'
 *
 * Always compare with exact equality — never startsWith — since prefix
 * matching can conflate distinct instruments that merely share a prefix.
 */
export function canonicalInstrumentId(raw: string): string {
  const clean = String(raw || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const compact = clean.replace(/-/g, '');
  let base: string;
  let quote: string;
  if (compact.endsWith('USDTM')) {
    base = compact.slice(0, -5);
    quote = 'USDT';
  } else if (compact.endsWith('USDCM')) {
    base = compact.slice(0, -5);
    quote = 'USDC';
  } else if (compact.endsWith('USDT')) {
    base = compact.slice(0, -4);
    quote = 'USDT';
  } else if (compact.endsWith('USDC')) {
    base = compact.slice(0, -4);
    quote = 'USDC';
  } else if (clean.includes('-')) {
    const [b, q] = clean.split('-');
    base = b || '';
    quote = q || 'USDT';
  } else {
    base = compact;
    quote = 'USDT';
  }
  if (base === 'XBT') base = 'BTC';
  return `${base}-${quote}`;
}

/**
 * Map app-internal ticker (e.g. 'BTC-USDT') to KuCoin Futures contract symbol.
 * Handles already-converted symbols (e.g. 'XBTUSDTM') gracefully.
 */
export function toKuCoinFuturesSymbol(ticker: string): string {
  const clean = ticker.replace('-', '').toUpperCase();
  if (ticker === 'BTC-USDT' || clean === 'BTCUSDT') return 'XBTUSDTM';
  if (clean.endsWith('USDTM')) return clean;
  if (clean.endsWith('USDT')) return `${clean}M`;
  return clean;
}

/**
 * Map app-internal ticker to Binance USDⓈ-M symbol (e.g. 'BTCUSDT').
 */
export function toBinanceUsdmSymbol(ticker: string): string {
  const clean = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean === 'XBTUSDTM') return 'BTCUSDT';
  if (clean.endsWith('USDTM')) {
    const base = clean.slice(0, -5);
    return `${base === 'XBT' ? 'BTC' : base}USDT`;
  }
  return clean;
}

/**
 * Normalize any interval string to seconds.
 * Returns: 60 | 300 | 900 | 1800 | 3600
 *
 * Supports: '1'|'1m'|'1min'|'60' → 60
 *           '5'|'5m'|'5min'|'300' → 300
 *           '15'|'15m'|'15min'|'900' → 900
 *           '30'|'30m'|'30min'|'1800' → 1800
 *           '60m'|'1h'|'3600' → 3600
 *
 * The KuCoin Futures kline endpoint accepts this seconds value directly.
 */
export function toKuCoinKlineGranularity(input: string | number | undefined): number {
  if (input === undefined || input === null) return 60;
  const raw = String(input).toLowerCase().trim();

  if (raw === '1' || raw === '1m' || raw === '1min' || raw === '60') return 60;
  if (raw === '5' || raw === '5m' || raw === '5min' || raw === '300') return 300;
  if (raw === '15' || raw === '15m' || raw === '15min' || raw === '900') return 900;
  if (raw === '30' || raw === '30m' || raw === '30min' || raw === '1800') return 1800;
  if (raw === '60m' || raw === '1h' || raw === '3600') return 3600;
  if (raw === '2' || raw === '2h' || raw === '120') return 7200;

  const numeric = Number(raw);
  // Already in seconds
  if ([60, 300, 900, 1800, 3600, 7200].includes(numeric)) return numeric;
  // Passed as minutes (1, 5, 15, 30, 60, 120) — convert to seconds
  if ([1, 5, 15, 30, 60, 120].includes(numeric)) return numeric * 60;

  return 60; // safe fallback to 1 minute
}

// ─── KuCoin Futures endpoints ─────────────────────────────────────────────────

export async function kucoinTicker(symbolOrTicker: string): Promise<ExchangeResult> {
  const symbol = toKuCoinFuturesSymbol(symbolOrTicker);
  const url = `${KUCOIN_FUTURES_BASE}/api/v1/ticker?${qs({ symbol })}`;
  return fetchKuCoin('ticker', url);
}

export async function kucoinLevel2(symbolOrTicker: string, priority: SmartFetchPriority = 'interactive'): Promise<ExchangeResult> {
  const symbol = toKuCoinFuturesSymbol(symbolOrTicker);
  const url = `${KUCOIN_FUTURES_BASE}/api/v1/level2/snapshot?${qs({ symbol })}`;
  return fetchKuCoin('level2', url, 'GET', 8000, priority);
}

export async function kucoinTrades(symbolOrTicker: string): Promise<ExchangeResult> {
  const symbol = toKuCoinFuturesSymbol(symbolOrTicker);
  const url = `${KUCOIN_FUTURES_BASE}/api/v1/trade/history?${qs({ symbol })}`;
  return fetchKuCoin('trades', url);
}

export async function kucoinCandles(
  symbolOrTicker: string,
  granularityInput?: string | number,
  fromMs?: number,
  toMs?: number,
): Promise<ExchangeResult> {
  const symbol = toKuCoinFuturesSymbol(symbolOrTicker);
  // Normalize to the seconds contract expected by KuCoin Futures.
  const granularitySec = toKuCoinKlineGranularity(granularityInput);
  const now = Date.now();
  const from = fromMs ?? now - granularitySec * 1000 * 120; // 120 candles window
  const to = toMs ?? now;

  const url = `${KUCOIN_FUTURES_BASE}/api/v1/kline/query?${qs({
    symbol,
    granularity: granularitySec,
    from,
    to,
  })}`;
  return fetchKuCoin('candles', url);
}

export async function kucoinFunding(symbolOrTicker: string): Promise<ExchangeResult> {
  const symbol = toKuCoinFuturesSymbol(symbolOrTicker);
  const url = `${KUCOIN_FUTURES_BASE}/api/v1/funding-rate/${encodeURIComponent(symbol)}/current`;
  return fetchKuCoin('funding', url);
}

/**
 * Public KuCoin UTA funding-rate history. The UTA endpoint is preferred for
 * research context because the classic public funding-history endpoint is
 * being superseded by the unified market-data API.
 */
export async function kucoinFundingHistory(
  symbolOrTicker: string,
  limit = 48,
  priority: SmartFetchPriority = 'background',
): Promise<ExchangeResult> {
  const symbol = toKuCoinFuturesSymbol(symbolOrTicker);
  const safeLimit = Math.max(12, Math.min(96, Math.floor(limit)));
  const endAt = Date.now();
  // Funding cadence can vary by contract; use a bounded 40-day window and
  // trim locally instead of assuming every market is exactly 8-hourly.
  const startAt = endAt - 40 * 24 * 60 * 60 * 1000;
  const url = `${KUCOIN_UTA_BASE}/api/ua/v1/market/funding-rate-history?${qs({ symbol, startAt, endAt })}`;
  const result = await fetchKuCoin<{ symbol?: string; list?: Array<Record<string, unknown>> }>(
    'funding-history-uta',
    url,
    'GET',
    8000,
    priority,
  );
  if (!result.ok) return result;
  const rows = Array.isArray(result.data?.list) ? result.data.list : [];
  return { ...result, data: rows.slice(-safeLimit) };
}

/** Public KuCoin UTA Futures open-interest history at 5-minute cadence. */
export async function kucoinOpenInterestHistory(
  symbolOrTicker: string,
  interval: '5min' | '15min' | '30min' | '1hour' | '4hour' | '1day' = '5min',
  limit = 8,
  priority: SmartFetchPriority = 'background',
): Promise<ExchangeResult> {
  const symbol = toKuCoinFuturesSymbol(symbolOrTicker);
  const safeLimit = Math.max(2, Math.min(100, Math.floor(limit)));
  const intervalMs: Record<typeof interval, number> = {
    '5min': 5 * 60_000,
    '15min': 15 * 60_000,
    '30min': 30 * 60_000,
    '1hour': 60 * 60_000,
    '4hour': 4 * 60 * 60_000,
    '1day': 24 * 60 * 60_000,
  };
  const endAt = Date.now();
  const startAt = endAt - intervalMs[interval] * Math.max(safeLimit + 4, 16);
  const url = `${KUCOIN_UTA_BASE}/api/ua/v1/market/open-interest?${qs({
    symbol,
    interval,
    pageSize: safeLimit,
    startAt,
    endAt,
  })}`;
  const result = await fetchKuCoin<Array<Record<string, unknown>>>(
    'open-interest-history-uta',
    url,
    'GET',
    8000,
    priority,
  );
  if (!result.ok) return result;
  const rows = Array.isArray(result.data) ? result.data : [];
  return { ...result, data: rows.slice(-safeLimit) };
}

export async function kucoinContract(symbolOrTicker: string, priority: SmartFetchPriority = 'interactive'): Promise<ExchangeResult> {
  const symbol = toKuCoinFuturesSymbol(symbolOrTicker);
  const url = `${KUCOIN_FUTURES_BASE}/api/v1/contracts/${encodeURIComponent(symbol)}`;
  return fetchKuCoin('contract', url, 'GET', 8000, priority);
}

export async function kucoinActiveContracts(): Promise<ExchangeResult> {
  const url = `${KUCOIN_FUTURES_BASE}/api/v1/contracts/active`;
  return fetchKuCoin('contracts-active', url, 'GET', 8000, 'background');
}

export async function kucoinBulletPublic(): Promise<ExchangeResult> {
  const url = `${KUCOIN_FUTURES_BASE}/api/v1/bullet-public`;
  return fetchKuCoin('bullet-public', url, 'POST');
}

// ─── Binance USDⓈ-M Futures endpoints ────────────────────────────────────────

/** Exchange info — used for symbol validation only; response is large. */
export async function binanceExchangeInfo(): Promise<ExchangeResult> {
  const url = `${BINANCE_USDM_BASE}/fapi/v1/exchangeInfo`;
  return fetchRaw('binance', 'exchangeInfo', url);
}

export async function binanceTicker(symbolOrTicker: string): Promise<ExchangeResult> {
  const symbol = toBinanceUsdmSymbol(symbolOrTicker);
  const url = `${BINANCE_USDM_BASE}/fapi/v1/ticker/price?${qs({ symbol })}`;
  return fetchRaw('binance', 'ticker', url);
}

export async function binanceDepth(symbolOrTicker: string, limit = 20, priority: SmartFetchPriority = 'interactive'): Promise<ExchangeResult> {
  const symbol = toBinanceUsdmSymbol(symbolOrTicker);
  const url = `${BINANCE_USDM_BASE}/fapi/v1/depth?${qs({ symbol, limit })}`;
  return fetchRaw('binance', 'depth', url, 'GET', 8000, priority);
}

export async function binanceKlines(
  symbolOrTicker: string,
  interval = '1m',
  limit = 120,
  priority: SmartFetchPriority = 'interactive',
): Promise<ExchangeResult> {
  const symbol = toBinanceUsdmSymbol(symbolOrTicker);
  const url = `${BINANCE_USDM_BASE}/fapi/v1/klines?${qs({ symbol, interval, limit })}`;
  return fetchRaw('binance', 'klines', url, 'GET', 8000, priority);
}

export async function binanceFunding(symbolOrTicker: string): Promise<ExchangeResult> {
  const symbol = toBinanceUsdmSymbol(symbolOrTicker);
  const url = `${BINANCE_USDM_BASE}/fapi/v1/premiumIndex?${qs({ symbol })}`;
  return fetchRaw('binance', 'funding', url);
}

export async function binanceFundingHistory(
  symbolOrTicker: string,
  limit = 48,
  priority: SmartFetchPriority = 'background',
): Promise<ExchangeResult> {
  const symbol = toBinanceUsdmSymbol(symbolOrTicker);
  const safeLimit = Math.max(12, Math.min(1_000, Math.floor(Number(limit) || 48)));
  const url = `${BINANCE_USDM_BASE}/fapi/v1/fundingRate?${qs({ symbol, limit: safeLimit })}`;
  return fetchRaw('binance', 'fundingHistory', url, 'GET', 8000, priority);
}

export async function binanceOpenInterestHistory(
  symbolOrTicker: string,
  period: '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '12h' | '1d' = '5m',
  limit = 8,
  priority: SmartFetchPriority = 'background',
): Promise<ExchangeResult> {
  const symbol = toBinanceUsdmSymbol(symbolOrTicker);
  const safeLimit = Math.max(2, Math.min(500, Math.floor(Number(limit) || 8)));
  const url = `${BINANCE_USDM_BASE}/futures/data/openInterestHist?${qs({ symbol, period, limit: safeLimit })}`;
  return fetchRaw('binance', 'openInterestHistory', url, 'GET', 8000, priority);
}

export async function binanceOpenInterest(symbolOrTicker: string, priority: SmartFetchPriority = 'background'): Promise<ExchangeResult> {
  const symbol = toBinanceUsdmSymbol(symbolOrTicker);
  const url = `${BINANCE_USDM_BASE}/fapi/v1/openInterest?${qs({ symbol })}`;
  return fetchRaw('binance', 'openInterest', url, 'GET', 8000, priority);
}

export async function binanceGlobalLongShort(
  symbolOrTicker: string,
  period = '5m',
  limit = 1,
): Promise<ExchangeResult> {
  const symbol = toBinanceUsdmSymbol(symbolOrTicker);
  const url = `${BINANCE_USDM_BASE}/futures/data/globalLongShortAccountRatio?${qs({
    symbol,
    period,
    limit,
  })}`;
  return fetchRaw('binance', 'globalLongShortAccountRatio', url);
}

export async function binanceTakerBuySell(
  symbolOrTicker: string,
  period = '5m',
  limit = 1,
): Promise<ExchangeResult> {
  const symbol = toBinanceUsdmSymbol(symbolOrTicker);
  const url = `${BINANCE_USDM_BASE}/futures/data/takerlongshortRatio?${qs({
    symbol,
    period,
    limit,
  })}`;
  return fetchRaw('binance', 'takerlongshortRatio', url);
}