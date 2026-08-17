import type { Candle } from '../../../types';
import type { OpportunityVolatilityState } from './opportunityTypes';

export interface VolatilityAssessment {
  state: OpportunityVolatilityState;
  expansion: number;
  ratio: number;
  available: boolean;
}

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

function trueRanges(candles: readonly Candle[]): number[] {
  const ranges: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const previousClose = candles[index - 1].close;
    ranges.push(Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose)));
  }
  return ranges;
}

export function assessVolatilityState(candles: readonly Candle[]): VolatilityAssessment {
  if (candles.length < 20) return { state: 'UNAVAILABLE', expansion: 0, ratio: 0, available: false };
  const ranges = trueRanges(candles.slice(-21));
  const recent = average(ranges.slice(-5));
  const prior = average(ranges.slice(-15, -5));
  if (!(prior > 0)) return { state: 'UNAVAILABLE', expansion: 0, ratio: 0, available: false };
  const ratio = recent / prior;
  const state: OpportunityVolatilityState = ratio >= 2
    ? 'CLIMAX'
    : ratio >= 1.25
      ? 'EXPANDING'
      : ratio <= 0.75
        ? 'COMPRESSION'
        : 'NORMAL';
  return { state, expansion: clamp((ratio - 0.5) / 1.5), ratio, available: true };
}
