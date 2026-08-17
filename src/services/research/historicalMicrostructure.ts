import { join } from 'node:path';
import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import { assertValidMarketEvent } from '../../contracts/realtime/marketEvent';
import { canonicalInstrumentId } from '../providers/publicExchangeClient';
import { resolvePrivateDataDir } from '../privateConfigFile';
import { AppendOnlyEventLog } from '../realtime/appendOnlyEventLog';
import { OrderBookRebuilder, type OrderBookStateSnapshot } from '../realtime/orderBookRebuilder';
import { SequenceGuard } from '../realtime/sequenceGuard';

export type HistoricalDepthUnit = 'BASE_ASSET' | 'CONTRACTS';

export interface HistoricalL1QuoteInput {
  symbol: string;
  venue: string;
  timestamp: number;
  bid: number;
  ask: number;
  bidSize?: number;
  askSize?: number;
  sourceSequence?: number;
}

export interface HistoricalL1Quote {
  symbol: string;
  venue: string;
  timestamp: number;
  bid: number;
  ask: number;
  bidSize: number | null;
  askSize: number | null;
  spread: number;
  spreadPct: number;
  sourceSequence: number | null;
}

export interface HistoricalL2SnapshotInput {
  symbol: string;
  venue: string;
  timestamp: number;
  sequence: number;
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
  unit: HistoricalDepthUnit;
  contractMultiplier?: number;
}

export interface HistoricalL2DeltaInput {
  symbol: string;
  venue: string;
  timestamp: number;
  sequence: number;
  sequenceStart?: number;
  previousSequence?: number;
  updates: Array<{ side: 'BID' | 'ASK'; price: number; size: number }>;
  unit: HistoricalDepthUnit;
  contractMultiplier?: number;
}

export interface HistoricalL1Series {
  symbol: string;
  venue: string | null;
  status: 'VALID' | 'INSUFFICIENT' | 'GAPPED';
  gaps: Array<{ from: number; to: number; durationMs: number }>;
  quotes: HistoricalL1Quote[];
}

export interface HistoricalL2Series {
  symbol: string;
  venue: string | null;
  status: 'VALID' | 'INSUFFICIENT' | 'CORRUPT' | 'GAPPED';
  corruptLines: number;
  sequenceErrors: string[];
  events: MarketEvent[];
  finalBook: OrderBookStateSnapshot | null;
}

export interface HistoricalTopOfBookTick {
  symbol: string;
  venue: string;
  timestamp: number;
  sequence: number | null;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  spreadPct: number;
}

export interface HistoricalFundingObservation {
  timestamp: number;
  rate: number;
  effectiveAt: number | null;
  source: string;
}

export interface HistoricalMicrostructureStats {
  events: number;
  l1Quotes: number;
  l2Snapshots: number;
  l2Deltas: number;
  trades: number;
  fundingObservations: number;
  symbols: string[];
  venues: string[];
  corruptLines: number;
}

const SOURCE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function positive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nonNegative(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function safeTimestamp(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= Date.now() + 60_000 ? Math.floor(parsed) : null;
}

function normalizeVenue(value: string): string {
  const venue = String(value || '').trim().toLowerCase();
  if (!SOURCE_PATTERN.test(venue)) throw new Error('historical_microstructure_venue_invalid');
  return venue;
}

function normalizeSymbol(value: string): string {
  const symbol = canonicalInstrumentId(value);
  if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(symbol)) throw new Error('historical_microstructure_symbol_invalid');
  return symbol;
}

function normalizeSize(size: unknown, unit: HistoricalDepthUnit, multiplier?: number): number {
  const raw = nonNegative(size);
  if (raw === null) throw new Error('historical_l2_size_invalid');
  if (unit === 'BASE_ASSET') return raw;
  const factor = positive(multiplier);
  if (factor === null) throw new Error('historical_l2_contract_multiplier_required');
  return raw * factor;
}

function eventId(parts: Array<string | number>): string {
  return parts.join(':').replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 160);
}

