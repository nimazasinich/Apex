/**
 * Canonical Decision Adapter — normalizes baseline and advanced engines.
 * The baseline remains authoritative until an audited promotion policy changes it,
 * but live, proxy replay and production-input replay all enter through this adapter.
 */
import { calculateAtr } from '../lib/levels';
import { scoreCandidate, type ScoringInput } from '../lib/scoring';
import { evaluateScanDecision, type ScanDecisionTrace } from './scannerCore';
import { normalizeEffectiveScannerConfig, type EffectiveScannerConfig, type ScannerConfigContext } from './scannerConfigPolicy';
import { adaptSmartMoneyContext, type SmcAdapterResult } from './smartMoneyContextAdapter';
import { MathEngine } from './mathEngine';
import type {
  ShadowSupplementalEvidence,
  SupplementalBundle,
  SupplementalFreshness,
  SupplementalResult,
} from './providers/supplementalTypes';
import type {
  BinanceSentiment,
  Candle,
  CandidateScore,
  DataState,
  FeatureQualityState,
  ScannerConfig,
  SmartMoneyContext,
  SmcAvailabilityState,
  TradeDirection,
} from '../types';
import type * as marketDataService from './marketDataService';

export const DECISION_ADAPTER_VERSION = 'canonical_v2';
const SHADOW_TTL_MS = 90_000;

export type CanonicalDecisionMode = 'live' | 'replay_proxy' | 'replay_production';

export interface AdvancedDecisionInputs {
  smoothedObi?: number | null;
  smoothedVolDelta?: number | null;
  qStructDirectional?: number | null;
  atr?: number | null;
  microPrice?: number | null;
  spread?: number | null;
  fundingRate?: number | null;
  sentiment?: BinanceSentiment | null;
  oiTrend?: 'EXPANDING' | 'CONTRACTING' | 'NEUTRAL';
  oiChangePercent?: number | null;
  smartMoneyContext?: SmartMoneyContext | null;
  supplementalBundle?: SupplementalBundle;
  quality?: Partial<Record<
    'obi' | 'volumeDelta' | 'qStruct' | 'atr' | 'microPrice' | 'spread' | 'funding' | 'openInterest' | 'smc',
    FeatureQualityState
  >>;
}

export interface ShadowDecisionSummary {
  status: ScanDecisionTrace['status'];
  direction: ScanDecisionTrace['direction'];
  reasonCode: ScanDecisionTrace['reasonCode'];
  reasonText: ScanDecisionTrace['reasonText'];
  confidence: number | null;
  rawScore: number | null;
  smcAvailability: SmcAvailabilityState;
  engineVersion: string;
  latencyMs?: number;
  inputQuality?: Record<string, FeatureQualityState>;
  squeezeRiskScore?: number | null;
  evidenceAgreementScore?: number | null;
  qStructDirectional?: number | null;
  atrExpansionScore?: number | null;
  fundingBiasScore?: number | null;
  oiChangePercent?: number | null;
  microPriceSkewScore?: number | null;
  liquidityQualityScore?: number | null;
  smcDirectionalScore?: number | null;
  smcContextScore?: number | null;
  scoringBreakdown?: Record<string, unknown> | null;
  gatesSnapshot?: ScanDecisionTrace['gatesSnapshot'];
  marketInputs?: { obi: number; volumeDelta: number; fundingRate: number; spread: number; atr: number; microPrice: number };
  /** Supplemental evidence is descriptive only and never enters the score. */
  shadowSupplementalEvidence?: ShadowSupplementalEvidence;
}

export interface DecisionSnapshot {
  symbol: string;
  direction: TradeDirection | 'NO_TRADE';
  rankingScore: number;
  /** Decision/evidence quality. This is not a win probability. */
  confidence: number;
  calibratedProbability: number | null;
  expectedNetEdge: number | null;
  modelUncertainty: number | null;
  featureCompletenessPct: number;
  supportingSignals: string[];
  conflictingSignals: string[];
  dataQuality: DataState;
  engineVersion: string;
  createdAt: number;
  expiresAt: number;
  baseline: CandidateScore;
  shadow?: ShadowDecisionSummary;
  smcAvailability?: SmcAvailabilityState;
  smartMoneyContext?: SmartMoneyContext | null;
  configOverrides?: EffectiveScannerConfig['overrides'];
  effectiveConfig?: ScannerConfig;
  configuredConfig?: ScannerConfig;
  mode: CanonicalDecisionMode;
}

