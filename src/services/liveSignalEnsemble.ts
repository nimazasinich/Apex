import type { Candle, TradeDirection } from '../types';
import type { ShadowDecisionSummary } from './decisionSummaryContracts';
import { detectLiveMarketRegime, type LiveMarketRegime, type LiveMarketRegimeSnapshot } from './liveMarketRegime';
import type { AuthorityStage } from '../contracts/evidence/evidenceGraph';
import type { EvidenceDependencyFamily } from '../contracts/evidence/observationMetadata';

export type IntelligenceModelId = 'ADVANCED_MICROSTRUCTURE' | 'TREND_MOMENTUM' | 'SQUEEZE_BREAKOUT' | 'MEAN_REVERSION';

export interface IntelligenceModelVote {
  model: IntelligenceModelId;
  signal: TradeDirection | 'NONE';
  confidence: number;
  directionalScore: number;
  available: boolean;
  reasons: string[];
  dependencyFamily: EvidenceDependencyFamily;
  lineageIds: string[];
}

export interface LiveSignalEnsembleResult {
  version: 'live_intelligence_ensemble_v2';
  direction: TradeDirection;
  status: 'ACCEPTED' | 'REJECTED';
  score: number;
  confidence: number;
  modelAgreement: number;
  regime: LiveMarketRegimeSnapshot;
  votes: IntelligenceModelVote[];
  rescuedAdvancedGate: boolean;
  hardRejectReason: string | null;
  reasonCode: 'ENSEMBLE_ACCEPTED' | 'ENSEMBLE_RESCUE_ACCEPTED' | 'ENSEMBLE_CONFLICT' | 'ADVANCED_HARD_REJECT';
  reasonText: string;
  effectiveIndependentSupport: number;
  authorityStage: AuthorityStage;
  rescueProfileVersion: string | null;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clamp01 = (value: number) => clamp(value, 0, 1);

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let value = values.slice(0, period).reduce((sum, row) => sum + row, 0) / period;
  for (let index = period; index < values.length; index += 1) value = (values[index] - value) * k + value;
  return Number.isFinite(value) ? value : null;
}

