import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import type {
  NormalizedOrderBookDeltaPayload,
  NormalizedOrderBookSnapshotPayload,
  OrderBookLevel,
} from '../../contracts/realtime/marketPayloads';

export type OrderBookStateQuality = 'EMPTY' | 'VALID' | 'REBUILDING' | 'INVALID' | 'STALE';

export interface OrderBookStateSnapshot {
  source: string;
  symbol: string;
  quality: OrderBookStateQuality;
  sequence: number | null;
  sequenceValidated: boolean;
  observedAt: number | null;
  updatedAt: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  spreadPct: number | null;
  reasons: string[];
}

interface InternalBook {
  source: string;
  symbol: string;
  quality: OrderBookStateQuality;
  sequence: number | null;
  sequenceValidated: boolean;
  observedAt: number | null;
  updatedAt: number;
  bids: Map<number, number>;
  asks: Map<number, number>;
  reasons: string[];
}

const KEY_SEP = '\u001f';
const MAX_LEVELS_PER_SIDE = 500;

function key(source: string, symbol: string): string {
  return `${source}${KEY_SEP}${symbol}`;
}

function normalizeLevels(value: unknown): OrderBookLevel[] | null {
  if (!Array.isArray(value)) return null;
  const result: OrderBookLevel[] = [];
  for (const raw of value) {
    let price: number;
    let size: number;
    if (Array.isArray(raw)) {
      price = Number(raw[0]);
      size = Number(raw[1]);
    } else if (raw && typeof raw === 'object') {
      price = Number((raw as Record<string, unknown>).price);
      size = Number((raw as Record<string, unknown>).size);
    } else continue;
    if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size < 0) continue;
    result.push({ price, size });
  }
  return result;
}

function parseSnapshot(payload: unknown): NormalizedOrderBookSnapshotPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;
  const bids = normalizeLevels(row.bids);
  const asks = normalizeLevels(row.asks);
  return bids && asks ? { bids, asks } : null;
}

function parseDelta(payload: unknown): NormalizedOrderBookDeltaPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;
  const rawUpdates = Array.isArray(row.updates) ? row.updates : [row];
  const updates: NormalizedOrderBookDeltaPayload['updates'] = [];
  for (const raw of rawUpdates) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const side = String(item.side || '').toUpperCase();
    const price = Number(item.price);
    const size = Number(item.size);
    if ((side !== 'BID' && side !== 'ASK') || !Number.isFinite(price) || price <= 0 || !Number.isFinite(size) || size < 0) continue;
    updates.push({ side, price, size });
  }
  return updates.length ? { updates } : null;
}

function trimBook(book: Map<number, number>, descending: boolean): Map<number, number> {
  if (book.size <= MAX_LEVELS_PER_SIDE) return book;
  const entries = [...book.entries()].sort((a, b) => descending ? b[0] - a[0] : a[0] - b[0]).slice(0, MAX_LEVELS_PER_SIDE);
  return new Map(entries);
}

export class OrderBookRebuilder {
  private readonly books = new Map<string, InternalBook>();