export interface LiveShadowMarketContext {
  ticker: ScoringInput['ticker'];
  candles1h: Candle[];
  candles15m?: Candle[];
  candles1m?: Candle[];
  candles5m?: Candle[];
  candles4h?: Candle[];
  orderBook: ScoringInput['orderBook'];
  orderBookDetail?: marketDataService.OrderBookResult | null;
  qStructDirectional?: number | null;
  minLiquidityUsd: number;
  scannerConfig: ScannerConfig;
  mode?: CanonicalDecisionMode;
  advancedInputs?: AdvancedDecisionInputs;
}

const SUPPLEMENTAL_FRESHNESS_WINDOW_MS = 5 * 60_000;

function supplementalFreshness(updatedAt: string | undefined, now: number): SupplementalFreshness {
  const timestamp = updatedAt ? Date.parse(updatedAt) : NaN;
  if (!Number.isFinite(timestamp)) return 'UNKNOWN';
  return now - timestamp <= SUPPLEMENTAL_FRESHNESS_WINDOW_MS ? 'CURRENT' : 'STALE';
}

function supplementalItem(
  category: 'news' | 'sentiment' | 'onchain',
  result: SupplementalResult | null,
  now: number,
): ShadowSupplementalEvidence['items'][number] {
  if (!result) {
    return {
      category,
      provider: 'cache',
      symbol: '',
      source: 'unavailable',
      status: 'CACHE_MISS',
      observedAt: null,
      freshness: 'UNKNOWN',
      available: false,
      observationCount: 0,
      reason: 'No cached supplemental result is available for this symbol.',
    };
  }
  const freshness = supplementalFreshness(result.updatedAt, now);
  const observationCount = Array.isArray(result.data) ? result.data.length : 0;
  const confidence = result.category === 'sentiment' && result.data ? result.data.confidence : undefined;
  return {
    category: result.category,
    provider: result.provider,
    symbol: result.symbol,
    source: result.source,
    status: result.status,
    observedAt: result.updatedAt || null,
    freshness,
    available: (result.source === 'live' || result.source === 'degraded') && freshness !== 'STALE',
    observationCount,
    ...(confidence !== undefined ? { confidence } : {}),
    reason: result.reason,
  };
}

export function projectShadowSupplementalEvidence(
  bundle: SupplementalBundle | undefined,
  now = Date.now(),
): ShadowSupplementalEvidence {
  return {
      version: 'supplemental_shadow_v1',
    generatedAt: now,
    items: [
      supplementalItem('news', bundle?.news ?? null, now),
      supplementalItem('sentiment', bundle?.sentiment ?? null, now),
      supplementalItem('onchain', bundle?.onchain ?? null, now),
    ],
  };
}

function toEngineCandles(rows: Candle[]) {
  return rows.map((row) => ({
    time: new Date(row.timestamp).toISOString(),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
  }));
}

function scannerContext(mode: CanonicalDecisionMode): ScannerConfigContext {
  return mode === 'replay_proxy' ? 'replay_proxy' : mode === 'replay_production' ? 'replay_production' : 'live';
}

function estimatedSignedVolume(rows: Candle[]): number | null {
  if (rows.length < 4) return null;
  const recent = rows.slice(-8);
  const avgVolume = recent.reduce((sum, row) => sum + Math.max(0, row.volume), 0) / recent.length;
  if (!Number.isFinite(avgVolume) || avgVolume <= 0) return null;
  const signed = recent.reduce((sum, row) => {
    const range = Math.max(1e-9, row.high - row.low);
    return sum + MathEngine.clamp((row.close - row.open) / range) * Math.max(0, row.volume);
  }, 0);
  return Number((signed / avgVolume).toFixed(6));
}

function stateFor(value: number | null | undefined, supplied?: FeatureQualityState, fallback: FeatureQualityState = 'MISSING'): FeatureQualityState {
  if (supplied) return supplied;
  return value != null && Number.isFinite(value) ? 'VALID' : fallback;
}

