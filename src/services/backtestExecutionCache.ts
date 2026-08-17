import { createHash } from 'node:crypto';


export interface BacktestReplayCacheIdentity {
  strategyId: string;
  strategyVersion: string | number;
  symbol: string;
  interval: string;
  direction: string;
  requestedBars: number;
  maxHoldBars: number;
  roundTripCostPct: number;
  parameters?: Record<string, number | string>;
  scannerConfig?: unknown;
  source: string;
  candles: ReadonlyArray<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? '"__undefined__"';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
}

/**
 * Hashes every replay-affecting input, including all OHLCV rows.
 * This deliberately avoids endpoint-cache collisions where first/last candles
 * match but an interior candle or active scanner setting changed.
 */
export function buildBacktestReplayCacheKey(identity: BacktestReplayCacheIdentity): string {
  const hash = createHash('sha256');
  const { candles, ...configuration } = identity;
  hash.update(stableSerialize(configuration));
  for (const candle of candles) {
    hash.update('\n');
    hash.update(stableSerialize([candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume]));
  }
  return hash.digest('hex');
}

export type BacktestCacheState = 'HIT' | 'MISS' | 'COALESCED';

export interface BacktestCacheResult<T> {
  value: T;
  state: BacktestCacheState;
}

export interface BacktestExecutionCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

interface CompletedEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Small bounded cache for deterministic replay work.
 *
 * It coalesces identical in-flight jobs, never caches failures, and keeps the
 * replay result separate from request-specific run IDs/runtime metadata.
 */
export class BacktestExecutionCache<T> {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly completed = new Map<string, CompletedEntry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(options: BacktestExecutionCacheOptions = {}) {
    const ttlMs = options.ttlMs ?? 30_000;
    const maxEntries = options.maxEntries ?? 32;
    if (!Number.isFinite(ttlMs) || ttlMs < 1) throw new RangeError('ttlMs must be a finite positive number.');
    if (!Number.isFinite(maxEntries) || maxEntries < 1) throw new RangeError('maxEntries must be a finite positive number.');
    this.ttlMs = Math.floor(ttlMs);
    this.maxEntries = Math.floor(maxEntries);
    this.now = options.now ?? Date.now;
  }

  async execute(key: string, task: () => Promise<T> | T): Promise<BacktestCacheResult<T>> {
    if (!key) throw new Error('Backtest cache key must not be empty.');
    const currentTime = this.now();
    const cached = this.completed.get(key);
    if (cached) {
      if (cached.expiresAt > currentTime) {
        // Refresh insertion order so eviction is least-recently-used.
        this.completed.delete(key);
        this.completed.set(key, cached);
        return { value: cached.value, state: 'HIT' };
      }
      this.completed.delete(key);
    }

    const pending = this.inFlight.get(key);
    if (pending) return { value: await pending, state: 'COALESCED' };

    const execution = Promise.resolve().then(task);
    this.inFlight.set(key, execution);
    try {
      const value = await execution;
      this.completed.set(key, { value, expiresAt: this.now() + this.ttlMs });
      this.evictOverflow();
      return { value, state: 'MISS' };
    } finally {
      this.inFlight.delete(key);
    }
  }

  prune(): void {
    const currentTime = this.now();
    for (const [key, entry] of this.completed) {
      if (entry.expiresAt <= currentTime) this.completed.delete(key);
    }
    this.evictOverflow();
  }

  clear(): void {
    this.completed.clear();
  }

  snapshot(): { completed: number; inFlight: number; ttlMs: number; maxEntries: number } {
    this.prune();
    return { completed: this.completed.size, inFlight: this.inFlight.size, ttlMs: this.ttlMs, maxEntries: this.maxEntries };
  }

  private evictOverflow(): void {
    while (this.completed.size > this.maxEntries) {
      const oldest = this.completed.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.completed.delete(oldest);
    }
  }
}
