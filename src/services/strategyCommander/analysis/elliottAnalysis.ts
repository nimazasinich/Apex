import type { Candle } from '../../../types';
import { causalCandleWindow, clampUnit, findConfirmedPivots, pivotsAlternate, type ConfirmedPivot } from './confirmedPivots';

export interface ElliottRule {
  rule: 'ALTERNATING_PIVOTS' | 'WAVE_2_ORIGIN' | 'WAVE_3_NOT_SHORTEST' | 'WAVE_4_NO_OVERLAP' | 'PROGRESSIVE_EXTREMES';
  passed: boolean;
}

export interface ElliottAnalysis {
  available: boolean;
  impulseDirection: 'UP' | 'DOWN' | 'UNKNOWN';
  nextExpectedDirection: 'UP' | 'DOWN' | 'SIDEWAYS';
  completionProbability: number;
  confidence: number;
  exhaustion: number;
  pivotIndexes: number[];
  rules: ElliottRule[];
  reasons: string[];
}

type Orientation = 'BULLISH' | 'BEARISH';
interface ElliottCandidate {
  orientation: Orientation;
  pivots: ConfirmedPivot[];
  confidence: number;
  rules: ElliottRule[];
}

function unavailable(reason: string, rules: ElliottRule[] = []): ElliottAnalysis {
  return {
    available: false,
    impulseDirection: 'UNKNOWN',
    nextExpectedDirection: 'SIDEWAYS',
    completionProbability: 0,
    confidence: 0,
    exhaustion: 0,
    pivotIndexes: [],
    rules,
    reasons: [reason],
  };
}

function evaluateImpulse(pivots: ConfirmedPivot[], orientation: Orientation): ElliottCandidate | null {
  const bullish = orientation === 'BULLISH';
  const expected = bullish ? ['LOW', 'HIGH', 'LOW', 'HIGH', 'LOW', 'HIGH'] : ['HIGH', 'LOW', 'HIGH', 'LOW', 'HIGH', 'LOW'];
  const alternating = pivotsAlternate(pivots) && pivots.every((pivot, index) => pivot.kind === expected[index]);
  const [origin, wave1, wave2, wave3, wave4, wave5] = pivots;
  const wave2Origin = bullish ? wave2.price > origin.price : wave2.price < origin.price;
  const progressive = bullish
    ? wave3.price > wave1.price && wave5.price > wave3.price
    : wave3.price < wave1.price && wave5.price < wave3.price;
  const wave4NoOverlap = bullish ? wave4.price > wave1.price : wave4.price < wave1.price;
  const wave1Move = Math.abs(wave1.price - origin.price);
  const wave3Move = Math.abs(wave3.price - wave2.price);
  const wave5Move = Math.abs(wave5.price - wave4.price);
  const wave3NotShortest = wave3Move + 1e-12 >= Math.min(wave1Move, wave5Move);
  const rules: ElliottRule[] = [
    { rule: 'ALTERNATING_PIVOTS', passed: alternating },
    { rule: 'WAVE_2_ORIGIN', passed: wave2Origin },
    { rule: 'WAVE_3_NOT_SHORTEST', passed: wave3NotShortest },
    { rule: 'WAVE_4_NO_OVERLAP', passed: wave4NoOverlap },
    { rule: 'PROGRESSIVE_EXTREMES', passed: progressive },
  ];
  if (rules.some((rule) => !rule.passed)) return null;
  const wave2Retracement = wave1Move > 0 ? Math.abs(wave2.price - wave1.price) / wave1Move : Number.POSITIVE_INFINITY;
  const wave4Retracement = wave3Move > 0 ? Math.abs(wave4.price - wave3.price) / wave3Move : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(wave2Retracement) || !Number.isFinite(wave4Retracement)) return null;
  const retracementFit = [wave2Retracement, wave4Retracement]
    .map((ratio) => ratio >= 0.2 && ratio <= 0.9 ? 1 : ratio > 0 && ratio < 1 ? 0.6 : 0)
    .reduce<number>((sum, value) => sum + value, 0) / 2;
  const confidence = clampUnit(0.65 + 0.2 * retracementFit + 0.15 * clampUnit(wave3Move / Math.max(wave1Move, 1e-12) / 1.618));
  return { orientation, pivots, confidence, rules };
}

export function analyzeElliott(candles: readonly Candle[] | undefined, asOfIndex?: number, left = 3, right = 3): ElliottAnalysis {
  const window = causalCandleWindow(candles, asOfIndex);
  if (!window.ok) return unavailable(window.reason ?? 'invalid_candle_input');
  if (window.candles.length < 30) return unavailable('insufficient_confirmed_history');
  const pivots = findConfirmedPivots(window.candles, left, right);
  if (pivots.length < 6) return unavailable('too_few_confirmed_pivots');

  const candidates: ElliottCandidate[] = [];
  for (let start = Math.max(0, pivots.length - 14); start <= pivots.length - 6; start += 1) {
    const sequence = pivots.slice(start, start + 6);
    const bullish = evaluateImpulse(sequence, 'BULLISH');
    const bearish = evaluateImpulse(sequence, 'BEARISH');
    if (bullish) candidates.push(bullish);
    if (bearish) candidates.push(bearish);
  }
  candidates.sort((leftCandidate, rightCandidate) => rightCandidate.confidence - leftCandidate.confidence
    || rightCandidate.pivots.at(-1)!.timestamp - leftCandidate.pivots.at(-1)!.timestamp);
  const best = candidates[0];
  if (!best) return unavailable('no_impulse_satisfies_core_elliott_rules');

  const wave3Move = Math.abs(best.pivots[3].price - best.pivots[2].price);
  const wave5Move = Math.abs(best.pivots[5].price - best.pivots[4].price);
  const extensionRatio = wave3Move > 0 ? wave5Move / wave3Move : 1;
  const exhaustion = clampUnit(0.45 + (extensionRatio < 0.8 ? 0.25 : 0) + (best.confidence > 0.8 ? 0.15 : 0));
  return {
    available: true,
    impulseDirection: best.orientation === 'BULLISH' ? 'UP' : 'DOWN',
    nextExpectedDirection: best.orientation === 'BULLISH' ? 'DOWN' : 'UP',
    completionProbability: clampUnit(best.confidence * 0.9 + 0.05),
    confidence: best.confidence,
    exhaustion,
    pivotIndexes: best.pivots.map((pivot) => pivot.index),
    rules: best.rules,
    reasons: [
      `${best.orientation.toLowerCase()}_five_wave_impulse_confirmed`,
      `wave5_wave3_extension:${extensionRatio.toFixed(4)}`,
    ],
  };
}
