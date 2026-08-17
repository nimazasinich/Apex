import { describe, expect, it } from 'vitest';
import type { WorkspaceContextSnapshot } from '../lib/workspaceContext';
import { matchesBacktestEvidence } from '../lib/workspaceContext';

function snapshot(): WorkspaceContextSnapshot {
  return {
    source: 'backtesting',
    updatedAt: 1,
    strategyId: 'strategy-a',
    symbol: 'BTC-USDT',
    direction: 'LONG',
    interval: '1h',
    lastBacktest: {
      strategyId: 'strategy-a',
      symbol: 'BTC-USDT',
      direction: 'LONG',
      interval: '1h',
      netReturnPct: 4.2,
      maxDrawdownPct: 1.5,
      winRatePct: 52,
      profitFactor: 1.4,
      candlesUsed: 500,
      trades: 12,
      completedAt: 2,
    },
  };
}

describe('workspace replay evidence identity', () => {
  it('matches only the exact strategy, market, direction, and interval', () => {
    const context = snapshot();
    expect(matchesBacktestEvidence(context, {
      strategyId: 'strategy-a', symbol: 'BTC-USDT', direction: 'LONG', interval: '1h',
    })).toBe(true);
    expect(matchesBacktestEvidence(context, {
      strategyId: 'strategy-b', symbol: 'BTC-USDT', direction: 'LONG', interval: '1h',
    })).toBe(false);
    expect(matchesBacktestEvidence(context, {
      strategyId: 'strategy-a', symbol: 'ETH-USDT', direction: 'LONG', interval: '1h',
    })).toBe(false);
    expect(matchesBacktestEvidence(context, {
      strategyId: 'strategy-a', symbol: 'BTC-USDT', direction: 'SHORT', interval: '1h',
    })).toBe(false);
  });

  it('fails closed for legacy evidence without an explicit identity', () => {
    const current = snapshot();
    const { strategyId: _legacyStrategyId, ...legacyEvidence } = current.lastBacktest!;
    const legacy = { ...current, lastBacktest: legacyEvidence } as unknown as WorkspaceContextSnapshot;
    expect(matchesBacktestEvidence(legacy, {
      strategyId: 'strategy-a', symbol: 'BTC-USDT', direction: 'LONG', interval: '1h',
    })).toBe(false);
  });
});
