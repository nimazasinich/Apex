import { describe, expect, it } from 'vitest';
import type { BacktestCandle } from '../../services/backtesting';
import { simulateBracketTrade } from '../../services/strategyEngine/replayHarness';
import { computeTransactionCostPct } from '../../services/transactionCosts';

const candles: BacktestCandle[] = [
  { time: '2026-01-01T00:00:00.000Z', open: 99, high: 111, low: 98, close: 110, volume: 1_000 },
  { time: '2026-01-01T01:00:00.000Z', open: 101, high: 103, low: 100, close: 102, volume: 1_100 },
  { time: '2026-01-01T02:00:00.000Z', open: 102, high: 104, low: 101, close: 103, volume: 1_200 },
];

describe('causal strategy replay fills and shared costs', () => {
  it('fills at the following bar open, never the signal bar close', () => {
    const trade = simulateBracketTrade({
      candles,
      signalIndex: 0,
      direction: 'LONG',
      stopDistance: 4,
      targetDistance: 1,
      maxBars: 1,
      transactionCostModel: { feePct: 0.08, spreadPct: 0.05, fundingRate: 0.0001, fundingIntervalBars: 8 },
      entryReason: 'fixture',
    });
    expect(trade.entry).toBe(candles[1].open);
    expect(trade.entry).not.toBe(candles[0].close);
    expect(trade.entryTime).toBe(candles[1].time);
  });

  it('charges the exact shared fee + spread + slippage + funding formula', () => {
    const model = { feePct: 0.08, spreadPct: 0.05, fundingRate: 0.0001, fundingIntervalBars: 8 };
    const trade = simulateBracketTrade({
      candles,
      signalIndex: 0,
      direction: 'LONG',
      stopDistance: 4,
      targetDistance: 1,
      maxBars: 1,
      transactionCostModel: model,
      entryReason: 'fixture',
    });
    const canonicalCost = computeTransactionCostPct({
      entryPrice: candles[1].open,
      holdingBars: trade.barsHeld,
      ...model,
    });
    expect(trade.transactionCostPct).toBeCloseTo(canonicalCost, 12);
    expect(trade.transactionCostPct).toBeCloseTo(0.19, 12);
  });
});
