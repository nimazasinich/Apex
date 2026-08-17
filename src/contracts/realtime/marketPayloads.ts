export type MarketSide = 'BUY' | 'SELL';
export type BookSide = 'BID' | 'ASK';

export interface NormalizedTradePayload {
  price: number;
  size: number;
  aggressorSide: MarketSide | null;
}

export interface NormalizedQuotePayload {
  bid: number;
  ask: number;
  bidSize?: number;
  askSize?: number;
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface NormalizedOrderBookSnapshotPayload {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface OrderBookUpdate {
  side: BookSide;
  price: number;
  size: number;
}

export interface NormalizedOrderBookDeltaPayload {
  updates: OrderBookUpdate[];
}

export interface NormalizedFundingPayload {
  rate: number;
}

export interface NormalizedOpenInterestPayload {
  openInterest: number;
}

export interface LiquidationCluster {
  id?: string;
  side: 'LONG' | 'SHORT';
  lowerPrice: number;
  upperPrice: number;
  notionalUsd?: number;
  confidence?: number;
}

export interface NormalizedLiquidationTopologyPayload {
  clusters: LiquidationCluster[];
  methodology?: string;
  providerTimestamp?: number;
  exchangeCoverage?: string[];
  predictive?: boolean;
}

export interface NormalizedOptionTradePayload {
  strike: number;
  expiry: number;
  gamma: number;
  openInterest?: number | null;
  spot: number;
  takerSide: MarketSide;
  contracts?: number;
  dealerGammaExposure?: number;
  instrumentName?: string;
  ivPercent?: number | null;
  gammaMethodology?: string;
  methodology?: string;
}

export interface NormalizedWalletPositionPayload {
  wallet: string;
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F' | 'UNRATED';
  direction: 'LONG' | 'SHORT';
  leverage?: number;
  netPnlPct?: number | null;
  closedTrades?: number;
  maxDrawdownPct?: number | null;
  observationOnly?: boolean;
  gradingReady?: boolean;
  methodology?: string;
  gradingVersion?: string;
  winRate?: number | null;
  profitFactor?: number | null;
  realizedPnlUsd?: number | null;
  feesUsd?: number | null;
  fundingUsd?: number | null;
  historyDays?: number | null;
  sizingCv?: number | null;
  drawdownToGrossProfitRatio?: number | null;
}

export interface NormalizedSentimentPayload {
  score: number;
  credibility: number;
  sourceId?: string;
}

export interface MetaModelEvaluationPayload {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  score: number;
  modelVersion: string;
  featureVersion: string;
  generatedAt: number;
  expiresAt: number;
}
