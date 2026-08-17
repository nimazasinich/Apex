// src/services/scannerCore.ts
// Copied from apex-trading-engine/src/services/scannerCore.ts.
// Only change from the original: the import below now points at
// './mathEngine' (this project's ported copy) instead of './marketData'
// (apex-trading-engine's live-polling monolith, not ported here — see
// mathEngine.ts header for why).
import { MathEngine, clampHeuristicAdjustment } from './mathEngine';
import { smcAlignmentForDirection } from './smartMoneyContextEngine';
import { effectiveQStructThreshold } from './scannerConfigPolicy';
import {
  BinanceSentiment,
  OITrendDirection,
  RankedContract,
  ScannerConfig,
  SignalDecisionReasonCode,
  SignalDecisionStatus,
  SmartMoneyContext,
} from '../types';

export interface ScanEvaluation {
  direction: 'SHORT' | 'LONG';
  confidence: number;
  rawScore: number;
  qStructDirectional?: number;
  atrExpansionScore?: number;
  fundingBiasScore?: number;
  oiChangePercent?: number;
  microPriceSkewScore?: number;
  liquidityQualityScore?: number;
  squeezeRiskScore?: number;
  evidenceAgreementScore?: number;
  smcDirectionalScore?: number;
  smcContextScore?: number;
  smcSetupModel?: SmartMoneyContext['setupModel'];
  smartMoneyContext?: SmartMoneyContext;
  scoringBreakdown?: ReturnType<typeof MathEngine.calculateDirectionalRawScore>['breakdown'];
}

export interface ScanGateSnapshot {
  shortObi: boolean;
  shortVolume: boolean;
  shortQStruct: boolean;
  longObi: boolean;
  longVolume: boolean;
  longQStruct: boolean;
  obiThreshold: number;
  volumeThreshold: number;
  qStructThreshold: number;
  smoothedObi: number;
  smoothedVolDelta: number;
  qStructDirectional: number;
}

export interface ScanDecisionTrace {
  status: SignalDecisionStatus;
  reasonCode: SignalDecisionReasonCode;
  reasonText: string;
  direction: 'SHORT' | 'LONG' | 'NONE';
  evaluation?: ScanEvaluation;
  gatesSnapshot: ScanGateSnapshot;
}

export interface ScanSlice {
  slice: RankedContract[];
  nextCursor: number;
}

export function selectScanSlice(
  eligible: RankedContract[],
  cursor: number,
  batchSize: number,
  active: Set<string>
): ScanSlice {
  const n = eligible.length;
  if (n === 0 || batchSize <= 0) return { slice: [], nextCursor: 0 };

  const start = ((cursor % n) + n) % n;
  const slice: RankedContract[] = [];
  let i = 0;
  for (; i < n && slice.length < batchSize; i++) {
    const c = eligible[(start + i) % n];
    if (!active.has(c.ticker)) slice.push(c);
  }
  return { slice, nextCursor: (start + Math.max(i, batchSize)) % n };
}

