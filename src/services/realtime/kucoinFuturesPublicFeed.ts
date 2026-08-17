import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import { KuCoinPublicStreamClient, type KuCoinStreamConnectionState } from '../kucoinStreaming';
import type { InProcessEventBus } from './inProcessEventBus';
import {
  normalizeCanonicalSymbols,
  type PublicFeedConnectionState,
  type PublicFeedSnapshot,
  type WebSocketFactory,
} from './publicFeedTypes';

const SOURCE = 'kucoin-futures-ws';
const DEFAULT_REST_BASE = 'https://api-futures.kucoin.com';
const MAX_DEPTH_BUFFER = 5_000;

interface KuCoinDepthDelta {
  sequence?: number | string;
  change?: string;
  timestamp?: number | string;
}

interface KuCoinTradeMessage {
  symbol?: string;
  sequence?: number | string;
  side?: string;
  size?: number | string;
  price?: number | string;
  tradeId?: string | number;
  ts?: number | string;
}

interface DepthSyncState {
  initialized: boolean;
  reseeding: boolean;
  lastSequence: number | null;
  buffer: KuCoinDepthDelta[];
}

export interface KuCoinFuturesPublicFeedOptions {
  enabled: boolean;
  symbols: string[];
  eventBus: InProcessEventBus;
  websocketFactory?: WebSocketFactory;
  fetchBullet?: () => Promise<unknown>;
  fetchDepthSnapshot?: (symbol: string) => Promise<unknown>;
  restBase?: string;
  now?: () => number;
}

function finitePositive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function finiteNonNegative(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function safeInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function epochMilliseconds(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  if (parsed > 10_000_000_000_000_000) return Math.floor(parsed / 1_000_000); // ns -> ms
  if (parsed > 10_000_000_000_000) return Math.floor(parsed / 1_000); // us -> ms
  return Math.floor(parsed);
}

function normalizeBookLevels(raw: unknown): Array<{ price: number; size: number }> {
  if (!Array.isArray(raw)) return [];
  const levels: Array<{ price: number; size: number }> = [];
  for (const item of raw) {
    if (!Array.isArray(item)) continue;
    const price = finitePositive(item[0]);
    const size = finiteNonNegative(item[1]);
    if (price === null || size === null) continue;
    levels.push({ price, size });
  }
  return levels;
}

function mapConnectionState(state: KuCoinStreamConnectionState): PublicFeedConnectionState {
  if (state === 'DISABLED') return 'DISABLED';
  if (state === 'DISCONNECTED') return 'DISCONNECTED';
  if (state === 'CONNECTING') return 'CONNECTING';
  if (state === 'CONNECTED') return 'CONNECTED';
  if (state === 'RECONNECTING') return 'RECONNECTING';
  return 'DEGRADED';
}

function toKuCoinUsdtmContract(symbol: string): string {
  const clean = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean === 'BTCUSDT' || clean === 'XBTUSDTM') return 'XBTUSDTM';
  if (clean.endsWith('USDTM')) return clean;
  if (clean.endsWith('USDT')) return `${clean}M`;
  throw new Error(`kucoin_usdtm_symbol_unsupported:${symbol}`);
}

