import { describe, expect, it } from 'vitest';
import { bespokeStrategyRunners } from '../services/strategyEngine';
import { getStrategyDefinition, listStrategyDefinitions } from '../services/strategyRegistry';
import { normalizeStrategyParameterAliases } from '../services/strategyParameters';

const PRIOR_STRATEGY_IDS = [
  'apex-composite-scanner-v1',
  'crypto-multi-alpha-ls-v1',
  'adaptive-long-short-trend-portfolio-v1',
  'funding-basis-carry-v1',
  'opening-range-vwap-rvol-breakout-v1',
  'volatility-squeeze-trend-volume-expansion-v1',
  'multi-timeframe-vwap-pullback-reacceleration-v1',
  'liquidity-sweep-fvg-reversal-v1',
  'dynamic-cointegration-basket-v1',
  'l2-liquidity-state-scalper-v1',
  'cross-exchange-market-making-v1',
  'funding-aware-avellaneda-mm-v1',
  'regime-routed-ai-ensemble-v1',
];

describe('strategy feature preservation', () => {
  it('retains every previously registered strategy identity', () => {
    const ids = new Set(listStrategyDefinitions({ includeBaseline: true }).map((definition) => definition.strategyId));
    expect(PRIOR_STRATEGY_IDS.every((id) => ids.has(id))).toBe(true);
  });

  it('retains previous manual controls and interval compatibility', () => {
    const orb = getStrategyDefinition('opening-range-vwap-rvol-breakout-v1')!;
    const squeeze = getStrategyDefinition('volatility-squeeze-trend-volume-expansion-v1')!;
    const router = getStrategyDefinition('regime-routed-ai-ensemble-v1')!;
    expect(orb.parameters.some((parameter) => parameter.key === 'atrStopMultiplier')).toBe(true);
    expect(squeeze.parameters.some((parameter) => parameter.key === 'widthLookback')).toBe(true);
    expect(squeeze.parameters.some((parameter) => parameter.key === 'atrStopMultiplier')).toBe(true);
    expect(router.supportedIntervals).toContain('1d');
  });

  it('migrates the newer squeezeLookback alias without changing execution', () => {
    const squeeze = getStrategyDefinition('volatility-squeeze-trend-volume-expansion-v1')!;
    expect(normalizeStrategyParameterAliases(squeeze, { squeezeLookback: 120 }).widthLookback).toBe(120);
    expect(typeof bespokeStrategyRunners.volatilitySqueezeExpansion).toBe('function');
  });
});
