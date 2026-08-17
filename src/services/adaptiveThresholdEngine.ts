/**
 * Controlled adaptive threshold tuning.
 *
 * This module learns only from persisted decision outcomes, applies small
 * bounded changes, normalizes scoring weights, and emits an audit record for
 * every applied adjustment. It never changes directionBias or thresholdMode.
 */
import type {
  AdaptiveMarketRegime,
  ScannerConfig,
  ScoringWeights,
  SignalDecisionLog,
  SignalDecisionReasonCode,
} from '../types';

export interface AdaptiveExperienceProfile {
  sampleSize: number;
  marketRegime: AdaptiveMarketRegime;
  confidenceInAdjustment: number;
  adjustmentConfidence: number;
  accepted: number;
  rejected: number;
  acceptanceRate: number;
  resolvedAccepted: number;
  winRate: number | null;
  avgPnl: number | null;
  recentResolvedAccepted: number;
  recentWinRate: number | null;
  recentAvgPnl: number | null;
  outcomeDrift: number;
  harmfulAcceptedLosses: number;
  missedWinners: number;
  savedLosses: number;
  falseSqueezeRejects: number;
  falseEvidenceRejects: number;
  falseConfidenceRejects: number;
  rejectionOutcomeByReason: Partial<Record<SignalDecisionReasonCode, { wins: number; losses: number }>>;
  averages: {
    squeezeRisk: number | null;
    evidenceAgreement: number | null;
    liquidityQuality: number | null;
    qStructDirectional: number | null;
  };
}

export interface AdaptiveThresholdChange {
  field: string;
  before: number;
  after: number;
  delta: number;
  reason: string;
}

export interface AdaptiveThresholdAuditLog {
  version: 1;
  timestamp: number;
  isoTime: string;
  mode: ScannerConfig['thresholdMode'];
  marketRegime: AdaptiveMarketRegime;
  confidence: number;
  sampleSize: number;
  changes: AdaptiveThresholdChange[];
  before: ScannerConfig;
  after: ScannerConfig;
  reasonSummary: string[];
}

export interface AdaptiveScannerConfigResult {
  nextConfig: ScannerConfig;
  profile?: AdaptiveExperienceProfile;
  audit?: AdaptiveThresholdAuditLog;
}

const MAX_PROFILE_ROWS = 2_000;

const BOUNDS = {
  obiThreshold: [-0.40, -0.10],
  qStructThreshold: [-0.52, -0.30],
  minConfidence: [0.60, 0.91],
  maxSqueezeRisk: [0.36, 0.86],
  minEvidenceAgreement: [0.32, 0.82],
  minSmartMoneyScore: [0.35, 0.80],
  smcHardRejectThreshold: [0.10, 0.45],
} as const;

const GUARDED_FLOORS = {
  minConfidence: 0.74,
  minEvidenceAgreement: 0.50,
  maxSqueezeRiskCeilingWhenLoosening: 0.72,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mean(values: Array<number | undefined>): number | null {
  const usable = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function round(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function cloneConfig(config: ScannerConfig): ScannerConfig {
  return { ...config, scoreWeights: { ...config.scoreWeights } };
}

function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const keys = Object.keys(weights) as Array<keyof ScoringWeights>;
  const bounded = Object.fromEntries(
    keys.map((key) => [key, clamp(Number(weights[key]) || 0, 0.01, 0.60)]),
  ) as unknown as ScoringWeights;
  const total = keys.reduce((sum, key) => sum + bounded[key], 0);
  if (!Number.isFinite(total) || total <= 0) {
    const equal = 1 / keys.length;
    return Object.fromEntries(keys.map((key, index) => [
      key,
      index === keys.length - 1 ? round(1 - equal * (keys.length - 1), 8) : round(equal, 8),
    ])) as unknown as ScoringWeights;
  }

  const out = {} as ScoringWeights;
  let assigned = 0;
  keys.forEach((key, index) => {
    const value = index === keys.length - 1
      ? 1 - assigned
      : round(bounded[key] / total, 8);
    out[key] = round(value, 8);
    assigned += out[key];
  });
  // Correct any final floating-point drift on the last key without changing
  // the relative ordering of learned weights.
  const finalSum = keys.reduce((sum, key) => sum + out[key], 0);
  out[keys.at(-1)!] = round(out[keys.at(-1)!] + (1 - finalSum), 8);
  return out;
}

function orderedRecentRows(logs: SignalDecisionLog[], limit = MAX_PROFILE_ROWS): SignalDecisionLog[] {
  const rows = logs.filter((row) => row && Number.isFinite(row.timestamp));
  let ordered = true;
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index - 1].timestamp > rows[index].timestamp) {
      ordered = false;
      break;
    }
  }
  const sorted = ordered ? rows : [...rows].sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id));
  return sorted.slice(-limit);
}

