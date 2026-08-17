import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import type { InProcessEventBus } from './inProcessEventBus';
import { blackScholesSpotGammaFromTradeIv, parseDeribitOptionInstrument } from './deribitOptionMath';
import type { PublicFeedConnectionState, PublicFeedSnapshot } from './publicFeedTypes';

const SOURCE = 'deribit-options-public';
const DEFAULT_BASE = 'https://www.deribit.com/api/v2';
const MAX_SEEN_TRADE_IDS = 10_000;

interface DeribitTrade {
  trade_id?: string | number;
  timestamp?: number;
  instrument_name?: string;
  direction?: string;
  amount?: number | string;
  contracts?: number | string;
  index_price?: number | string;
  iv?: number | string;
}

interface DeribitTicker {
  instrument_name?: string;
  open_interest?: number | string;
  underlying_price?: number | string;
  index_price?: number | string;
  greeks?: { gamma?: number | string };
}

export interface DeribitOptionsPublicFeedOptions {
  enabled: boolean;
  symbols: string[];
  eventBus: InProcessEventBus;
  fetchJson?: (url: string) => Promise<unknown>;
  baseUrl?: string;
  now?: () => number;
  pollIntervalMs?: number;
  maxTradesPerPoll?: number;
  maxInstrumentsPerPoll?: number;
  tickerConcurrency?: number;
}

function finitePositive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function safeTimestamp(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function baseCurrencyForSymbol(symbol: string): 'BTC' | 'ETH' | null {
  const base = symbol.toUpperCase().split(/[-_]/)[0];
  return base === 'BTC' || base === 'ETH' ? base : null;
}

function canonicalSymbolForCurrency(currency: string): string {
  return `${currency.toUpperCase()}-USDT`;
}

export function validatedDeribitBaseUrl(value: string | undefined): string {
  const candidate = (value ?? DEFAULT_BASE).replace(/\/+$/, '');
  const parsed = new URL(candidate);
  const allowedHosts = new Set(['www.deribit.com', 'test.deribit.com']);
  if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname) || !parsed.pathname.startsWith('/api/v2')) {
    throw new Error('deribit_base_url_not_allowlisted');
  }
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/+$/, '');
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`deribit_http_${response.status}`);
  return response.json();
}

