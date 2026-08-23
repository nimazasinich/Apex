/**
 * APEX-NEXT Core Domain & Terminal Types
 * All domain models, exchange data structures, and terminal configuration types.
 */
import type { ScanGateSnapshot } from './contracts/scanner/scanContracts';
import type { EdgeId } from './contracts/realtime/edgeEvidence';
import type { StrategyValidationSubjectIdentity } from './services/strategyValidationContracts';

export type DataState = 'live' | 'degraded' | 'not_configured' | 'unavailable';


export type UiDataState =
  | 'loading'
  | 'live'
  | 'delayed'
  | 'stale'
  | 'partial'
  | 'proxy'
  | 'local'
  | 'unavailable'
  | 'blocked'
  | 'error';

export interface UiDataMeta {
  state: UiDataState;
  label: string;
  source?: string;
  observedAt?: string;
  ageMs?: number;
  reason?: string;
  retryable?: boolean;
}

export type ReadinessTier = 'CONFIRMED' | 'WATCHLIST' | 'CAUTION' | 'BLOCKED';

export type TradeDirection = 'LONG' | 'SHORT';


/** Shadow-only signal lifecycle. It never authorizes execution. */
export type SignalLifecycleState =
  | 'CANDIDATE'
  | 'CONFIRMED'
  | 'ACTIVE'
  | 'INVALIDATED'
  | 'EXPIRED';

export type SignalLifecycleOutcome = 'WIN' | 'LOSS' | 'BREAKEVEN';

export interface SignalLifecycleSnapshot {
  signalId: string;
  state: SignalLifecycleState;
  bornAt: number;
  updatedAt: number;
  maxLifetimeMs: number;
  confirmTicks: number;
  failTicks: number;
  staleTicks: number;
  reversalTicks: number;
  exitLevelsValid: boolean;
  outcome: SignalLifecycleOutcome | null;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  shadowOnly: true;
}

export type DivergenceCategory = 'WITH_TREND' | 'RANGE' | 'COUNTER_TREND' | 'UNAVAILABLE';
export type DivergenceTrendDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNAVAILABLE';
export type DirectionMarketDataSource =
  | 'kucoin_live'
  | 'kucoin_plus_binance_live'
  | 'kucoin_live_binance_unavailable'
  | 'binance_futures_failover'
  | 'unavailable';

export interface DirectionDivergenceClassification {
  orderDirection: TradeDirection;
  alignmentScore: number;
  trendStrength: number;
  timeframeAgreement: number;
  category: DivergenceCategory;
  dataCompleteness: number;
  dataSource: ExchangeDataSource;
  perTimeframe: Record<string, {
    direction: DivergenceTrendDirection;
    strength: number;
    candleCount: number;
  }>;
  fundingRate?: number;
  oiChangePercent?: number;
  longShortRatio?: number;
}

