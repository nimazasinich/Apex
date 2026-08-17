import type { Candle } from '../../../types';
import type { CommanderEvidenceV1 } from '../../../contracts/commander/commanderEvidence';
import { analyzeFibonacci } from '../analysis/fibonacciAnalysis';
import { makeCommanderEvidence, type CommanderEvidenceAdapterBaseInput, unavailableCommanderEvidence } from './evidenceAdapterUtils';

export interface FibonacciEvidenceInput extends CommanderEvidenceAdapterBaseInput {
  candles?: Candle[];
}

export function buildFibonacciEvidence(input: FibonacciEvidenceInput): CommanderEvidenceV1 {
  const analysis = analyzeFibonacci(input.candles, input.asOfIndex);
  if (!analysis.available) return unavailableCommanderEvidence(input, 'FIBONACCI', analysis.reasons[0] ?? 'fibonacci_unavailable');
  const score = Math.max(-0.25, Math.min(0.25, analysis.score));
  return makeCommanderEvidence(input, 'FIBONACCI', {
    direction: analysis.direction,
    thesisTags: analysis.reasons.includes('extension_counter_impulse_exhaustion') ? ['EXHAUSTION'] : ['PULLBACK'],
    score,
    confidence: Math.min(0.4, analysis.confidence),
    valueQuality: 'VALID',
    supportingReasons: [
      ...analysis.reasons,
      `bounded_score:${score.toFixed(4)}`,
      ...(analysis.nearestLevel !== undefined ? [`nearest_level:${analysis.nearestLevel}`] : []),
    ],
  });
}
