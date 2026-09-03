/**
 * Converts canonical decision snapshots into SignalDecisionLog rows for audit and parity analysis.
 * Logs the canonical authority decision while retaining baseline-vs-advanced comparison evidence.
 */
import type {
  SignalDecisionLog,
  SignalDecisionReasonCode,
  SignalDecisionStatus,
  TradeDirection,
} from '../types';
import type { DecisionSnapshot } from './canonicalDecisionAdapter';
import { DECISION_ADAPTER_VERSION } from './canonicalDecisionAdapter';
import { auditSmcFeatureDuplication, inspectMlFeatureCompleteness, ML_FEATURE_VERSION } from './mlFeatureExtractor';

export interface ShadowComparisonSummary {
  agreement: boolean;
  baselineAccepted: boolean;
  shadowAccepted: boolean;
  baselineScore: number;
  shadowConfidence: number | null;
  divergenceReason: string | null;
}

export function summarizeShadowComparison(snapshot: DecisionSnapshot): ShadowComparisonSummary {
  const baselineAccepted =
    snapshot.baseline.guardPass &&
    snapshot.baseline.readinessTier !== 'BLOCKED';
  const shadowAccepted = snapshot.shadow?.status === 'ACCEPTED';
  const agreement = baselineAccepted === shadowAccepted;
  let divergenceReason: string | null = null;
  if (!agreement) {
    if (baselineAccepted && !shadowAccepted) {
      divergenceReason = `Baseline accepted (${snapshot.baseline.readinessTier}) but shadow rejected: ${snapshot.shadow?.reasonCode ?? 'unknown'}`;
    } else if (!baselineAccepted && shadowAccepted) {
      divergenceReason = `Shadow accepted but baseline blocked: ${snapshot.baseline.guardReasons.join('; ') || snapshot.baseline.readinessTier}`;
    }
  }
  return {
    agreement,
    baselineAccepted,
    shadowAccepted,
    baselineScore: snapshot.baseline.score,
    shadowConfidence: snapshot.shadow?.confidence ?? null,
    divergenceReason,
  };
}

function canonicalDecisionStatus(snapshot: DecisionSnapshot): SignalDecisionStatus {
  return snapshot.direction === 'NO_TRADE' ? 'REJECTED' : 'ACCEPTED';
}

function canonicalReasonCode(snapshot: DecisionSnapshot): SignalDecisionReasonCode {
  if (!snapshot.decisionReasonCode || snapshot.decisionReasonCode === 'BASELINE_GUARD_BLOCKED') {
    if (snapshot.baseline.readinessTier === 'BLOCKED') return 'DATA_NOT_READY';
    if (snapshot.baseline.guardReasons.some((r) => r.includes('liquidity floor'))) return 'LOW_LIQUIDITY_QUALITY';
    return 'GATES_FAILED';
  }
  return snapshot.decisionReasonCode;
}

