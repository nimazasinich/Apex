import { describe, expect, it } from 'vitest';
import {
  EWMATracker,
  OITrendTracker,
  SymbolStatisticsRegistry,
  WelfordNormalizer,
} from '../services/onlineStatistics';

describe('online statistics', () => {
  it('computes a stable Welford sample variance and z-score', () => {
    const tracker = new WelfordNormalizer();
    [2, 4, 4, 4, 5, 5, 7, 9].forEach((value) => tracker.update(value));
    expect(tracker.samples).toBe(8);
    expect(tracker.mean).toBe(5);
    expect(tracker.sampleVariance).toBeCloseTo(32 / 7, 10);
    expect(tracker.populationVariance).toBeCloseTo(4, 10);
    expect(tracker.standardDeviation).toBeCloseTo(Math.sqrt(32 / 7), 10);
    expect(tracker.zScore(5)).toBe(0);
  });

  it('applies EWMA without accepting non-finite values', () => {
    const tracker = new EWMATracker(0.25);
    expect(tracker.update(10)).toBe(10);
    expect(tracker.update(14)).toBe(11);
    expect(tracker.snapshot()).toEqual({ alpha: 0.25, samples: 2, value: 11 });
    expect(() => tracker.update(Number.NaN)).toThrow('ewma_value_must_be_finite');
  });

  it('classifies expanding and contracting open interest', () => {
    const tracker = new OITrendTracker({
      windowSize: 3,
      expandThresholdFraction: 0.003,
      contractThresholdFraction: -0.003,
    });
    tracker.record('BTC-USDT', 1000, 1);
    expect(tracker.record('BTC-USDT', 1005, 2).trend).toBe('EXPANDING');
    tracker.clear('BTC-USDT');
    tracker.record('BTC-USDT', 1000, 1);
    expect(tracker.record('BTC-USDT', 995, 2).trend).toBe('CONTRACTING');
  });

  it('bounds OBI and evicts least-recently-used symbol state', () => {
    const registry = new SymbolStatisticsRegistry(2);
    expect(registry.smoothOBI('BTC-USDT', 1.5)).toBe(1);
    registry.smoothOBI('ETH-USDT', 0.2);
    registry.smoothOBI('SOL-USDT', -0.2);
    expect(registry.symbolCount).toBe(2);
    expect(registry.snapshot('BTC-USDT').obi).toBeNull();
    expect(registry.snapshot('SOL-USDT').obi?.samples).toBe(1);
  });

  it('lists bounded recent symbol snapshots for operational diagnostics', () => {
    const registry = new SymbolStatisticsRegistry(3);
    registry.smoothOBI('BTC-USDT', -0.2);
    registry.smoothATR('BTC-USDT', 125.5);
    registry.smoothOBI('ETH-USDT', 0.1);
    const rows = registry.listSnapshots(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].symbol).toBe('ETH-USDT');
    expect(rows[0].lastTouchedAt).toBeGreaterThan(0);
    expect(rows[0].obi?.samples).toBe(1);
  });

});