export interface SymbolTicker {
  symbol: string;
  lastPrice: number;
  turnover24h: number; // USD Turnover
  priceChange24hPct: number; // Percentage change
  volume24h: number; // Base asset volume
  high24h: number;
  low24h: number;
  fundingRate: number; // e.g., 0.0001 (0.01%)
  fundingQuality?: FeatureQualityState;
  openInterest: number; // USD Open Interest
  dataState: DataState;
  timestamp: number;
  sparkline1h?: number[]; // 1-hour price momentum trend points
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartFeedStatus {
  loading: boolean;
  dataState: DataState;
  source: string | null;
  stale: boolean;
  ageMs: number;
  error: string | null;
}

export interface OrderBookSummary {
  symbol: string;
  bidDepthUsd: number;
  askDepthUsd: number;
  imbalancePct: number; // -100 (heavy ask) to +100 (heavy bid)
  dataState: DataState;
  qualityState?: FeatureQualityState;
}

export interface ScoringInput {
  ticker: SymbolTicker;
  candles: Candle[]; // 1h candles
  candles15m?: Candle[]; // 15m candles (REQ-073)
  orderBook: OrderBookSummary;
  minLiquidityUsd: number;
}

export interface SentimentInput {
  name: string;
  value: number;
  score: number; // 0 to 100
  weight: number; // relative weight in composite
  dataState: DataState;
  detail: string;
}

export type SentimentZone =
  | 'Extreme Fear'
  | 'Fear'
  | 'Neutral'
  | 'Greed'
  | 'Extreme Greed';

export interface SentimentComposite {
  score: number; // 0 to 100
  zone: SentimentZone;
  inputs: SentimentInput[];
  dataState: DataState;
  timestamp: number;
  /** Provider that produced the composite, when reported (GAP UI-02). */
  source?: string;
}

export type FeatureQualityState =
  | 'VALID'
  | 'MISSING'
  | 'INSUFFICIENT_HISTORY'
  | 'STALE'
  | 'ESTIMATED'
  | 'UNAVAILABLE';

export type TimeframeConfluenceState = 'ALIGNED' | 'CONFLICTING' | 'PARTIAL' | 'UNAVAILABLE';

export type SmcAvailabilityState = 'AVAILABLE' | 'INSUFFICIENT_HISTORY' | 'STALE' | 'UNAVAILABLE';

export type MomentumSignal = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface FeatureQualityMeta {
  state: FeatureQualityState;
  source?: string;
  ageMs?: number;
}

export interface ScoringFeatureQuality {
  rsi: FeatureQualityMeta;
  rocMomentum: FeatureQualityMeta;
  structure: FeatureQualityMeta;
  orderBookImbalance: FeatureQualityMeta;
  funding: FeatureQualityMeta;
  tf15m: FeatureQualityMeta;
  tf1h: FeatureQualityMeta;
}

export interface TimeframeConfluenceResult {
  state: TimeframeConfluenceState;
  tf15m: MomentumSignal;
  tf1h: MomentumSignal;
  /** Backward-compatible alias: true when state === 'ALIGNED'. */
  aligned: boolean;
}

export interface ShadowDecisionSummary {
  status: SignalDecisionStatus;
  direction: 'SHORT' | 'LONG' | 'NONE';
  reasonCode: SignalDecisionReasonCode;
  reasonText: string;
  confidence: number | null;
  rawScore: number | null;
  smcAvailability: SmcAvailabilityState;
  engineVersion: string;
  shadowSupplementalEvidence?: import('./services/providers/supplementalTypes').ShadowSupplementalEvidence;
}

export interface CandidateScore {
  symbol: string;
  lastPrice: number;
  priceChange24hPct: number;
  turnover24h: number;
  direction: TradeDirection;
  score: number; // 0 to 100
  readinessTier: ReadinessTier;
  guardPass: boolean;
  guardReasons: string[];
  momentumScore: number;
  orderFlowScore: number;
  fundingScore: number;
  structureScore: number;
  liquidityScore: number;
  timeframeConfluence: boolean; // True if 15m and 1h align
  timeframeDetails: {
    tf15m: MomentumSignal;
    tf1h: MomentumSignal;
  };
  dataState: DataState;
  /** Structured multi-timeframe result (REQ-073 upgrade). */
  timeframeConfluenceState?: TimeframeConfluenceState;
  /** Per-feature data quality beside scored values. */
  featureQuality?: ScoringFeatureQuality;
  /** Share of configured baseline score weight backed by usable evidence. */
  featureCompletenessPct?: number;
  /** Versioned real-MACD shadow feature; never silently replaces legacy ROC. */
  momentumShadow?: { roc: MomentumSignal; macdV1: MomentumSignal; agreement: boolean; version: 'macd_12_26_9_v1' };
  /** Advanced engine shadow evaluation — not authoritative for live ranking. */
  shadowDecision?: ShadowDecisionSummary;
  /** Canonical adapter metadata kept separate from ranking score. */
  canonicalDecision?: { confidence: number; calibratedProbability: number | null; expectedNetEdge: number | null; modelUncertainty: number | null; featureCompletenessPct: number; engineVersion: string; createdAt: number; expiresAt: number };
  /** Stable identity assigned by the client lifecycle adapter for this active thesis. */
  signalId?: string;
  /** Independently computed multi-timeframe classification; shadow-only. */
  directionDivergenceShadow?: DirectionDivergenceClassification;
  /** Verified inputs used by the shadow lifecycle state machine. */
  lifecycleContext?: {
    smoothedObi: number;
    confluence1M: number;
    confluenceAvailable: boolean;
    dataState: DataState;
    entryPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
  };
  /** Current shadow lifecycle state. Never used to submit an order. */
  signalLifecycle?: SignalLifecycleSnapshot;
}

export interface EvidenceItem {
  label: string;
  tag: 'supports' | 'contradicts' | 'neutral';
  detail: string;
}

export interface DerivedLevels {
  symbol: string;
  entry: number;
  resistances: [number, number, number]; // [r1, r2, r3] ascending from entry
  supports: [number, number, number]; // [s1, s2, s3] descending from entry
  method: 'SWING_STRUCTURE' | 'ATR_BANDS' | 'VOLUME_NODES';
  atr14: number;
  confidenceScore: number; // 0 to 100
  evidenceList: EvidenceItem[];
  riskReward: {
    nearestTarget: number;
    nearestStop: number;
    rMultiple: number;
    riskPct: number;
  };
  dataState: DataState;
}

export interface SizingConfig {
  accountBalanceUsd: number;
  riskMode: 'USD' | 'PCT';
  riskValue: number; // e.g. 100 (USD) or 1.0 (%)
  leverage: number; // e.g. 5x
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  direction: TradeDirection;
  successProbModel: number; // 0 to 100
  successProbUserOverride: number | null; // null if not overridden
}

export interface SizingResult {
  positionSizeBase: number;
  positionSizeUsd: number;
  riskUsd: number;
  expectedRMultiple: number;
  liquidationPrice: number;
  summaryText: string;
}

export interface DecisionJournalEntry {
  id: string;
  timestamp: number;
  symbol: string;
  direction: TradeDirection;
  action: 'ACCEPTED' | 'REJECTED';
  score: number;
  readinessTier: ReadinessTier;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  userReason: string;
  evidenceSummary: string[];
  outcomeStatus: 'OPEN' | 'TARGET_HIT' | 'STOP_HIT' | 'EXPIRED';
  closedPrice?: number;
  closedAt?: number;
  realizedR?: number;
}

export interface CalibrationBucket {
  tier: ReadinessTier;
  predictedProbAvg: number;
  realizedWinRatePct: number;
  totalTrades: number;
  winningTrades: number;
}

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  direction: TradeDirection | 'BOTH';
  minReadiness: ReadinessTier;
  minScore: number;
  symbolFilter?: string;
  alertType?: 'PRICE' | 'INDICATOR' | 'PORTFOLIO';
  condition?: 'ABOVE' | 'BELOW' | 'CHANGE_ABOVE' | 'SCORE_ABOVE';
  targetValue?: number;
  portfolioMetric?: 'MARGIN_RATIO_PCT' | 'RISK_SCORE';
  triggeredCount: number;
  /** Disable the rule after its first successful trigger. */
  triggerOnce?: boolean;
  createdAt?: number;
  lastTriggeredAt?: number;
}

