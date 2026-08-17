import type { Candlestick } from '../../../types';
import { buildDirectionDivergence } from '../../directionDivergence';
import type { CommanderEvidenceV1 } from '../../../contracts/commander/commanderEvidence';
import { closedCandleWindow, directionFromSignedScore, makeCommanderEvidence, type CommanderEvidenceAdapterBaseInput, unavailableCommanderEvidence } from './evidenceAdapterUtils';

export interface PriceActionEvidenceInput extends CommanderEvidenceAdapterBaseInput {
  candles?: Candlestick[];
}

export function buildPriceActionEvidence(input: PriceActionEvidenceInput): CommanderEvidenceV1 {
  const window = closedCandleWindow(input.candles, input.asOfIndex, 25);
  if (window.reason) return unavailableCommanderEvidence(input, 'PRICE_ACTION', window.reason);
  const classification = buildDirectionDivergence('LONG', { [input.timeframe]: window.candles });
  const score = classification.alignmentScore;
  return makeCommanderEvidence(input, 'PRICE_ACTION', {
    direction: directionFromSignedScore(score),
    score,
    confidence: Math.min(1, classification.trendStrength * classification.dataCompleteness),
    valueQuality: classification.dataCompleteness > 0 ? 'VALID' : 'MISSING',
    supportingReasons: [`price_action_category:${classification.category}`, `timeframe_agreement:${classification.timeframeAgreement.toFixed(3)}`],
    conflictingReasons: classification.category === 'COUNTER_TREND' || classification.category === 'RANGE' ? [`price_action_${classification.category.toLowerCase()}`] : [],
  });
}