function classifyRegime(rows: SignalDecisionLog[]): AdaptiveMarketRegime {
  if (!rows.length) return 'UNKNOWN';
  const squeeze = mean(rows.map((row) => row.squeezeRiskScore));
  const liquidity = mean(rows.map((row) => row.liquidityQualityScore));
  const evidence = mean(rows.map((row) => row.evidenceAgreementScore));
  const q = mean(rows.map((row) => row.qStructDirectional));
  if (squeeze !== null && squeeze > 0.58) return 'SQUEEZE_RISK';
  if (liquidity !== null && liquidity < 0.48) return 'THIN_BOOK';
  if (q !== null && q > 0.30 && (evidence ?? 0) > 0.52) return 'TREND_UP';
  if (q !== null && q < -0.30 && (evidence ?? 0) > 0.52) return 'TREND_DOWN';
  if (evidence !== null && evidence < 0.44) return 'CHOP';
  return 'MIXED';
}

export function summarizeAdaptiveExperience(
  logs: SignalDecisionLog[],
  minSamples = 24,
): AdaptiveExperienceProfile {
  const recent = orderedRecentRows(logs);
  const accepted = recent.filter((row) => row.decision === 'ACCEPTED');
  const rejected = recent.filter((row) => row.decision === 'REJECTED');
  const resolvedAccepted = accepted.filter((row) => row.laterOutcome === 'WIN' || row.laterOutcome === 'LOSS');
  const wins = resolvedAccepted.filter((row) => row.laterOutcome === 'WIN');
  const losses = resolvedAccepted.filter((row) => row.laterOutcome === 'LOSS');
  const recentWindowSize = Math.max(minSamples, Math.ceil(recent.length * 0.25));
  const recentResolved = recent.slice(-recentWindowSize).filter((row) =>
    row.decision === 'ACCEPTED' && (row.laterOutcome === 'WIN' || row.laterOutcome === 'LOSS'),
  );
  const recentWins = recentResolved.filter((row) => row.laterOutcome === 'WIN');
  const overallWinRate = resolvedAccepted.length ? wins.length / resolvedAccepted.length : null;
  const recentWinRate = recentResolved.length ? recentWins.length / recentResolved.length : null;
  const recentAvgPnl = mean(recentResolved.map((row) => row.laterPnl));
  const outcomeDrift = overallWinRate !== null && recentWinRate !== null ? Math.abs(recentWinRate - overallWinRate) : 0;
  const missedWinners = rejected.filter((row) => row.laterOutcome === 'WIN');
  const savedLosses = rejected.filter((row) => row.laterOutcome === 'LOSS');
  const byReason: AdaptiveExperienceProfile['rejectionOutcomeByReason'] = {};
  for (const row of rejected) {
    if (row.laterOutcome !== 'WIN' && row.laterOutcome !== 'LOSS') continue;
    const current = byReason[row.reasonCode] ?? { wins: 0, losses: 0 };
    if (row.laterOutcome === 'WIN') current.wins += 1;
    else current.losses += 1;
    byReason[row.reasonCode] = current;
  }
  const outcomeEvidence = resolvedAccepted.length + missedWinners.length + savedLosses.length;
  const sampleConfidence = clamp(recent.length / Math.max(1, minSamples * 4), 0, 1);
  const outcomeConfidence = clamp(outcomeEvidence / Math.max(1, minSamples * 2), 0, 1);
  const adjustmentConfidence = round(sampleConfidence * 0.45 + outcomeConfidence * 0.55);

  return {
    sampleSize: recent.length,
    marketRegime: classifyRegime(recent),
    confidenceInAdjustment: adjustmentConfidence,
    adjustmentConfidence,
    accepted: accepted.length,
    rejected: rejected.length,
    acceptanceRate: recent.length ? accepted.length / recent.length : 0,
    resolvedAccepted: resolvedAccepted.length,
    winRate: overallWinRate,
    avgPnl: mean(resolvedAccepted.map((row) => row.laterPnl)),
    recentResolvedAccepted: recentResolved.length,
    recentWinRate,
    recentAvgPnl,
    outcomeDrift: round(outcomeDrift, 6),
    harmfulAcceptedLosses: losses.filter((row) =>
      (row.laterPnl ?? -1) <= -1 ||
      (row.squeezeRiskScore ?? 0) > 0.55 ||
      (row.liquidityQualityScore ?? 1) < 0.55 ||
      (row.evidenceAgreementScore ?? 1) < 0.48,
    ).length,
    missedWinners: missedWinners.length,
    savedLosses: savedLosses.length,
    falseSqueezeRejects: missedWinners.filter((row) => row.reasonCode === 'HIGH_SQUEEZE_RISK').length,
    falseEvidenceRejects: missedWinners.filter((row) => row.reasonCode === 'LOW_EVIDENCE_AGREEMENT').length,
    falseConfidenceRejects: missedWinners.filter((row) => row.reasonCode === 'LOW_CONFIDENCE').length,
    rejectionOutcomeByReason: byReason,
    averages: {
      squeezeRisk: mean(recent.map((row) => row.squeezeRiskScore)),
      evidenceAgreement: mean(recent.map((row) => row.evidenceAgreementScore)),
      liquidityQuality: mean(recent.map((row) => row.liquidityQualityScore)),
      qStructDirectional: mean(recent.map((row) => row.qStructDirectional)),
    },
  };
}