export interface SystemHealthReport {
  kucoinStatus: DataState;
  binanceStatus: DataState;
  sentimentStatus: DataState;
  cacheHitRatePct: number;
  cacheTotalQueries: number;
  cacheHits: number;
  uptimeSeconds: number;
  lastErrorLog: Array<{
    timestamp: number;
    source: string;
    message: string;
  }>;
  activeCandidateCount: number;
  lastScanTimestamp: number;
}

/**
 * NOTE: this shape changed when /api/market/backtest was wired to the real
 * apex-trading-engine `runApexReplayBacktest` (previously pure Math.random()
 * mock). Nothing in this project's UI consumed BacktestResult yet (verified:
 * zero .tsx references), so the contract was corrected to what the real
 * engine actually produces rather than forced into the old fabricated shape.
 * `readinessDistribution` (a 4-tier CONFIRMED/WATCHLIST/CAUTION/BLOCKED
 * bucket) had no honest equivalent in the real replay's ACCEPTED/REJECTED +
 * reasonCode model, so it's replaced by `acceptedCandidates` /
 * `rejectedCandidates` / `rejectionCounts`, which are real.
 */
export interface BacktestResult {
  symbol: string;
  direction: TradeDirection;
  interval: string;
  candlesUsed: number;
  lookbackCandles?: number;
  simulatedScans: number;
  flaggedSignals: number;
  acceptedCandidates: number;
  rejectedCandidates: number;
  rejectionCounts: Record<string, number>;
  historicalWinRatePct: number;
  avgRMultipleRealized: number;
  avgPnlPct?: number;
  totalPnlPct: number;
  maxDrawdownPct: number;
  profitFactor: number | null;
  wins?: number;
  losses?: number;
  timed?: number;
  strategy?: string;
  strategyVersion?: number;
  replayMode?: string;
  source?: string;
  requestedBars?: number;
  maxHoldBars?: number;
  runtime?: {
    totalMs: number;
    tickerLookupMs: number;
    historyFetchMs: number;
    replayMs: number;
    tickerLookupState: 'live' | 'fallback' | 'skipped';
    replayCache?: 'HIT' | 'MISS' | 'COALESCED' | 'BYPASS';
  };
  costModel?: {
    commissionPctPerSide: number;
    slippagePctPerSide: number;
    fundingPctEstimate: number;
    roundTripCostPct: number;
    appliedByEngine: boolean;
  };
  audit?: {
    runId: string;
    engine: string;
    generatedAt: number;
    closedCandlesOnly: boolean;
    lookaheadPolicy: 'DISABLED';
    fillPolicy: 'NEXT_BAR_OR_BRACKET';
    deterministic: boolean;
    configFingerprint: string;
    optimizationRevision?: number;
    optimizationSourceReportAt?: number;
  };
  configOverrides?: Array<{ field: string; configured: number | string; effective: number | string; reason: string; policyVersion?: string }>;
  effectiveScoreWeights?: Partial<ScoringWeights>;
  smcAvailabilitySummary?: Partial<Record<SmcAvailabilityState, number>>;
  disclaimer?: string;
  equityCurve?: Array<{
    step: number;
    timestamp?: number;
    equity: number;
    drawdownPct: number;
  }>;
  /**
   * Closed-candle benchmark returned by the server for every successful run.
   * This keeps the Results panel informative even when a deterministic
   * strategy produces zero qualifying trades.
   */
  marketCurve?: Array<{
    step: number;
    timestamp: number;
    close: number;
    normalized: number;
  }>;
  diagnostics?: {
    requestedBars: number;
    candlesReturned: number;
    warmupBars: number;
    executableBars: number;
    tradeCount: number;
    noTradeReason?: string;
  };
  timeline: Array<{
    /** Actual replay market; differs from the request symbol for cross-asset strategies. */
    symbol?: string;
    timestamp: number;
    price: number;
    score: number;
    tier: ReadinessTier;
    outcome: 'WIN' | 'LOSS' | 'OPEN';
    entry: number;
    exit: number;
    stop: number;
    target: number;
    rMultiple: number;
    barsHeld?: number;
    pnlPct?: number;
    reason?: string;
  }>;
  dataState: DataState;
}

