import { describe, expect, it } from 'vitest';
import { BacktestExecutionCache, buildBacktestDatasetFingerprint, buildBacktestReplayCacheKey } from '../services/backtestExecutionCache';

describe('BacktestExecutionCache', () => {
  it('coalesces identical concurrent replay work and then serves a completed hit', async () => {
    const cache = new BacktestExecutionCache<number>({ ttlMs: 1000, maxEntries: 4 });
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const task = async () => { calls += 1; await gate; return 42; };

    const first = cache.execute('same', task);
    const second = cache.execute('same', task);
    await Promise.resolve();
    expect(calls).toBe(1);
    release();

    expect(await first).toEqual({ value: 42, state: 'MISS' });
    expect(await second).toEqual({ value: 42, state: 'COALESCED' });
    expect(await cache.execute('same', task)).toEqual({ value: 42, state: 'HIT' });
    expect(calls).toBe(1);
  });

  it('expires entries, does not cache failures, and bounds completed entries', async () => {
    let now = 100;
    const cache = new BacktestExecutionCache<number>({ ttlMs: 10, maxEntries: 2, now: () => now });
    await expect(cache.execute('bad', () => { throw new Error('failed'); })).rejects.toThrow('failed');
    expect(cache.snapshot().completed).toBe(0);

    await cache.execute('a', () => 1);
    await cache.execute('b', () => 2);
    await cache.execute('c', () => 3);
    expect(cache.snapshot().completed).toBe(2);
    expect((await cache.execute('a', () => 10)).state).toBe('MISS');

    now += 11;
    cache.prune();
    expect(cache.snapshot().completed).toBe(0);
  });

  it('fingerprints every candle and normalizes configuration key order', () => {
    const base = {
      strategyId: 'scanner', strategyVersion: '1', symbol: 'BTC-USDT', interval: '15m', direction: 'SHORT',
      requestedBars: 3, maxHoldBars: 24, roundTripCostPct: 0.2, source: 'fixture',
      parameters: { zeta: 2, alpha: 1 }, scannerConfig: { scoreWeights: { volume: 0.4, obi: 0.6 }, threshold: 0.7 },
      candles: [
        { time: '2026-01-01T00:00:00.000Z', open: 100, high: 102, low: 99, close: 101, volume: 10 },
        { time: '2026-01-01T00:15:00.000Z', open: 101, high: 103, low: 100, close: 102, volume: 11 },
        { time: '2026-01-01T00:30:00.000Z', open: 102, high: 104, low: 101, close: 103, volume: 12 },
      ],
    };
    const reordered = {
      ...base,
      parameters: { alpha: 1, zeta: 2 },
      scannerConfig: { threshold: 0.7, scoreWeights: { obi: 0.6, volume: 0.4 } },
    };
    const changedInterior = {
      ...base,
      candles: base.candles.map((candle, index) => index === 1 ? { ...candle, close: 102.5 } : candle),
    };
    expect(buildBacktestReplayCacheKey(base)).toBe(buildBacktestReplayCacheKey(reordered));
    expect(buildBacktestReplayCacheKey(base)).not.toBe(buildBacktestReplayCacheKey(changedInterior));
    expect(buildBacktestDatasetFingerprint(base.source, base.symbol, base.interval, base.candles))
      .not.toBe(buildBacktestDatasetFingerprint(base.source, base.symbol, base.interval, changedInterior.candles));
  });

});
