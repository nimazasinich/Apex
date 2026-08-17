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

const SOURCE = 'bybit-linear-ws';
const DEFAULT_WS_URL = 'wss://stream.bybit.com/v5/public/linear';

export interface BybitLinearPublicFeedOptions {
  enabled: boolean;
  symbols: string[];
  eventBus: InProcessEventBus;
  websocketFactory?: WebSocketFactory;
  websocketUrl?: string;
  now?: () => number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
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
  const result: Array<{ price: number; size: number }> = [];
  for (const item of raw) {
    if (!Array.isArray(item)) continue;
    const price = finitePositive(item[0]);
    const size = finiteNonNegative(item[1]);
    if (price === null || size === null) continue;
    result.push({ price, size });
  }
  return result;
}

export class BybitLinearPublicFeed {
  private readonly symbols: string[];
  private readonly eventBus: InProcessEventBus;
  private readonly websocketFactory: WebSocketFactory;
  private readonly websocketUrl: string;
  private readonly now: () => number;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private socket: WebSocketLike | null = null;
  private state: PublicFeedConnectionState;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryCount = 0;
  private stopping = false;
  private processing: Promise<void> = Promise.resolve();
  private connectedAt: number | null = null;
  private lastMessageAt: number | null = null;
  private lastError: string | null = null;
  private reconnects = 0;
  private publishedEvents = 0;
  private rejectedEvents = 0;

  constructor(options: BybitLinearPublicFeedOptions) {
    this.symbols = normalizeCanonicalSymbols(options.symbols);
    this.eventBus = options.eventBus;
    this.websocketFactory = options.websocketFactory ?? defaultWebSocketFactory;
    this.websocketUrl = options.websocketUrl ?? DEFAULT_WS_URL;
    this.now = options.now ?? Date.now;
    this.reconnectBaseMs = Math.max(250, Math.min(30_000, options.reconnectBaseMs ?? 1_000));
    this.reconnectMaxMs = Math.max(this.reconnectBaseMs, Math.min(120_000, options.reconnectMaxMs ?? 30_000));
    this.state = options.enabled && this.symbols.length ? 'DISCONNECTED' : 'DISABLED';
  }

  start(): void {
    if (this.state === 'DISABLED' || this.stopping || this.socket) return;
    this.stopping = false;
    this.connect();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
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
    if (this.stopping || this.state === 'DISABLED') return;
    this.state = this.retryCount > 0 ? 'RECONNECTING' : 'CONNECTING';
    let socket: WebSocketLike;
    try { socket = this.websocketFactory(this.websocketUrl); }
    catch (error) { this.fail(error); this.scheduleReconnect(); return; }
    this.socket = socket;
    socket.onopen = () => {
      this.retryCount = 0;
      this.connectedAt = this.now();
      this.state = 'CONNECTED';
      this.lastError = null;
      const args = this.symbols.flatMap((symbol) => {
        const s = toExchangeSymbol(symbol);
        return [`publicTrade.${s}`, `orderbook.50.${s}`];
      });
      socket.send(JSON.stringify({ op: 'subscribe', args, req_id: `apex-${this.now()}` }));
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => {
        if (this.socket?.readyState === 1) this.socket.send(JSON.stringify({ op: 'ping', req_id: `apex-${this.now()}` }));
      }, 20_000);
      this.pingTimer.unref?.();
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
      this.lastError = 'bybit_websocket_error';
    };
    socket.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
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
    this.lastError = error instanceof Error ? error.message : String(error || 'bybit_feed_error');
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
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new Error('bybit_ws_invalid_json'); }
    if (!parsed || typeof parsed !== 'object') return;
    const row = parsed as Record<string, unknown>;
    const topic = String(row.topic || '');
    if (topic.startsWith('publicTrade.')) return this.handleTrades(row);
    if (topic.startsWith('orderbook.')) return this.handleBook(row);
  }

  private async handleTrades(row: Record<string, unknown>): Promise<void> {
    if (!Array.isArray(row.data)) return;
    for (let i = 0; i < row.data.length; i += 1) {
      const item = row.data[i];
      if (!item || typeof item !== 'object') continue;
      const trade = item as Record<string, unknown>;
      const symbol = toCanonicalSymbol(String(trade.s || ''));
      if (!this.symbols.includes(symbol)) continue;
      const price = finitePositive(trade.p);
      const size = finitePositive(trade.v);
      const timestamp = safeInteger(trade.T) ?? safeInteger(row.ts) ?? this.now();
      const side = String(trade.S || '').toUpperCase();
      if (price === null || size === null || (side !== 'BUY' && side !== 'SELL')) continue;
      const rawId = String(trade.i || trade.id || `${timestamp}-${i}`).replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 80);
      await this.publish({
        eventId: `bb:tr:${toExchangeSymbol(symbol)}:${rawId || `${timestamp}-${i}`}`,
        type: 'TRADE',
        source: SOURCE,
        symbol,
        exchangeTimestamp: timestamp,
        receivedAt: this.now(),
        schemaVersion: 1,
        ingestionKind: 'LIVE',
        payload: { price, size, aggressorSide: side },
      });
    }
  }

  private async handleBook(row: Record<string, unknown>): Promise<void> {
    if (!row.data || typeof row.data !== 'object') return;
    const data = row.data as Record<string, unknown>;
    const symbol = toCanonicalSymbol(String(data.s || ''));
    if (!this.symbols.includes(symbol)) return;
    const bids = normalizeBookLevels(data.b);
    const asks = normalizeBookLevels(data.a);
    const timestamp = safeInteger(data.cts) ?? safeInteger(row.ts) ?? this.now();
    const updateId = safeInteger(data.u) ?? timestamp;
    const kind = String(row.type || '').toLowerCase();
    if (kind === 'snapshot' || updateId === 1) {
      if (!bids.length || !asks.length) return;
      // Bybit publishes an update id and a cross sequence but does not expose
      // the exact previous-update linkage needed by APEX's strict contiguous
      // SequenceGuard. Keep the feed useful but unsequenced/non-authoritative.
      await this.publish({
        eventId: `bb:ob:snap:${toExchangeSymbol(symbol)}:${updateId}`,
        type: 'ORDERBOOK_SNAPSHOT',
        source: SOURCE,
        symbol,
        exchangeTimestamp: timestamp,
        receivedAt: this.now(),
        schemaVersion: 1,
        ingestionKind: 'LIVE',
        payload: { bids, asks },
      });
      return;
    }
    if (kind !== 'delta') return;
    const updates = [
      ...bids.map((level) => ({ side: 'BID' as const, ...level })),
      ...asks.map((level) => ({ side: 'ASK' as const, ...level })),
    ];
    if (!updates.length) return;
    await this.publish({
      eventId: `bb:ob:delta:${toExchangeSymbol(symbol)}:${updateId}`,
      type: 'ORDERBOOK_DELTA',
      source: SOURCE,
      symbol,
      exchangeTimestamp: timestamp,
      receivedAt: this.now(),
      schemaVersion: 1,
      ingestionKind: 'LIVE',
      payload: { updates },
    });
  }
}
