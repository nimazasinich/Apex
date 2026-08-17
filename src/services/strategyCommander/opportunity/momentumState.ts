import type { Candle } from '../../../types';
import type { MomentumState, OpportunityDirection } from './opportunityTypes';

export interface MomentumAssessment {
  state: MomentumState;
  direction: OpportunityDirection | null;
  strength: number;
  acceleration: number;
  available: boolean;
}

const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const change = (from: number, to: number) => from > 0 && Number.isFinite(from) && Number.isFinite(to) ? (to - from) / from : 0;

export function assessMomentumState(candles: readonly Candle[]): MomentumAssessment {
  if (candles.length < 15) return { state: 'UNAVAILABLE', direction: null, strength: 0, acceleration: 0, available: false };
  const closes = candles.map((candle) => candle.close);
  const last = closes.length - 1;
  const recent = change(closes[last - 5], closes[last]);
  const prior = change(closes[last - 10], closes[last - 5]);
  const acceleration = Math.abs(recent) - Math.abs(prior);
  const strength = clamp(Math.abs(recent) / 0.025);
  const priorWindow = closes.slice(-15, -1);
  const atHigh = closes[last] >= Math.max(...priorWindow);
  const atLow = closes[last] <= Math.min(...priorWindow);
  const materiallyWeaker = Math.abs(recent) < Math.abs(prior) * 0.7;

  if (atHigh && recent > 0 && prior > 0 && materiallyWeaker) {
    return { state: 'BEARISH_DIVERGENCE', direction: 'SHORT', strength, acceleration, available: true };
  }
  if (atLow && recent < 0 && prior < 0 && materiallyWeaker) {
    return { state: 'BULLISH_DIVERGENCE', direction: 'LONG', strength, acceleration, available: true };
  }
  if (recent > 0.001) {
    const state: MomentumState = acceleration > 0.0005 ? 'BULLISH_ACCELERATING' : acceleration < -0.0015 ? 'EXHAUSTED_UP' : 'BULLISH_DECELERATING';
    return { state, direction: state === 'EXHAUSTED_UP' ? 'SHORT' : 'LONG', strength, acceleration, available: true };
  }
  if (recent < -0.001) {
    const state: MomentumState = acceleration > 0.0005 ? 'BEARISH_ACCELERATING' : acceleration < -0.0015 ? 'EXHAUSTED_DOWN' : 'BEARISH_DECELERATING';
    return { state, direction: state === 'EXHAUSTED_DOWN' ? 'LONG' : 'SHORT', strength, acceleration, available: true };
  }
  return { state: 'NEUTRAL', direction: null, strength, acceleration, available: true };
}
