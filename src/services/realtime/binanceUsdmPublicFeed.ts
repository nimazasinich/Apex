import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import type { InProcessEventBus } from './inProcessEventBus';
import {
  decodeWebSocketData,
  defaultWebSocketFactory,
  normalizeCanonicalSymbols,
  toCanonicalSymbol,
  toExchangeSymbol,
  type PublicFeedConnectionState,
  type PublicFeedSnapshot,
  type WebSocketFactory,
  type WebSocketLike,
} from './publicFeedTypes';

const SOURCE = 'binance-usdm-ws';
const DEFAULT_WS_BASE = 'wss://fstream.binance.com/stream?streams=';
const DEFAULT_REST_BASE = 'https://fapi.binance.com';
const MAX_DEPTH_BUFFER = 5_000;

interface BinanceDepthEvent {
  E?: number;
  T?: number;
  s?: string;
  U?: number;
  u?: number;
  pu?: number;
  b?: unknown[];
  a?: unknown[];
}

interface DepthSyncState {
  initialized: boolean;
  syncing: boolean;
  lastSequence: number | null;
  buffer: BinanceDepthEvent[];
}

export interface BinanceUsdmPublicFeedOptions {
  enabled: boolean;
  symbols: string[];
  eventBus: InProcessEventBus;
  websocketFactory?: WebSocketFactory;
  fetchJson?: (url: string) => Promise<unknown>;
  websocketBase?: string;
  restBase?: string;
  now?: () => number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`binance_depth_http_${response.status}`);
  return response.json();
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

export class BinanceUsdmPublicFeed {
  private readonly symbols: string[];
  private readonly eventBus: InProcessEventBus;
  private readonly websocketFactory: WebSocketFactory;
  private readonly fetchJson: (url: string) => Promise<unknown>;
  private readonly websocketBase: string;
  private readonly restBase: string;
  private readonly now: () => number;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly depth = new Map<string, DepthSyncState>();
  private socket: WebSocketLike | null = null;
  private state: PublicFeedConnectionState;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private stopping = false;
  private processing: Promise<void> = Promise.resolve();
  private connectedAt: number | null = null;
  private lastMessageAt: number | null = null;
  private lastError: string | null = null;
  private reconnects = 0;
  private publishedEvents = 0;
  private rejectedEvents = 0;

  constructor(options: BinanceUsdmPublicFeedOptions) {
    this.symbols = normalizeCanonicalSymbols(options.symbols);
    this.eventBus = options.eventBus;
    this.websocketFactory = options.websocketFactory ?? defaultWebSocketFactory;
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
    this.websocketBase = options.websocketBase ?? DEFAULT_WS_BASE;
    this.restBase = (options.restBase ?? DEFAULT_REST_BASE).replace(/\/+$/, '');
    this.now = options.now ?? Date.now;
    this.reconnectBaseMs = Math.max(250, Math.min(30_000, options.reconnectBaseMs ?? 1_000));
    this.reconnectMaxMs = Math.max(this.reconnectBaseMs, Math.min(120_000, options.reconnectMaxMs ?? 30_000));
    this.state = options.enabled && this.symbols.length ? 'DISCONNECTED' : 'DISABLED';
    for (const symbol of this.symbols) this.depth.set(symbol, { initialized: false, syncing: false, lastSequence: null, buffer: [] });
  }