function quoteFromEvent(event: MarketEvent): HistoricalL1Quote | null {
  if (event.type !== 'QUOTE' || !event.payload || typeof event.payload !== 'object') return null;
  const row = event.payload as Record<string, unknown>;
  const bid = positive(row.bid);
  const ask = positive(row.ask);
  if (bid === null || ask === null || ask <= bid) return null;
  const midpoint = (bid + ask) / 2;
  return {
    symbol: event.symbol,
    venue: event.source,
    timestamp: event.exchangeTimestamp,
    bid,
    ask,
    bidSize: positive(row.bidSize),
    askSize: positive(row.askSize),
    spread: ask - bid,
    spreadPct: midpoint > 0 ? ((ask - bid) / midpoint) * 100 : 0,
    sourceSequence: event.sequence ?? null,
  };
}

export class HistoricalMicrostructureRepository {
  private readonly log: AppendOnlyEventLog;
  private readonly sequence = new SequenceGuard();
  private readonly snapshotSeen = new Set<string>();

  constructor(options: { filePath?: string; maxSegmentBytes?: number; maxSegments?: number; fsync?: boolean } = {}) {
    const filePath = options.filePath ?? join(resolvePrivateDataDir(), 'research', 'historical-microstructure.jsonl');
    this.log = new AppendOnlyEventLog({
      filePath,
      maxSegmentBytes: options.maxSegmentBytes ?? 32 * 1024 * 1024,
      maxSegments: options.maxSegments ?? 32,
      fsync: options.fsync ?? true,
    });
    this.hydrateSequenceState();
  }

  private hydrateSequenceState(): void {
    const rows = this.log.readAll().events
      .filter((event) => event.type === 'ORDERBOOK_SNAPSHOT' || event.type === 'ORDERBOOK_DELTA')
      .sort((a, b) => a.exchangeTimestamp - b.exchangeTimestamp || (a.sequence ?? 0) - (b.sequence ?? 0));
    for (const event of rows) {
      const key = `${event.source}:${event.symbol}`;
      if (event.type === 'ORDERBOOK_SNAPSHOT') this.snapshotSeen.add(key);
      this.sequence.inspect(event);
    }
  }

  async appendL1(input: HistoricalL1QuoteInput): Promise<MarketEvent> {
    const symbol = normalizeSymbol(input.symbol);
    const venue = normalizeVenue(input.venue);
    const timestamp = safeTimestamp(input.timestamp);
    const bid = positive(input.bid);
    const ask = positive(input.ask);
    const bidSize = input.bidSize === undefined ? null : nonNegative(input.bidSize);
    const askSize = input.askSize === undefined ? null : nonNegative(input.askSize);
    if (timestamp === null || bid === null || ask === null || ask <= bid || (input.bidSize !== undefined && bidSize === null) || (input.askSize !== undefined && askSize === null)) {
      throw new Error('historical_l1_quote_invalid');
    }
    const midpoint = (bid + ask) / 2;
    const event: MarketEvent = {
      eventId: eventId(['l1', venue, symbol, timestamp, input.sourceSequence ?? 'na']),
      type: 'QUOTE', source: venue, symbol, exchangeTimestamp: timestamp, receivedAt: Date.now(),
      ...(input.sourceSequence !== undefined ? { sequence: input.sourceSequence } : {}),
      schemaVersion: 1, ingestionKind: 'HISTORICAL_BOOTSTRAP',
      payload: { bid, ask, bidSize, askSize, spread: ask - bid, spreadPct: ((ask - bid) / midpoint) * 100, unit: 'BASE_ASSET' },
    };
    assertValidMarketEvent(event);
    await this.log.append(event);
    return event;
  }

  async appendL2Snapshot(input: HistoricalL2SnapshotInput): Promise<MarketEvent> {
    const symbol = normalizeSymbol(input.symbol);
    const venue = normalizeVenue(input.venue);
    const timestamp = safeTimestamp(input.timestamp);
    if (timestamp === null || !Number.isSafeInteger(input.sequence) || input.sequence < 0 || !Array.isArray(input.bids) || !Array.isArray(input.asks) || !input.bids.length || !input.asks.length) {
      throw new Error('historical_l2_snapshot_invalid');
    }
    const normalize = ([priceRaw, sizeRaw]: [number, number]) => {
      const price = positive(priceRaw);
      if (price === null) throw new Error('historical_l2_price_invalid');
      return { price, size: normalizeSize(sizeRaw, input.unit, input.contractMultiplier) };
    };
    const bids = input.bids.map(normalize).sort((a, b) => b.price - a.price);
    const asks = input.asks.map(normalize).sort((a, b) => a.price - b.price);
    if (bids[0].price >= asks[0].price) throw new Error('historical_l2_crossed_book');
    const event: MarketEvent = {
      eventId: eventId(['l2s', venue, symbol, timestamp, input.sequence]), type: 'ORDERBOOK_SNAPSHOT', source: venue, symbol,
      exchangeTimestamp: timestamp, receivedAt: Date.now(), sequence: input.sequence, schemaVersion: 1, ingestionKind: 'HISTORICAL_BOOTSTRAP',
      payload: { bids, asks, sourceUnit: input.unit, normalizedUnit: 'BASE_ASSET', contractMultiplier: input.unit === 'CONTRACTS' ? input.contractMultiplier : null },
    };
    assertValidMarketEvent(event);
    const decision = this.sequence.inspect(event);
    if (decision.status !== 'ACCEPTED') throw new Error(`historical_l2_sequence_${decision.status.toLowerCase()}`);
    this.snapshotSeen.add(`${venue}:${symbol}`);
    await this.log.append(event);
    return event;
  }

