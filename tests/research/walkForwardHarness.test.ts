/**
 * Tests for the walk-forward research harness.
 *
 * These pin the properties that make the baseline study honest rather than the
 * incidental arithmetic: the sealed holdout cannot be read, parameters cannot be
 * chosen on the bars they are scored on, genuine data holes stay holes, and a
 * multi-symbol drawdown is measured along the path the account actually took.
 */

import { describe, expect, it } from 'vitest';

import {
  DEVELOPMENT_FROM_MS,
  HoldoutLeakageError,
  SEALED_HOLDOUT_FROM_MS,
  alignEventSeriesToCandles,
  alignFundingToCandles,
  assertNoHoldoutLeakage,
  loadDevelopmentCandles,
  resampleCandles,
  type Candle,
} from '../../scripts/research/lib/researchDataset';
import {
  WalkForwardConfigurationError,
  assertSplitsAreCausal,
  buildWalkForwardSplits,
  outOfSampleBarCount,
} from '../../scripts/research/lib/walkForward';
import {
  buildTrades,
  maxDrawdownPct,
  summarizeTrades,
  type Direction,
  type Trade,
} from '../../scripts/research/lib/tradeMetrics';
import { transactionCostModelFromPerSideAssumptions } from '../../src/services/transactionCosts';

const HOUR = 60 * 60 * 1000;

/** The exact per-side assumptions the sealed structural study used. */
const BASE_COSTS = transactionCostModelFromPerSideAssumptions({
  commissionPctPerSide: 0.04,
  slippagePctPerSide: 0.02,
  fundingPctEstimate: 0.01,
});

const STRESSED_COSTS = transactionCostModelFromPerSideAssumptions(
  { commissionPctPerSide: 0.04, slippagePctPerSide: 0.02, fundingPctEstimate: 0.01 },
  { feeMultiplier: 2, spreadMultiplier: 2, slippageMultiplier: 2, fundingMultiplier: 2 },
);

function candlesFromCloses(closes: readonly number[], startMs = 0, stepMs = HOUR): Candle[] {
  return closes.map((close, index) => ({
    t: startMs + index * stepMs,
    o: close,
    h: close,
    l: close,
    c: close,
    v: 1,
  }));
}

function trade(spec: Partial<Trade> & Pick<Trade, 'exitTime' | 'netPnlPct'>): Trade {
  return {
    symbol: 'BTCUSDT',
    familyId: 'test',
    entryIndex: 0,
    exitIndex: 1,
    entryTime: spec.exitTime - HOUR,
    direction: 1,
    entryPrice: 100,
    exitPrice: 100,
    holdingBars: 1,
    weight: 1,
    exposureScale: 1,
    unweightedGrossPnlPct: spec.netPnlPct,
    unweightedCostPct: 0,
    splitIndex: 0,
    ...spec,
  };
}

describe('sealed holdout guard', () => {
  it('rejects any row at or after 2024-01-01T00:00:00Z', () => {
    expect(SEALED_HOLDOUT_FROM_MS).toBe(Date.UTC(2024, 0, 1));

    expect(() => assertNoHoldoutLeakage([{ t: SEALED_HOLDOUT_FROM_MS }], 'unit')).toThrow(
      HoldoutLeakageError,
    );
    expect(() => assertNoHoldoutLeakage([{ t: SEALED_HOLDOUT_FROM_MS + 1 }], 'unit')).toThrow(
      /sealed final holdout/,
    );
  });

  it('accepts the last hour before the boundary', () => {
    expect(() =>
      assertNoHoldoutLeakage([{ t: DEVELOPMENT_FROM_MS }, { t: SEALED_HOLDOUT_FROM_MS - 1 }], 'unit'),
    ).not.toThrow();
  });

  it('keeps the guard on real loaded data', () => {
    const loaded = loadDevelopmentCandles('BTCUSDT');
    expect(loaded.rows.length).toBeGreaterThan(20_000);
    expect(loaded.rows[0].t).toBeGreaterThanOrEqual(DEVELOPMENT_FROM_MS);
    expect(loaded.rows[loaded.rows.length - 1].t).toBeLessThan(SEALED_HOLDOUT_FROM_MS);
    // The file itself covers 2020-09-01 .. 2025-12-31, so the loader is genuinely
    // discarding rows rather than the data happening to stop in time.
    expect(loaded.fileCoverage.rows).toBeGreaterThan(loaded.rows.length);
  });
});

