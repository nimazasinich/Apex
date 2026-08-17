import type { MarketEvent, MarketEventType } from '../../contracts/realtime/marketEvent';

export interface RealtimeSeriesStoreOptions {
  maxEventsPerKey?: number;
  maxAgeMs?: number;
}

export interface RealtimeSeriesQuery {
  symbol: string;
  type: MarketEventType;
  sources?: string[];
  since?: number;
  limit?: number;
}

const KEY_SEPARATOR = '\u001f';

function key(event: Pick<MarketEvent, 'source' | 'symbol' | 'type'>): string {
  return [event.source, event.symbol, event.type].join(KEY_SEPARATOR);
}

/**
 * Bounded, in-memory event history used by evidence evaluators. It is not the
 * durable source of truth; the append-only event log remains authoritative for
 * replay. Keeping this store bounded prevents realtime evidence from causing
 * unbounded heap growth.
 */
export class RealtimeSeriesStore {
  private readonly maxEventsPerKey: number;
  private readonly maxAgeMs: number;
  private readonly series = new Map<string, MarketEvent[]>();

  constructor(options: RealtimeSeriesStoreOptions = {}) {
    this.maxEventsPerKey = Math.max(32, Math.min(100_000, Math.floor(options.maxEventsPerKey ?? 5_000)));
    this.maxAgeMs = Math.max(60_000, Math.min(30 * 24 * 60 * 60 * 1_000, Math.floor(options.maxAgeMs ?? 24 * 60 * 60 * 1_000)));
  }

  append(event: MarketEvent, now = Date.now()): void {
    const k = key(event);
    const rows = this.series.get(k) ?? [];
    rows.push(structuredClone(event));
    const cutoff = now - this.maxAgeMs;
    let firstValid = 0;
    while (firstValid < rows.length && rows[firstValid].receivedAt < cutoff) firstValid += 1;
    const trimmed = firstValid > 0 ? rows.slice(firstValid) : rows;
    if (trimmed.length > this.maxEventsPerKey) trimmed.splice(0, trimmed.length - this.maxEventsPerKey);
    this.series.set(k, trimmed);
  }

  query(input: RealtimeSeriesQuery): MarketEvent[] {
    const symbol = input.symbol.toUpperCase();
    const since = input.since ?? Number.NEGATIVE_INFINITY;
    const sourceSet = input.sources?.length ? new Set(input.sources) : null;
    const result: MarketEvent[] = [];
    for (const [seriesKey, rows] of this.series) {
      const [source, rowSymbol, type] = seriesKey.split(KEY_SEPARATOR);
      if (rowSymbol !== symbol || type !== input.type) continue;
      if (sourceSet && !sourceSet.has(source)) continue;
      for (const event of rows) {
        if (event.receivedAt >= since) result.push(structuredClone(event));
      }
    }
    result.sort((left, right) => left.exchangeTimestamp - right.exchangeTimestamp || left.receivedAt - right.receivedAt);
    const limit = Math.max(1, Math.min(100_000, Math.floor(input.limit ?? (result.length || 1))));
    return result.length > limit ? result.slice(result.length - limit) : result;
  }

  invalidateSeries(input: { source: string; symbol: string; type: MarketEventType }): number {
    const seriesKey = [input.source, input.symbol.toUpperCase(), input.type].join(KEY_SEPARATOR);
    const rows = this.series.get(seriesKey);
    if (!rows) return 0;
    const removed = rows.length;
    this.series.delete(seriesKey);
    return removed;
  }

  sources(symbol: string, type: MarketEventType): string[] {
    const suffix = `${KEY_SEPARATOR}${symbol.toUpperCase()}${KEY_SEPARATOR}${type}`;
    return [...this.series.keys()]
      .filter((seriesKey) => seriesKey.endsWith(suffix))
      .map((seriesKey) => seriesKey.slice(0, -suffix.length))
      .sort();
  }

  clear(): void {
    this.series.clear();
  }

  stats(): { keys: number; events: number } {
    let events = 0;
    for (const rows of this.series.values()) events += rows.length;
    return { keys: this.series.size, events };
  }
}
