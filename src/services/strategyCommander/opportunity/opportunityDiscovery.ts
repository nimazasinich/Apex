import type { Candle, CandidateScore, DataState } from '../../../types';
import { assessMomentumState, type MomentumAssessment } from './momentumState';
import { opportunityFingerprint } from './opportunityFingerprint';
import {
  OPPORTUNITY_DISCOVERY_VERSION,
  type CurrentShortlistEntryV1,
  type OpportunityCandidateV1,
  type OpportunityDirection,
  type OpportunityDiscoveryInput,
  type OpportunityShortlistComparisonV1,
} from './opportunityTypes';
import { assessVolatilityState } from './volatilityState';
import { assessVolumeState } from './volumeState';

const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const round = (value: number, digits = 6) => Number((Number.isFinite(value) ? value : 0).toFixed(digits));

function closedSeries(rows: Candle[] | undefined, asOfTimestamp: number | undefined): { candles: Candle[]; valid: boolean } {
  if (!Array.isArray(rows) || rows.length === 0) return { candles: [], valid: false };
  const candles = rows.filter((candle) => asOfTimestamp === undefined || candle.timestamp <= asOfTimestamp);
  if (!candles.length) return { candles: [], valid: false };
  const valid = candles.every((candle, index) => Number.isFinite(candle.timestamp)
    && [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)
    && candle.high >= candle.low
    && candle.open > 0
    && candle.close > 0
    && candle.volume >= 0
    && (index === 0 || candle.timestamp > candles[index - 1].timestamp));
  return valid ? { candles, valid: true } : { candles: [], valid: false };
}

function stateDirection(assessment: MomentumAssessment): OpportunityDirection | null {
  return assessment.direction;
}

function liquidityQuality(input: OpportunityDiscoveryInput): number {
  const turnover = Number.isFinite(input.ticker.turnover24h) ? Math.max(0, input.ticker.turnover24h) : 0;
  const threshold = Math.max(1, input.minLiquidityUsd);
  const turnoverQuality = clamp(turnover / (threshold * 3));
  const book = input.orderBook;
  if (!book || book.dataState === 'unavailable' || !Number.isFinite(book.bidDepthUsd) || !Number.isFinite(book.askDepthUsd)) {
    return round(turnoverQuality * 0.7);
  }
  const depth = Math.max(0, book.bidDepthUsd) + Math.max(0, book.askDepthUsd);
  const depthQuality = clamp(depth / Math.max(100_000, turnover * 0.0005));
  return round(turnoverQuality * 0.65 + depthQuality * 0.35);
}

function dataQuality(state: DataState): number {
  if (state === 'live') return 1;
  if (state === 'degraded') return 0.65;
  return 0;
}

function possibleDirections(primary: MomentumAssessment, secondary: MomentumAssessment): OpportunityDirection[] {
  const directions = [stateDirection(primary), stateDirection(secondary)].filter((value): value is OpportunityDirection => value !== null);
  return [...new Set(directions)].sort();
}