export interface TerminalSettings {
  minLiquidityUsd: number; // e.g. 10000000 ($10M)
  defaultAccountBalanceUsd: number;
  defaultRiskPct: number;
  defaultLeverage: number;
  autopilotEnabled: boolean;
  soundAlertsEnabled: boolean;
  maxLiveOrderNotionalUsd: number;
}

export interface CorrelationPair {
  symbolX: string;
  symbolY: string;
  r: number;
  returnsX: number[];
  returnsY: number[];
}

export interface CorrelationMatrixResult {
  symbols: string[];
  matrix: number[][]; // N x N Pearson correlation coefficients (-1.0 to +1.0)
  pairs: CorrelationPair[];
  timestamp: number;
  dataState: DataState;
  /** Provider that produced the price series, when reported (GAP UI-02). */
  source?: string;
}

/**
 * ── Real decision-engine types ──────────────────────────────────────────────
 * Copied from apex-trading-engine/src/types.ts so the ported scannerCore.ts /
 * mathEngine.ts / smartMoneyContextEngine.ts / backtesting.ts compile and run
 * unchanged against this project's own type module. Kept verbatim — do not
 * redefine fields loosely, callers rely on exact real-engine semantics.
 */

export interface OrderBookLevel {
  price: number;
  volume: number;
  cumulative: number;
  percentage: number;
}

export type ExchangeDataSource = 'live' | 'degraded' | 'unavailable';

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  dataSource?: ExchangeDataSource;
}

export interface Candlestick {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  fvg?: { Type: 'BULLISH' | 'BEARISH'; gap: [number, number] };
  orderBlock?: { Type: 'BULLISH' | 'BEARISH'; range: [number, number] };
}

export type CandlestickSeries = Candlestick[] & { dataSource?: ExchangeDataSource };

export interface Levels {
  resistance: [number, number, number];
  breakout: [number, number, number];
}

export interface ScoringWeights {
  obi: number;
  qStruct: number;
  volume: number;
  funding: number;
  openInterest: number;
  atr: number;
  microstructure: number;
  liquidity: number;
  smc: number;
}

export interface ScoringBreakdown {
  obi: number;
  qStruct: number;
  volume: number;
  funding: number;
  openInterest: number;
  atr: number;
  microstructure: number;
  liquidity: number;
  smc: number;
  weightedSum: number;
  totalWeight: number;
}

export interface MemoryLog {
  id: string;
  signalId?: string;
  timestamp: string;
  ticker: string;
  direction: 'SHORT' | 'LONG';
  pnlPercentage: number;
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  heuristicsTuned: {
    compositeConfidenceAdjustment: number;
    riskFixedFactor: number;
  };
  note: string;
}

export interface BinanceSentiment {
  longShortRatio: number;
  takerBuySellRatio: number;
  longAccount: number | null;
  shortAccount: number | null;
  dataSource?: ExchangeDataSource;
}

export type OITrendDirection = 'EXPANDING' | 'CONTRACTING' | 'NEUTRAL';

export type SmartMoneySetupModel = 'FLIP' | 'CHOCH' | 'CONTINUATION' | 'LIQUIDITY_SWEEP_REVERSAL' | 'NONE';
export type SmartMoneyControlSide = 'SUPPLY' | 'DEMAND' | 'NEUTRAL';

