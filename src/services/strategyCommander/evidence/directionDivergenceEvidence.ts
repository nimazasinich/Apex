import type { Candlestick, DirectionMarketDataSource } from '../../../types';
import { buildDirectionDivergence } from '../../directionDivergence';
import type { CommanderEvidenceV1 } from '../../../contracts/commander/commanderEvidence';
import { closedCandleWindow, makeCommanderEvidence, type CommanderEvidenceAdapterBaseInput, unavailableCommanderEvidence } from './evidenceAdapterUtils';

export interface DirectionDivergenceEvidenceInput extends CommanderEvidenceAdapterBaseInput {
  orderDirection: 'LONG' | 'SHORT';
  timeframes: Record<string, Candlestick[] | undefined>;
  fundingRate?: number;
  oiChangePercent?: number;
  longShortRatio?: number;
  marketDataSource?: DirectionMarketDataSource;
}

export function buildDirectionDivergenceEvidence(input: DirectionDivergenceEvidenceInput): CommanderEvidenceV1 {
  const entries = Object.entries(input.timeframes);
  if (!entries.length) return unavailableCommanderEvidence(input, 'MOMENTUM', 'direction_divergence_timeframes_missing');
  const windows = entries.map(([name, candles]) => ({
    name,
    window: candles ? closedCandleWindow(candles, input.asOfIndex, 25) : { candles: [], reason: null },
  }));
  if (!windows.some(({ window }) => window.candles.length)) return unavailableCommanderEvidence(input, 'MOMENTUM', 'direction_divergence_candle_input_missing');
  const invalid = windows.find(({ window }) => window.reason);
  if (invalid?.window.reason) return unavailableCommanderEvidence(input, 'MOMENTUM', invalid.window.reason);
  const classification = buildDirectionDivergence(
    input.orderDirection,
    Object.fromEntries(windows.map(({ name, window }) => [name, window.candles])),
    {
      fundingRate: input.fundingRate,
      oiChangePercent: input.oiChangePercent,
      longShortRatio: input.longShortRatio,
      marketDataSource: input.marketDataSource,
    },
  );
  const quality = classification.dataCompleteness > 0 ? 'VALID' : 'MISSING';
  const direction = classification.alignmentScore > 0.05
    ? input.orderDirection
    : classification.alignmentScore < -0.05
      ? input.orderDirection === 'LONG' ? 'SHORT' : 'LONG'
      : null;
  return makeCommanderEvidence(input, 'MOMENTUM', {
    expertId: 'apex.direction_divergence',
    direction,
    score: classification.alignmentScore,
    confidence: Math.min(1, classification.trendStrength * classification.dataCompleteness),
    valueQuality: quality,
    supportingReasons: [
      `order_direction:${input.orderDirection}`,
      `divergence_category:${classification.category}`,
      `timeframe_agreement:${classification.timeframeAgreement.toFixed(3)}`,
      `data_completeness:${classification.dataCompleteness.toFixed(3)}`,
    ],
    conflictingReasons: classification.category === 'COUNTER_TREND' || classification.category === 'RANGE'
      ? [`direction_divergence_${classification.category.toLowerCase()}`]
      : [],
  });
}
