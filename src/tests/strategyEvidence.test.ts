import { describe, expect, it } from 'vitest';
import type { BacktestResult, StrategyDefinition } from '../types';
import { buildStrategyEvidenceSnapshot } from '../services/strategyEvidence';
import { listStrategyDefinitions } from '../services/strategyRegistry';
import { scoreStrategyValidation } from '../services/strategyRanking';
import { buildStrategyValidationReport } from '../services/strategyValidation';
import {
  evidenceComparable,
  hasBoundEvidence,
  strategyDisplayStatus,
} from '../pages/strategies/strategyPresentation';

function backtest(overrides: Partial<BacktestResult> = {}): BacktestResult {
  const timeline = Array.from({ length: 40 }, (_, index) => ({
    timestamp: 1_700_000_000_000 + index * 3_600_000,
    entry: 100,
    exit: index % 3 === 0 ? 99.5 : 101,
    outcome: index % 3 === 0 ? 'LOSS' as const : 'WIN' as const,
    rMultiple: index % 3 === 0 ? -0.5 : 1,
    pnlPct: index % 3 === 0 ? -0.5 : 1,
    barsHeld: 4,
  }));
  return {
    symbol: 'BTC-USDT',
    direction: 'LONG',
    interval: '1h',
    source: 'fixture-provider',
    candlesUsed: 1_500,
    requestedBars: 1_500,
    lookbackCandles: 1_500,
    maxHoldBars: 24,
    simulatedScans: 1_400,
    flaggedSignals: 80,
    acceptedCandidates: 40,
    rejectedCandidates: 40,
    rejectionCounts: {},
    historicalWinRatePct: 67.5,
    avgRMultipleRealized: 0.5,
    avgPnlPct: 0.5,
    totalPnlPct: 20,
    maxDrawdownPct: 8,
    profitFactor: 1.8,
    wins: 27,
    losses: 13,
    timed: 0,
    equityCurve: [],
    timeline,
    dataState: 'live',
    strategy: 'fixture-v1',
    strategyVersion: 1,
    costModel: {
      commissionPctPerSide: 0.04,
      slippagePctPerSide: 0.05,
      fundingPctEstimate: 0.01,
      roundTripCostPct: 0.19,
      appliedByEngine: true,
    },
    audit: {
      runId: 'validation-fixture-run',
      engine: 'APEX_FIXTURE_REPLAY',
      generatedAt: 1_700_100_000_000,
      closedCandlesOnly: true,
      lookaheadPolicy: 'DISABLED',
      fillPolicy: 'NEXT_BAR_OR_BRACKET',
      deterministic: true,
      configFingerprint: 'fixture-fingerprint',
    },
    ...overrides,
  } as BacktestResult;
}

function backtestRun(offset: number, overrides: Partial<BacktestResult> = {}): BacktestResult {
  const run = backtest(overrides);
  return { ...run, timeline: run.timeline.map((trade) => ({ ...trade, timestamp: trade.timestamp + offset })) };
}

function evidenceStrategy(dataState: BacktestResult['dataState'] = 'live'): StrategyDefinition {
  const definition = listStrategyDefinitions()[0];
  const holdout = backtest({ dataState });
  const report = buildStrategyValidationReport({
    strategyId: definition.strategyId,
    strategyVersion: definition.version,
    windows: [0, 1, 2].map((index) => ({
      label: `wf-${index}`,
      from: 1_699_000_000_000 + index,
      to: 1_699_500_000_000 + index,
      result: backtest({ totalPnlPct: 10 + index, dataState }),
    })),
    holdout: { from: 1_700_000_000_000, to: 1_700_100_000_000, result: holdout },
    neighborRuns: [
      { paramDelta: { x: -0.1 }, totalPnlPct: 12 },
      { paramDelta: { x: 0.1 }, totalPnlPct: 14 },
      { paramDelta: { x: 0.2 }, totalPnlPct: 8 },
    ],
    costStressResult: backtest({ totalPnlPct: 5, profitFactor: 1.2, dataState }),
    regimeResults: {
      trending: backtestRun(10_000, { totalPnlPct: 8, dataState }),
      ranging: backtestRun(20_000, { totalPnlPct: 2, dataState }),
      high_volatility: backtestRun(30_000, { totalPnlPct: 3, dataState }),
    },
    reproducible: true,
  });
  const rank = scoreStrategyValidation(report, { symbolGroup: 'BTC-USDT', timeframe: '1h', regime: 'mixed' });
  return {
    ...definition,
    status: report.passedAllGates ? 'validated' : 'candidate',
    latestSnapshot: buildStrategyEvidenceSnapshot(definition, report, rank),
  };
}

describe('strategy evidence truthfulness', () => {
  it('does not ship hard-coded performance snapshots in the registry', () => {
    expect(listStrategyDefinitions({ includeBaseline: true }).every((strategy) => strategy.latestSnapshot === undefined)).toBe(true);
  });

  it('binds complete provenance and cost assumptions to validation metrics', () => {
    const strategy = evidenceStrategy();
    expect(hasBoundEvidence(strategy)).toBe(true);
    expect(strategyDisplayStatus(strategy)).toBe('Verified');
    expect(strategy.latestSnapshot).toMatchObject({
      source: 'validation',
      symbol: 'BTC-USDT',
      interval: '1h',
      direction: 'LONG',
      validationMethod: 'walk-forward-3-window-plus-holdout-v1',
      commissionPctPerSide: 0.04,
      slippagePctPerSide: 0.05,
      fundingPctEstimate: 0.01,
      sampleSize: 1_500,
      runId: 'validation-fixture-run',
      dataState: 'live',
    });
  });

  it('does not label degraded or incomplete evidence as verified', () => {
    const degraded = evidenceStrategy('degraded');
    expect(hasBoundEvidence(degraded)).toBe(true);
    expect(strategyDisplayStatus(degraded)).toBe('Evidence Pending');

    const incomplete: StrategyDefinition = {
      ...evidenceStrategy(),
      latestSnapshot: { ...evidenceStrategy().latestSnapshot!, runId: undefined },
    };
    expect(hasBoundEvidence(incomplete)).toBe(false);
    expect(strategyDisplayStatus(incomplete)).toBe('Evidence Pending');
  });

  it('compares performance only when dataset and cost contexts match', () => {
    const first = evidenceStrategy();
    const second = { ...evidenceStrategy(), strategyId: 'comparison-fixture-v1' };
    expect(evidenceComparable([first, second]).comparable).toBe(true);

    const mismatched: StrategyDefinition = {
      ...second,
      latestSnapshot: { ...second.latestSnapshot!, slippagePctPerSide: 0.08 },
    };
    expect(evidenceComparable([first, mismatched])).toEqual(expect.objectContaining({ comparable: false }));
  });
});