export interface SmartMoneyContext {
  smcDirectionalScore: number;
  smcContextScore: number;
  setupModel: SmartMoneySetupModel;
  controlSide: SmartMoneyControlSide;
  smartMoneyBiasScore: number;
  flipSetupScore: number;
  chochSetupScore: number;
  continuationScore: number;
  ifcQualityScore: number;
  liquiditySweepScore: number;
  zoneFreshnessScore: number;
  unmitigatedZoneProximity: number;
  htfSupplyInControl: boolean;
  htfDemandInControl: boolean;
  reasons: string[];
}

export type ThresholdMode = 'MANUAL' | 'ADAPTIVE' | 'ADAPTIVE_GUARDRAILS';

export interface ScannerConfig {
  intervalMs: number;
  obiThreshold: number;
  volumeThreshold: number;
  qStructThreshold: number;
  fundingThreshold: number;
  oiExpansionThresholdPct: number;
  atrExpansionThreshold: number;
  maxSqueezeRisk: number;
  minEvidenceAgreement: number;
  minSmartMoneyScore: number;
  smcHardRejectThreshold: number;
  thresholdMode: ThresholdMode;
  scorePreset?: 'ATLAS_PROPOSAL' | 'ATLAS_PLUS_V2' | 'CUSTOM';
  adaptiveLearningRate: number;
  adaptiveMinSamples: number;
  scoreWeights: ScoringWeights;
  minConfidence: number;
  directionBias: 'SHORT_ONLY' | 'LONG_ONLY' | 'BOTH';
  topRankSkip: number;
  minVolume24hUsd: number;
}

/**
 * A single scan-cycle decision record: what the scanner evaluated, why it
 * accepted or rejected the candidate, and (once known) how the trade played
 * out. This is the canonical row shape persisted by DecisionMemoryDB /
 * DecisionMemoryMirror and consumed by the decision-dataset export and
 * adaptive-threshold scripts. Optional fields are optional because not every
 * evaluation path (e.g. a gate rejection before scoring ever ran) produces
 * them — they are never backfilled with fabricated values.
 */
export interface SignalDecisionLog {
  id: string;
  signalId?: string;
  cycleId: string;
  timestamp: number;
  isoTime: string;
  ticker: string;
  direction: 'SHORT' | 'LONG' | 'NONE';
  decision: SignalDecisionStatus;
  reasonCode: SignalDecisionReasonCode;
  reasonText: string;

  confidence?: number;
  rawScore?: number;
  qStructDirectional?: number;
  squeezeRiskScore?: number;
  evidenceAgreementScore?: number;
  liquidityQualityScore?: number;
  microPriceSkewScore?: number;
  fundingBiasScore?: number;
  oiChangePercent?: number;
  atrExpansionScore?: number;
  smcDirectionalScore?: number;
  smcContextScore?: number;
  smcSetupModel?: SmartMoneySetupModel;
  smartMoneyContext?: SmartMoneyContext;
  scoringBreakdown?: ScoringBreakdown | Record<string, number>;
  gatesSnapshot?: ScanGateSnapshot;
  configSnapshot?: ScannerConfig;
  marketSnapshotSummary?: Record<string, unknown>;
  /** Decision-time market geometry used by counterfactual replay. */
  price?: number;
  atr?: number;
  /** Optional persisted analysis label; never used as a live scanner gate. */
  directionDivergence?: DivergenceCategory;
  /** Full independently computed multi-timeframe evidence, persisted for audit. */
  directionDivergenceDetail?: DirectionDivergenceClassification;
  /** Lifecycle snapshot at the time this decision row was persisted. */
  signalLifecycleState?: SignalLifecycleState;

  /** Known only after the position tied to an ACCEPTED decision has closed. */
  laterOutcome?: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'EXPIRED' | 'UNKNOWN';
  laterPnl?: number;
  /** Auditable resolution metadata. Missing exchange costs are retained as null, never imputed. */
  outcomeResolution?: {
    schemaVersion: 1;
    outcomeTimestamp: number | null;
    horizonMs: number | null;
    returnDefinition: 'R_MULTIPLE' | 'PERCENTAGE';
    returnValue: number | null;
    entryReference: { price: number | null; timestamp: number | null; source: 'SIGNAL_LIFECYCLE' | 'MEMORY_LOG' };
    exitReference: { price: number | null; timestamp: number | null; source: 'SIGNAL_LIFECYCLE' | 'MEMORY_LOG' };
    fees: { value: number | null; currency: string | null; status: 'VERIFIED' | 'NOT_AVAILABLE' };
    funding: { value: number | null; currency: string | null; status: 'VERIFIED' | 'NOT_AVAILABLE' };
    provenance: { source: 'SIGNAL_LIFECYCLE_TRACKER' | 'MEMORY_LOG'; version: string };
    unresolvedReason: string | null;
  };
}