function change(
  config: ScannerConfig,
  changes: AdaptiveThresholdChange[],
  field: keyof Pick<ScannerConfig, 'obiThreshold' | 'qStructThreshold' | 'minConfidence' | 'maxSqueezeRisk' | 'minEvidenceAgreement' | 'minSmartMoneyScore' | 'smcHardRejectThreshold'>,
  proposed: number,
  reason: string,
): void {
  const [min, max] = BOUNDS[field];
  const before = config[field];
  const after = round(clamp(proposed, min, max));
  if (Math.abs(after - before) < 1e-9) return;
  config[field] = after;
  changes.push({ field, before, after, delta: round(after - before), reason });
}

function adjustWeight(config: ScannerConfig, key: keyof ScoringWeights, delta: number): void {
  config.scoreWeights[key] = (config.scoreWeights[key] ?? 0) + delta;
}

export function deriveAdaptiveScannerConfig(
  config: ScannerConfig,
  logs: SignalDecisionLog[],
  options: { now?: number } = {},
): AdaptiveScannerConfigResult {
  const before = cloneConfig(config);
  const profile = summarizeAdaptiveExperience(logs, config.adaptiveMinSamples);
  if (config.thresholdMode === 'MANUAL' || profile.sampleSize < Math.max(1, config.adaptiveMinSamples)) {
    return { nextConfig: before, profile };
  }

  const next = cloneConfig(config);
  const changes: AdaptiveThresholdChange[] = [];
  const reasons: string[] = [];
  const confidence = profile.adjustmentConfidence;
  const learningRate = clamp(config.adaptiveLearningRate || 0.04, 0.005, 0.12);
  let step = learningRate * (0.35 + confidence * 0.65);
  if (profile.outcomeDrift > 0.25) step *= 0.75;
  const guardrails = config.thresholdMode === 'ADAPTIVE_GUARDRAILS';
  const effectiveWinRate = profile.recentResolvedAccepted >= 5
    ? (profile.recentWinRate ?? 0.5) * 0.65 + (profile.winRate ?? 0.5) * 0.35
    : (profile.winRate ?? 0.5);
  const effectiveAvgPnl = profile.recentResolvedAccepted >= 5
    ? (profile.recentAvgPnl ?? 0) * 0.65 + (profile.avgPnl ?? 0) * 0.35
    : (profile.avgPnl ?? 0);
  const weakAccepted = profile.resolvedAccepted >= Math.max(5, Math.floor(config.adaptiveMinSamples / 3)) &&
    (effectiveWinRate < 0.48 || effectiveAvgPnl < 0);
  const strongAccepted = profile.resolvedAccepted >= Math.max(8, Math.floor(config.adaptiveMinSamples / 2)) &&
    effectiveWinRate > 0.64 && effectiveAvgPnl > 0.25 &&
    (profile.recentResolvedAccepted < 5 || (profile.recentWinRate ?? 0) >= 0.56);

  if (profile.outcomeDrift > 0.25) {
    reasons.push('Reduced adaptation step because recent outcomes diverge materially from the longer sample.');
  }

  if (weakAccepted) {
    change(next, changes, 'minConfidence', next.minConfidence + step * 0.65, 'Accepted outcomes underperformed.');
    change(next, changes, 'minEvidenceAgreement', next.minEvidenceAgreement + step * 0.55, 'Losses require stronger evidence agreement.');
    change(next, changes, 'maxSqueezeRisk', next.maxSqueezeRisk - step * 0.65, 'Loss profile requires lower squeeze tolerance.');
    change(next, changes, 'qStructThreshold', next.qStructThreshold - step * 0.45, 'Require clearer directional structure.');
    adjustWeight(next, 'liquidity', step * 0.7);
    adjustWeight(next, 'microstructure', step * 0.55);
    adjustWeight(next, 'qStruct', step * 0.45);
    reasons.push('Tightened thresholds after weak accepted outcomes.');
  }

  const acceptedLosses = orderedRecentRows(logs, 2_000)
    .filter((row) => row.decision === 'ACCEPTED' && row.laterOutcome === 'LOSS')
    .slice(-500);
  const lossSqueeze = mean(acceptedLosses.map((row) => row.squeezeRiskScore));
  const lossEvidence = mean(acceptedLosses.map((row) => row.evidenceAgreementScore));
  const lossLiquidity = mean(acceptedLosses.map((row) => row.liquidityQualityScore));
  if ((lossSqueeze ?? 0) > 0.50) {
    change(next, changes, 'maxSqueezeRisk', next.maxSqueezeRisk - step * 0.45, 'Accepted losses clustered at elevated squeeze risk.');
    adjustWeight(next, 'liquidity', step * 0.35);
    adjustWeight(next, 'microstructure', step * 0.35);
  }
  if ((lossEvidence ?? 1) < 0.55) {
    change(next, changes, 'minEvidenceAgreement', next.minEvidenceAgreement + step * 0.35, 'Accepted losses had weak evidence agreement.');
    adjustWeight(next, 'qStruct', step * 0.30);
  }
  if ((lossLiquidity ?? 1) < 0.65) {
    change(next, changes, 'minConfidence', next.minConfidence + step * 0.25, 'Accepted losses had weak liquidity quality.');
    adjustWeight(next, 'liquidity', step * 0.45);
  }

  const missedTotal = profile.missedWinners;
  const savedTotal = profile.savedLosses;
  const filtersOverStrict = missedTotal >= 4 && missedTotal > savedTotal * 0.45;
  if (filtersOverStrict) {
    const allowLoose = !guardrails || effectiveWinRate >= 0.52;
    if (profile.falseSqueezeRejects >= 2) {
      const cap = guardrails ? GUARDED_FLOORS.maxSqueezeRiskCeilingWhenLoosening : BOUNDS.maxSqueezeRisk[1];
      change(next, changes, 'maxSqueezeRisk', Math.min(cap, next.maxSqueezeRisk + step * 0.30), 'Rejected high-squeeze candidates later produced wins.');
    }
    if (profile.falseEvidenceRejects >= 2 && allowLoose) {
      const floor = guardrails ? GUARDED_FLOORS.minEvidenceAgreement : BOUNDS.minEvidenceAgreement[0];
      change(next, changes, 'minEvidenceAgreement', Math.max(floor, next.minEvidenceAgreement - step * 0.22), 'Rejected low-evidence candidates later produced wins.');
    }
    if (profile.falseConfidenceRejects >= 2 && allowLoose) {
      const floor = guardrails ? GUARDED_FLOORS.minConfidence : BOUNDS.minConfidence[0];
      change(next, changes, 'minConfidence', Math.max(floor, next.minConfidence - step * 0.20), 'Rejected low-confidence candidates later produced wins.');
    }
    reasons.push('Applied limited reason-specific loosening for replayed missed winners.');
  }

  if (savedTotal > Math.max(5, missedTotal * 1.8)) {
    change(next, changes, 'minConfidence', next.minConfidence + step * 0.18, 'Rejected candidates predominantly became losses; filters are protective.');
    change(next, changes, 'minEvidenceAgreement', next.minEvidenceAgreement + step * 0.14, 'Saved-loss evidence supports preserving stricter filters.');
    reasons.push('Reinforced filters because rejected candidates predominantly became losses.');
  }

  if (profile.marketRegime === 'SQUEEZE_RISK') {
    change(next, changes, 'maxSqueezeRisk', next.maxSqueezeRisk - step * 0.25, 'Current regime is squeeze-risk dominant.');
    adjustWeight(next, 'liquidity', step * 0.25);
    adjustWeight(next, 'microstructure', step * 0.25);
  } else if (profile.marketRegime === 'THIN_BOOK') {
    change(next, changes, 'minConfidence', next.minConfidence + step * 0.18, 'Thin-book regime requires higher confidence.');
    change(next, changes, 'maxSqueezeRisk', next.maxSqueezeRisk - step * 0.16, 'Thin-book regime lowers squeeze tolerance.');
    adjustWeight(next, 'liquidity', step * 0.45);
  } else if (profile.marketRegime === 'CHOP') {
    change(next, changes, 'minEvidenceAgreement', next.minEvidenceAgreement + step * 0.22, 'Chop regime requires broader agreement.');
    change(next, changes, 'qStructThreshold', next.qStructThreshold - step * 0.16, 'Chop regime requires clearer QStruct alignment.');
  } else if ((profile.marketRegime === 'TREND_UP' || profile.marketRegime === 'TREND_DOWN') && strongAccepted) {
    adjustWeight(next, 'qStruct', step * 0.22);
    adjustWeight(next, 'volume', step * 0.16);
    if (!guardrails) change(next, changes, 'minConfidence', next.minConfidence - step * 0.08, 'Strong directionally aligned trend outcomes permit a very small friction reduction.');
  }

  if (guardrails) {
    next.minConfidence = Math.max(GUARDED_FLOORS.minConfidence, next.minConfidence);
    next.minEvidenceAgreement = Math.max(GUARDED_FLOORS.minEvidenceAgreement, next.minEvidenceAgreement);
  }
  next.scoreWeights = normalizeWeights(next.scoreWeights);
  next.thresholdMode = config.thresholdMode;
  next.directionBias = config.directionBias;
  next.adaptiveLearningRate = config.adaptiveLearningRate;
  next.adaptiveMinSamples = config.adaptiveMinSamples;

  const weightKeys = Object.keys(next.scoreWeights) as Array<keyof ScoringWeights>;
  for (const key of weightKeys) {
    const beforeValue = before.scoreWeights[key];
    const afterValue = next.scoreWeights[key];
    if (Math.abs(afterValue - beforeValue) >= 1e-7) {
      changes.push({ field: `scoreWeights.${key}`, before: beforeValue, after: afterValue, delta: round(afterValue - beforeValue), reason: 'Normalized adaptive factor weighting.' });
    }
  }

  if (!changes.length) return { nextConfig: next, profile };
  const now = Number.isFinite(options.now) ? Number(options.now) : Date.now();
  return {
    nextConfig: next,
    profile,
    audit: {
      version: 1,
      timestamp: now,
      isoTime: new Date(now).toISOString(),
      mode: config.thresholdMode,
      marketRegime: profile.marketRegime,
      confidence,
      sampleSize: profile.sampleSize,
      changes,
      before,
      after: cloneConfig(next),
      reasonSummary: reasons.length ? reasons : ['Applied bounded adaptive maintenance adjustments.'],
    },
  };
}