function std(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function signedForDirection(raw: number, direction: TradeDirection): number {
  return direction === 'LONG' ? raw : -raw;
}

function trendVote(candles1h: Candle[], candles15m: Candle[] | undefined, direction: TradeDirection, regime: LiveMarketRegime): IntelligenceModelVote {
  if (candles1h.length < 30) return { model: 'TREND_MOMENTUM', signal: 'NONE', confidence: 0, directionalScore: 0, available: false, reasons: ['Insufficient 1h history.'], dependencyFamily: 'PRICE_CANDLES', lineageIds: [] };
  const closes = candles1h.slice(-60).map((row) => row.close);
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  if (fast == null || slow == null || closes.at(-1)! <= 0) return { model: 'TREND_MOMENTUM', signal: 'NONE', confidence: 0, directionalScore: 0, available: false, reasons: ['EMA trend state unavailable.'], dependencyFamily: 'PRICE_CANDLES', lineageIds: [] };
  const spread = (fast - slow) / closes.at(-1)!;
  const lookback = Math.min(20, closes.length - 1);
  const momentum = lookback > 0 ? (closes.at(-1)! / closes[closes.length - 1 - lookback]) - 1 : 0;
  let intraday = 0;
  if ((candles15m?.length ?? 0) >= 12) {
    const c15 = candles15m!.slice(-24).map((row) => row.close);
    intraday = c15.at(-1)! / c15[0] - 1;
  }
  const raw = clamp(spread * 55 + momentum * 7 + intraday * 5, -1, 1);
  const directionalScore = signedForDirection(raw, direction);
  const signal: TradeDirection | 'NONE' = raw > 0.16 ? 'LONG' : raw < -0.16 ? 'SHORT' : 'NONE';
  const regimeBoost = (regime === 'TREND_UP' || regime === 'TREND_DOWN') ? 0.15 : regime === 'RANGE' ? -0.10 : 0;
  const confidence = clamp01(Math.abs(raw) + regimeBoost);
  return {
    model: 'TREND_MOMENTUM', signal, confidence, directionalScore, available: true,
    reasons: [`EMA spread ${(spread * 100).toFixed(2)}%, 20-bar momentum ${(momentum * 100).toFixed(2)}%, intraday ${(intraday * 100).toFixed(2)}%.`],
    dependencyFamily: 'PRICE_CANDLES', lineageIds: ['candles:1h', ...(candles15m?.length ? ['candles:15m'] : [])],
  };
}

function squeezeVote(candles: Candle[], direction: TradeDirection, regime: LiveMarketRegime): IntelligenceModelVote {
  if (candles.length < 30) return { model: 'SQUEEZE_BREAKOUT', signal: 'NONE', confidence: 0, directionalScore: 0, available: false, reasons: ['Insufficient candles for compression breakout model.'], dependencyFamily: 'PRICE_CANDLES', lineageIds: [] };
  const sample = candles.slice(-30);
  const prior = sample.slice(-21, -1);
  const last = sample.at(-1)!;
  const priorHigh = Math.max(...prior.map((row) => row.high));
  const priorLow = Math.min(...prior.map((row) => row.low));
  const priorRanges = prior.map((row) => Math.max(1e-9, row.high - row.low));
  const recentRanges = priorRanges.slice(-6);
  const baselineRange = priorRanges.reduce((sum, value) => sum + value, 0) / priorRanges.length;
  const recentRange = recentRanges.reduce((sum, value) => sum + value, 0) / recentRanges.length;
  const compression = baselineRange > 0 ? recentRange / baselineRange : 1;
  const priorVolumes = prior.map((row) => Math.max(0, row.volume));
  const avgVolume = priorVolumes.reduce((sum, value) => sum + value, 0) / Math.max(1, priorVolumes.length);
  const volumeExpansion = avgVolume > 0 ? last.volume / avgVolume : 1;
  const breakoutUp = last.close > priorHigh;
  const breakoutDown = last.close < priorLow;
  const proximityUp = priorHigh > 0 ? (last.close - priorHigh) / priorHigh : 0;
  const proximityDown = priorLow > 0 ? (priorLow - last.close) / priorLow : 0;
  let raw = 0;
  if (breakoutUp) raw = clamp(0.55 + Math.max(0, 1 - compression) * 0.25 + Math.max(0, volumeExpansion - 1) * 0.12 + proximityUp * 20, 0, 1);
  if (breakoutDown) raw = -clamp(0.55 + Math.max(0, 1 - compression) * 0.25 + Math.max(0, volumeExpansion - 1) * 0.12 + proximityDown * 20, 0, 1);
  const directionalScore = signedForDirection(raw, direction);
  const signal: TradeDirection | 'NONE' = raw > 0.3 ? 'LONG' : raw < -0.3 ? 'SHORT' : 'NONE';
  const regimeBoost = regime === 'HIGH_VOLATILITY' || regime === 'TRANSITION' ? 0.08 : 0;
  return {
    model: 'SQUEEZE_BREAKOUT', signal, confidence: clamp01(Math.abs(raw) + regimeBoost), directionalScore, available: true,
    reasons: [`Compression ratio ${compression.toFixed(2)}x, volume expansion ${volumeExpansion.toFixed(2)}x, breakout ${breakoutUp ? 'UP' : breakoutDown ? 'DOWN' : 'NONE'}.`],
    dependencyFamily: 'PRICE_CANDLES', lineageIds: ['candles:squeeze-source'],
  };
}

function meanReversionVote(candles: Candle[], direction: TradeDirection, regime: LiveMarketRegime, microstructureLean: number): IntelligenceModelVote {
  if (candles.length < 24) return { model: 'MEAN_REVERSION', signal: 'NONE', confidence: 0, directionalScore: 0, available: false, reasons: ['Insufficient history for mean reversion.'], dependencyFamily: 'PRICE_CANDLES', lineageIds: [] };
  const closes = candles.slice(-24).map((row) => row.close);
  const window = closes.slice(-20);
  const mean = window.reduce((sum, value) => sum + value, 0) / window.length;
  const sigma = std(window) ?? 0;
  if (!(sigma > 0)) return { model: 'MEAN_REVERSION', signal: 'NONE', confidence: 0, directionalScore: 0, available: false, reasons: ['Zero dispersion prevents z-score evaluation.'], dependencyFamily: 'PRICE_CANDLES', lineageIds: [] };
  const z = (window.at(-1)! - mean) / sigma;
  let raw = 0;
  if (regime === 'RANGE' || regime === 'TRANSITION') {
    raw = clamp(-z / 2.5 + clamp(microstructureLean, -0.35, 0.35) * 0.35, -1, 1);
  }
  const signal: TradeDirection | 'NONE' = raw > 0.38 ? 'LONG' : raw < -0.38 ? 'SHORT' : 'NONE';
  return {
    model: 'MEAN_REVERSION', signal, confidence: clamp01(Math.abs(raw) * (regime === 'RANGE' ? 1 : 0.75)),
    directionalScore: signedForDirection(raw, direction), available: true,
    reasons: [`20-bar z-score ${z.toFixed(2)} in ${regime} regime; microstructure lean ${microstructureLean.toFixed(2)}.`],
    dependencyFamily: 'PRICE_CANDLES', lineageIds: ['candles:1h'],
  };
}

const HARD_ADVANCED_REJECTIONS = new Set([
  'SNAPSHOT_UNAVAILABLE', 'HIGH_SQUEEZE_RISK', 'LOW_LIQUIDITY_QUALITY',
  'WEAK_MICROSTRUCTURE_CONFIRMATION', 'SMC_CONTEXT_AGAINST_SHORT', 'SMC_CONTEXT_AGAINST_LONG', 'NO_SMC_CONFIRMATION',
]);

const DIRECTIONAL_ADVANCED_REJECTIONS = new Set([
  'GATE_OBI_FAILED', 'GATE_VOLUME_FAILED', 'GATE_QSTRUCT_FAILED', 'GATES_FAILED', 'NO_DIRECTION_FOR_BIAS', 'LOW_CONFIDENCE',
]);

function weightsFor(regime: LiveMarketRegime): Record<IntelligenceModelId, number> {
  if (regime === 'RANGE') return { ADVANCED_MICROSTRUCTURE: 0.40, TREND_MOMENTUM: 0.10, SQUEEZE_BREAKOUT: 0.15, MEAN_REVERSION: 0.35 };
  if (regime === 'HIGH_VOLATILITY') return { ADVANCED_MICROSTRUCTURE: 0.45, TREND_MOMENTUM: 0.15, SQUEEZE_BREAKOUT: 0.35, MEAN_REVERSION: 0.05 };
  if (regime === 'TREND_UP' || regime === 'TREND_DOWN') return { ADVANCED_MICROSTRUCTURE: 0.45, TREND_MOMENTUM: 0.30, SQUEEZE_BREAKOUT: 0.20, MEAN_REVERSION: 0.05 };
  if (regime === 'TRANSITION') return { ADVANCED_MICROSTRUCTURE: 0.55, TREND_MOMENTUM: 0.20, SQUEEZE_BREAKOUT: 0.15, MEAN_REVERSION: 0.10 };
  return { ADVANCED_MICROSTRUCTURE: 0.65, TREND_MOMENTUM: 0.15, SQUEEZE_BREAKOUT: 0.10, MEAN_REVERSION: 0.10 };
}

export function evaluateLiveSignalEnsemble(args: {
  direction: TradeDirection;
  candles1h: Candle[];
  candles15m?: Candle[];
  candles4h?: Candle[];
  advanced?: ShadowDecisionSummary;
  authorityStage?: AuthorityStage;
  rescueProfile?: { version: string; sealedHoldoutValidated: true; paperForwardValidated: true };
}): LiveSignalEnsembleResult {
  const authorityStage = args.authorityStage ?? 'SIGNAL_ELIGIBLE';
  const regime = detectLiveMarketRegime(args.candles1h, args.candles4h);
  const advanced = args.advanced;
  const advancedRaw = advanced?.status === 'ACCEPTED' && advanced.direction === args.direction
    ? Math.max(0.2, advanced.confidence ?? 0)
    : advanced?.direction && advanced.direction !== 'NONE' && advanced.direction !== args.direction
      ? -Math.max(0.2, advanced.confidence ?? 0.4)
      : 0;
  const advancedVote: IntelligenceModelVote = {
    model: 'ADVANCED_MICROSTRUCTURE',
    signal: advanced?.status === 'ACCEPTED' && advanced.direction !== 'NONE' ? advanced.direction : 'NONE',
    confidence: advanced?.confidence ?? 0,
    directionalScore: advancedRaw,
    available: Boolean(advanced),
    reasons: [advanced?.reasonText ?? 'Advanced microstructure result unavailable.'],
    dependencyFamily: 'L2_ORDERBOOK',
    lineageIds: ['advanced:microstructure'],
  };
  const microLean = clamp(((advanced?.qStructDirectional ?? 0) + (advanced?.gatesSnapshot?.smoothedObi ?? 0)) / 2, -1, 1);
  const votes: IntelligenceModelVote[] = [
    advancedVote,
    trendVote(args.candles1h, args.candles15m, args.direction, regime.regime),
    squeezeVote(args.candles15m?.length ? args.candles15m : args.candles1h, args.direction, regime.regime),
    meanReversionVote(args.candles1h, args.direction, regime.regime, microLean),
  ];
  const weights = weightsFor(regime.regime);
  const available = votes.filter((vote) => vote.available);
  const familyTotals = new Map<EvidenceDependencyFamily, number>();
  const familyBudgets = new Map<EvidenceDependencyFamily, number>();
  for (const vote of available) {
    familyTotals.set(vote.dependencyFamily, (familyTotals.get(vote.dependencyFamily) ?? 0) + weights[vote.model]);
    familyBudgets.set(vote.dependencyFamily, Math.max(familyBudgets.get(vote.dependencyFamily) ?? 0, weights[vote.model]));
  }
  const adjustedWeight = (vote: IntelligenceModelVote) => {
    const total = familyTotals.get(vote.dependencyFamily) ?? weights[vote.model];
    const budget = familyBudgets.get(vote.dependencyFamily) ?? weights[vote.model];
    return weights[vote.model] * (total > budget && total > 0 ? budget / total : 1);
  };
  const weightTotal = available.reduce((sum, vote) => sum + adjustedWeight(vote), 0) || 1;
  const signed = available.reduce((sum, vote) => sum + vote.directionalScore * adjustedWeight(vote), 0) / weightTotal;
  const score = clamp01(0.5 + signed * 0.5);
  const supporting = available.filter((vote) => vote.directionalScore >= 0.25);
  const opposing = available.filter((vote) => vote.directionalScore <= -0.25);
  const supportingFamilies = new Set(supporting.map((vote) => vote.dependencyFamily));
  const opposingFamilies = new Set(opposing.map((vote) => vote.dependencyFamily));
  const decisiveFamilies = new Set([...supportingFamilies, ...opposingFamilies]);
  const modelAgreement = decisiveFamilies.size ? supportingFamilies.size / decisiveFamilies.size : 0.5;
  // A rejected/neutral advanced vote is not in `supporting`, so no model-name
  // exclusion is necessary. Independence is the number of distinct causal
  // dependency families actually supporting this decision.
  const effectiveIndependentSupport = supportingFamilies.size;
  const hardRejectReason = advanced && advanced.status === 'REJECTED' && HARD_ADVANCED_REJECTIONS.has(advanced.reasonCode)
    ? advanced.reasonCode : null;
  const advancedAccepted = advanced?.status === 'ACCEPTED' && advanced.direction === args.direction;
  const advancedDirectionalReject = Boolean(advanced && advanced.status === 'REJECTED' && DIRECTIONAL_ADVANCED_REJECTIONS.has(advanced.reasonCode));
  const rescueResearchOnly = authorityStage === 'SHADOW' || authorityStage === 'PAPER_FORWARD';
  const validatedRescueProfile = args.rescueProfile?.sealedHoldoutValidated === true && args.rescueProfile?.paperForwardValidated === true;
  const rescueAuthorized = rescueResearchOnly || validatedRescueProfile;
  const rescuedAdvancedGate = rescueAuthorized && !hardRejectReason && !advancedAccepted && advancedDirectionalReject
    && regime.regime !== 'UNKNOWN' && effectiveIndependentSupport >= 2 && modelAgreement >= 0.66 && score >= 0.68;
  const accepted = !hardRejectReason && (advancedAccepted ? score >= 0.52 && modelAgreement >= 0.45 : rescuedAdvancedGate);
  const confidence = clamp01(score * 0.65 + modelAgreement * 0.20 + regime.confidence * 0.15);

  if (hardRejectReason) {
    return {
      version: 'live_intelligence_ensemble_v2', direction: args.direction, status: 'REJECTED', score, confidence,
      modelAgreement, regime, votes, rescuedAdvancedGate: false, hardRejectReason,
      reasonCode: 'ADVANCED_HARD_REJECT', reasonText: `Advanced safety-quality rejection ${hardRejectReason} remains authoritative; ensemble cannot override it.`,
      effectiveIndependentSupport, authorityStage, rescueProfileVersion: args.rescueProfile?.version ?? null,
    };
  }
  if (accepted) {
    return {
      version: 'live_intelligence_ensemble_v2', direction: args.direction, status: 'ACCEPTED', score, confidence,
      modelAgreement, regime, votes, rescuedAdvancedGate, hardRejectReason: null,
      reasonCode: rescuedAdvancedGate ? 'ENSEMBLE_RESCUE_ACCEPTED' : 'ENSEMBLE_ACCEPTED',
      reasonText: rescuedAdvancedGate
        ? `Dependency-distinct evidence confirmed ${args.direction} after a directional microstructure gate miss (${effectiveIndependentSupport} independent families, ${(modelAgreement * 100).toFixed(0)}% agreement).`
        : `Advanced microstructure and regime-aware ensemble support ${args.direction} with ${(modelAgreement * 100).toFixed(0)}% model agreement.`,
      effectiveIndependentSupport, authorityStage, rescueProfileVersion: args.rescueProfile?.version ?? null,
    };
  }
  return {
    version: 'live_intelligence_ensemble_v2', direction: args.direction, status: 'REJECTED', score, confidence,
    modelAgreement, regime, votes, rescuedAdvancedGate: false, hardRejectReason: null,
    reasonCode: 'ENSEMBLE_CONFLICT',
    reasonText: `Regime-aware models did not reach independent agreement for ${args.direction} (score ${(score * 100).toFixed(0)}, agreement ${(modelAgreement * 100).toFixed(0)}%).`,
    effectiveIndependentSupport, authorityStage, rescueProfileVersion: args.rescueProfile?.version ?? null,
  };
}