/**
 * Coarse market-regime label derived from a decision log's own gate/score
 * fields (see exportDecisionDataset.mts:classifyRegime, the sole producer).
 * LONG and SHORT evaluation are supported symmetrically; regime labels are
 * descriptive inputs to bounded adaptation and never authorize execution.
 */
export type AdaptiveMarketRegime =
  | 'TREND_UP'
  | 'TREND_DOWN'
  | 'SQUEEZE_RISK'
  | 'THIN_BOOK'
  | 'CHOP'
  | 'MIXED'
  | 'UNKNOWN';

export type SignalDecisionStatus = 'ACCEPTED' | 'REJECTED';
export type SignalDecisionReasonCode =
  | 'ACCEPTED_BEST_CANDIDATE'
  | 'LOWER_RANK_THAN_BEST'
  | 'GATE_OBI_FAILED'
  | 'GATE_VOLUME_FAILED'
  | 'GATE_QSTRUCT_FAILED'
  | 'GATES_FAILED'
  | 'NO_DIRECTION_FOR_BIAS'
  | 'NO_STRUCTURE_DATA'
  | 'SNAPSHOT_UNAVAILABLE'
  | 'EVALUATION_ERROR'
  | 'HIGH_SQUEEZE_RISK'
  | 'LOW_EVIDENCE_AGREEMENT'
  | 'LOW_CONFIDENCE'
  | 'LOW_LIQUIDITY_QUALITY'
  | 'WEAK_MICROSTRUCTURE_CONFIRMATION'
  | 'SMC_CONTEXT_AGAINST_SHORT'
  | 'SMC_CONTEXT_AGAINST_LONG'
  | 'NO_SMC_CONFIRMATION'
  | 'ALREADY_ACTIVE'
  | 'DATA_NOT_READY';

export interface RankedContract {
  ticker: string;
  kuCoinSymbol: string;
  turnover24hUsd: number;
  rank: number;
  lastPrice?: number;
  priceChgPct?: number;
  volume24hBase?: number;
}


/** Strategy Studio / composite strategy library contracts. */
export type BacktestInterval = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
export type StrategyEvidenceTier = 'A' | 'B' | 'C' | 'D' | 'E';
export type StrategyWave = 'wave1-mvp' | 'wave2-formalized' | 'wave3-microstructure' | 'wave4-ai-research';
export type StrategyEngineKind = 'scanner-preset' | 'bespoke';
export type StrategyStatus = 'candidate' | 'validated' | 'deprecated' | 'blocked';

export type StrategyFusionComponentKey =
  | 'technical'
  | 'smartMoney'
  | 'orderFlow'
  | 'liquidity'
  | 'funding'
  | 'openInterest'
  | 'sentiment'
  | 'news'
  | 'whaleFlow'
  | 'regime';

export type StrategyFusionDataMode = 'NATIVE' | 'PROXY' | 'LIVE_ONLY';
export type StrategyFusionRole = 'DIRECTIONAL' | 'QUALITY';

export interface StrategyFusionComponentDefinition {
  key: StrategyFusionComponentKey;
  label: string;
  role: StrategyFusionRole;
  weight: number;
  minWeight: number;
  maxWeight: number;
  required: boolean;
  dataMode: StrategyFusionDataMode;
  reason: string;
}

export interface StrategyDynamicEvolutionPolicy {
  mode: 'BOUNDED_AUTO';
  maxWeightStep: number;
  minHoldoutImprovement: number;
  maxOverfitGap: number;
  requireCostStress: boolean;
  requireNeighborStability: boolean;
  retainRollbackRevisions: number;
  liveOnlyWeightsManualUntilHistoricalData: boolean;
}

export interface StrategyFusionBlueprint {
  components: StrategyFusionComponentDefinition[];
  minCompleteness: number;
  minAgreement: number;
  manualTuning: boolean;
  evolution: StrategyDynamicEvolutionPolicy;
}

export type StrategyLiquidityHunterEdgeRole = 'ENHANCER' | 'BLOCKER' | 'REGIME_FILTER' | 'EXECUTION_QUALITY_FILTER';

export interface StrategyLiquidityHunterEdgeBinding {
  edgeId: EdgeId;
  role: StrategyLiquidityHunterEdgeRole;
  /** Optional by design: absence of Liquidity Hunter evidence never disables the existing strategy. */
  required: false;
  rationale: string;
  authority: 'SHADOW_ONLY';
}

