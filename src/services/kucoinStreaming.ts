/**
 * Optional KuCoin public WebSocket transport with sequence-validated L2 state.
 *
 * The transport is disabled by default and must be explicitly enabled by the
 * caller. It is intended as a low-latency supplement to REST, not a replacement
 * for verified snapshots. Sequence gaps fail closed and trigger a REST reseed.
 */

import type { OrderBook, OrderBookLevel } from '../types';

export type KuCoinStreamConnectionState =
  | 'DISABLED'
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'DEGRADED';

export type L2ApplyStatus = 'APPLIED' | 'DUPLICATE' | 'GAP' | 'INVALID' | 'UNSEEDED';

export interface KuCoinL2Delta {
  change: string;
  sequence?: number | string;
  sequenceStart?: number | string;
  sequenceEnd?: number | string;
  timestamp?: number | string;
}

export interface SequencedOrderBookSnapshot {
  symbol: string;
  sequence: number;
  book: OrderBook;
  updatedAt: number;
  degraded: boolean;
  needsReseed: boolean;
}

export interface L2ApplyResult {
  status: L2ApplyStatus;
  previousSequence: number | null;
  nextSequence: number | null;
  snapshot: SequencedOrderBookSnapshot | null;
  reason?: string;
}

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLevels(
  rows: Array<readonly [number | string, number | string] | { price: number; volume: number }>,
  side: 'buy' | 'sell',
  depth: number,
): OrderBookLevel[] {
  const byPrice = new Map<number, number>();
  for (const row of rows) {
    const objectRow = row as { price: number; volume: number };
    const price = finite(Array.isArray(row) ? row[0] : objectRow.price);
    const volume = finite(Array.isArray(row) ? row[1] : objectRow.volume);
    if (price === null || volume === null || price <= 0 || volume <= 0) continue;
    byPrice.set(price, volume);
  }
  const sorted = [...byPrice.entries()]
    .sort((a, b) => side === 'buy' ? b[0] - a[0] : a[0] - b[0])
    .slice(0, depth);
  const total = sorted.reduce((sum, [, volume]) => sum + volume, 0);
  let cumulative = 0;
  return sorted.map(([price, volume]) => {
    cumulative += volume;
    return {
      price,
      volume,
      cumulative,
      percentage: total > 0 ? cumulative / total * 100 : 0,
    };
  });
}

function cloneBook(book: OrderBook): OrderBook {
  return {
    ...book,
    bids: book.bids.map((row) => ({ ...row })),
    asks: book.asks.map((row) => ({ ...row })),
  };
}

export class KuCoinL2SequenceBook {
  private snapshotValue: SequencedOrderBookSnapshot | null = null;

  constructor(private readonly depth = 50) {
    if (!Number.isFinite(depth) || depth < 1) throw new RangeError('l2_depth_out_of_range');
  }

  seed(input: {
    symbol: string;
    sequence: number;
    bids: Array<readonly [number | string, number | string] | { price: number; volume: number }>;
    asks: Array<readonly [number | string, number | string] | { price: number; volume: number }>;
    updatedAt?: number;
  }): SequencedOrderBookSnapshot {
    const symbol = input.symbol.trim().toUpperCase();
    const sequence = finite(input.sequence);
    if (!symbol) throw new TypeError('l2_symbol_required');
    if (sequence === null || sequence < 0) throw new RangeError('l2_sequence_invalid');
    const bids = normalizeLevels(input.bids, 'buy', this.depth);
    const asks = normalizeLevels(input.asks, 'sell', this.depth);
    if (!bids.length || !asks.length || bids[0].price >= asks[0].price) {
      throw new Error('l2_seed_crossed_or_empty');
    }
    this.snapshotValue = {
      symbol,
      sequence,
      book: { bids, asks, dataSource: 'live' },
      updatedAt: input.updatedAt ?? Date.now(),
      degraded: false,
      needsReseed: false,
    };
    return this.snapshot();
  }