function buildShadowInputs(
  ctx: LiveShadowMarketContext,
  direction: TradeDirection,
  smc: SmcAdapterResult,
  effectiveCfg: ScannerConfig,
) {
  const history = toEngineCandles(ctx.candles1h);
  const price = ctx.ticker.lastPrice;
  const supplied = ctx.advancedInputs;
  const atrFallback = MathEngine.calculateATR(history, 14) || calculateAtr(ctx.candles1h, 14) || null;
  const atr = supplied?.atr ?? atrFallback;
  const spread = supplied?.spread ?? ctx.orderBookDetail?.spread ?? null;
  const microPrice = supplied?.microPrice ?? ctx.orderBookDetail?.microPrice ?? null;
  const smoothedObi = supplied?.smoothedObi ?? ctx.orderBookDetail?.obi ?? (
    ctx.orderBook.dataState !== 'unavailable' ? ctx.orderBook.imbalancePct / 100 : null
  );
  const estimatedVolume = estimatedSignedVolume(ctx.candles1m?.length ? ctx.candles1m : ctx.candles1h);
  const smoothedVolDelta = supplied?.smoothedVolDelta ?? estimatedVolume;
  const qStructDirectional = supplied?.qStructDirectional ?? ctx.qStructDirectional ?? (
    history.length >= 16 ? MathEngine.calculateQStructDirectional({
      confluence1M: MathEngine.computeRealConfluence(history.slice(-16)),
      confluence5M: MathEngine.computeRealConfluence(history.slice(-32)),
      confluence15M: MathEngine.computeRealConfluence(history.slice(-48)),
      confluence1MAvailable: history.length >= 16,
      confluence5MAvailable: history.length >= 32,
      confluence15MAvailable: history.length >= 48,
    }) : null
  );
  const fundingRate = supplied?.fundingRate ?? (Number.isFinite(ctx.ticker.fundingRate) ? ctx.ticker.fundingRate : null);
  const smartMoneyContext = supplied?.smartMoneyContext ?? smc.context;

  const inputQuality: Record<string, FeatureQualityState> = {
    obi: stateFor(smoothedObi, supplied?.quality?.obi, ctx.orderBookDetail?.obi != null ? 'VALID' : 'ESTIMATED'),
    volumeDelta: stateFor(smoothedVolDelta, supplied?.quality?.volumeDelta, estimatedVolume != null ? 'ESTIMATED' : 'MISSING'),
    qStruct: stateFor(qStructDirectional, supplied?.quality?.qStruct, ctx.qStructDirectional != null ? 'VALID' : 'ESTIMATED'),
    atr: stateFor(atr, supplied?.quality?.atr, atrFallback != null ? 'ESTIMATED' : 'MISSING'),
    microPrice: stateFor(microPrice, supplied?.quality?.microPrice),
    spread: stateFor(spread, supplied?.quality?.spread),
    funding: stateFor(fundingRate, supplied?.quality?.funding),
    openInterest: stateFor(supplied?.oiChangePercent, supplied?.quality?.openInterest),
    smc: supplied?.quality?.smc ?? (smartMoneyContext ? 'VALID' : smc.availability === 'STALE' ? 'STALE' : 'MISSING'),
  };

  const critical = ['obi', 'volumeDelta', 'qStruct', 'atr', 'microPrice', 'spread', 'funding', ...(ctx.mode === 'replay_production' ? ['openInterest'] : [])];
  const missingCritical = critical.filter((key) => ['MISSING', 'UNAVAILABLE', 'STALE', 'INSUFFICIENT_HISTORY'].includes(inputQuality[key]));

  const cfg: ScannerConfig = {
    ...effectiveCfg,
    directionBias: direction === 'LONG' ? 'LONG_ONLY' : 'SHORT_ONLY',
  };

  return {
    inputQuality,
    missingCritical,
    args: {
      smoothedObi: smoothedObi ?? 0,
      smoothedVolDelta: smoothedVolDelta ?? 0,
      qStructDirectional: qStructDirectional ?? 0,
      price,
      atr: atr ?? 0,
      microPrice: microPrice ?? price,
      spread: spread ?? 0,
      fundingRate: fundingRate ?? 0,
      sentiment: supplied?.sentiment ?? null,
      oiTrend: supplied?.oiTrend,
      oiChangePercent: supplied?.oiChangePercent ?? undefined,
      smartMoneyContext: smartMoneyContext ?? undefined,
      cfg,
      heuristicAdj: 0,
    },
  };
}