export interface StrategyParameterDefinition {
  key: string;
  label: string;
  default: number | string;
  min?: number;
  max?: number;
  step?: number;
  reason: string;
  optimization?: 'enabled' | 'manual-only';
  /** Older accepted keys retained so saved profiles and API clients remain compatible. */
  legacyKeys?: string[];
}

export type StrategyCapabilityRole = 'REPLAY' | 'PAPER' | 'LIVE' | 'BLOCKED' | 'UNAVAILABLE';

export interface StrategyExecutionCapability {
  roles: StrategyCapabilityRole[];
  primary: StrategyCapabilityRole;
  independentlyLiveDispatched: boolean;
  reason: string;
}

export interface StrategyDefinition {
  strategyId: string;
  version: number;
  name: string;
  summary: string;
  realisticExpectation?: string;
  evidenceTier: StrategyEvidenceTier[];
  wave: StrategyWave;
  status: StrategyStatus;
  longShort: 'LONG' | 'SHORT' | 'BOTH';
  supportedIntervals: BacktestInterval[];
  dataRequirements: string[];
  engine: StrategyEngineKind;
  scoreWeights?: Partial<ScoringWeights>;
  scannerConfigOverrides?: Partial<ScannerConfig>;
  runFn?: string;
  regimeRules: string[];
  setupRules: string[];
  triggerRules: string[];
  riskRules: string[];
  exitRules: string[];
  noTradeRules: string[];
  parameters: StrategyParameterDefinition[];
  sourceReferences: string[];
  knownFailureModes: string[];
  categories: string[];
  componentCount: number;
  /** Ten ranked, fixed strategy blueprints are the primary APEX research catalogue. */
  isCore?: boolean;
  coreRank?: number;
  fusion?: StrategyFusionBlueprint;
  /** Shadow-only Liquidity Hunter context bindings; metadata only, never order authority. */
  liquidityHunterEdges?: StrategyLiquidityHunterEdgeBinding[];
  latestSnapshot?: {
    score: number;
    winRatePct: number;
    netReturnPct: number;
    maxDrawdownPct: number;
    profitFactor: number;
    lastBacktestAt?: number;
    costStressPassed?: boolean;
    source?: 'validation' | 'backtest' | 'paper' | 'live';
    symbol?: string;
    interval?: BacktestInterval;
    direction?: TradeDirection;
    dateFrom?: number;
    dateTo?: number;
    commissionPctPerSide?: number;
    slippagePctPerSide?: number;
    fundingPctEstimate?: number;
    sampleSize?: number;
    engine?: string;
    runId?: string;
    validationMethod?: string;
    validationScope?: 'BASE_REPLAY' | 'FULL_STRATEGY';
    fullStrategyValidated?: boolean;
    dataState?: DataState;
    warnings?: string[];
  };
  blockedReason?: string;
  executionCapability?: StrategyExecutionCapability;
}

export interface StrategyReplayTrade {
  /** Market actually traded by the replay. Required for cross-asset engines. */
  symbol?: string;
  entryTime: string;
  exitTime: string;
  entry: number;
  exit: number;
  stop: number;
  target: number;
  outcome: 'TP' | 'SL' | 'TIMEOUT';
  pnlPct: number;
  grossPnlPct?: number;
  transactionCostPct?: number;
  /** Fraction of portfolio equity exposed after the portfolio risk governor. */
  exposureFraction?: number;
  /** Portfolio-return contribution after exposure scaling. */
  portfolioPnlPct?: number;
  /** Raw price-return fields retained so nested strategy routers can re-govern once at portfolio level. */
  unscaledGrossPnlPct?: number;
  unscaledTransactionCostPct?: number;
  barsHeld: number;
  rawScore?: number;
  confidence?: number;
  entryReason: string;
}

export interface StrategyReplaySummary {
  candles: number;
  trades: number;
  wins: number;
  losses: number;
  timed: number;
  winRate: number;
  avgPnlPct: number;
  totalPnlPct: number;
  maxDrawdownPct: number;
  profitFactor: number;
  acceptedCandidates?: number;
  rejectedCandidates?: number;
  rejectionCounts?: Record<string, number>;
  strategy?: string;
  replayMode?: string;
  configOverrides?: Array<{ field: string; configured: number | string; effective: number | string; reason: string; policyVersion?: string }>;
  effectiveScoreWeights?: Partial<ScoringWeights>;
  riskPolicy?: {
    policyVersion: string;
    maxGrossExposureFraction: number;
    maxRiskPerTradePct: number;
    softDrawdownPct: number;
    hardDrawdownPct: number;
    skippedAfterShutdown: number;
    throttledTrades: number;
  };
  optimizationProfile?: {
    revision: number;
    promotedAt: number;
    sourceReportAt: number;
  };
}

