import type { Candle } from '../../../types';
import type { VolumeState } from './opportunityTypes';

export interface VolumeAssessment {
  state: VolumeState;
  activity: number;
  ratio: number;
  available: boolean;
}

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export function assessVolumeState(candles: readonly Candle[]): VolumeAssessment {
  if (candles.length < 20) return { state: 'UNAVAILABLE', activity: 0, ratio: 0, available: false };
  const recent = candles.slice(-5);
  const baseline = candles.slice(-20, -5);
  const baselineAverage = average(baseline.map((candle) => candle.volume));
  if (!(baselineAverage > 0)) return { state: 'UNAVAILABLE', activity: 0, ratio: 0, available: false };
  const ratio = average(recent.map((candle) => candle.volume)) / baselineAverage;
  const last = recent.at(-1)!;
  const lastRatio = last.volume / baselineAverage;
  const candleRange = Math.max(1e-9, last.high - last.low);
  const bodyRatio = Math.abs(last.close - last.open) / candleRange;
  const priceChange = candles.at(-6)!.close > 0 ? (last.close - candles.at(-6)!.close) / candles.at(-6)!.close : 0;
  let state: VolumeState = 'NORMAL';
  if (lastRatio >= 2.2 && bodyRatio <= 0.28) state = 'ABSORPTION';
  else if (lastRatio >= 2.2) state = 'CLIMAX';
  else if (Math.abs(priceChange) >= 0.01 && ratio < 0.78) state = 'DIVERGENT';
  else if (ratio >= 1.25) state = 'ACCELERATING';
  else if (ratio <= 0.75) state = 'DECELERATING';
  return { state, activity: clamp(ratio / 2), ratio, available: true };
}