  apply(delta: KuCoinL2Delta): L2ApplyResult {
    const current = this.snapshotValue;
    if (!current) {
      return { status: 'UNSEEDED', previousSequence: null, nextSequence: null, snapshot: null, reason: 'rest_seed_required' };
    }
    if (!delta || typeof delta.change !== 'string') {
      return { status: 'INVALID', previousSequence: current.sequence, nextSequence: current.sequence, snapshot: this.snapshot(), reason: 'change_missing' };
    }

    const sequenceStart = finite(delta.sequenceStart ?? delta.sequence);
    const sequenceEnd = finite(delta.sequenceEnd ?? delta.sequence);
    if (sequenceStart === null || sequenceEnd === null || sequenceStart < 0 || sequenceEnd < sequenceStart) {
      return { status: 'INVALID', previousSequence: current.sequence, nextSequence: current.sequence, snapshot: this.snapshot(), reason: 'sequence_invalid' };
    }
    if (sequenceEnd <= current.sequence) {
      return { status: 'DUPLICATE', previousSequence: current.sequence, nextSequence: current.sequence, snapshot: this.snapshot() };
    }
    const expected = current.sequence + 1;
    if (sequenceStart > expected || sequenceEnd < expected) {
      current.degraded = true;
      current.needsReseed = true;
      current.book.dataSource = 'degraded';
      return {
        status: 'GAP',
        previousSequence: current.sequence,
        nextSequence: sequenceEnd,
        snapshot: this.snapshot(),
        reason: `expected_${expected}_received_${sequenceStart}_${sequenceEnd}`,
      };
    }

    const [priceRaw, sideRaw, sizeRaw] = delta.change.split(',');
    const price = finite(priceRaw);
    const size = finite(sizeRaw);
    const side = sideRaw === 'buy' || sideRaw === 'sell' ? sideRaw : null;
    if (price === null || size === null || !side || price <= 0 || size < 0) {
      return { status: 'INVALID', previousSequence: current.sequence, nextSequence: current.sequence, snapshot: this.snapshot(), reason: 'change_invalid' };
    }

    const previousBook = cloneBook(current.book);
    const rows = side === 'buy' ? current.book.bids : current.book.asks;
    const rowIndex = rows.findIndex((row) => row.price === price);
    if (size === 0 && rowIndex >= 0) rows.splice(rowIndex, 1);
    else if (size > 0 && rowIndex >= 0) rows[rowIndex] = { ...rows[rowIndex], volume: size };
    else if (size > 0) rows.push({ price, volume: size, cumulative: 0, percentage: 0 });

    const normalized = normalizeLevels(rows.map((row) => ({ price: row.price, volume: row.volume })), side, this.depth);
    if (side === 'buy') current.book.bids = normalized;
    else current.book.asks = normalized;

    if (!current.book.bids.length || !current.book.asks.length || current.book.bids[0].price >= current.book.asks[0].price) {
      current.book = previousBook;
      current.degraded = true;
      current.needsReseed = true;
      current.book.dataSource = 'degraded';
      return {
        status: 'GAP',
        previousSequence: current.sequence,
        nextSequence: sequenceEnd,
        snapshot: this.snapshot(),
        reason: 'book_crossed_after_delta',
      };
    }

    const previousSequence = current.sequence;
    current.sequence = sequenceEnd;
    current.updatedAt = finite(delta.timestamp) ?? Date.now();
    current.degraded = false;
    current.needsReseed = false;
    current.book.dataSource = 'live';
    return {
      status: 'APPLIED',
      previousSequence,
      nextSequence: current.sequence,
      snapshot: this.snapshot(),
    };
  }

  markDegraded(): SequencedOrderBookSnapshot | null {
    if (!this.snapshotValue) return null;
    this.snapshotValue.degraded = true;
    this.snapshotValue.book.dataSource = 'degraded';
    return this.snapshot();
  }

  snapshot(): SequencedOrderBookSnapshot {
    if (!this.snapshotValue) throw new Error('l2_book_unseeded');
    return { ...this.snapshotValue, book: cloneBook(this.snapshotValue.book) };
  }

  clear(): void {
    this.snapshotValue = null;
  }
}

interface WebSocketEventLike { data?: unknown }
interface WebSocketLike {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: WebSocketEventLike) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;
export type StreamHandler = (data: unknown) => void;

export interface KuCoinPublicStreamClientOptions {
  enabled: boolean;
  tokenEndpoint?: string;
  websocketFactory?: WebSocketFactory;
  fetchJson?: (url: string, init?: RequestInit) => Promise<unknown>;
  now?: () => number;
  random?: () => number;
}

interface BulletData {
  token?: string;
  instanceServers?: Array<{ endpoint?: string; pingInterval?: number; pingTimeout?: number }>;
}

function defaultWebSocketFactory(url: string): WebSocketLike {
  if (typeof WebSocket === 'undefined') throw new Error('websocket_not_available');
  return new WebSocket(url) as unknown as WebSocketLike;
}

