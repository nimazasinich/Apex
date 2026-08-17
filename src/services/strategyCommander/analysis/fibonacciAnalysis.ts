import type { Candle } from '../../../types';
import { causalCandleWindow, clampSigned, clampUnit, findConfirmedPivots, type ConfirmedPivot } from './confirmedPivots';

export interface FibonacciAnalysis {
  available: boolean;
  score: number;
  confidence: number;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  swing?: {
    direction: 'UP' | 'DOWN';
    startIndex: number;
    endIndex: number;
    high: number;
    low: number;
  };
  nearestLevel?: number;
  nearestDistancePct?: number;
  reasons: string[];
}

const RETRACEMENTS = [0.236, 0.382, 0.5, 0.618, 0.786] as const;
const EXTENSIONS = [1, 1.272, 1.618, 2, 2.618] as const;
const KEY_LEVELS = new Set([0.382, 0.5, 0.618, 0.786, 1.272, 1.618]);

function unavailable(reason: string): FibonacciAnalysis {
  return { available: false, score: 0, confidence: 0, direction: 'NEUTRAL', reasons: [reason] };
}

function latestSwing(pivots: readonly ConfirmedPivot[]): [ConfirmedPivot, ConfirmedPivot] | null {
  for (let index = pivots.length - 2; index >= 0; index -= 1) {
    const start = pivots[index];
    const end = pivots[index + 1];
    if (start.kind === end.kind) continue;
    const move = Math.abs(end.price - start.price) / Math.max(Math.min(start.price, end.price), 1e-12);
    if (move >= 0.015) return [start, end];
  }
  return null;
}

export function analyzeFibonacci(candles: readonly Candle[] | undefined, asOfIndex?: number, left = 3, right = 3): FibonacciAnalysis {
  const window = causalCandleWindow(candles, asOfIndex);
  if (!window.ok) return unavailable(window.reason ?? 'invalid_candle_input');
  if (window.candles.length < 30) return unavailable('insufficient_confirmed_history');
  const pivots = findConfirmedPivots(window.candles, left, right);
  const pair = latestSwing(pivots);
  if (!pair) return unavailable('confirmed_swing_pair_missing');

  const [start, end] = pair;
  const range = end.price - start.price;
  if (!Number.isFinite(range) || range === 0) return unavailable('confirmed_swing_range_invalid');
  const current = window.candles.at(-1)!.close;
  const levels = [
    ...RETRACEMENTS.map((level) => ({ level, price: end.price - range * level })),
    ...EXTENSIONS.map((level) => ({ level, price: end.price + Math.sign(range) * Math.abs(range) * (level - 1) })),
  ].map((entry) => ({
    ...entry,
    distancePct: Math.abs(current - entry.price) / Math.max(Math.abs(current), 1e-12) * 100,
  }));
  const nearest = levels.sort((leftLevel, rightLevel) => leftLevel.distancePct - rightLevel.distancePct)[0];
  if (!nearest || !Number.isFinite(nearest.distancePct)) return unavailable('fibonacci_level_distance_invalid');

  const recent = window.candles.slice(-5);
  const impulse = recent.length >= 2
    ? (recent.at(-1)!.close - recent[0].close) / Math.max(Math.abs(recent[0].close), 1e-12)
    : 0;
  const swingDirection = range > 0 ? 'UP' : 'DOWN';
  const trendSign = swingDirection === 'UP' ? 1 : -1;
  const atKeyLevel = nearest.distancePct <= 1.5 && KEY_LEVELS.has(nearest.level);
  let score = 0;
  let confidence = 0.25;
  const reasons: string[] = [];
  if (!atKeyLevel) {
    reasons.push(`nearest_level_distance_pct:${nearest.distancePct.toFixed(3)}`);
  } else if (nearest.level < 1) {
    if (Math.sign(impulse) === trendSign) {
      score = trendSign * (0.45 + 0.35 * clampUnit(1 - nearest.distancePct / 1.5));
      confidence = 0.65;
      reasons.push('confirmed_retracement_continuation');
    } else {
      score = -trendSign * 0.25;
      confidence = 0.45;
      reasons.push('retracement_without_confirmed_continuation');
    }
  } else if (Math.sign(impulse) === -trendSign) {
    score = -trendSign * (0.35 + 0.25 * clampUnit(1 - nearest.distancePct / 1.5));
    confidence = 0.6;
    reasons.push('extension_counter_impulse_exhaustion');
  } else {
    score = trendSign * 0.25;
    confidence = 0.45;
    reasons.push('extension_acceptance_in_swing_direction');
  }

  const high = Math.max(start.price, end.price);
  const low = Math.min(start.price, end.price);
  const significance = clampUnit((high - low) / Math.max(low, 1e-12) / 0.1);
  score = clampSigned(score);
  confidence = clampUnit(confidence * (0.65 + 0.35 * significance));
  return {
    available: true,
    score,
    confidence,
    direction: score > 0.15 ? 'LONG' : score < -0.15 ? 'SHORT' : 'NEUTRAL',
    swing: { direction: swingDirection, startIndex: start.index, endIndex: end.index, high, low },
    nearestLevel: nearest.level,
    nearestDistancePct: nearest.distancePct,
    reasons,
  };
}
