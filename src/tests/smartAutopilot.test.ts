import { describe, expect, it } from 'vitest';
import { buildSmartAutopilotPlan, runSmartAutopilotOptimizationCouncil, type SmartAutopilotOptimizationReportLike } from '../services/smartAutopilot';

function report(overrides: Partial<SmartAutopilotOptimizationReportLike> = {}): SmartAutopilotOptimizationReportLike {
  const base: SmartAutopilotOptimizationReportLike = {
    promotion: {
      eligible: true,
      blockers: [],
      holdoutImprovement: 0.18,
      neighborPassRate: 0.9,
      overfitGap: 0.12,
    },
    budget: { maximumOverfitGap: 0.32 },
    holdout: {
      candidate: { metrics: { totalPnlPct: 8.4, profitFactor: 1.7, tradeCount: 18 } },
      costStress: { metrics: { totalPnlPct: 5.6, profitFactor: 1.4 } },
    },
  };
  return {
    ...base,
    ...overrides,
    promotion: { ...base.promotion, ...(overrides.promotion || {}) },
    budget: { ...base.budget, ...(overrides.budget || {}) },
    holdout: {
      candidate: { metrics: { ...base.holdout.candidate.metrics, ...(overrides.holdout?.candidate?.metrics || {}) } },
      costStress: { metrics: { ...base.holdout.costStress.metrics, ...(overrides.holdout?.costStress?.metrics || {}) } },
    },
  };
}

describe('Smart Autopilot planner and optimization council', () => {
  it('rotates bounded strategy × market × timeframe × direction contexts', () => {
    const strategies = [
      { strategyId: 'alpha', status: 'ready', supportedIntervals: ['15m', '1h'], longShort: 'BOTH' as const },
      { strategyId: 'beta', status: 'ready', supportedIntervals: ['1h'], longShort: 'LONG' as const },
      { strategyId: 'blocked', status: 'blocked', supportedIntervals: ['1h'], longShort: 'SHORT' as const },
    ];
    const first = buildSmartAutopilotPlan({ strategies, symbol: 'BTC-USDT', symbols: ['ETH-USDT', 'SOL-USDT'], preferredInterval: '1h', cycleIndex: 0, maxContexts: 4 });
    const second = buildSmartAutopilotPlan({ strategies, symbol: 'BTC-USDT', symbols: ['ETH-USDT', 'SOL-USDT'], preferredInterval: '1h', cycleIndex: 1, maxContexts: 4 });
    expect(first.contexts).toHaveLength(4);
    expect(first.contexts.map((row) => row.symbol)).toEqual(['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'BTC-USDT']);
    expect(first.contexts.every((row) => row.strategyId !== 'blocked')).toBe(true);
    expect(second.startOffset).not.toBe(first.startOffset);
    expect(new Set([...first.contexts, ...second.contexts].map((row) => row.id)).size).toBeGreaterThan(4);
  });

  it('approves only robust positive holdout + cost-stress candidates with stable neighbors', () => {
    const council = runSmartAutopilotOptimizationCouncil(report());
    expect(council.vetoes).toBe(0);
    expect(council.supports).toBe(5);
    expect(council.approvedForPromotion).toBe(true);
  });

  it('vetoes negative or overfit candidates even when another metric looks good', () => {
    const negative = runSmartAutopilotOptimizationCouncil(report({
      holdout: {
        candidate: { metrics: { totalPnlPct: -1.2, profitFactor: 1.8, tradeCount: 20 } },
        costStress: { metrics: { totalPnlPct: -2.5, profitFactor: 0.8 } },
      },
    }));
    expect(negative.approvedForPromotion).toBe(false);
    expect(negative.blockers).toContain('holdout_return_not_positive');
    expect(negative.blockers).toContain('cost_stress_return_not_positive');

    const overfit = runSmartAutopilotOptimizationCouncil(report({ promotion: { eligible: true, blockers: [], holdoutImprovement: 0.2, neighborPassRate: 0.9, overfitGap: 0.5 } }));
    expect(overfit.approvedForPromotion).toBe(false);
    expect(overfit.blockers).toContain('overfit_gap_exceeds_budget');
  });
});
