import type { Candle } from '../../../types';
import type { CommanderEvidenceV1 } from '../../../contracts/commander/commanderEvidence';
import { analyzeElliott } from '../analysis/elliottAnalysis';
import { makeCommanderEvidence, type CommanderEvidenceAdapterBaseInput, unavailableCommanderEvidence } from './evidenceAdapterUtils';

export interface ElliottEvidenceInput extends CommanderEvidenceAdapterBaseInput {
  candles?: Candle[];
}

export function buildElliottEvidence(input: ElliottEvidenceInput): CommanderEvidenceV1 {
  const analysis = analyzeElliott(input.candles, input.asOfIndex);
  if (!analysis.available) return unavailableCommanderEvidence(input, 'ELLIOTT', analysis.reasons[0] ?? 'elliott_unavailable');
  const sign = analysis.nextExpectedDirection === 'UP' ? 1 : analysis.nextExpectedDirection === 'DOWN' ? -1 : 0;
  const score = sign * Math.min(0.55, analysis.completionProbability);
  return makeCommanderEvidence(input, 'ELLIOTT', {
    direction: sign > 0 ? 'LONG' : sign < 0 ? 'SHORT' : null,
    thesisTags: ['REVERSAL', 'EXHAUSTION'],
    score,
    confidence: Math.min(0.55, analysis.confidence),
    valueQuality: 'VALID',
    supportingReasons: [...analysis.reasons, `next_expected_direction:${analysis.nextExpectedDirection.toLowerCase()}`],
    rawEvidenceIds: analysis.pivotIndexes.map((index) => `${input.inputFingerprint}:pivot:${index}`),
  });
}
