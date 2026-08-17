import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OpenInterestHistoryStore, OpenInterestSampler } from '../services/openInterestHistory';

function file(): string { return join(mkdtempSync(join(tmpdir(), 'apex-oi-')), 'oi.json'); }

const base = Date.now() - 60 * 60_000;

describe('OpenInterestHistoryStore', () => {
  it('persists validated timestamped OI with provenance and restores after restart', () => {
    const path = file();
    const store = new OpenInterestHistoryStore({ filePath: path, expectedIntervalMs: 60_000, freshnessMs: 180_000 });
    store.append({ symbol: 'BTCUSDT', venue: 'Binance', openInterestUsd: 1000, observedAt: base, sourceTimestamp: base - 1000, provenance: 'binance:/fapi/v1/openInterest', dataState: 'live' });
    store.append({ symbol: 'BTC-USDT', venue: 'binance', openInterestUsd: 1100, observedAt: base + 60_000, sourceTimestamp: base + 59_000, provenance: 'binance:/fapi/v1/openInterest', dataState: 'live' });
    const restarted = new OpenInterestHistoryStore({ filePath: path, expectedIntervalMs: 60_000, freshnessMs: 180_000, retentionMs: 365 * 24 * 60 * 60_000 });
    const series = restarted.series('BTC-USDT', { now: base + 60_000, since: base - 1 });
    expect(series.status).toBe('FRESH');
    expect(series.samples).toHaveLength(2);
    expect(series.change?.absoluteUsd).toBe(100);
    expect(series.change?.percent).toBeCloseTo(10);
    expect(JSON.parse(readFileSync(path, 'utf8')).version).toBe(1);
  });

  it('never fabricates an OI change from one current value and reports gaps/staleness', () => {
    const store = new OpenInterestHistoryStore({ filePath: file(), expectedIntervalMs: 60_000, freshnessMs: 120_000, retentionMs: 365 * 24 * 60 * 60_000 });
    store.append({ symbol: 'ETH-USDT', venue: 'kucoin', openInterestUsd: 500, observedAt: base, sourceTimestamp: null, provenance: 'kucoin:contract', dataState: 'degraded' });
    expect(store.series('ETH-USDT', { now: base, since: base - 1 }).change).toBeNull();
    expect(store.series('ETH-USDT', { now: base, since: base - 1 }).status).toBe('INSUFFICIENT');
    store.append({ symbol: 'ETH-USDT', venue: 'kucoin', openInterestUsd: 550, observedAt: base + 10 * 60_000, sourceTimestamp: null, provenance: 'kucoin:contract', dataState: 'degraded' });
    const series = store.series('ETH-USDT', { now: base + 10 * 60_000, since: base - 1 });
    expect(series.gaps).toHaveLength(1);
    expect(series.status).toBe('STALE');
  });

  it('rejects non-finite/zero values and allows bounded periodic sampling', async () => {
    const store = new OpenInterestHistoryStore({ filePath: file(), retentionMs: 365 * 24 * 60 * 60_000 });
    expect(() => store.append({ symbol: 'BTC-USDT', venue: 'binance', openInterestUsd: Number.NaN, observedAt: base, sourceTimestamp: null, provenance: 'bad', dataState: 'live' })).toThrow('open_interest_sample_invalid');
    let calls = 0;
    const sampler = new OpenInterestSampler({
      store,
      intervalMs: 30_000,
      sample: async () => {
        calls += 1;
        return [{ symbol: 'SOL-USDT', venue: 'binance', openInterestUsd: 250, observedAt: base + calls, sourceTimestamp: null, provenance: 'test', dataState: 'live' }];
      },
    });
    expect(await sampler.runOnce()).toEqual({ accepted: 1, rejected: 0 });
    expect(store.series('SOL-USDT', { now: base + 1, since: base - 1 }).samples).toHaveLength(1);
  });
});