function gateReason(g: ScanGateSnapshot, bias: ScannerConfig['directionBias'], direction?: 'SHORT' | 'LONG'): Pick<ScanDecisionTrace, 'reasonCode' | 'reasonText'> {
  const label = direction === 'LONG' ? 'LONG' : direction === 'SHORT' ? 'SHORT' : 'directional';
  if (bias === 'SHORT_ONLY' || direction === 'SHORT') {
    if (!g.shortObi) return { reasonCode: 'GATE_OBI_FAILED', reasonText: `OBI ${g.smoothedObi.toFixed(3)} is not below ${g.obiThreshold.toFixed(3)}.` };
    if (!g.shortVolume) return { reasonCode: 'GATE_VOLUME_FAILED', reasonText: `Net volume delta ${g.smoothedVolDelta.toFixed(2)} is not below ${g.volumeThreshold.toFixed(2)}.` };
    if (!g.shortQStruct) return { reasonCode: 'GATE_QSTRUCT_FAILED', reasonText: `Directional QStruct ${g.qStructDirectional.toFixed(3)} is not below ${g.qStructThreshold.toFixed(3)}.` };
    return { reasonCode: 'GATES_FAILED', reasonText: `${label} gates did not align.` };
  }
  if (bias === 'LONG_ONLY' || direction === 'LONG') {
    if (!g.longObi) return { reasonCode: 'GATE_OBI_FAILED', reasonText: `OBI ${g.smoothedObi.toFixed(3)} is not above ${Math.abs(g.obiThreshold).toFixed(3)}.` };
    if (!g.longVolume) return { reasonCode: 'GATE_VOLUME_FAILED', reasonText: `Net volume delta ${g.smoothedVolDelta.toFixed(2)} is not above ${Math.abs(g.volumeThreshold).toFixed(2)}.` };
    if (!g.longQStruct) return { reasonCode: 'GATE_QSTRUCT_FAILED', reasonText: `Directional QStruct ${g.qStructDirectional.toFixed(3)} is not above ${Math.abs(g.qStructThreshold).toFixed(3)}.` };
    return { reasonCode: 'GATES_FAILED', reasonText: `${label} gates did not align.` };
  }
  return { reasonCode: 'NO_DIRECTION_FOR_BIAS', reasonText: 'Neither SHORT nor LONG gates aligned strongly enough for the current BOTH-direction mode.' };
}

function directionConfidencePreview(args: Parameters<typeof evaluateScanDecision>[0], direction: 'SHORT' | 'LONG'): number {
  const score = MathEngine.calculateDirectionalRawScore({
    direction,
    obi: args.smoothedObi,
    qStructDirectional: args.qStructDirectional,
    netVolumeDelta: args.smoothedVolDelta,
    volumeThresholdAbs: Math.max(1, Math.abs(args.cfg.volumeThreshold || 1)),
    fundingRate: args.fundingRate,
    fundingThreshold: args.cfg.fundingThreshold ?? 0.0001,
    oiChangePercent: args.oiChangePercent,
    oiExpansionThresholdPct: args.cfg.oiExpansionThresholdPct ?? 0.30,
    atr: args.atr,
    price: args.price,
    atrExpansionThreshold: args.cfg.atrExpansionThreshold ?? 0.005,
    microPrice: args.microPrice,
    spread: args.spread,
    smcDirectionalScore: args.smartMoneyContext?.smcDirectionalScore ?? 0,
    weights: args.cfg.scoreWeights,
  });
  const liquidityQuality = MathEngine.liquidityQualityScore(args.spread, args.atr, args.price);
  const evidenceAgreement = MathEngine.evidenceAgreementScore(score.breakdown);
  const squeezeRisk = MathEngine.squeezeRiskScore({
    direction,
    fundingRate: args.fundingRate,
    fundingThreshold: args.cfg.fundingThreshold ?? 0.0001,
    sentiment: args.sentiment,
    oiChangePercent: args.oiChangePercent,
    qStructDirectional: args.qStructDirectional,
    liquidityQuality,
  });
  return MathEngine.calculateAdvancedConfidence({ rawScore: score.rawScore, liquidityQuality, evidenceAgreement, squeezeRisk });
}