  async appendL2Delta(input: HistoricalL2DeltaInput): Promise<MarketEvent> {
    const symbol = normalizeSymbol(input.symbol);
    const venue = normalizeVenue(input.venue);
    const timestamp = safeTimestamp(input.timestamp);
    if (timestamp === null || !Number.isSafeInteger(input.sequence) || input.sequence < 0 || !Array.isArray(input.updates) || !input.updates.length) {
      throw new Error('historical_l2_delta_invalid');
    }
    if (!this.snapshotSeen.has(`${venue}:${symbol}`)) throw new Error('historical_l2_snapshot_required');
    const updates = input.updates.map((row) => {
      const price = positive(row.price);
      if (price === null || (row.side !== 'BID' && row.side !== 'ASK')) throw new Error('historical_l2_delta_update_invalid');
      return { side: row.side, price, size: normalizeSize(row.size, input.unit, input.contractMultiplier) };
    });
    const event: MarketEvent = {
      eventId: eventId(['l2d', venue, symbol, timestamp, input.sequence]), type: 'ORDERBOOK_DELTA', source: venue, symbol,
      exchangeTimestamp: timestamp, receivedAt: Date.now(), sequence: input.sequence,
      ...(input.sequenceStart !== undefined ? { sequenceStart: input.sequenceStart } : {}),
      ...(input.previousSequence !== undefined ? { previousSequence: input.previousSequence } : {}),
      schemaVersion: 1, ingestionKind: 'HISTORICAL_BOOTSTRAP',
      payload: { updates, sourceUnit: input.unit, normalizedUnit: 'BASE_ASSET', contractMultiplier: input.unit === 'CONTRACTS' ? input.contractMultiplier : null },
    };
    assertValidMarketEvent(event);
    const decision = this.sequence.inspect(event);
    if (decision.status !== 'ACCEPTED') throw new Error(`historical_l2_sequence_${decision.status.toLowerCase()}:${decision.reason ?? 'unknown'}`);
    await this.log.append(event);
    return event;
  }

  async appendMarketEvent(event: MarketEvent): Promise<'RECORDED' | 'IGNORED'> {
    assertValidMarketEvent(event);
    if (!['QUOTE', 'TRADE', 'ORDERBOOK_SNAPSHOT', 'ORDERBOOK_DELTA', 'FUNDING'].includes(event.type)) return 'IGNORED';
    const symbol = normalizeSymbol(event.symbol);
    const venue = normalizeVenue(event.source);
    const normalized: MarketEvent = {
      ...structuredClone(event),
      symbol,
      source: venue,
      ingestionKind: event.ingestionKind ?? 'LIVE',
    };
    if (normalized.type === 'ORDERBOOK_DELTA' && !this.snapshotSeen.has(`${venue}:${symbol}`)) {
      throw new Error('historical_l2_snapshot_required');
    }
    if (normalized.type === 'ORDERBOOK_SNAPSHOT' || normalized.type === 'ORDERBOOK_DELTA') {
      const decision = this.sequence.inspect(normalized);
      if (!['ACCEPTED', 'UNSEQUENCED'].includes(decision.status)) {
        throw new Error(`historical_l2_sequence_${decision.status.toLowerCase()}:${decision.reason ?? 'unknown'}`);
      }
      if (normalized.type === 'ORDERBOOK_SNAPSHOT') this.snapshotSeen.add(`${venue}:${symbol}`);
    }
    await this.log.append(normalized);
    return 'RECORDED';
  }