async function defaultFetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`stream_token_http_${response.status}`);
  return response.json();
}

function unwrapBulletEnvelope(value: unknown): BulletData {
  if (!value || typeof value !== 'object') throw new Error('stream_token_malformed');
  const row = value as Record<string, unknown>;
  if (row.ok === false) throw new Error(`stream_token_failed:${String(row.reason ?? row.message ?? 'unknown')}`);
  const data = row.ok === true ? row.data : row;
  if (!data || typeof data !== 'object') throw new Error('stream_token_data_missing');
  return data as BulletData;
}

export class KuCoinPublicStreamClient {
  private socket: WebSocketLike | null = null;
  private stateValue: KuCoinStreamConnectionState;
  private handlers = new Map<string, Set<StreamHandler>>();
  private stateHandlers = new Set<(state: KuCoinStreamConnectionState) => void>();
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryCount = 0;
  private closing = false;
  private tokenCache: { data: BulletData; expiresAt: number } | null = null;
  private readonly tokenEndpoint: string;
  private readonly websocketFactory: WebSocketFactory;
  private readonly fetchJson: NonNullable<KuCoinPublicStreamClientOptions['fetchJson']>;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(private readonly options: KuCoinPublicStreamClientOptions) {
    this.stateValue = options.enabled ? 'DISCONNECTED' : 'DISABLED';
    this.tokenEndpoint = options.tokenEndpoint ?? '/api/kucoin/bullet-public';
    this.websocketFactory = options.websocketFactory ?? defaultWebSocketFactory;
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  get state(): KuCoinStreamConnectionState {
    return this.stateValue;
  }

  onStateChange(handler: (state: KuCoinStreamConnectionState) => void): () => void {
    this.stateHandlers.add(handler);
    handler(this.stateValue);
    return () => this.stateHandlers.delete(handler);
  }

  async subscribe(topic: string, handler: StreamHandler): Promise<() => void> {
    if (!this.options.enabled) return () => undefined;
    const normalized = topic.trim();
    if (!normalized) throw new TypeError('stream_topic_required');
    let set = this.handlers.get(normalized);
    const isNew = !set;
    if (!set) {
      set = new Set();
      this.handlers.set(normalized, set);
    }
    set.add(handler);
    await this.ensureConnected();
    if (isNew && this.socket?.readyState === 1) this.sendSubscription(normalized, 'subscribe');
    return () => {
      const current = this.handlers.get(normalized);
      current?.delete(handler);
      if (current?.size === 0) {
        this.handlers.delete(normalized);
        if (this.socket?.readyState === 1) this.sendSubscription(normalized, 'unsubscribe');
      }
      if (this.handlers.size === 0) this.disconnect();
    };
  }

  disconnect(): void {
    this.closing = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
    try { this.socket?.close(); } catch { /* no-op */ }
    this.socket = null;
    this.connectPromise = null;
    this.retryCount = 0;
    this.setState(this.options.enabled ? 'DISCONNECTED' : 'DISABLED');
  }

  private setState(state: KuCoinStreamConnectionState): void {
    if (this.stateValue === state) return;
    this.stateValue = state;
    for (const handler of this.stateHandlers) {
      try { handler(state); } catch { /* observability must not break transport */ }
    }
  }

  private async getBullet(): Promise<BulletData> {
    if (this.tokenCache && this.now() < this.tokenCache.expiresAt) return this.tokenCache.data;
    const payload = await this.fetchJson(this.tokenEndpoint, { method: 'POST' });
    const data = unwrapBulletEnvelope(payload);
    if (!data.token) throw new Error('stream_token_missing');
    this.tokenCache = { data, expiresAt: this.now() + 20 * 60 * 60 * 1000 };
    return data;
  }

  private async ensureConnected(): Promise<void> {
    if (this.socket?.readyState === 1 && this.stateValue === 'CONNECTED') return;
    if (this.connectPromise) return this.connectPromise;
    this.closing = false;
    this.setState(this.retryCount ? 'RECONNECTING' : 'CONNECTING');
    this.connectPromise = this.connect().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private async connect(): Promise<void> {
    const bullet = await this.getBullet();
    const server = bullet.instanceServers?.find((row) => typeof row.endpoint === 'string');
    const endpoint = server?.endpoint ?? 'wss://ws-api-futures.kucoin.com/endpoint';
    const separator = endpoint.includes('?') ? '&' : '?';
    const connectId = `apex_${this.now()}_${Math.floor(this.random() * 1e9).toString(36)}`;
    const socket = this.websocketFactory(`${endpoint}${separator}token=${encodeURIComponent(bullet.token!)}&connectId=${connectId}`);
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      let opened = false;
      socket.onopen = () => {
        opened = true;
        this.retryCount = 0;
        this.setState('CONNECTED');
        for (const topic of this.handlers.keys()) this.sendSubscription(topic, 'subscribe');
        if (this.pingTimer) clearInterval(this.pingTimer);
        const pingEvery = Math.max(5_000, Number(server?.pingInterval ?? 18_000));
        this.pingTimer = setInterval(() => {
          if (this.socket?.readyState === 1) {
            this.socket.send(JSON.stringify({ id: String(this.now()), type: 'ping' }));
          }
        }, pingEvery);
        resolve();
      };
      socket.onmessage = (event) => {
        try {
          const parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (!parsed || typeof parsed !== 'object') return;
          const row = parsed as Record<string, unknown>;
          if (row.type === 'message' && typeof row.topic === 'string') {
            for (const handler of this.handlers.get(row.topic) ?? []) handler(row.data);
          }
        } catch {
          this.setState('DEGRADED');
        }
      };
      socket.onerror = () => {
        this.setState('DEGRADED');
      };
      socket.onclose = () => {
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = null;
        this.socket = null;
        if (this.closing || this.handlers.size === 0) {
          this.setState(this.options.enabled ? 'DISCONNECTED' : 'DISABLED');
          if (!opened) reject(new Error('stream_closed_before_open'));
          return;
        }
        this.scheduleReconnect();
        if (!opened) reject(new Error('stream_closed_before_open'));
      };
    });
  }