export function discoverOpportunity(input: OpportunityDiscoveryInput): OpportunityCandidateV1 {
  const oneHour = closedSeries(input.candles1h, input.asOfTimestamp);
  const fifteenMinute = closedSeries(input.candles15m, input.asOfTimestamp);
  const momentum = assessMomentumState(oneHour.candles);
  const fastMomentum = assessMomentumState(fifteenMinute.candles);
  const volume = assessVolumeState(oneHour.candles);
  const volatility = assessVolatilityState(oneHour.candles);
  const liquidity = liquidityQuality(input);
  const directions = possibleDirections(momentum, fastMomentum);
  const mtfAligned = momentum.direction !== null && momentum.direction === fastMomentum.direction ? 1 : 0;
  const directionalEvidence = momentum.direction === null ? 0 : 1;
  const accelerating = momentum.state.endsWith('ACCELERATING') ? 1 : 0;
  const decelerating = momentum.state.endsWith('DECELERATING') ? 1 : 0;
  const reversalState = ['EXHAUSTED_UP', 'EXHAUSTED_DOWN', 'BULLISH_DIVERGENCE', 'BEARISH_DIVERGENCE'].includes(momentum.state) ? 1 : 0;
  const reversalVolume = volume.state === 'ABSORPTION' || volume.state === 'CLIMAX' || volume.state === 'DIVERGENT' ? 1 : 0;
  const volumeSupport = volume.state === 'ACCELERATING' || volume.state === 'CLIMAX' ? volume.activity : volume.state === 'NORMAL' ? 0.45 : 0.15;
  const compression = volatility.state === 'COMPRESSION' ? 1 : 0;
  const rangeExpansion = volatility.state === 'EXPANDING' || volatility.state === 'CLIMAX' ? volatility.expansion : 0;
  const fundingAvailable = input.ticker.fundingQuality === 'VALID' || input.ticker.fundingQuality === 'ESTIMATED';
  const fundingAnomaly = fundingAvailable ? clamp(Math.abs(input.ticker.fundingRate) / 0.0003) : 0;
  const oiAvailable = Number.isFinite(input.oiChangePercent);
  const oiExpansion = oiAvailable ? clamp(Math.abs(Number(input.oiChangePercent)) / 3) : 0;
  const liquidationAvailable = Number.isFinite(input.liquidationActivity);
  const liquidationIntensity = liquidationAvailable ? clamp(Number(input.liquidationActivity)) : 0;

  const continuationPotential = clamp(
    momentum.strength * 0.3 + mtfAligned * 0.25 + volumeSupport * 0.2 + rangeExpansion * 0.15 + oiExpansion * 0.1,
  ) * directionalEvidence;
  const breakoutPotential = clamp(
    compression * 0.3 + volumeSupport * 0.25 + rangeExpansion * 0.2 + momentum.strength * 0.15 + oiExpansion * 0.1,
  );
  const reversalPotential = clamp(
    reversalState * 0.35 + reversalVolume * 0.2 + decelerating * 0.15 + (volatility.state === 'CLIMAX' ? 0.1 : 0)
      + fundingAnomaly * 0.1 + liquidationIntensity * 0.1,
  );
  const meanReversionPotential = clamp(
    reversalState * 0.4 + decelerating * 0.25 + reversalVolume * 0.2 + (volatility.state === 'CLIMAX' ? 0.15 : 0),
  );

  const availability = [
    Number.isFinite(input.ticker.turnover24h) && input.ticker.turnover24h > 0,
    oneHour.valid && momentum.available,
    fifteenMinute.valid && fastMomentum.available,
    volume.available,
    volatility.available,
    Boolean(input.orderBook && input.orderBook.dataState !== 'unavailable'),
    fundingAvailable,
    oiAvailable,
    liquidationAvailable,
  ];
  const evidenceCompleteness = availability.filter(Boolean).length / availability.length;
  const evidenceQuality = clamp(evidenceCompleteness * 0.7 + dataQuality(input.ticker.dataState) * 0.3);
  const primaryPotential = Math.max(continuationPotential, breakoutPotential, reversalPotential, meanReversionPotential);
  const opportunityScore = clamp(primaryPotential * 0.65 + liquidity * 0.2 + evidenceQuality * 0.15) * 100;
  const reasons = [
    `momentum_state:${momentum.state}`,
    `fast_momentum_state:${fastMomentum.state}`,
    `volume_state:${volume.state}`,
    `volatility_state:${volatility.state}`,
    `mtf_alignment:${mtfAligned.toFixed(0)}`,
    `shadow_only:true`,
  ];
  if (!oneHour.valid) reasons.push('one_hour_history_missing_or_invalid');
  if (!fifteenMinute.valid) reasons.push('fifteen_minute_history_missing_or_invalid');
  if (!directions.length) reasons.push('direction_unresolved');
  if (!accelerating && continuationPotential > 0) reasons.push('continuation_without_acceleration');
  if (!oiAvailable) reasons.push('open_interest_change_unavailable');
  if (!liquidationAvailable) reasons.push('liquidation_activity_unavailable');

  const unsigned = {
    version: OPPORTUNITY_DISCOVERY_VERSION,
    symbol: input.ticker.symbol,
    timestamp: new Date(input.timestamp).toISOString(),
    horizon: input.horizon ?? '1h',
    opportunityScore: round(opportunityScore, 4),
    continuationPotential: round(continuationPotential),
    breakoutPotential: round(breakoutPotential),
    reversalPotential: round(reversalPotential),
    meanReversionPotential: round(meanReversionPotential),
    momentumState: momentum.state,
    volumeState: volume.state,
    volatilityState: volatility.state,
    liquidityQuality: liquidity,
    possibleDirections: directions,
    evidenceCompleteness: round(evidenceCompleteness),
    evidenceQuality: round(evidenceQuality),
    reasons,
  } satisfies Omit<OpportunityCandidateV1, 'fingerprint'>;
  return { ...unsigned, fingerprint: opportunityFingerprint(unsigned) };
}