export function evaluateScanDecision(args: {
  smoothedObi: number;
  smoothedVolDelta: number;
  qStructDirectional: number;
  price: number;
  atr: number;
  microPrice: number;
  spread: number;
  fundingRate: number;
  sentiment: BinanceSentiment | null;
  oiTrend?: OITrendDirection;
  oiChangePercent?: number;
  smartMoneyContext?: SmartMoneyContext;
  cfg: Pick<ScannerConfig,
    'obiThreshold' | 'volumeThreshold' | 'qStructThreshold' | 'fundingThreshold' |
    'oiExpansionThresholdPct' | 'atrExpansionThreshold' | 'maxSqueezeRisk' |
    'minEvidenceAgreement' | 'minSmartMoneyScore' | 'smcHardRejectThreshold' | 'scoreWeights' | 'directionBias' | 'minConfidence'>;
  heuristicAdj: number;
}): ScanDecisionTrace {
  const { smoothedObi, smoothedVolDelta, qStructDirectional, price, atr, microPrice, spread, fundingRate, sentiment, oiTrend, oiChangePercent, smartMoneyContext, cfg, heuristicAdj } = args;

  const obiThreshold = cfg.obiThreshold ?? -0.15;
  const volumeThreshold = cfg.volumeThreshold ?? 0;
  const qStructThreshold = effectiveQStructThreshold(cfg);

  const gatesSnapshot: ScanGateSnapshot = {
    shortObi: smoothedObi < obiThreshold,
    shortVolume: smoothedVolDelta < volumeThreshold,
    shortQStruct: qStructDirectional < qStructThreshold,
    longObi: smoothedObi > Math.abs(obiThreshold),
    longVolume: smoothedVolDelta > Math.abs(volumeThreshold),
    longQStruct: qStructDirectional > Math.abs(qStructThreshold),
    obiThreshold,
    volumeThreshold,
    qStructThreshold,
    smoothedObi,
    smoothedVolDelta,
    qStructDirectional,
  };

  const shortGates = gatesSnapshot.shortObi && gatesSnapshot.shortVolume && gatesSnapshot.shortQStruct;
  const longGates = gatesSnapshot.longObi && gatesSnapshot.longVolume && gatesSnapshot.longQStruct;

  let direction: 'SHORT' | 'LONG' | null = null;
  if (cfg.directionBias === 'SHORT_ONLY') {
    direction = shortGates ? 'SHORT' : null;
  } else if (cfg.directionBias === 'LONG_ONLY') {
    direction = longGates ? 'LONG' : null;
  } else {
    if (shortGates && longGates) {
      const shortPreview = directionConfidencePreview(args, 'SHORT');
      const longPreview = directionConfidencePreview(args, 'LONG');
      direction = longPreview > shortPreview ? 'LONG' : 'SHORT';
    } else if (shortGates) {
      direction = 'SHORT';
    } else if (longGates) {
      direction = 'LONG';
    }
  }

  if (!direction) {
    const reason = gateReason(gatesSnapshot, cfg.directionBias);
    return { status: 'REJECTED', direction: 'NONE', gatesSnapshot, ...reason };
  }

  const score = MathEngine.calculateDirectionalRawScore({
    direction,
    obi: smoothedObi,
    qStructDirectional,
    netVolumeDelta: smoothedVolDelta,
    volumeThresholdAbs: Math.max(1, Math.abs(volumeThreshold || 1)),
    fundingRate,
    fundingThreshold: cfg.fundingThreshold ?? 0.0001,
    oiChangePercent,
    oiExpansionThresholdPct: cfg.oiExpansionThresholdPct ?? 0.30,
    atr,
    price,
    atrExpansionThreshold: cfg.atrExpansionThreshold ?? 0.005,
    microPrice,
    spread,
    smcDirectionalScore: smartMoneyContext?.smcDirectionalScore ?? 0,
    weights: cfg.scoreWeights,
  });

  const liquidityQuality = MathEngine.liquidityQualityScore(spread, atr, price);
  const evidenceAgreement = MathEngine.evidenceAgreementScore(score.breakdown);
  const squeezeRisk = MathEngine.squeezeRiskScore({
    direction,
    fundingRate,
    fundingThreshold: cfg.fundingThreshold ?? 0.0001,
    sentiment,
    oiChangePercent,
    qStructDirectional,
    liquidityQuality,
  });

  const atrExpansionScore = MathEngine.atrExpansionScore(atr, price, cfg.atrExpansionThreshold ?? 0.005);
  const fundingBiasScore = MathEngine.fundingBiasScore(fundingRate, cfg.fundingThreshold ?? 0.0001);
  const microPriceSkewScore = MathEngine.microPriceSkewScore(microPrice, price, spread);
  const rawScore = score.rawScore;

  const smcContextAligned = smartMoneyContext
    ? smcAlignmentForDirection(smartMoneyContext.smcDirectionalScore ?? 0, direction)
    : null;

  const sentimentForDir = (sentiment && direction === 'LONG')
    ? { ...sentiment, longShortRatio: sentiment.longShortRatio !== 0 ? 1 / sentiment.longShortRatio : 1 }
    : sentiment;
  const sentimentMult = Math.sqrt(MathEngine.sentimentBiasMultiplier(sentimentForDir));
  const oiWarmupMult = Number.isFinite(oiChangePercent as number) ? 1.0 : MathEngine.oiTrendMultiplier(oiTrend);
  const confidence = Math.max(0.01, Math.min(0.99,
    MathEngine.calculateAdvancedConfidence({ rawScore, liquidityQuality, evidenceAgreement, squeezeRisk }) * sentimentMult * oiWarmupMult + clampHeuristicAdjustment(heuristicAdj)));

  const evaluation: ScanEvaluation = {
    direction,
    confidence,
    rawScore,
    qStructDirectional,
    atrExpansionScore,
    fundingBiasScore,
    oiChangePercent: Number.isFinite(oiChangePercent as number) ? (oiChangePercent as number) : 0,
    microPriceSkewScore,
    liquidityQualityScore: liquidityQuality,
    squeezeRiskScore: squeezeRisk,
    evidenceAgreementScore: evidenceAgreement,
    smcDirectionalScore: smartMoneyContext?.smcDirectionalScore ?? 0,
    smcContextScore: smcContextAligned ?? undefined,
    smcSetupModel: smartMoneyContext?.setupModel,
    smartMoneyContext,
    scoringBreakdown: score.breakdown,
  };

  const minExecutableLiquidity = 0.80;
  const conditionalLiquidityFloor = 0.86;
  if (liquidityQuality < minExecutableLiquidity || (liquidityQuality < conditionalLiquidityFloor && squeezeRisk > 0.42)) {
    return {
      status: 'REJECTED', direction, evaluation, gatesSnapshot,
      reasonCode: 'LOW_LIQUIDITY_QUALITY',
      reasonText: `Liquidity quality ${(liquidityQuality * 100).toFixed(0)}% is too weak for reliable ${direction} execution.`,
    };
  }

  if (direction === 'SHORT' && microPriceSkewScore > 0.06 && evidenceAgreement < 0.82) {
    return {
      status: 'REJECTED', direction, evaluation, gatesSnapshot,
      reasonCode: 'WEAK_MICROSTRUCTURE_CONFIRMATION',
      reasonText: `Micro-price skew ${microPriceSkewScore.toFixed(2)} is leaning against the short without enough evidence agreement.`,
    };
  }
  if (direction === 'LONG' && microPriceSkewScore < -0.06 && evidenceAgreement < 0.82) {
    return {
      status: 'REJECTED', direction, evaluation, gatesSnapshot,
      reasonCode: 'WEAK_MICROSTRUCTURE_CONFIRMATION',
      reasonText: `Micro-price skew ${microPriceSkewScore.toFixed(2)} is leaning against the long without enough evidence agreement.`,
    };
  }

  const minSmc = cfg.minSmartMoneyScore ?? 0.52;
  const smcOpposition = cfg.smcHardRejectThreshold ?? 0.22;
  const smcScore = smcContextAligned;
  const smcDirectional = smartMoneyContext?.smcDirectionalScore ?? 0;
  if (smartMoneyContext && direction === 'SHORT' && smcDirectional > smcOpposition && evidenceAgreement < 0.86) {
    return {
      status: 'REJECTED', direction, evaluation, gatesSnapshot,
      reasonCode: 'SMC_CONTEXT_AGAINST_SHORT',
      reasonText: `Smart Money context is demand-side/bullish (${smcDirectional.toFixed(2)}) and does not support a short.`,
    };
  }
  if (smartMoneyContext && direction === 'LONG' && smcDirectional < -smcOpposition && evidenceAgreement < 0.86) {
    return {
      status: 'REJECTED', direction, evaluation, gatesSnapshot,
      reasonCode: 'SMC_CONTEXT_AGAINST_LONG',
      reasonText: `Smart Money context is supply-side/bearish (${smcDirectional.toFixed(2)}) and does not support a long.`,
    };
  }
  if (smartMoneyContext && smartMoneyContext.setupModel === 'NONE' && smcScore != null && smcScore < minSmc && confidence < 0.88) {
    return {
      status: 'REJECTED', direction, evaluation, gatesSnapshot,
      reasonCode: 'NO_SMC_CONFIRMATION',
      reasonText: `SMC alignment ${(smcScore * 100).toFixed(0)}% is below the fast-horizon floor and no Flip/CHoCH/Continuation setup is present.`,
    };
  }

  if (squeezeRisk > (cfg.maxSqueezeRisk ?? 0.70)) {
    return {
      status: 'REJECTED', direction, evaluation, gatesSnapshot,
      reasonCode: 'HIGH_SQUEEZE_RISK',
      reasonText: `Squeeze/trap risk ${(squeezeRisk * 100).toFixed(0)}% exceeds max ${(cfg.maxSqueezeRisk ?? 0.70) * 100}%.`,
    };
  }
  if (evidenceAgreement < (cfg.minEvidenceAgreement ?? 0.50)) {
    return {
      status: 'REJECTED', direction, evaluation, gatesSnapshot,
      reasonCode: 'LOW_EVIDENCE_AGREEMENT',
      reasonText: `Evidence agreement ${(evidenceAgreement * 100).toFixed(0)}% is below minimum ${((cfg.minEvidenceAgreement ?? 0.50) * 100).toFixed(0)}%.`,
    };
  }
  if (confidence < (cfg.minConfidence ?? 0.70)) {
    return {
      status: 'REJECTED', direction, evaluation, gatesSnapshot,
      reasonCode: 'LOW_CONFIDENCE',
      reasonText: `Final confidence ${(confidence * 100).toFixed(0)}% is below floor ${((cfg.minConfidence ?? 0.70) * 100).toFixed(0)}%.`,
    };
  }

  return {
    status: 'ACCEPTED', direction, evaluation, gatesSnapshot,
    reasonCode: 'ACCEPTED_BEST_CANDIDATE',
    reasonText: 'Candidate survived directional gates, confidence floor, evidence agreement and squeeze-risk guard.',
  };
}