  private scheduleReconnect(): void {
    this.retryCount += 1;
    this.setState('RECONNECTING');
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.retryCount, 5));
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureConnected().catch(() => this.scheduleReconnect());
    }, delay);
  }

  private sendSubscription(topic: string, type: 'subscribe' | 'unsubscribe'): void {
    if (this.socket?.readyState !== 1) return;
    this.socket.send(JSON.stringify({
      id: String(this.now()),
      type,
      topic,
      privateChannel: false,
      response: true,
    }));
  }
}

export interface SequenceValidatedL2StreamOptions {
  client: KuCoinPublicStreamClient;
  symbol: string;
  contract: string;
  seed: () => Promise<{
    sequence: number;
    bids: Array<readonly [number | string, number | string] | { price: number; volume: number }>;
    asks: Array<readonly [number | string, number | string] | { price: number; volume: number }>;
  }>;
  onUpdate: (snapshot: SequencedOrderBookSnapshot, status: L2ApplyStatus | 'SEEDED') => void;
  onError?: (error: Error) => void;
  depth?: number;
}

export class SequenceValidatedL2Stream {
  private readonly book: KuCoinL2SequenceBook;
  private unsubscribe: (() => void) | null = null;
  private resyncPromise: Promise<void> | null = null;

  constructor(private readonly options: SequenceValidatedL2StreamOptions) {
    this.book = new KuCoinL2SequenceBook(options.depth ?? 50);
  }

  async start(): Promise<() => void> {
    await this.reseed();
    const topic = `/contractMarket/level2:${this.options.contract}`;
    this.unsubscribe = await this.options.client.subscribe(topic, (data) => {
      const result = this.book.apply(data as KuCoinL2Delta);
      if (result.snapshot) this.options.onUpdate(result.snapshot, result.status);
      if (result.status === 'GAP' || result.status === 'UNSEEDED') void this.reseed();
    });
    return () => this.stop();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.book.clear();
  }

  private async reseed(): Promise<void> {
    if (this.resyncPromise) return this.resyncPromise;
    this.resyncPromise = (async () => {
      try {
        const seed = await this.options.seed();
        const snapshot = this.book.seed({
          symbol: this.options.symbol,
          sequence: seed.sequence,
          bids: seed.bids,
          asks: seed.asks,
        });
        this.options.onUpdate(snapshot, 'SEEDED');
      } catch (error) {
        this.book.markDegraded();
        this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    })().finally(() => {
      this.resyncPromise = null;
    });
    return this.resyncPromise;
  }
}

export function parseStreamingFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value ?? '').trim().toLowerCase());
}
