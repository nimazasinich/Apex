import type { Candle, DataState, OrderBookSummary, SymbolTicker } from '../../../types';

export const OPPORTUNITY_DISCOVERY_VERSION = 'commander_opportunity_v1' as const;

export type OpportunityDirection = 'LONG' | 'SHORT';
export type MomentumState =
  | 'BULLISH_ACCELERATING'
  | 'BULLISH_DECELERATING'
  | 'BEARISH_ACCELERATING'
  | 'BEARISH_DECELERATING'
  | 'EXHAUSTED_UP'
  | 'EXHAUSTED_DOWN'
  | 'BULLISH_DIVERGENCE'
  | 'BEARISH_DIVERGENCE'
  | 'NEUTRAL'
  | 'UNAVAILABLE';
export type VolumeState = 'NORMAL' | 'ACCELERATING' | 'DECELERATING' | 'CLIMAX' | 'ABSORPTION' | 'DIVERGENT' | 'UNAVAILABLE';
export type OpportunityVolatilityState = 'COMPRESSION' | 'NORMAL' | 'EXPANDING' | 'CLIMAX' | 'UNAVAILABLE';

export interface OpportunityCandidateV1 {
  version: typeof OPPORTUNITY_DISCOVERY_VERSION;
  symbol: string;
  timestamp: string;
  horizon: string;
  opportunityScore: number;
  continuationPotential: number;
  breakoutPotential: number;
  reversalPotential: number;
  meanReversionPotential: number;
  momentumState: MomentumState;
  volumeState: VolumeState;
  volatilityState: OpportunityVolatilityState;
  liquidityQuality: number;
  possibleDirections: OpportunityDirection[];
  evidenceCompleteness: number;
  evidenceQuality: number;
  reasons: string[];
  fingerprint: string;
}

export interface OpportunityDiscoveryInput {
  ticker: SymbolTicker;
  candles1h?: Candle[];
  candles15m?: Candle[];
  orderBook?: OrderBookSummary | null;
  horizon?: string;
  timestamp: number;
  asOfTimestamp?: number;
  minLiquidityUsd: number;
  oiChangePercent?: number;
  liquidationActivity?: number;
}

export interface CurrentShortlistEntryV1 {
  symbol: string;
  rank: number;
  score: number;
  directions: OpportunityDirection[];
}

export interface OpportunityShortlistComparisonV1 {
  version: 'commander_opportunity_comparison_v1';
  timestamp: string;
  shadowOnly: true;
  authoritativeSelection: 'CURRENT_APEX_CANDIDATES';
  currentShortlist: CurrentShortlistEntryV1[];
  opportunityShortlist: OpportunityCandidateV1[];
  overlapSymbols: string[];
  currentOnlySymbols: string[];
  opportunityOnlySymbols: string[];
  dataState: DataState;
  fingerprint: string;
}