export function evaluateScanCandidate(args: {
  smoothedObi: number;
  smoothedVolDelta: number;
  qStructDirectional: number;
  price: number;
  atr: number;
  microPrice: number;
  spread: number;
  fundingRate: number;
  sentiment: BinanceSentiment | null;
  oiTrend?: OITrendDirection;
  oiChangePercent?: number;
  smartMoneyContext?: SmartMoneyContext;
  cfg: Pick<ScannerConfig,
    'obiThreshold' | 'volumeThreshold' | 'qStructThreshold' | 'fundingThreshold' |
    'oiExpansionThresholdPct' | 'atrExpansionThreshold' | 'maxSqueezeRisk' |
    'minEvidenceAgreement' | 'minSmartMoneyScore' | 'smcHardRejectThreshold' | 'scoreWeights' | 'directionBias'>;
  heuristicAdj: number;
}): ScanEvaluation | null {
  const decision = evaluateScanDecision({
    ...args,
    cfg: { ...args.cfg, minConfidence: 0.01 },
  });
  return decision.status === 'ACCEPTED' ? decision.evaluation ?? null : null;
}

export interface RankedCandidate<T> {
  item: T;
  evaluation: ScanEvaluation;
}

export function pickBestCandidate<T>(candidates: RankedCandidate<T>[]): RankedCandidate<T> | null {
  if (!candidates.length) return null;
  return candidates.reduce((best, c) =>
    c.evaluation.confidence > best.evaluation.confidence ? c : best
  );
}