  async appendBatch(inputs: Array<HistoricalL1QuoteInput | HistoricalL2SnapshotInput | HistoricalL2DeltaInput>): Promise<{ accepted: number }> {
    const sorted = [...inputs].sort((a, b) => a.timestamp - b.timestamp);
    let accepted = 0;
    for (const input of sorted) {
      if ('bid' in input && 'ask' in input) await this.appendL1(input);
      else if ('bids' in input && 'asks' in input) await this.appendL2Snapshot(input);
      else await this.appendL2Delta(input as HistoricalL2DeltaInput);
      accepted += 1;
    }
    return { accepted };
  }

  l1Series(symbolRaw: string, options: { venue?: string; since?: number; until?: number; expectedCadenceMs?: number } = {}): HistoricalL1Series {
    const symbol = normalizeSymbol(symbolRaw);
    const venue = options.venue ? normalizeVenue(options.venue) : null;
    const since = Number.isFinite(options.since) ? Number(options.since) : Number.NEGATIVE_INFINITY;
    const until = Number.isFinite(options.until) ? Number(options.until) : Number.POSITIVE_INFINITY;
    const expectedCadenceMs = Math.max(1, Number(options.expectedCadenceMs ?? 1_000));
    const quotes = this.log.readAll().events.map(quoteFromEvent).filter((row): row is HistoricalL1Quote => Boolean(
      row && row.symbol === symbol && (!venue || row.venue === venue) && row.timestamp >= since && row.timestamp <= until,
    )).sort((a, b) => a.timestamp - b.timestamp);
    const gaps: HistoricalL1Series['gaps'] = [];
    for (let index = 1; index < quotes.length; index += 1) {
      const durationMs = quotes[index].timestamp - quotes[index - 1].timestamp;
      if (durationMs > expectedCadenceMs * 3) gaps.push({ from: quotes[index - 1].timestamp, to: quotes[index].timestamp, durationMs });
    }
    return { symbol, venue, status: quotes.length < 2 ? 'INSUFFICIENT' : gaps.length ? 'GAPPED' : 'VALID', gaps, quotes };
  }

  l2Series(symbolRaw: string, options: { venue?: string; since?: number; until?: number } = {}): HistoricalL2Series {
    const symbol = normalizeSymbol(symbolRaw);
    const venue = options.venue ? normalizeVenue(options.venue) : null;
    const since = Number.isFinite(options.since) ? Number(options.since) : Number.NEGATIVE_INFINITY;
    const until = Number.isFinite(options.until) ? Number(options.until) : Number.POSITIVE_INFINITY;
    const read = this.log.readAll();
    const events = read.events.filter((event) =>
      (event.type === 'ORDERBOOK_SNAPSHOT' || event.type === 'ORDERBOOK_DELTA') && event.symbol === symbol && (!venue || event.source === venue) && event.exchangeTimestamp >= since && event.exchangeTimestamp <= until,
    ).sort((a, b) => a.exchangeTimestamp - b.exchangeTimestamp || (a.sequence ?? 0) - (b.sequence ?? 0));
    if (!events.length) return { symbol, venue, status: 'INSUFFICIENT', corruptLines: read.corruptLines, sequenceErrors: [], events: [], finalBook: null };
    const guard = new SequenceGuard();
    const rebuilder = new OrderBookRebuilder();
    const sequenceErrors: string[] = [];
    let seenSnapshot = false;
    for (const event of events) {
      if (event.type === 'ORDERBOOK_SNAPSHOT') seenSnapshot = true;
      if (!seenSnapshot && event.type === 'ORDERBOOK_DELTA') sequenceErrors.push('delta_before_snapshot');
      const decision = guard.inspect(event);
      if (!['ACCEPTED', 'UNSEQUENCED'].includes(decision.status)) sequenceErrors.push(`${decision.status}:${decision.reason ?? 'unknown'}`);
      rebuilder.apply(event, event.exchangeTimestamp);
    }
    const final = events.at(-1)!;
    const finalBook = rebuilder.snapshot(final.source, final.symbol, final.exchangeTimestamp, Number.MAX_SAFE_INTEGER);
    const status: HistoricalL2Series['status'] = read.corruptLines > 0
      ? 'CORRUPT'
      : sequenceErrors.length > 0 || !finalBook || finalBook.quality !== 'VALID'
        ? 'GAPPED'
        : events.filter((event) => event.type === 'ORDERBOOK_SNAPSHOT').length < 1
          ? 'INSUFFICIENT'
          : 'VALID';
    return { symbol, venue, status, corruptLines: read.corruptLines, sequenceErrors: [...new Set(sequenceErrors)], events, finalBook };
  }

