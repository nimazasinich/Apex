import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import { blackScholesSpotGammaFromTradeIv, parseDeribitOptionInstrument } from './deribitOptionMath';
import { validatedDeribitBaseUrl } from './deribitOptionsPublicFeed';

interface DeribitHistoricalTrade {
  trade_id?: string | number;
  timestamp?: number;
  instrument_name?: string;
  direction?: string;
  amount?: number | string;
  contracts?: number | string;
  index_price?: number | string;
  iv?: number | string;
}

export interface DeribitOptionsHistoricalImportOptions {
  currency: 'BTC' | 'ETH';
  startTime: number;
  endTime: number;
  baseUrl?: string;
  fetchJson?: (url: string) => Promise<unknown>;
  maxRequests?: number;
  minimumWindowMs?: number;
  now?: () => number;
}

export interface DeribitOptionsHistoricalImportResult {
  events: MarketEvent[];
  requests: number;
  sourceTrades: number;
  rejectedTrades: number;
  incompleteWindows: Array<{ startTime: number; endTime: number; returned: number }>;
  complete: boolean;
  methodology: 'DERIBIT_HISTORICAL_TAKER_FLOW_EVENT_TIME_IV_GAMMA_PROXY';
}

function finitePositive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function safeTimestamp(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`deribit_history_http_${response.status}`);
  return response.json();
}

function extractTrades(payload: unknown): { trades: DeribitHistoricalTrade[]; hasMore: boolean } {
  if (!payload || typeof payload !== 'object') return { trades: [], hasMore: false };
  const result = (payload as Record<string, unknown>).result;
  if (!result || typeof result !== 'object') return { trades: [], hasMore: false };
  const row = result as Record<string, unknown>;
  return {
    trades: Array.isArray(row.trades) ? row.trades as DeribitHistoricalTrade[] : [],
    hasMore: row.has_more === true,
  };
}

function canonicalSymbol(currency: string): string {
  return `${currency.toUpperCase()}-USDT`;
}

/**
 * Backfills public Deribit option trades over a bounded historical range.
 * Large windows are recursively subdivided whenever Deribit indicates more
 * rows are available, avoiding silent truncation at the 1000-row endpoint cap.
 * Event-time IV is used to reconstruct gamma. Historical open interest is not
 * invented and is stored as null. The result is useful for taker-flow research
 * but is not a complete dealer-inventory GEX reconstruction.
 */
export async function importDeribitOptionsHistory(
  options: DeribitOptionsHistoricalImportOptions,
): Promise<DeribitOptionsHistoricalImportResult> {
  const startTime = Math.floor(options.startTime);
  const endTime = Math.floor(options.endTime);
  if (!Number.isSafeInteger(startTime) || !Number.isSafeInteger(endTime) || startTime < 0 || endTime <= startTime) {
    throw new Error('invalid_deribit_history_range');
  }
  const maxRequests = Math.max(1, Math.min(10_000, Math.floor(options.maxRequests ?? 2_048)));
  const minimumWindowMs = Math.max(1_000, Math.min(60 * 60_000, Math.floor(options.minimumWindowMs ?? 60_000)));
  const baseUrl = validatedDeribitBaseUrl(options.baseUrl);
  const fetchJson = options.fetchJson ?? defaultFetchJson;
  const now = options.now ?? Date.now;
  const byTradeId = new Map<string, DeribitHistoricalTrade>();
  const incompleteWindows: Array<{ startTime: number; endTime: number; returned: number }> = [];
  let requests = 0;

  const fetchWindow = async (from: number, to: number): Promise<void> => {
    if (requests >= maxRequests) {
      incompleteWindows.push({ startTime: from, endTime: to, returned: 0 });
      return;
    }
    requests += 1;
    const params = new URLSearchParams({
      currency: options.currency,
      kind: 'option',
      start_timestamp: String(from),
      end_timestamp: String(to),
      count: '1000',
      sorting: 'asc',
    });
    const payload = await fetchJson(`${baseUrl}/public/get_last_trades_by_currency_and_time?${params.toString()}`);
    const { trades, hasMore } = extractTrades(payload);
    const saturated = hasMore || trades.length >= 1000;
    if (saturated && to - from > minimumWindowMs) {
      const midpoint = Math.floor(from + (to - from) / 2);
      if (midpoint <= from || midpoint >= to) {
        incompleteWindows.push({ startTime: from, endTime: to, returned: trades.length });
      } else {
        await fetchWindow(from, midpoint);
        await fetchWindow(midpoint + 1, to);
        return;
      }
    }
    if (saturated) incompleteWindows.push({ startTime: from, endTime: to, returned: trades.length });
    for (const trade of trades) {
      const id = String(trade.trade_id ?? '');
      if (id) byTradeId.set(id, trade);
    }
  };

  await fetchWindow(startTime, endTime);

  const events: MarketEvent[] = [];
  let rejectedTrades = 0;
  const ordered = [...byTradeId.entries()].sort((a, b) => {
    const at = Number(a[1].timestamp ?? 0);
    const bt = Number(b[1].timestamp ?? 0);
    return at - bt || a[0].localeCompare(b[0]);
  });
  for (const [tradeId, trade] of ordered) {
    const timestamp = safeTimestamp(trade.timestamp);
    const instrumentName = String(trade.instrument_name ?? '');
    const instrument = parseDeribitOptionInstrument(instrumentName);
    const spot = finitePositive(trade.index_price);
    const ivPercent = finitePositive(trade.iv);
    const contracts = finitePositive(trade.contracts) ?? finitePositive(trade.amount);
    const takerSide = String(trade.direction ?? '').toUpperCase();
    const gamma = timestamp !== null && instrument && spot !== null && ivPercent !== null
      ? blackScholesSpotGammaFromTradeIv({
          spot,
          strike: instrument.strike,
          expiry: instrument.expiry,
          timestamp,
          ivPercent,
          riskFreeRate: 0,
        })
      : null;
    if (timestamp === null || !instrument || spot === null || ivPercent === null || contracts === null || gamma === null || (takerSide !== 'BUY' && takerSide !== 'SELL')) {
      rejectedTrades += 1;
      continue;
    }
    events.push({
      eventId: `dr:hist-opt:${tradeId}`,
      type: 'OPTION_TRADE',
      source: 'deribit-options-historical-import',
      symbol: canonicalSymbol(options.currency),
      exchangeTimestamp: timestamp,
      receivedAt: now(),
      schemaVersion: 1,
      ingestionKind: 'REPLAY',
      payload: {
        strike: instrument.strike,
        expiry: instrument.expiry,
        gamma,
        openInterest: null,
        spot,
        takerSide,
        contracts,
        instrumentName,
        ivPercent,
        gammaMethodology: 'BLACK_SCHOLES_FROM_DERIBIT_TRADE_IV_ZERO_RATE',
        methodology: 'DERIBIT_HISTORICAL_TAKER_FLOW_EVENT_TIME_IV_GAMMA_PROXY',
      },
    });
  }

  return {
    events,
    requests,
    sourceTrades: byTradeId.size,
    rejectedTrades,
    incompleteWindows,
    complete: incompleteWindows.length === 0,
    methodology: 'DERIBIT_HISTORICAL_TAKER_FLOW_EVENT_TIME_IV_GAMMA_PROXY',
  };
}
