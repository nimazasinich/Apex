import type { Candlestick } from '../../../types';
import { deriveSmartMoneyContext } from '../../smartMoneyContextEngine';
import type { CommanderEvidenceV1 } from '../../../contracts/commander/commanderEvidence';
import { closedCandleWindow, directionFromSignedScore, makeCommanderEvidence, type CommanderEvidenceAdapterBaseInput, unavailableCommanderEvidence } from './evidenceAdapterUtils';

export interface SmartMoneyEvidenceInput extends CommanderEvidenceAdapterBaseInput {
  candles1m?: Candlestick[];
  candles5m?: Candlestick[];
  candles15m?: Candlestick[];
  candles4h?: Candlestick[];
  direction?: 'LONG' | 'SHORT';
}

export function buildSmartMoneyEvidence(input: SmartMoneyEvidenceInput): CommanderEvidenceV1 {
  const windows = [
    input.candles1m ? closedCandleWindow(input.candles1m, input.asOfIndex, 8) : { candles: [], reason: null },
    input.candles5m ? closedCandleWindow(input.candles5m, input.asOfIndex, 8) : { candles: [], reason: null },
    input.candles15m ? closedCandleWindow(input.candles15m, input.asOfIndex, 8) : { candles: [], reason: null },
    input.candles4h ? closedCandleWindow(input.candles4h, input.asOfIndex, 8) : { candles: [], reason: null },
  ];
  if (!windows.some((window) => window.candles.length)) return unavailableCommanderEvidence(input, 'SMART_MONEY', 'smart_money_candle_input_missing');
  const invalid = windows.find((window) => window.reason);
  if (invalid?.reason) return unavailableCommanderEvidence(input, 'SMART_MONEY', invalid.reason);
  const [candles1m, candles5m, candles15m, candles4h] = windows.map((window) => window.candles);
  const context = deriveSmartMoneyContext({
    candles1m, candles5m, candles15m, candles4h, direction: input.direction,
  });
  const score = context.smcDirectionalScore;
  return makeCommanderEvidence(input, 'SMART_MONEY', {
    direction: directionFromSignedScore(score),
    thesisTags: context.setupModel === 'LIQUIDITY_SWEEP_REVERSAL' ? ['REVERSAL'] : context.setupModel === 'CONTINUATION' ? ['TREND_CONTINUATION'] : [],
    score,
    confidence: Math.abs(score),
    valueQuality: 'VALID',
    supportingReasons: [`setup_model:${context.setupModel}`, `control_side:${context.controlSide}`, ...context.reasons],
    conflictingReasons: context.controlSide === 'NEUTRAL' ? ['smart_money_control_neutral'] : [],
  });
}