function unavailableShadow(
  direction: TradeDirection,
  smcAvailability: SmcAvailabilityState,
  missingCritical: string[],
  inputQuality: Record<string, FeatureQualityState>,
  latencyMs: number,
): ShadowDecisionSummary {
  return {
    status: 'REJECTED',
    direction,
    reasonCode: 'SNAPSHOT_UNAVAILABLE',
    reasonText: `Advanced decision deferred because critical inputs are unavailable or stale: ${missingCritical.join(', ')}.`,
    confidence: null,
    rawScore: null,
    smcAvailability,
    engineVersion: DECISION_ADAPTER_VERSION,
    latencyMs,
    inputQuality,
  };
}

function summarizeShadow(
  trace: ScanDecisionTrace,
  smcAvailability: SmcAvailabilityState,
  latencyMs: number,
  inputQuality: Record<string, FeatureQualityState>,
  marketInputs: { obi: number; volumeDelta: number; fundingRate: number; spread: number; atr: number; microPrice: number },
): ShadowDecisionSummary {
  return {
    status: trace.status,
    direction: trace.direction,
    reasonCode: trace.reasonCode,
    reasonText: trace.reasonText,
    confidence: trace.evaluation?.confidence ?? null,
    rawScore: trace.evaluation?.rawScore ?? null,
    smcAvailability,
    engineVersion: DECISION_ADAPTER_VERSION,
    latencyMs,
    inputQuality,
    squeezeRiskScore: trace.evaluation?.squeezeRiskScore ?? null,
    evidenceAgreementScore: trace.evaluation?.evidenceAgreementScore ?? null,
    qStructDirectional: trace.evaluation?.qStructDirectional ?? trace.gatesSnapshot.qStructDirectional,
    atrExpansionScore: trace.evaluation?.atrExpansionScore ?? null,
    fundingBiasScore: trace.evaluation?.fundingBiasScore ?? null,
    oiChangePercent: trace.evaluation?.oiChangePercent ?? null,
    microPriceSkewScore: trace.evaluation?.microPriceSkewScore ?? null,
    liquidityQualityScore: trace.evaluation?.liquidityQualityScore ?? null,
    smcDirectionalScore: trace.evaluation?.smcDirectionalScore ?? null,
    smcContextScore: trace.evaluation?.smcContextScore ?? null,
    scoringBreakdown: trace.evaluation?.scoringBreakdown as Record<string, unknown> | undefined ?? null,
    gatesSnapshot: trace.gatesSnapshot,
    marketInputs,
  };
}

function collectBaselineSignals(baseline: CandidateScore): { supporting: string[]; conflicting: string[] } {
  const supporting: string[] = [];
  const conflicting: string[] = [];
  if (baseline.momentumScore >= 60) supporting.push('momentum');
  else if (baseline.momentumScore <= 40) conflicting.push('momentum');
  if (baseline.structureScore >= 70) supporting.push('structure');
  else if (baseline.structureScore <= 35) conflicting.push('structure');
  if (baseline.orderFlowScore >= 55) supporting.push('order_flow');
  else if (baseline.orderFlowScore <= 45) conflicting.push('order_flow');
  if (baseline.guardPass) supporting.push('guard_pass');
  else conflicting.push(...baseline.guardReasons.map((reason) => `guard:${reason}`));
  if (baseline.momentumShadow && !baseline.momentumShadow.agreement) conflicting.push('roc_macd_shadow_divergence');
  return { supporting, conflicting };
}

function deriveDecisionQuality(baseline: CandidateScore, shadow?: ShadowDecisionSummary): number {
  const completeness = Math.max(0, Math.min(1, (baseline.featureCompletenessPct ?? 0) / 100));
  const guardFactor = baseline.guardPass ? 1 : 0.55;
  const confluenceFactor = baseline.timeframeConfluenceState === 'ALIGNED' ? 1
    : baseline.timeframeConfluenceState === 'PARTIAL' ? 0.8
      : baseline.timeframeConfluenceState === 'CONFLICTING' ? 0.55 : 0.65;
  const shadowFactor = shadow?.status === 'ACCEPTED' ? 1 : shadow ? 0.75 : 0.85;
  return Number(Math.max(0.01, Math.min(0.99, completeness * guardFactor * confluenceFactor * shadowFactor)).toFixed(4));
}