describe('as-of alignment', () => {
  const candles = candlesFromCloses([100, 100, 100, 100]);

  it('does not back-fill bars before the first event', () => {
    const aligned = alignEventSeriesToCandles(candles, [{ t: HOUR / 2, value: 7 }], 8 * HOUR);
    expect(aligned[0]).toBeUndefined();
    expect(aligned[1]).toEqual({ t: HOUR / 2, value: 7 });
  });

  it('does not make an event visible on the bar it lands inside', () => {
    // Event stamped 30 minutes into bar 0; a bar may only see events at or before
    // its own open time.
    const aligned = alignEventSeriesToCandles(candles, [{ t: HOUR / 2, value: 7 }], 8 * HOUR);
    expect(aligned[0]).toBeUndefined();
  });

  it('returns undefined instead of carrying a stale value past the bound', () => {
    const aligned = alignEventSeriesToCandles(candles, [{ t: 0, value: 7 }], HOUR);
    expect(aligned[0]?.value).toBe(7);
    expect(aligned[1]?.value).toBe(7);
    expect(aligned[2]).toBeUndefined();
    expect(aligned[3]).toBeUndefined();
  });

  it('exposes funding rate only, and leaves an 8h+ gap unavailable', () => {
    const hourly = candlesFromCloses(new Array(10).fill(100));
    const rates = alignFundingToCandles(hourly, [{ t: 0, rate: 0.0001, mark: 0 }]);
    expect(rates[0]).toBe(0.0001);
    expect(rates[8]).toBe(0.0001);
    // Bar 9 is nine hours after the only funding event, i.e. a missed settlement.
    expect(rates[9]).toBeUndefined();
  });
});

describe('resampleCandles', () => {
  it('emits only complete groups', () => {
    const hourly: Candle[] = [
      { t: 0, o: 10, h: 12, l: 9, c: 11, v: 1 },
      { t: HOUR, o: 11, h: 15, l: 10, c: 14, v: 2 },
      { t: 2 * HOUR, o: 14, h: 14, l: 8, c: 9, v: 3 },
      { t: 3 * HOUR, o: 9, h: 13, l: 9, c: 13, v: 4 },
      // 4h group is short one bar (5h is missing) and must be dropped, not published
      // as a three-hour bar.
      { t: 4 * HOUR, o: 13, h: 13, l: 13, c: 13, v: 5 },
      { t: 6 * HOUR, o: 13, h: 13, l: 13, c: 13, v: 6 },
      { t: 7 * HOUR, o: 13, h: 13, l: 13, c: 13, v: 7 },
    ];
    const fourHour = resampleCandles(hourly, 4);
    expect(fourHour).toHaveLength(1);
    expect(fourHour[0]).toEqual({ t: 0, o: 10, h: 15, l: 8, c: 13, v: 10 });
  });

  it('buckets by absolute epoch boundary, not array position', () => {
    // Four consecutive hourly bars, but straddling a 4h boundary: neither bucket is
    // complete, so nothing is emitted. Position-based grouping would wrongly emit one.
    const straddling = candlesFromCloses([1, 2, 3, 4], 2 * HOUR);
    expect(resampleCandles(straddling, 4)).toHaveLength(0);
  });

  it('passes hourly data through unchanged', () => {
    const hourly = candlesFromCloses([1, 2, 3]);
    expect(resampleCandles(hourly, 1)).toEqual(hourly);
  });
});