/** Context passed into a bespoke strategy replay engine. */
export interface StrategyRunContext {
  strategyId: string;
  symbol: string;
  interval: string;
  from: number;
  to: number;
  parameters: Record<string, number | string | boolean>;
  candles?: Array<Record<string, number | string>>;
}

export interface StrategyReplayResult {
  trades: StrategyReplayTrade[];
  equityCurve: number[];
  summary: StrategyReplaySummary;
}

export interface StrategyComparableGroup {
  symbolGroup: string;
  timeframe: string;
  regime: string;
}

export interface StrategyValidationReport {
  strategyId: string;
  strategyVersion: number;
  runAt: number;
  windows: Array<{ label: string; from: number; to: number; result: BacktestResult }>;
  holdout: { from: number; to: number; result: BacktestResult };
  stability: { neighborRuns: Array<{ paramDelta: Record<string, number>; totalPnlPct: number }>; passed: boolean };
  costStress: { feeMultiplier: number; slippageMultiplier: number; result: BacktestResult; passed: boolean };
  regimeResults?: Record<string, BacktestResult>;
  regimeStatus?: 'available' | 'insufficient_data';
  regimeReason?: string;
  ablationResults?: Array<{ component: string; scoreDelta: number }>;
  triedVariants?: number;
  /**
   * Identity of what this run actually measured — candidate, active profile, or
   * definition defaults — with a fingerprint over the exact parameters and
   * scanner config used. The automatic-promotion gate matches this fingerprint
   * against the candidate being promoted, so evidence produced by one identity
   * can never authorize another. Optional for backward compatibility with
   * reports persisted before subject tracking existed; the gate treats a missing
   * subject as a blocker, never as a pass.
   */
  subject?: StrategyValidationSubjectIdentity;
  /**
   * Optional comparison run of another identity — normally the previously active
   * profile — over the SAME holdout candles. It exists so an operator can see
   * whether the candidate actually beat what is already promoted.
   *
   * It is deliberately NOT a second full gate suite: only the holdout slice is
   * replayed, and only the gates computable from that one slice are reported.
   * Nothing here contributes to `gates` or `passedAllGates`, and the promotion
   * gate never reads it.
   */
  /** Scope the validation evidence actually covers. */
  validationScope?: 'BASE_REPLAY' | 'FULL_STRATEGY';
  /** Explicit reasons why a gate-passing replay is not full-strategy evidence. */
  validationLimitations?: string[];
  /** True only when every configured gate passed AND the full strategy semantics were exercised. */
  fullStrategyValidated?: boolean;
  baseline?: {
    subject: StrategyValidationSubjectIdentity;
    comparedOn: 'HOLDOUT_SLICE';
    holdoutTotalPnlPct: number;
    holdoutMaxDrawdownPct: number;
    holdoutGates: {
      data: boolean;
      sample: boolean;
      outOfSample: boolean;
      drawdown: boolean;
    };
  };
  gates: {
    data: boolean;
    sample: boolean;
    outOfSample: boolean;
    drawdown: boolean;
    stability: boolean;
    costResilience: boolean;
    regime: boolean;
    reproducibility: boolean;
  };
  passedAllGates: boolean;
}

export interface StrategyRankScore {
  strategyId: string;
  strategyVersion: number;
  comparableGroup: StrategyComparableGroup;
  components: {
    outOfSampleReturn: number;
    drawdownTailLoss: number;
    walkForwardConsistency: number;
    profitFactorQuality: number;
    sortinoQuality: number;
    parameterStability: number;
    costLatencyResilience: number;
    regimeCoverage: number;
    sampleAdequacy: number;
    diversificationValue: number;
  };
  penalties: string[];
  score: number;
}

// Liquidity Hunter foundation contracts are additive and do not replace existing domain types.
export type { EvidenceQuality, EvidenceValue } from './contracts/realtime/evidenceValue';
export type { MarketEvent, MarketEventType } from './contracts/realtime/marketEvent';
export type { WorldStateEntry, WorldStateSnapshot } from './contracts/realtime/worldState';
export type { EdgeEvidence, EdgeId, EdgeStatus } from './contracts/realtime/edgeEvidence';
export type { EdgeThresholdProfile, EdgeThresholdPromotionState } from './contracts/realtime/edgeThreshold';
export type {
  LayerDecision,
  LiquidityHunterSetupState,
  LiquidityHunterSetupTransition,
  SweepDirection,
  TradeBias,
} from './contracts/realtime/liquidityHunterState';
export type { ExecutionPositionState, ExecutionPositionTransition } from './contracts/realtime/executionPositionState';
export type { ReadPlaneMessage } from './contracts/realtime/websocketMessages';
