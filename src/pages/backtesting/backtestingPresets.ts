import type { BacktestInterval, BacktestStrategyPreset } from './backtestingTypes';
import type { StrategyDefinition, TradeDirection } from '../../types';
import { baselineStrategyDefinition, strategyDefinitions } from '../../services/strategyRegistry';

export const INTERVAL_OPTIONS: BacktestInterval[] = ['5m', '15m', '1h', '4h', '1d'];

function inferDataTier(definition: StrategyDefinition): BacktestStrategyPreset['dataTier'] {
  const requirements = definition.dataRequirements.join(' ').toLowerCase();
  if (/level\s*2|order book|l2/.test(requirements)) return 'Level 2';
  if (/multi-exchange|cross-exchange|spot.*perp|perp.*spot/.test(requirements)) return 'Cross-venue';
  if (/funding|basis|open interest|taker flow/.test(requirements)) return 'Funding';
  return 'Standard';
}

function asPreset(definition: StrategyDefinition): BacktestStrategyPreset {
  const allowedDirections: TradeDirection[] = definition.longShort === 'BOTH'
    ? ['LONG', 'SHORT']
    : [definition.longShort];
  return {
    id: definition.strategyId,
    name: definition.name,
    tags: definition.categories.slice(0, 4).map((label, index) => ({
      label,
      tone: (['green', 'blue', 'red', 'violet'][index % 4]) as 'green' | 'blue' | 'red' | 'violet',
    })),
    description: definition.summary,
    disabled: definition.status === 'blocked' || definition.status === 'deprecated',
    blockedReason: definition.blockedReason,
    supportedIntervals: definition.supportedIntervals.filter((value): value is BacktestInterval => INTERVAL_OPTIONS.includes(value as BacktestInterval)),
    dataTier: inferDataTier(definition),
    allowedDirections,
    parameters: definition.parameters,
  };
}

export const STRATEGY_PRESETS = [baselineStrategyDefinition, ...strategyDefinitions].map(asPreset);

export function defaultParameters(strategy: BacktestStrategyPreset): Record<string, number | string> {
  return Object.fromEntries(strategy.parameters.map((parameter) => [parameter.key, parameter.default]));
}

export function clampNumber(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
