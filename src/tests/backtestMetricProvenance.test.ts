import { describe, expect, it } from 'vitest';
import type { BacktestResult } from '../types';
import { deriveLocalBacktestSummary } from '../pages/backtesting/backtestMetrics';
import type { CostAdjustedTrade } from '../pages/backtesting/backtestingTypes';

const result = {
  symbol: 'BTC-USDT', direction: 'LONG', interval: '1h', candlesUsed: 500,
  simulatedScans: 10, flaggedSignals: 3, acceptedCandidates: 2, rejectedCandidates: 1,
  rejectionCounts: {}, historicalWinRatePct: 50, avgRMultipleRealized: 0.25,
  totalPnlPct: 4.2, maxDrawdownPct: 1.5, profitFactor: 1.4,
  timeline: [], dataState: 'live',
} as BacktestResult;

const trades: CostAdjustedTrade[] = [
  { timestamp: 1, price: 100, score: 80, tier: 'CONFIRMED', outcome: 'WIN', entry: 100, exit: 102, stop: 99, target: 102, rMultiple: 2, barsHeld: 4, adjustedReturnPct: 2, equity: 102, drawdownPct: 0, tradeNumber: 1, dateLabel: 'A', timeLabel: '00:01' },
  { timestamp: 2, price: 102, score: 70, tier: 'WATCHLIST', outcome: 'LOSS', entry: 102, exit: 101, stop: 101, target: 104, rMultiple: -1, barsHeld: 2, adjustedReturnPct: -1, equity: 100.98, drawdownPct: -1, tradeNumber: 2, dateLabel: 'B', timeLabel: '00:02' },
];

describe('Backtesting metric provenance', () => {
  it('derives risk-profile display metrics without mutating server metrics', () => {
    const local = deriveLocalBacktestSummary(result, trades, 10_000);
    expect(local.netReturnPct).toBeCloseTo(0.98, 8);
    expect(local.finalBalance).toBeCloseTo(10_098, 6);
    expect(result.totalPnlPct).toBe(4.2);
    expect(result.maxDrawdownPct).toBe(1.5);
  });
});