export function decisionSnapshotToLog(
  snapshot: DecisionSnapshot,
  direction: TradeDirection,
  cycleId: string,
): SignalDecisionLog {
  const comparison = summarizeShadowComparison(snapshot);
  const timestamp = snapshot.createdAt;
  const isoTime = new Date(timestamp).toISOString();
  const id = `${cycleId}-${snapshot.symbol}-${direction}-${timestamp}`;

  const log: SignalDecisionLog = {
    id,
    cycleId,
    timestamp,
    isoTime,
    ticker: snapshot.symbol,
    direction,
    decision: canonicalDecisionStatus(snapshot),
    reasonCode: canonicalReasonCode(snapshot),
    reasonText: snapshot.decisionReasonText ?? (snapshot.direction === 'NO_TRADE' ? 'Canonical decision blocked.' : 'Canonical decision accepted.'),
    confidence: snapshot.confidence,
    rawScore: snapshot.rankingScore / 100,
    qStructDirectional: snapshot.shadow?.qStructDirectional ?? undefined,
    squeezeRiskScore: snapshot.shadow?.squeezeRiskScore ?? undefined,
    evidenceAgreementScore: snapshot.shadow?.evidenceAgreementScore ?? undefined,
    liquidityQualityScore: snapshot.shadow?.liquidityQualityScore ?? undefined,
    microPriceSkewScore: snapshot.shadow?.microPriceSkewScore ?? undefined,
    fundingBiasScore: snapshot.shadow?.fundingBiasScore ?? undefined,
    oiChangePercent: snapshot.shadow?.oiChangePercent ?? undefined,
    atrExpansionScore: snapshot.shadow?.atrExpansionScore ?? undefined,
    scoringBreakdown: snapshot.shadow?.scoringBreakdown as Record<string, number> | undefined,
    gatesSnapshot: snapshot.shadow?.gatesSnapshot,
    configSnapshot: snapshot.effectiveConfig,
    price: snapshot.baseline.lastPrice,
    smartMoneyContext: snapshot.smartMoneyContext ?? undefined,
    smcDirectionalScore: snapshot.smartMoneyContext?.smcDirectionalScore,
    smcContextScore: snapshot.smartMoneyContext?.smcContextScore,
    smcSetupModel: snapshot.smartMoneyContext?.setupModel,
    marketRegime: snapshot.intelligence?.regime.regime,
    ensembleScore: snapshot.intelligence?.score,
    ensembleModelAgreement: snapshot.intelligence?.modelAgreement,
    parliamentMode: snapshot.parliamentContribution?.mode,
    parliamentEligibleIfPromoted: snapshot.parliamentContribution?.eligibleIfPromoted,
    parliamentCategoryConfluence: snapshot.parliamentContribution?.categoryConfluence,
    parliamentScore: snapshot.parliamentContribution?.score,
    parliamentConfidence: snapshot.parliamentContribution?.confidence,
    parliamentReasonCode: snapshot.parliamentContribution?.reasonCode,
    marketSnapshotSummary: {
      logKind: 'SHADOW_COMPARISON',
      engineVersion: snapshot.engineVersion || DECISION_ADAPTER_VERSION,
      price: snapshot.baseline.lastPrice,
      obi: snapshot.shadow?.marketInputs?.obi ?? null,
      netVolumeDelta: snapshot.shadow?.marketInputs?.volumeDelta ?? null,
      fundingRate: snapshot.shadow?.marketInputs?.fundingRate ?? null,
      spread: snapshot.shadow?.marketInputs?.spread ?? null,
      atr: snapshot.shadow?.marketInputs?.atr ?? null,
      microPrice: snapshot.shadow?.marketInputs?.microPrice ?? null,
      dataSource: snapshot.dataQuality === 'live' ? 'kucoin_live' : snapshot.dataQuality === 'unavailable' ? 'unavailable' : 'kucoin_live_binance_unavailable',
      mode: snapshot.mode,
      authoritativeEngine: snapshot.authority === 'REGIME_ENSEMBLE_PARLIAMENT' ? 'liveSignalEnsemble_plus_promoted_parliament' : snapshot.authority === 'REGIME_ENSEMBLE' ? 'liveSignalEnsemble_regime_aware' : 'baseline_scoreCandidate',
      shadowEngine: snapshot.authority === 'REGIME_ENSEMBLE_PARLIAMENT' ? 'scannerCore_plus_parliament_comparison' : snapshot.authority === 'REGIME_ENSEMBLE' ? 'scannerCore_plus_baseline_comparison' : 'scannerCore_evaluateScanDecision',
      comparison,
      baseline: {
        score: snapshot.baseline.score,
        readinessTier: snapshot.baseline.readinessTier,
        guardPass: snapshot.baseline.guardPass,
        guardReasons: snapshot.baseline.guardReasons,
        timeframeConfluenceState: snapshot.baseline.timeframeConfluenceState,
        featureQuality: snapshot.baseline.featureQuality,
      },
      shadow: snapshot.shadow ?? null,
      smcAvailability: snapshot.smcAvailability ?? null,
      configuredConfig: snapshot.configuredConfig ?? null,
      effectiveConfig: snapshot.effectiveConfig ?? null,
      configOverrides: snapshot.configOverrides ?? [],
      authority: snapshot.authority,
      decisionReasonCode: snapshot.decisionReasonCode,
      decisionReasonText: snapshot.decisionReasonText,
      safetyGuardReasons: snapshot.safetyGuardReasons ?? null,
      featureCompletenessPct: snapshot.featureCompletenessPct,
      decisionQualityConfidence: snapshot.confidence,
      calibratedProbability: snapshot.calibratedProbability,
      expectedNetEdge: snapshot.expectedNetEdge,
      modelUncertainty: snapshot.modelUncertainty,
      intelligence: snapshot.intelligence ?? null,
      calibration: snapshot.calibration ?? null,
      parliamentContribution: snapshot.parliamentContribution ?? null,
      supportingSignals: snapshot.supportingSignals,
      conflictingSignals: snapshot.conflictingSignals,
      expiresAt: snapshot.expiresAt,
    },
  };
  const mlCompleteness = inspectMlFeatureCompleteness(log);
  const smcFeatureAudit = auditSmcFeatureDuplication(log);
  log.marketSnapshotSummary = {
    ...(log.marketSnapshotSummary || {}),
    mlFeatureVersion: ML_FEATURE_VERSION,
    mlFeatureCompleteness: mlCompleteness,
    smcFeatureDuplicationAudit: smcFeatureAudit,
  };
  return log;
}

export function decisionSnapshotsToLogs(
  snapshots: Array<{ snapshot: DecisionSnapshot; direction: TradeDirection }>,
  cycleId: string,
): SignalDecisionLog[] {
  return snapshots.map(({ snapshot, direction }) => decisionSnapshotToLog(snapshot, direction, cycleId));
}