  fundingSeries(symbolRaw: string, options: { venue?: string; since?: number; until?: number } = {}): HistoricalFundingObservation[] {
    const symbol = normalizeSymbol(symbolRaw);
    const venue = options.venue ? normalizeVenue(options.venue) : null;
    const since = Number.isFinite(options.since) ? Number(options.since) : Number.NEGATIVE_INFINITY;
    const until = Number.isFinite(options.until) ? Number(options.until) : Number.POSITIVE_INFINITY;
    const rows: HistoricalFundingObservation[] = [];
    for (const event of this.log.readAll().events) {
      if (event.type !== 'FUNDING' || event.symbol !== symbol || (venue && event.source !== venue) || event.exchangeTimestamp < since || event.exchangeTimestamp > until) continue;
      const payload = event.payload && typeof event.payload === 'object' ? event.payload as Record<string, unknown> : {};
      const rate = Number(payload.rate ?? payload.fundingRate);
      if (!Number.isFinite(rate) || Math.abs(rate) > 1) continue;
      const explicitEffective = Number(payload.effectiveAt ?? payload.nextFundingTime);
      rows.push({ timestamp: event.exchangeTimestamp, rate, effectiveAt: Number.isFinite(explicitEffective) && explicitEffective > 0 ? explicitEffective : null, source: event.source });
    }
    return rows.sort((a, b) => a.timestamp - b.timestamp);
  }

  l2TopOfBookSeries(symbolRaw: string, options: { venue?: string; since?: number; until?: number } = {}): HistoricalTopOfBookTick[] {
    const series = this.l2Series(symbolRaw, options);
    if (!series.events.length) return [];
    const rebuilder = new OrderBookRebuilder();
    const ticks: HistoricalTopOfBookTick[] = [];
    for (const event of series.events) {
      rebuilder.apply(event, event.exchangeTimestamp);
      const book = rebuilder.snapshot(event.source, event.symbol, event.exchangeTimestamp, Number.MAX_SAFE_INTEGER);
      if (!book || book.quality !== 'VALID' || book.bestBid === null || book.bestAsk === null || book.bestAsk <= book.bestBid) continue;
      const bidSize = book.bids[0]?.size ?? 0;
      const askSize = book.asks[0]?.size ?? 0;
      if (!(bidSize >= 0) || !(askSize >= 0)) continue;
      ticks.push({
        symbol: event.symbol, venue: event.source, timestamp: event.exchangeTimestamp, sequence: event.sequence ?? null,
        bid: book.bestBid, ask: book.bestAsk, bidSize, askSize, spreadPct: book.spreadPct ?? 0,
      });
    }
    return ticks;
  }

  storagePath(): string { return this.log.filePath; }

  stats(): HistoricalMicrostructureStats {
    const read = this.log.readAll();
    const symbols = new Set<string>();
    const venues = new Set<string>();
    let l1Quotes = 0; let l2Snapshots = 0; let l2Deltas = 0; let trades = 0; let fundingObservations = 0;
    for (const event of read.events) {
      symbols.add(event.symbol); venues.add(event.source);
      if (event.type === 'QUOTE') l1Quotes += 1;
      else if (event.type === 'ORDERBOOK_SNAPSHOT') l2Snapshots += 1;
      else if (event.type === 'ORDERBOOK_DELTA') l2Deltas += 1;
      else if (event.type === 'TRADE') trades += 1;
      else if (event.type === 'FUNDING') fundingObservations += 1;
    }
    return { events: read.events.length, l1Quotes, l2Snapshots, l2Deltas, trades, fundingObservations, symbols: [...symbols].sort(), venues: [...venues].sort(), corruptLines: read.corruptLines };
  }

  rawEvents(): MarketEvent[] { return this.log.readAll().events; }
  async flush(): Promise<void> { await this.log.flush(); }
  async close(): Promise<void> { await this.log.close(); }
}
