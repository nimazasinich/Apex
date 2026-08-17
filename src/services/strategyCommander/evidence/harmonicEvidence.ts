import type { Candle } from '../../../types';
import type { CommanderEvidenceV1 } from '../../../contracts/commander/commanderEvidence';
import { analyzeHarmonics } from '../analysis/harmonicAnalysis';
import { makeCommanderEvidence, type CommanderEvidenceAdapterBaseInput, unavailableCommanderEvidence } from './evidenceAdapterUtils';

export interface HarmonicEvidenceInput extends CommanderEvidenceAdapterBaseInput {
  candles?: Candle[];
}

export function buildHarmonicEvidence(input: HarmonicEvidenceInput): CommanderEvidenceV1 {
  const analysis = analyzeHarmonics(input.candles, input.asOfIndex);
  const pattern = analysis.patterns[0];
  if (!analysis.available || !pattern) return unavailableCommanderEvidence(input, 'HARMONIC', analysis.reasons[0] ?? 'harmonic_unavailable');
  const score = (pattern.direction === 'LONG' ? 1 : -1) * Math.min(0.7, pattern.reliability);
  return makeCommanderEvidence(input, 'HARMONIC', {
    direction: pattern.direction,
    thesisTags: ['REVERSAL'],
    score,
    confidence: Math.min(0.6, pattern.confidence),
    valueQuality: 'VALID',
    supportingReasons: [...pattern.reasons, `pattern:${pattern.type.toLowerCase()}`, `bounded_reliability:${Math.abs(score).toFixed(4)}`],
    rawEvidenceIds: pattern.pivotIndexes.map((index) => `${input.inputFingerprint}:pivot:${index}`),
  });
}