  apply(event: MarketEvent, now = Date.now()): void {
    if (event.type !== 'ORDERBOOK_SNAPSHOT' && event.type !== 'ORDERBOOK_DELTA') return;
    const k = key(event.source, event.symbol);
    if (event.type === 'ORDERBOOK_SNAPSHOT') {
      const payload = parseSnapshot(event.payload);
      if (!payload) {
        this.invalidate(event.source, event.symbol, 'invalid_orderbook_snapshot_payload', now);
        return;
      }
      const bids = new Map<number, number>();
      const asks = new Map<number, number>();
      for (const level of payload.bids) if (level.size > 0) bids.set(level.price, level.size);
      for (const level of payload.asks) if (level.size > 0) asks.set(level.price, level.size);
      const state: InternalBook = {
        source: event.source,
        symbol: event.symbol,
        quality: bids.size && asks.size ? 'VALID' : 'INVALID',
        sequence: event.sequence ?? null,
        sequenceValidated: event.sequence !== undefined,
        observedAt: event.exchangeTimestamp,
        updatedAt: now,
        bids: trimBook(bids, true),
        asks: trimBook(asks, false),
        reasons: bids.size && asks.size ? [] : ['empty_orderbook_side'],
      };
      this.books.set(k, state);
      return;
    }

    const current = this.books.get(k);
    if (!current || current.quality !== 'VALID') {
      this.books.set(k, {
        source: event.source,
        symbol: event.symbol,
        quality: 'REBUILDING',
        sequence: event.sequence ?? null,
        sequenceValidated: false,
        observedAt: event.exchangeTimestamp,
        updatedAt: now,
        bids: new Map(),
        asks: new Map(),
        reasons: ['orderbook_snapshot_required_before_delta'],
      });
      return;
    }
    const payload = parseDelta(event.payload);
    if (!payload) {
      this.invalidate(event.source, event.symbol, 'invalid_orderbook_delta_payload', now);
      return;
    }
    for (const update of payload.updates) {
      const side = update.side === 'BID' ? current.bids : current.asks;
      if (update.size === 0) side.delete(update.price);
      else side.set(update.price, update.size);
    }
    current.bids = trimBook(current.bids, true);
    current.asks = trimBook(current.asks, false);
    current.sequence = event.sequence ?? current.sequence;
    current.sequenceValidated = current.sequenceValidated && event.sequence !== undefined;
    current.observedAt = event.exchangeTimestamp;
    current.updatedAt = now;
    if (!current.bids.size || !current.asks.size) {
      current.quality = 'INVALID';
      current.reasons = [...current.reasons, 'empty_orderbook_side_after_delta'];
    }
  }

  invalidate(source: string, symbol: string, reason: string, now = Date.now()): void {
    const k = key(source, symbol);
    const current = this.books.get(k);
    if (!current) {
      this.books.set(k, {
        source,
        symbol,
        quality: 'INVALID',
        sequence: null,
        sequenceValidated: false,
        observedAt: null,
        updatedAt: now,
        bids: new Map(),
        asks: new Map(),
        reasons: [reason],
      });
      return;
    }
    current.quality = 'INVALID';
    current.updatedAt = now;
    current.reasons = [...current.reasons, reason];
  }

  markRebuilding(source: string, symbol: string, reason: string, now = Date.now()): void {
    this.invalidate(source, symbol, reason, now);
    const current = this.books.get(key(source, symbol));
    if (current) current.quality = 'REBUILDING';
  }

  snapshot(source: string, symbol: string, now = Date.now(), maxAgeMs = 5_000): OrderBookStateSnapshot | null {
    const current = this.books.get(key(source, symbol));
    if (!current) return null;
    const bids = [...current.bids.entries()].sort((a, b) => b[0] - a[0]).map(([price, size]) => ({ price, size }));
    const asks = [...current.asks.entries()].sort((a, b) => a[0] - b[0]).map(([price, size]) => ({ price, size }));
    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;
    const midpoint = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : null;
    const spreadPct = midpoint && bestBid !== null && bestAsk !== null ? ((bestAsk - bestBid) / midpoint) * 100 : null;
    const stale = now - current.updatedAt > maxAgeMs;
    return {
      source,
      symbol,
      quality: current.quality === 'VALID' && stale ? 'STALE' : current.quality,
      sequence: current.sequence,
      sequenceValidated: current.sequenceValidated,
      observedAt: current.observedAt,
      updatedAt: current.updatedAt,
      bids,
      asks,
      bestBid,
      bestAsk,
      spreadPct,
      reasons: stale && current.quality === 'VALID' ? [...current.reasons, 'orderbook_stale'] : [...current.reasons],
    };
  }

  stats(): { books: number; valid: number; rebuilding: number; invalid: number } {
    let valid = 0;
    let rebuilding = 0;
    let invalid = 0;
    for (const book of this.books.values()) {
      if (book.quality === 'VALID') valid += 1;
      else if (book.quality === 'REBUILDING') rebuilding += 1;
      else if (book.quality === 'INVALID') invalid += 1;
    }
    return { books: this.books.size, valid, rebuilding, invalid };
  }

  clear(): void {
    this.books.clear();
  }
}