export function buildCanonicalDecision(
  ctx: LiveShadowMarketContext,
  direction: TradeDirection,
  options?: { includeShadow?: boolean; now?: number },
): DecisionSnapshot {
  const now = options?.now ?? Date.now();
  const mode = ctx.mode ?? 'live';
  const shadowSupplementalEvidence = projectShadowSupplementalEvidence(ctx.advancedInputs?.supplementalBundle, now);
  const scoringInput: ScoringInput = {
    ticker: ctx.ticker,
    candles: ctx.candles1h,
    candles15m: ctx.candles15m,
    orderBook: ctx.orderBook,
    minLiquidityUsd: ctx.minLiquidityUsd,
  };
  const baseline = scoreCandidate(scoringInput, direction);
  const { supporting, conflicting } = collectBaselineSignals(baseline);

  const effectiveConfig = normalizeEffectiveScannerConfig(
    { ...ctx.scannerConfig, directionBias: direction === 'LONG' ? 'LONG_ONLY' : 'SHORT_ONLY' },
    scannerContext(mode),
  );

  let shadow: ShadowDecisionSummary | undefined;
  let smcAvailability: SmcAvailabilityState | undefined;
  let smartMoneyContext: SmartMoneyContext | null | undefined;

  if (options?.includeShadow !== false) {
    const shadowStartedAt = Date.now();
    const smc = ctx.advancedInputs?.smartMoneyContext
      ? { context: ctx.advancedInputs.smartMoneyContext, availability: 'AVAILABLE' as const, reasons: ['SMC supplied by recorded production input.'] }
      : adaptSmartMoneyContext({
          candles1m: ctx.candles1m,
          candles5m: ctx.candles5m,
          candles15m: ctx.candles15m,
          candles4h: ctx.candles4h,
          direction,
          now,
        });
    smcAvailability = smc.availability;
    smartMoneyContext = smc.context;
    const prepared = buildShadowInputs(ctx, direction, smc, effectiveConfig.effective);
    if (prepared.missingCritical.length) {
      shadow = unavailableShadow(direction, smc.availability, prepared.missingCritical, prepared.inputQuality, Date.now() - shadowStartedAt);
    } else {
      const trace = evaluateScanDecision(prepared.args);
      shadow = summarizeShadow(trace, smc.availability, Date.now() - shadowStartedAt, prepared.inputQuality, {
        obi: prepared.args.smoothedObi,
        volumeDelta: prepared.args.smoothedVolDelta,
        fundingRate: prepared.args.fundingRate,
        spread: prepared.args.spread,
        atr: prepared.args.atr,
        microPrice: prepared.args.microPrice,
      });
      smartMoneyContext = trace.evaluation?.smartMoneyContext ?? smartMoneyContext;
    }
  }

  const directionResolved: TradeDirection | 'NO_TRADE' =
    baseline.guardPass && baseline.readinessTier !== 'BLOCKED' ? direction : 'NO_TRADE';
  const confidence = deriveDecisionQuality(baseline, shadow);

  return {
    symbol: ctx.ticker.symbol,
    direction: directionResolved,
    rankingScore: baseline.score,
    confidence,
    calibratedProbability: null,
    expectedNetEdge: null,
    modelUncertainty: null,
    featureCompletenessPct: baseline.featureCompletenessPct ?? 0,
    supportingSignals: supporting,
    conflictingSignals: conflicting,
    dataQuality: baseline.dataState,
    engineVersion: DECISION_ADAPTER_VERSION,
    createdAt: now,
    expiresAt: now + SHADOW_TTL_MS,
    baseline,
    shadow: shadow ? { ...shadow, shadowSupplementalEvidence } : undefined,
    smcAvailability,
    smartMoneyContext,
    configOverrides: effectiveConfig.overrides,
    effectiveConfig: effectiveConfig.effective,
    configuredConfig: effectiveConfig.configured,
    mode,
  };
}
