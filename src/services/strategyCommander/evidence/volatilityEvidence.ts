import type { Candlestick } from '../../../types';
import { MathEngine } from '../../mathEngine';
import type { CommanderEvidenceV1 } from '../../../contracts/commander/commanderEvidence';
import { closedCandleWindow, makeCommanderEvidence, type CommanderEvidenceAdapterBaseInput, unavailableCommanderEvidence } from './evidenceAdapterUtils';

export interface VolatilityEvidenceInput extends CommanderEvidenceAdapterBaseInput {
  candles?: Candlestick[];
  atr?: number;
  price?: number;
  expansionThreshold?: number;
}

export function buildVolatilityEvidence(input: VolatilityEvidenceInput): CommanderEvidenceV1 {
  const window = input.candles ? closedCandleWindow(input.candles, input.asOfIndex, 2) : { candles: [], reason: null };
  if (window.reason) return unavailableCommanderEvidence(input, 'VOLATILITY', window.reason);
  const price = input.price ?? window.candles.at(-1)?.close;
  const atr = input.atr ?? (window.candles.length ? MathEngine.calculateATR(window.candles) : undefined);
  if (!Number.isFinite(price) || !Number.isFinite(atr) || Number(price) <= 0 || Number(atr) <= 0) return unavailableCommanderEvidence(input, 'VOLATILITY', 'volatility_inputs_missing_or_invalid');
  const expansion = MathEngine.atrExpansionScore(Number(atr), Number(price), input.expansionThreshold ?? 0.005);
  return makeCommanderEvidence(input, 'VOLATILITY', {
    score: expansion,
    confidence: expansion,
    valueQuality: 'VALID',
    supportingReasons: [`atr_expansion:${expansion.toFixed(3)}`, `atr_pct:${(Number(atr) / Number(price) * 100).toFixed(3)}%`],
    conflictingReasons: expansion < 0.25 ? ['volatility_not_expanding'] : [],
  });
}