describe('walk-forward splits', () => {
  const request = { totalBars: 100, warmupBars: 10, trainBars: 30, testBars: 10, stepBars: 10 };

  it('tiles the series with non-overlapping test ranges', () => {
    const plan = buildWalkForwardSplits(request);
    expect(plan.splits).toHaveLength(6);
    expect(plan.splits[0]).toEqual({
      index: 0,
      trainStart: 10,
      trainEnd: 40,
      testStart: 40,
      testEnd: 50,
    });
    expect(plan.splits[5]).toEqual({
      index: 5,
      trainStart: 60,
      trainEnd: 90,
      testStart: 90,
      testEnd: 100,
    });
    expect(plan.droppedTailBars).toBe(0);
    expect(outOfSampleBarCount(plan.splits)).toBe(60);
    expect(() => assertSplitsAreCausal(plan.splits)).not.toThrow();
  });

  it('drops a short trailing test window and reports it', () => {
    const plan = buildWalkForwardSplits({ ...request, totalBars: 105 });
    expect(plan.splits).toHaveLength(6);
    expect(plan.droppedTailBars).toBe(5);
  });

  it('refuses a step smaller than the test window', () => {
    expect(() => buildWalkForwardSplits({ ...request, stepBars: 5 })).toThrow(
      WalkForwardConfigurationError,
    );
    expect(() => buildWalkForwardSplits({ ...request, stepBars: 5 })).toThrow(/double-count/);
  });

  it('detects a test range that starts before its train range ends', () => {
    expect(() =>
      assertSplitsAreCausal([{ index: 0, trainStart: 0, trainEnd: 40, testStart: 39, testEnd: 50 }]),
    ).toThrow(/Parameters would be chosen on bars they are scored on/);
  });

  it('detects test ranges that overlap each other', () => {
    expect(() =>
      assertSplitsAreCausal([
        { index: 0, trainStart: 0, trainEnd: 10, testStart: 10, testEnd: 20 },
        { index: 1, trainStart: 5, trainEnd: 15, testStart: 15, testEnd: 25 },
      ]),
    ).toThrow(/counted twice/);
  });
});

