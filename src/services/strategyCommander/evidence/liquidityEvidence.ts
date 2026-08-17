import type { Candlestick, OrderBook } from '../../../types';
import { MathEngine } from '../../mathEngine';
import type { CommanderEvidenceV1 } from '../../../contracts/commander/commanderEvidence';
import { closedCandleWindow, makeCommanderEvidence, type CommanderEvidenceAdapterBaseInput, unavailableCommanderEvidence } from './evidenceAdapterUtils';

export interface LiquidityEvidenceInput extends CommanderEvidenceAdapterBaseInput {
  candles?: Candlestick[];
  orderBook?: OrderBook;
  price?: number;
  spread?: number;
  atr?: number;
}

export function buildLiquidityEvidence(input: LiquidityEvidenceInput): CommanderEvidenceV1 {
  const window = input.candles ? closedCandleWindow(input.candles, input.asOfIndex, 2) : { candles: [], reason: null };
  if (window.reason) return unavailableCommanderEvidence(input, 'LIQUIDITY', window.reason);
  const price = input.price ?? window.candles.at(-1)?.close;
  const spread = input.spread ?? (input.orderBook ? MathEngine.calculateSpread(input.orderBook) : undefined);
  const atr = input.atr ?? (window.candles.length ? MathEngine.calculateATR(window.candles) : undefined);
  if (!Number.isFinite(price) || !Number.isFinite(spread) || !Number.isFinite(atr) || Number(price) <= 0 || Number(spread) < 0 || Number(atr) <= 0) {
    return unavailableCommanderEvidence(input, 'LIQUIDITY', 'liquidity_inputs_missing_or_invalid');
  }
  const quality = MathEngine.liquidityQualityScore(Number(spread), Number(atr), Number(price));
  return makeCommanderEvidence(input, 'LIQUIDITY', {
    score: quality,
    confidence: quality,
    valueQuality: 'VALID',
    supportingReasons: [`liquidity_quality:${quality.toFixed(3)}`, `spread:${Number(spread).toFixed(8)}`, `atr:${Number(atr).toFixed(8)}`],
    conflictingReasons: quality < 0.5 ? ['liquidity_quality_degraded'] : [],
  });
}