function extractResult(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return null;
  return (payload as Record<string, unknown>).result ?? null;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      try {
        results[index] = { status: 'fulfilled', value: await mapper(values[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Credential-free Deribit option-flow collector used only as shadow evidence.
 * Primary gamma is reconstructed at the trade timestamp from the IV carried on
 * the trade. This avoids applying a future/current ticker gamma to an older
 * trade. Current ticker calls are retained only for open-interest metadata and
 * as an explicitly lower-quality gamma fallback when the trade IV is missing.
 * Neither path claims to reconstruct complete dealer inventory.
 */
export class DeribitOptionsPublicFeed {
  private readonly symbols: string[];
  private readonly eventBus: InProcessEventBus;
  private readonly fetchJson: (url: string) => Promise<unknown>;
  private readonly baseUrl: string;
  private readonly now: () => number;
  private readonly pollIntervalMs: number;
  private readonly maxTradesPerPoll: number;
  private readonly maxInstrumentsPerPoll: number;
  private readonly tickerConcurrency: number;
  private readonly seenTradeIds = new Map<string, number>();
  private state: PublicFeedConnectionState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopping = false;
  private inFlight = false;
  private connectedAt: number | null = null;
  private lastMessageAt: number | null = null;
  private lastError: string | null = null;
  private reconnects = 0;
  private publishedEvents = 0;
  private rejectedEvents = 0;

  constructor(options: DeribitOptionsPublicFeedOptions) {
    this.symbols = [...new Set(options.symbols.map((value) => value.trim().toUpperCase()).filter((value) => baseCurrencyForSymbol(value)))].slice(0, 4);
    this.eventBus = options.eventBus;
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
    this.baseUrl = validatedDeribitBaseUrl(options.baseUrl);
    this.now = options.now ?? Date.now;
    this.pollIntervalMs = Math.max(5_000, Math.min(120_000, options.pollIntervalMs ?? 20_000));
    this.maxTradesPerPoll = Math.max(10, Math.min(1_000, Math.floor(options.maxTradesPerPoll ?? 200)));
    this.maxInstrumentsPerPoll = Math.max(4, Math.min(64, Math.floor(options.maxInstrumentsPerPoll ?? 24)));
    this.tickerConcurrency = Math.max(1, Math.min(8, Math.floor(options.tickerConcurrency ?? 4)));
    this.state = options.enabled && this.symbols.length ? 'DISCONNECTED' : 'DISABLED';
  }

  start(): void {
    if (this.state === 'DISABLED' || this.stopping || this.timer || this.inFlight) return;
    this.stopping = false;
    this.state = 'CONNECTING';
    void this.poll();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    while (this.inFlight) await new Promise((resolve) => setTimeout(resolve, 10));
    this.state = this.state === 'DISABLED' ? 'DISABLED' : 'STOPPED';
  }

  snapshot(): PublicFeedSnapshot {
    return {
      source: SOURCE,
      state: this.state,
      symbols: [...this.symbols],
      connectedAt: this.connectedAt,
      lastMessageAt: this.lastMessageAt,
      lastError: this.lastError,
      reconnects: this.reconnects,
      publishedEvents: this.publishedEvents,
      rejectedEvents: this.rejectedEvents,
    };
  }

  private schedule(): void {
    if (this.stopping || this.state === 'DISABLED') return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.poll();
    }, this.pollIntervalMs);
    this.timer.unref?.();
  }

  private pruneSeen(): void {
    if (this.seenTradeIds.size <= MAX_SEEN_TRADE_IDS) return;
    const ordered = [...this.seenTradeIds.entries()].sort((a, b) => a[1] - b[1]);
    for (const [id] of ordered.slice(0, ordered.length - MAX_SEEN_TRADE_IDS)) this.seenTradeIds.delete(id);
  }

  private async request(path: string, params: Record<string, string | number>): Promise<unknown> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) query.set(key, String(value));
    return this.fetchJson(`${this.baseUrl}/${path}?${query.toString()}`);
  }

  private async poll(): Promise<void> {
    if (this.stopping || this.inFlight || this.state === 'DISABLED') return;
    this.inFlight = true;
    try {
      const results = await Promise.allSettled(this.symbols.map((symbol) => this.pollSymbol(symbol)));
      const failures = results.filter((result) => result.status === 'rejected');
      if (failures.length === results.length && results.length > 0) throw failures[0].reason;
      if (this.connectedAt === null) this.connectedAt = this.now();
      this.state = failures.length ? 'DEGRADED' : 'CONNECTED';
      this.lastError = failures.length
        ? failures.map((result) => result.status === 'rejected' ? (result.reason instanceof Error ? result.reason.message : String(result.reason)) : '').filter(Boolean).join('|')
        : null;
      this.lastMessageAt = this.now();
    } catch (error) {
      this.reconnects += 1;
      this.state = 'DEGRADED';
      this.lastError = error instanceof Error ? error.message : String(error || 'deribit_options_poll_failed');
    } finally {
      this.inFlight = false;
      this.pruneSeen();
      this.schedule();
    }
  }

  private async pollSymbol(symbol: string): Promise<void> {
    const currency = baseCurrencyForSymbol(symbol);
    if (!currency) return;
    const payload = await this.request('public/get_last_trades_by_currency', {
      currency,
      kind: 'option',
      count: this.maxTradesPerPoll,
      sorting: 'desc',
    });
    const result = extractResult(payload);
    const trades = result && typeof result === 'object' && Array.isArray((result as Record<string, unknown>).trades)
      ? ((result as Record<string, unknown>).trades as DeribitTrade[])
      : [];
    const candidates = trades.filter((trade) => {
      const tradeId = String(trade.trade_id ?? '');
      const instrument = String(trade.instrument_name ?? '');
      return tradeId && instrument && !this.seenTradeIds.has(tradeId) && parseDeribitOptionInstrument(instrument);
    });
    if (!candidates.length) return;

    // Current ticker metadata is fetched only for the bounded set of instruments
    // represented by the new trades. It is no longer required for primary gamma.
    const instruments = [...new Set(candidates.map((trade) => String(trade.instrument_name)))].slice(0, this.maxInstrumentsPerPoll);
    const settledTickers = await mapWithConcurrency(instruments, this.tickerConcurrency, async (instrument) => {
      const tickerPayload = await this.request('public/ticker', { instrument_name: instrument });
      const ticker = extractResult(tickerPayload);
      if (!ticker || typeof ticker !== 'object') throw new Error(`deribit_ticker_malformed:${instrument}`);
      return ticker as DeribitTicker;
    });
    const tickerByInstrument = new Map<string, DeribitTicker>();
    settledTickers.forEach((tickerResult, index) => {
      if (tickerResult.status === 'fulfilled') tickerByInstrument.set(instruments[index], tickerResult.value);
    });

    for (const trade of candidates.reverse()) {
      const tradeId = String(trade.trade_id ?? '');
      const instrument = String(trade.instrument_name ?? '');
      const parsed = parseDeribitOptionInstrument(instrument);
      if (!tradeId || !parsed) continue;
      const timestamp = safeTimestamp(trade.timestamp);
      const taker = String(trade.direction ?? '').toUpperCase();
      const contracts = finitePositive(trade.contracts) ?? finitePositive(trade.amount);
      const tradeSpot = finitePositive(trade.index_price);
      const tradeIv = finitePositive(trade.iv);
      const ticker = tickerByInstrument.get(instrument);
      const tickerSpot = finitePositive(ticker?.underlying_price) ?? finitePositive(ticker?.index_price);
      const spot = tradeSpot ?? tickerSpot;
      const eventTimeGamma = timestamp !== null && spot !== null && tradeIv !== null
        ? blackScholesSpotGammaFromTradeIv({
            spot,
            strike: parsed.strike,
            expiry: parsed.expiry,
            timestamp,
            ivPercent: tradeIv,
            riskFreeRate: 0,
          })
        : null;
      const fallbackGamma = finitePositive(ticker?.greeks?.gamma);
      const gamma = eventTimeGamma ?? fallbackGamma;
      const openInterest = finitePositive(ticker?.open_interest);
      const gammaMethodology = eventTimeGamma !== null
        ? 'BLACK_SCHOLES_FROM_DERIBIT_TRADE_IV_ZERO_RATE'
        : fallbackGamma !== null
          ? 'CURRENT_TICKER_GAMMA_FALLBACK'
          : null;
      if (timestamp === null || gamma === null || spot === null || contracts === null || !gammaMethodology || (taker !== 'BUY' && taker !== 'SELL')) continue;
      const event: MarketEvent = {
        eventId: `dr:opt:${tradeId}`,
        type: 'OPTION_TRADE',
        source: SOURCE,
        symbol: canonicalSymbolForCurrency(currency),
        exchangeTimestamp: timestamp,
        receivedAt: this.now(),
        schemaVersion: 1,
        ingestionKind: 'LIVE',
        payload: {
          strike: parsed.strike,
          expiry: parsed.expiry,
          gamma,
          openInterest,
          spot,
          takerSide: taker,
          contracts,
          instrumentName: instrument,
          ivPercent: tradeIv,
          gammaMethodology,
          methodology: eventTimeGamma !== null
            ? 'DERIBIT_PUBLIC_TAKER_FLOW_EVENT_TIME_IV_GAMMA_PROXY'
            : 'DERIBIT_PUBLIC_TAKER_FLOW_CURRENT_TICKER_GAMMA_FALLBACK_PROXY',
        },
      };
      try {
        const disposition = await this.eventBus.publish(event);
        if (disposition === 'DELIVERED') {
          this.publishedEvents += 1;
          this.seenTradeIds.set(tradeId, timestamp);
        }
      } catch (error) {
        this.rejectedEvents += 1;
        throw error;
      }
    }
  }
}
