import { describe, expect, it } from 'vitest';
import { bespokeStrategyRunners } from '../services/strategyEngine';
import { CORE_STRATEGY_COUNT, listCoreStrategyDefinitions } from '../services/strategyRegistry';
import type { StrategyFusionComponentKey } from '../types';

const expectedComponents: StrategyFusionComponentKey[] = [
  'technical', 'smartMoney', 'orderFlow', 'liquidity', 'funding',
  'openInterest', 'sentiment', 'news', 'whaleFlow', 'regime',
];

describe('fixed Core 10 strategy portfolio', () => {
  it('registers exactly ten unique, ordered and fully fused core strategies', () => {
    const strategies = listCoreStrategyDefinitions();
    expect(CORE_STRATEGY_COUNT).toBe(10);
    expect(strategies).toHaveLength(10);
    expect(strategies.map((strategy) => strategy.coreRank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(strategies.map((strategy) => strategy.strategyId)).size).toBe(10);

    for (const strategy of strategies) {
      expect(strategy.isCore).toBe(true);
      expect(strategy.fusion).toBeDefined();
      expect(strategy.fusion?.components.map((component) => component.key).sort()).toEqual([...expectedComponents].sort());
      expect(strategy.fusion?.manualTuning).toBe(true);
      expect(strategy.fusion?.evolution.minHoldoutImprovement).toBeGreaterThanOrEqual(0);
      expect(strategy.fusion?.evolution.requireCostStress).toBe(true);
      expect(strategy.fusion?.evolution.requireNeighborStability).toBe(true);
      expect(strategy.fusion?.evolution.retainRollbackRevisions).toBeGreaterThan(0);
      expect(strategy.parameters.some((parameter) => parameter.optimization === 'enabled')).toBe(true);
      expect(strategy.parameters.filter((parameter) => parameter.key.startsWith('fusion.')).every((parameter) => parameter.optimization === 'manual-only')).toBe(true);
      expect(strategy.latestSnapshot).toBeUndefined();
    }
  });

  it('keeps every candidate bespoke core strategy connected to a real runner', () => {
    for (const strategy of listCoreStrategyDefinitions()) {
      if (strategy.engine === 'bespoke' && strategy.status !== 'blocked') {
        expect(strategy.runFn).toBeTruthy();
        expect(bespokeStrategyRunners[strategy.runFn || '']).toBeTypeOf('function');
      }
    }
  });
});
