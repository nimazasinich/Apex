import { describe, expect, it } from 'vitest';
import type { BacktestResult } from '../types';
import { buildStrategyValidationReport, gateRegime } from '../services/strategyValidation';
import { scoreStrategyValidation } from '../services/strategyRanking';

function result(overrides: Partial<BacktestResult> = {}): BacktestResult {
  const timeline = Array.from({ length: 40 }, (_, index) => ({
    timestamp: 1_700_000_000_000 + index,
    entry: 100,
    exit: index % 3 === 0 ? 99.5 : 101,
    outcome: index % 3 === 0 ? 'LOSS' as const : 'WIN' as const,
    rMultiple: index % 3 === 0 ? -0.5 : 1,
    pnlPct: index % 3 === 0 ? -0.5 : 1,
    barsHeld: 4,
  }));
  return {
    symbol: 'BTC-USDT', direction: 'LONG', interval: '1h', source: 'fixture', candlesUsed: 1500,
    requestedBars: 1500, lookbackCandles: 1500, maxHoldBars: 24, simulatedScans: 1400,
    flaggedSignals: 80, acceptedCandidates: 40, rejectedCandidates: 40, rejectionCounts: {},
    historicalWinRatePct: 67.5, avgRMultipleRealized: 0.5, avgPnlPct: 0.5, totalPnlPct: 20,
    maxDrawdownPct: 8, profitFactor: 1.8, wins: 27, losses: 13, timed: 0,
    equityCurve: [], timeline, dataState: 'live', strategy: 'fixture-v1', strategyVersion: 1,
    ...overrides,
  } as BacktestResult;
}

function distinctResult(offset: number, overrides: Partial<BacktestResult> = {}): BacktestResult {
  const base = result(overrides);
  return { ...base, timeline: base.timeline.map((trade) => ({ ...trade, timestamp: trade.timestamp + offset })) };
}

describe('strategy validation and ranking runtime', () => {
  it('promotes only when every declared gate has executable evidence', () => {
    const holdout = result();
    const report = buildStrategyValidationReport({
      strategyId: 'fixture-v1', strategyVersion: 1,
      windows: [0, 1, 2].map((index) => ({ label: `wf-${index}`, from: index, to: index + 1, result: result({ totalPnlPct: 10 + index }) })),
      holdout: { from: 3, to: 4, result: holdout },
      neighborRuns: [{ paramDelta: { x: -0.1 }, totalPnlPct: 12 }, { paramDelta: { x: 0.1 }, totalPnlPct: 14 }, { paramDelta: { x: 0.2 }, totalPnlPct: 8 }],
      costStressResult: result({ totalPnlPct: 5, profitFactor: 1.2 }),
      regimeResults: {
        trending: distinctResult(10_000, { totalPnlPct: 8 }),
        ranging: distinctResult(20_000, { totalPnlPct: 2 }),
        high_volatility: distinctResult(30_000, { totalPnlPct: 3 }),
      },
      reproducible: true,
    });
    expect(report.passedAllGates).toBe(true);
    const score = scoreStrategyValidation(report, { symbolGroup: 'BTC-USDT', timeframe: '1h', regime: 'mixed' });
    expect(score.score).toBeGreaterThan(0);
    expect(score.penalties).toEqual([]);
  });

  it('applies explicit penalties instead of labelling weak evidence verified', () => {
    const weak = result({ totalPnlPct: -5, profitFactor: 0.7, timeline: result().timeline.slice(0, 5) });
    const report = buildStrategyValidationReport({
      strategyId: 'weak-v1', strategyVersion: 1,
      windows: [{ label: 'wf', from: 0, to: 1, result: weak }],
      holdout: { from: 1, to: 2, result: weak },
      neighborRuns: [{ paramDelta: {}, totalPnlPct: -2 }, { paramDelta: {}, totalPnlPct: -3 }],
      costStressResult: weak,
      regimeResults: { trend: weak, chop: weak },
      reproducible: false,
    });
    expect(report.passedAllGates).toBe(false);
    const score = scoreStrategyValidation(report, { symbolGroup: 'BTC-USDT', timeframe: '1h', regime: 'mixed' });
    expect(score.penalties).toEqual(expect.arrayContaining(['OUT_OF_SAMPLE_GATE_FAILED', 'COST_STRESS_FAILED', 'INADEQUATE_SAMPLE', 'REPRODUCIBILITY_NOT_CONFIRMED']));
  });

  it('rejects relabelled copies of the same underlying run as regime evidence', () => {
    const sameRun = result({ totalPnlPct: 8 });
    expect(gateRegime({
      trending: sameRun,
      ranging: structuredClone(sameRun),
      high_volatility: distinctResult(50_000, { totalPnlPct: 4 }),
    })).toBe(false);
  });
});