async function fetchKuCoinPublicData(url: string, method: 'GET' | 'POST'): Promise<unknown> {
  const response = await fetch(url, { method, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`kucoin_public_http_${response.status}`);
  const json = await response.json() as Record<string, unknown>;
  if (json?.code !== undefined && String(json.code) !== '200000') {
    throw new Error(`kucoin_public_code_${String(json.code)}`);
  }
  return json?.data ?? json;
}

/**
 * KuCoin USDT-margined Futures public WebSocket adapter for Liquidity Hunter.
 *
 * It reuses APEX's existing public-token transport and publishes only normalized
 * market-data events into the central read-only event bus. It never depends on
 * account credentials and has no execution/order capability.
 */
export class KuCoinFuturesPublicFeed {
  private readonly symbols: string[];
  private readonly contracts = new Map<string, string>();
  private readonly eventBus: InProcessEventBus;
  private readonly client: KuCoinPublicStreamClient;
  private readonly fetchDepthSnapshot: (symbol: string) => Promise<unknown>;
  private readonly now: () => number;
  private readonly depth = new Map<string, DepthSyncState>();
  private readonly unsubscribers: Array<() => void> = [];
  private processing: Promise<void> = Promise.resolve();
  private started = false;
  private stopping = false;
  private state: PublicFeedConnectionState;
  private connectedAt: number | null = null;
  private lastMessageAt: number | null = null;
  private lastError: string | null = null;
  private reconnects = 0;
  private publishedEvents = 0;
  private rejectedEvents = 0;

  constructor(options: KuCoinFuturesPublicFeedOptions) {
    this.symbols = normalizeCanonicalSymbols(options.symbols).filter((symbol) => symbol.endsWith('-USDT'));
    this.eventBus = options.eventBus;
    const restBase = (options.restBase ?? process.env.KUCOIN_FUTURES_BASE ?? DEFAULT_REST_BASE).replace(/\/+$/, '');
    this.fetchDepthSnapshot = options.fetchDepthSnapshot ?? ((symbol) => fetchKuCoinPublicData(`${restBase}/api/v1/level2/snapshot?symbol=${encodeURIComponent(toKuCoinUsdtmContract(symbol))}`, 'GET'));
    this.now = options.now ?? Date.now;
    this.state = options.enabled && this.symbols.length ? 'DISCONNECTED' : 'DISABLED';
    for (const symbol of this.symbols) {
      const contract = toKuCoinUsdtmContract(symbol);
      this.contracts.set(symbol, contract);
      this.depth.set(symbol, { initialized: false, reseeding: false, lastSequence: null, buffer: [] });
    }
    this.client = new KuCoinPublicStreamClient({
      enabled: this.state !== 'DISABLED',
      tokenEndpoint: `${restBase}/api/v1/bullet-public`,
      websocketFactory: options.websocketFactory,
      fetchJson: async () => (options.fetchBullet ? options.fetchBullet() : fetchKuCoinPublicData(`${restBase}/api/v1/bullet-public`, 'POST')),
      now: this.now,
    });
    this.client.onStateChange((state) => {
      const previous = this.state;
      this.state = mapConnectionState(state);
      if (this.state === 'CONNECTED') {
        if (previous === 'RECONNECTING') this.reconnects += 1;
        this.connectedAt = this.connectedAt ?? this.now();
      }
      if (this.state === 'DEGRADED') this.lastError = this.lastError ?? 'kucoin_stream_degraded';
    });
  }

  start(): void {
    if (this.state === 'DISABLED' || this.started || this.stopping) return;
    this.started = true;
    this.stopping = false;
    void this.startAsync().catch((error) => this.fail(error));
  }

  async stop(): Promise<void> {
    this.stopping = true;
    while (this.unsubscribers.length) {
      try { this.unsubscribers.pop()?.(); } catch { /* no-op */ }
    }
    this.client.disconnect();
    await this.processing.catch(() => undefined);
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

  private async startAsync(): Promise<void> {
    for (const symbol of this.symbols) {
      if (this.stopping) return;
      const contract = this.contracts.get(symbol)!;
      const tradeUnsubscribe = await this.client.subscribe(`/contractMarket/execution:${contract}`, (data) => {
        this.enqueue(() => this.handleTrade(symbol, data));
      });
      this.unsubscribers.push(tradeUnsubscribe);
      const depthUnsubscribe = await this.client.subscribe(`/contractMarket/level2:${contract}`, (data) => {
        this.enqueue(() => this.handleDepth(symbol, data));
      });
      this.unsubscribers.push(depthUnsubscribe);
      await this.reseedDepth(symbol);
    }
  }

  private enqueue(task: () => Promise<void>): void {
    this.processing = this.processing.then(task).catch((error) => this.fail(error));
  }

  private fail(error: unknown): void {
    if (this.state !== 'DISABLED' && this.state !== 'STOPPED') this.state = 'DEGRADED';
    this.lastError = error instanceof Error ? error.message : String(error || 'kucoin_feed_error');
  }

  private async publish(event: MarketEvent): Promise<void> {
    try {
      const disposition = await this.eventBus.publish(event);
      if (disposition === 'DELIVERED') this.publishedEvents += 1;
      this.lastMessageAt = event.receivedAt;
    } catch (error) {
      this.rejectedEvents += 1;
      throw error;
    }
  }

  private async handleTrade(symbol: string, raw: unknown): Promise<void> {
    if (!raw || typeof raw !== 'object') return;
    const data = raw as KuCoinTradeMessage;
    const price = finitePositive(data.price);
    const size = finitePositive(data.size);
    const side = String(data.side || '').toUpperCase();
    if (price === null || size === null || (side !== 'BUY' && side !== 'SELL')) return;
    const receivedAt = this.now();
    const timestamp = epochMilliseconds(data.ts, receivedAt);
    const sequence = safeInteger(data.sequence);
    const tradeId = String(data.tradeId ?? sequence ?? timestamp).replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 80) || String(timestamp);
    await this.publish({
      eventId: `kc:tr:${this.contracts.get(symbol)}:${tradeId}`,
      type: 'TRADE',
      source: SOURCE,
      symbol,
      exchangeTimestamp: timestamp,
      receivedAt,
      schemaVersion: 1,
      ingestionKind: 'LIVE',
      payload: { price, size, aggressorSide: side, contract: this.contracts.get(symbol), sourceSequence: sequence },
    });
  }

  private async handleDepth(symbol: string, raw: unknown): Promise<void> {
    if (!raw || typeof raw !== 'object') return;
    const data = raw as KuCoinDepthDelta;
    const sequence = safeInteger(data.sequence);
    if (sequence === null || typeof data.change !== 'string') return;
    const sync = this.depth.get(symbol)!;
    if (!sync.initialized) {
      sync.buffer.push(data);
      if (sync.buffer.length > MAX_DEPTH_BUFFER) {
        sync.buffer.splice(0, sync.buffer.length - MAX_DEPTH_BUFFER);
        this.fail(new Error(`kucoin_depth_buffer_overflow:${symbol}`));
      }
      if (!sync.reseeding) void this.reseedDepth(symbol);
      return;
    }
    if (sync.lastSequence !== null && sequence <= sync.lastSequence) return;
    if (sync.lastSequence !== null && sequence !== sync.lastSequence + 1) {
      await this.publishDepthDelta(symbol, data, sync.lastSequence);
      sync.initialized = false;
      sync.buffer = [];
      this.lastError = `kucoin_depth_sequence_gap:${symbol}:${sync.lastSequence}:${sequence}`;
      await this.reseedDepth(symbol);
      return;
    }
    await this.publishDepthDelta(symbol, data, sync.lastSequence);
    sync.lastSequence = sequence;
  }

  private async reseedDepth(symbol: string): Promise<void> {
    const sync = this.depth.get(symbol);
    if (!sync || sync.reseeding || this.stopping) return;
    sync.reseeding = true;
    try {
      const payload = await this.fetchDepthSnapshot(symbol);
      if (!payload || typeof payload !== 'object') throw new Error('kucoin_depth_snapshot_malformed');
      const row = payload as Record<string, unknown>;
      const sequence = safeInteger(row.sequence);
      const bids = normalizeBookLevels(row.bids);
      const asks = normalizeBookLevels(row.asks);
      if (sequence === null || bids.length === 0 || asks.length === 0) throw new Error('kucoin_depth_snapshot_invalid');
      const receivedAt = this.now();
      await this.publish({
        eventId: `kc:ob:snap:${this.contracts.get(symbol)}:${sequence}`,
        type: 'ORDERBOOK_SNAPSHOT',
        source: SOURCE,
        symbol,
        exchangeTimestamp: receivedAt,
        receivedAt,
        sequence,
        schemaVersion: 1,
        ingestionKind: 'LIVE',
        payload: { bids, asks },
      });
      sync.lastSequence = sequence;
      sync.initialized = true;

      const buffered = sync.buffer.splice(0)
        .map((event) => ({ event, sequence: safeInteger(event.sequence) }))
        .filter((row): row is { event: KuCoinDepthDelta; sequence: number } => row.sequence !== null && row.sequence > sequence)
        .sort((left, right) => left.sequence - right.sequence);
      for (const bufferedEvent of buffered) {
        if (sync.lastSequence !== null && bufferedEvent.sequence !== sync.lastSequence + 1) {
          sync.initialized = false;
          this.lastError = `kucoin_depth_buffer_gap:${symbol}:${sync.lastSequence}:${bufferedEvent.sequence}`;
          break;
        }
        await this.publishDepthDelta(symbol, bufferedEvent.event, sync.lastSequence);
        sync.lastSequence = bufferedEvent.sequence;
      }
      if (!sync.initialized) queueMicrotask(() => { void this.reseedDepth(symbol); });
    } catch (error) {
      sync.initialized = false;
      this.fail(error);
    } finally {
      sync.reseeding = false;
    }
  }

  private async publishDepthDelta(symbol: string, data: KuCoinDepthDelta, previousSequence: number | null): Promise<void> {
    const sequence = safeInteger(data.sequence);
    if (sequence === null || typeof data.change !== 'string') return;
    const [priceRaw, sideRaw, sizeRaw] = data.change.split(',');
    const price = finitePositive(priceRaw);
    const size = finiteNonNegative(sizeRaw);
    const normalizedSide = String(sideRaw || '').toLowerCase();
    if (price === null || size === null || (normalizedSide !== 'buy' && normalizedSide !== 'sell')) return;
    const receivedAt = this.now();
    const timestamp = epochMilliseconds(data.timestamp, receivedAt);
    await this.publish({
      eventId: `kc:ob:delta:${this.contracts.get(symbol)}:${sequence}`,
      type: 'ORDERBOOK_DELTA',
      source: SOURCE,
      symbol,
      exchangeTimestamp: timestamp,
      receivedAt,
      sequenceStart: sequence,
      sequence,
      previousSequence: previousSequence ?? undefined,
      schemaVersion: 1,
      ingestionKind: 'LIVE',
      payload: { updates: [{ side: normalizedSide === 'buy' ? 'BID' : 'ASK', price, size }] },
    });
  }
}