  start(): void {
    if (this.state === 'DISABLED' || this.stopping || this.socket) return;
    this.stopping = false;
    this.connect();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    try { this.socket?.close(1000, 'shutdown'); } catch { /* no-op */ }
    this.socket = null;
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

  private connect(): void {
    if (this.stopping || this.state === 'DISABLED' || this.symbols.length === 0) return;
    this.state = this.retryCount > 0 ? 'RECONNECTING' : 'CONNECTING';
    const streams = this.symbols.flatMap((symbol) => {
      const s = toExchangeSymbol(symbol).toLowerCase();
      return [`${s}@aggTrade`, `${s}@bookTicker`, `${s}@depth@100ms`];
    });
    const url = `${this.websocketBase}${streams.join('/')}`;
    let socket: WebSocketLike;
    try {
      socket = this.websocketFactory(url);
    } catch (error) {
      this.fail(error);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      this.retryCount = 0;
      this.connectedAt = this.now();
      this.state = 'CONNECTED';
      this.lastError = null;
      for (const symbol of this.symbols) {
        const sync = this.depth.get(symbol)!;
        sync.initialized = false;
        sync.syncing = false;
        sync.lastSequence = null;
        sync.buffer.length = 0;
        void this.initializeDepth(symbol);
      }
    };
    socket.onmessage = (event) => {
      const raw = decodeWebSocketData(event.data);
      if (!raw) return;
      this.lastMessageAt = this.now();
      this.processing = this.processing
        .then(() => this.handleMessage(raw))
        .catch((error) => this.fail(error));
    };
    socket.onerror = () => {
      this.state = 'DEGRADED';
      this.lastError = 'binance_websocket_error';
    };
    socket.onclose = () => {
      this.socket = null;
      if (this.stopping) return;
      this.state = 'DISCONNECTED';
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.state === 'DISABLED') return;
    this.retryCount += 1;
    this.reconnects += 1;
    this.state = 'RECONNECTING';
    const delay = Math.min(this.reconnectMaxMs, this.reconnectBaseMs * (2 ** Math.min(this.retryCount - 1, 6)));
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private fail(error: unknown): void {
    this.state = 'DEGRADED';
    this.lastError = error instanceof Error ? error.message : String(error || 'binance_feed_error');
  }

  private async publish(event: MarketEvent): Promise<void> {
    try {
      const disposition = await this.eventBus.publish(event);
      if (disposition === 'DELIVERED') this.publishedEvents += 1;
    } catch (error) {
      this.rejectedEvents += 1;
      throw error;
    }
  }

  private async handleMessage(raw: string): Promise<void> {
    let envelope: unknown;
    try { envelope = JSON.parse(raw); } catch { throw new Error('binance_ws_invalid_json'); }
    if (!envelope || typeof envelope !== 'object') return;
    const outer = envelope as Record<string, unknown>;
    const data = outer.data && typeof outer.data === 'object' ? outer.data as Record<string, unknown> : outer;
    const eventType = String(data.e || '');
    if (eventType === 'aggTrade') return this.handleTrade(data);
    if (eventType === 'bookTicker') return this.handleQuote(data);
    if (eventType === 'depthUpdate') return this.handleDepth(data as BinanceDepthEvent);
  }

  private async handleTrade(data: Record<string, unknown>): Promise<void> {
    const exchangeSymbol = String(data.s || '');
    const symbol = toCanonicalSymbol(exchangeSymbol);
    if (!this.symbols.includes(symbol)) return;
    const price = finitePositive(data.p);
    const size = finitePositive(data.q);
    const timestamp = safeInteger(data.T) ?? safeInteger(data.E) ?? this.now();
    if (price === null || size === null) return;
    const makerBuyer = data.m === true;
    const tradeId = safeInteger(data.a) ?? timestamp;
    await this.publish({
      eventId: `bn:tr:${toExchangeSymbol(symbol)}:${tradeId}`,
      type: 'TRADE',
      source: SOURCE,
      symbol,
      exchangeTimestamp: timestamp,
      receivedAt: this.now(),
      schemaVersion: 1,
      ingestionKind: 'LIVE',
      payload: { price, size, aggressorSide: makerBuyer ? 'SELL' : 'BUY' },
    });
  }

  private async handleQuote(data: Record<string, unknown>): Promise<void> {
    const symbol = toCanonicalSymbol(String(data.s || ''));
    if (!this.symbols.includes(symbol)) return;
    const bid = finitePositive(data.b);
    const ask = finitePositive(data.a);
    if (bid === null || ask === null || ask < bid) return;
    const receivedAt = this.now();
    const timestamp = safeInteger(data.E) ?? safeInteger(data.T) ?? receivedAt;
    const updateId = safeInteger(data.u) ?? timestamp;
    await this.publish({
      eventId: `bn:qt:${toExchangeSymbol(symbol)}:${updateId}`,
      type: 'QUOTE',
      source: SOURCE,
      symbol,
      exchangeTimestamp: timestamp,
      receivedAt,
      schemaVersion: 1,
      ingestionKind: 'LIVE',
      payload: {
        bid,
        ask,
        bidSize: finiteNonNegative(data.B) ?? undefined,
        askSize: finiteNonNegative(data.A) ?? undefined,
      },
    });
  }

  private async handleDepth(data: BinanceDepthEvent): Promise<void> {
    const symbol = toCanonicalSymbol(String(data.s || ''));
    if (!this.symbols.includes(symbol)) return;
    const sync = this.depth.get(symbol)!;
    const start = safeInteger(data.U);
    const end = safeInteger(data.u);
    if (start === null || end === null || start > end) return;
    if (!sync.initialized) {
      sync.buffer.push(data);
      if (sync.buffer.length > MAX_DEPTH_BUFFER) {
        sync.buffer.splice(0, sync.buffer.length - MAX_DEPTH_BUFFER);
        this.fail(new Error(`binance_depth_buffer_overflow:${symbol}`));
      }
      if (!sync.syncing) void this.initializeDepth(symbol);
      return;
    }
    const previous = safeInteger(data.pu);
    if (sync.lastSequence !== null && previous !== null && previous !== sync.lastSequence) {
      sync.initialized = false;
      sync.buffer = [data];
      this.lastError = `binance_depth_sequence_gap:${symbol}:${previous}:${sync.lastSequence}`;
      await this.publishDepthDelta(symbol, data, false);
      void this.initializeDepth(symbol);
      return;
    }
    await this.publishDepthDelta(symbol, data, false);
    sync.lastSequence = end;
  }

  private async initializeDepth(symbol: string): Promise<void> {
    const sync = this.depth.get(symbol);
    if (!sync || sync.syncing || this.stopping) return;
    sync.syncing = true;
    try {
      const exchangeSymbol = toExchangeSymbol(symbol);
      const payload = await this.fetchJson(`${this.restBase}/fapi/v1/depth?symbol=${encodeURIComponent(exchangeSymbol)}&limit=1000`);
      if (!payload || typeof payload !== 'object') throw new Error('binance_depth_snapshot_malformed');
      const row = payload as Record<string, unknown>;
      const lastUpdateId = safeInteger(row.lastUpdateId);
      const bids = normalizeBookLevels(row.bids);
      const asks = normalizeBookLevels(row.asks);
      if (lastUpdateId === null || bids.length === 0 || asks.length === 0) throw new Error('binance_depth_snapshot_invalid');
      const receivedAt = this.now();
      await this.publish({
        eventId: `bn:ob:snap:${exchangeSymbol}:${lastUpdateId}`,
        type: 'ORDERBOOK_SNAPSHOT',
        source: SOURCE,
        symbol,
        exchangeTimestamp: receivedAt,
        receivedAt,
        sequence: lastUpdateId,
        schemaVersion: 1,
        ingestionKind: 'LIVE',
        payload: { bids, asks },
      });
      sync.lastSequence = lastUpdateId;
      sync.initialized = true;

      const buffered = sync.buffer.splice(0).filter((event) => (safeInteger(event.u) ?? -1) > lastUpdateId);
      let first = true;
      for (const event of buffered) {
        const start = safeInteger(event.U);
        const end = safeInteger(event.u);
        if (start === null || end === null) continue;
        const expected = (sync.lastSequence ?? lastUpdateId) + 1;
        if (first && !(start <= expected && end >= expected)) continue;
        const previous = safeInteger(event.pu);
        if (!first && previous !== null && sync.lastSequence !== null && previous !== sync.lastSequence) {
          sync.initialized = false;
          sync.buffer = [event, ...buffered.slice(buffered.indexOf(event) + 1)];
          this.lastError = `binance_depth_buffer_gap:${symbol}`;
          await this.publishDepthDelta(symbol, event, false);
          break;
        }
        await this.publishDepthDelta(symbol, event, first);
        sync.lastSequence = end;
        first = false;
      }
      if (!sync.initialized) queueMicrotask(() => { void this.initializeDepth(symbol); });
    } catch (error) {
      sync.initialized = false;
      this.fail(error);
    } finally {
      sync.syncing = false;
    }
  }

  private async publishDepthDelta(symbol: string, data: BinanceDepthEvent, omitPrevious: boolean): Promise<void> {
    const start = safeInteger(data.U);
    const end = safeInteger(data.u);
    if (start === null || end === null) return;
    const updates = [
      ...normalizeBookLevels(data.b).map((level) => ({ side: 'BID' as const, ...level })),
      ...normalizeBookLevels(data.a).map((level) => ({ side: 'ASK' as const, ...level })),
    ];
    if (updates.length === 0) return;
    const receivedAt = this.now();
    const timestamp = safeInteger(data.T) ?? safeInteger(data.E) ?? receivedAt;
    await this.publish({
      eventId: `bn:ob:delta:${toExchangeSymbol(symbol)}:${end}`,
      type: 'ORDERBOOK_DELTA',
      source: SOURCE,
      symbol,
      exchangeTimestamp: timestamp,
      receivedAt,
      sequenceStart: start,
      sequence: end,
      previousSequence: omitPrevious ? undefined : safeInteger(data.pu) ?? undefined,
      schemaVersion: 1,
      ingestionKind: 'LIVE',
      payload: { updates },
    });
  }
}
