import type { Candlestick } from '../../../types';
import { computeTimeframeDirection } from '../../directionDivergence';
import type { CommanderEvidenceV1 } from '../../../contracts/commander/commanderEvidence';
import { closedCandleWindow, directionFromSignedScore, makeCommanderEvidence, type CommanderEvidenceAdapterBaseInput, unavailableCommanderEvidence } from './evidenceAdapterUtils';

export interface MomentumEvidenceInput extends CommanderEvidenceAdapterBaseInput {
  candles?: Candlestick[];
}

export function buildMomentumEvidence(input: MomentumEvidenceInput): CommanderEvidenceV1 {
  const window = closedCandleWindow(input.candles, input.asOfIndex, 25);
  if (window.reason) return unavailableCommanderEvidence(input, 'MOMENTUM', window.reason);
  const result = computeTimeframeDirection(window.candles);
  if (result.direction === 'UNAVAILABLE') return unavailableCommanderEvidence(input, 'MOMENTUM', 'momentum_direction_unavailable');
  const score = result.direction === 'BULLISH' ? result.strength : result.direction === 'BEARISH' ? -result.strength : 0;
  return makeCommanderEvidence(input, 'MOMENTUM', {
    direction: directionFromSignedScore(score),
    score,
    confidence: result.strength,
    valueQuality: 'VALID',
    supportingReasons: [`${result.direction.toLowerCase()} momentum strength:${result.strength.toFixed(3)}`, `closed_candles:${result.candleCount}`],
    conflictingReasons: result.direction === 'NEUTRAL' ? ['momentum_below_directional_threshold'] : [],
  });
}