describe('buildTrades', () => {
  const candles = candlesFromCloses([100, 110, 121, 100, 100]);
  const common = {
    symbol: 'BTCUSDT',
    familyId: 'unit',
    splitIndex: 0,
    candles,
    costModel: BASE_COSTS,
    hoursPerBar: 1,
  };

  it('merges consecutive equal exposure into one round trip', () => {
    const positions: Direction[] = [1, 1, 0, 0, 0];
    const trades = buildTrades({ ...common, positions, range: { start: 0, end: 5 } });

    expect(trades).toHaveLength(1);
    expect(trades[0].entryIndex).toBe(0);
    expect(trades[0].exitIndex).toBe(2);
    expect(trades[0].entryPrice).toBe(100);
    expect(trades[0].exitPrice).toBe(121);
    expect(trades[0].holdingBars).toBe(2);
    expect(trades[0].unweightedGrossPnlPct).toBeCloseTo(21, 10);
    // 0.08 fee + 0.02 spread + 0.02 slippage + 0.01 funding = 0.13 round trip.
    expect(trades[0].unweightedCostPct).toBeCloseTo(0.13, 10);
    expect(trades[0].netPnlPct).toBeCloseTo(20.87, 10);
  });

  it('charges double under the 2x stress model', () => {
    const positions: Direction[] = [1, 1, 0, 0, 0];
    const [stressed] = buildTrades({
      ...common,
      costModel: STRESSED_COSTS,
      positions,
      range: { start: 0, end: 5 },
    });
    expect(stressed.unweightedCostPct).toBeCloseTo(0.26, 10);
  });

  it('signs a short position against the price move', () => {
    const positions: Direction[] = [-1, 0, 0, 0, 0];
    const [short] = buildTrades({ ...common, positions, range: { start: 0, end: 5 } });
    expect(short.direction).toBe(-1);
    expect(short.unweightedGrossPnlPct).toBeCloseTo(-10, 10);
  });

  it('closes an open position at the last bar of the range', () => {
    const positions: Direction[] = [0, 0, 0, 1, 1];
    const trades = buildTrades({ ...common, positions, range: { start: 0, end: 5 } });
    expect(trades).toHaveLength(1);
    expect(trades[0].entryIndex).toBe(3);
    expect(trades[0].exitIndex).toBe(4);
    expect(trades[0].holdingBars).toBe(1);
  });

  it('ignores positions outside the scored range', () => {
    const positions: Direction[] = [1, 1, 1, 1, 1];
    const trades = buildTrades({ ...common, positions, range: { start: 2, end: 4 } });
    expect(trades).toHaveLength(1);
    expect(trades[0].entryIndex).toBe(2);
    expect(trades[0].exitIndex).toBe(3);
  });

  it('scales P&L by the gross-exposure weight', () => {
    const positions: Direction[] = [1, 1, 0, 0, 0];
    const [half] = buildTrades({ ...common, positions, range: { start: 0, end: 5 }, weight: 0.5 });
    expect(half.weight).toBe(0.5);
    expect(half.netPnlPct).toBeCloseTo(20.87 / 2, 10);
  });

  it('scales the funding interval with the bar size', () => {
    const fourHour = candlesFromCloses([100, 100], 0, 4 * HOUR);
    const [oneBar] = buildTrades({
      ...common,
      candles: fourHour,
      hoursPerBar: 4,
      positions: [1, 0],
      range: { start: 0, end: 2 },
    });
    // One 4h bar is half a funding interval, so exactly one funding period is
    // charged -- the same as an hourly bar, and not eight of them.
    expect(oneBar.unweightedCostPct).toBeCloseTo(0.13, 10);
  });
});

describe('summarizeTrades', () => {
  it('reports profit factor, win rate and net return additively', () => {
    const summary = summarizeTrades([
      trade({ exitTime: HOUR, netPnlPct: 10 }),
      trade({ exitTime: 2 * HOUR, netPnlPct: 5 }),
      trade({ exitTime: 3 * HOUR, netPnlPct: -3 }),
    ]);
    expect(summary.trades).toBe(3);
    expect(summary.netReturnPct).toBeCloseTo(12, 10);
    expect(summary.profitFactor).toBeCloseTo(5, 10);
    expect(summary.winRatePct).toBeCloseTo((2 / 3) * 100, 10);
  });

  it('reports an undefined profit factor rather than zero when nothing lost', () => {
    expect(summarizeTrades([trade({ exitTime: HOUR, netPnlPct: 4 })]).profitFactor).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(summarizeTrades([]).profitFactor).toBeNull();
    expect(summarizeTrades([]).trades).toBe(0);
  });

  it('measures drawdown in exit-time order across symbols', () => {
    const interleaved: Trade[] = [
      trade({ symbol: 'BTCUSDT', exitTime: 1 * HOUR, netPnlPct: -5 }),
      trade({ symbol: 'BTCUSDT', exitTime: 3 * HOUR, netPnlPct: 20 }),
      trade({ symbol: 'ETHUSDT', exitTime: 2 * HOUR, netPnlPct: -30 }),
    ];
    // Walking the array as grouped by symbol would give 30; the path the account
    // actually took is -5, -30, +20, whose trough is -35 below a peak of 0.
    expect(maxDrawdownPct(interleaved)).toBeCloseTo(35, 10);
  });

  it('reports no drawdown for a monotonically rising curve', () => {
    expect(
      maxDrawdownPct([
        trade({ exitTime: HOUR, netPnlPct: 1 }),
        trade({ exitTime: 2 * HOUR, netPnlPct: 2 }),
      ]),
    ).toBe(0);
  });
});