export function buildOpportunityShortlist(inputs: readonly OpportunityDiscoveryInput[], limit = 10): OpportunityCandidateV1[] {
  return inputs
    .map(discoverOpportunity)
    .sort((left, right) => right.opportunityScore - left.opportunityScore || left.symbol.localeCompare(right.symbol))
    .slice(0, Math.max(0, Math.floor(limit)));
}

function currentShortlist(longCandidates: readonly CandidateScore[], shortCandidates: readonly CandidateScore[], limit: number): CurrentShortlistEntryV1[] {
  const grouped = new Map<string, { score: number; directions: Set<OpportunityDirection> }>();
  for (const candidate of [...longCandidates, ...shortCandidates]) {
    const current = grouped.get(candidate.symbol) ?? { score: -Infinity, directions: new Set<OpportunityDirection>() };
    current.score = Math.max(current.score, Number.isFinite(candidate.score) ? candidate.score : 0);
    if (candidate.direction === 'LONG' || candidate.direction === 'SHORT') current.directions.add(candidate.direction);
    grouped.set(candidate.symbol, current);
  }
  return [...grouped.entries()]
    .sort(([leftSymbol, left], [rightSymbol, right]) => right.score - left.score || leftSymbol.localeCompare(rightSymbol))
    .slice(0, limit)
    .map(([symbol, value], index) => ({ symbol, rank: index + 1, score: round(value.score, 4), directions: [...value.directions].sort() }));
}

export function buildOpportunityShortlistComparison(input: {
  longCandidates: readonly CandidateScore[];
  shortCandidates: readonly CandidateScore[];
  opportunityShortlist: readonly OpportunityCandidateV1[];
  timestamp: number;
  dataState: DataState;
  limit?: number;
}): OpportunityShortlistComparisonV1 {
  const limit = Math.max(1, Math.floor(input.limit ?? 10));
  const current = currentShortlist(input.longCandidates, input.shortCandidates, limit);
  const opportunities = input.opportunityShortlist.slice(0, limit).map((candidate) => ({ ...candidate }));
  const currentSymbols = new Set(current.map((entry) => entry.symbol));
  const opportunitySymbols = new Set(opportunities.map((entry) => entry.symbol));
  const overlapSymbols = [...currentSymbols].filter((symbol) => opportunitySymbols.has(symbol)).sort();
  const currentOnlySymbols = [...currentSymbols].filter((symbol) => !opportunitySymbols.has(symbol)).sort();
  const opportunityOnlySymbols = [...opportunitySymbols].filter((symbol) => !currentSymbols.has(symbol)).sort();
  const unsigned = {
    version: 'commander_opportunity_comparison_v1' as const,
    timestamp: new Date(input.timestamp).toISOString(),
    shadowOnly: true as const,
    authoritativeSelection: 'CURRENT_APEX_CANDIDATES' as const,
    currentShortlist: current,
    opportunityShortlist: opportunities,
    overlapSymbols,
    currentOnlySymbols,
    opportunityOnlySymbols,
    dataState: input.dataState,
  };
  return { ...unsigned, fingerprint: opportunityFingerprint(unsigned) };
}
