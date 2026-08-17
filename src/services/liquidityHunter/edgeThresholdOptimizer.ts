import { createHash } from 'node:crypto';
import type { EdgeId } from '../../contracts/realtime/edgeEvidence';
import type { EdgeThresholdProfile } from '../../contracts/realtime/edgeThreshold';

export const EDGE_THRESHOLD_OPTIMIZER_VERSION = 'lh_edge_threshold_optimizer_v1';

export type EdgeThresholdObservationRole = 'DEVELOPMENT' | 'HOLDOUT';

export interface EdgeThresholdValidationContext {
  sourceSet: string[];
  featureVersion: string;
  validationProtocol: 'PURGED_WALK_FORWARD_HOLDOUT';
  datasetFingerprintSha256: string;
}

export interface EdgeThresholdObservation {
  edgeId: EdgeId;
  timestamp: number;
  score: number;
  dataQuality: number;
  netReturnPct: number;
  regime: string;
  role: EdgeThresholdObservationRole;
  sourceVersion?: string;
}

export interface EdgeThresholdCandidateMetrics {
  threshold: number;
  sampleCount: number;
  acceptedCount: number;
  positiveShare: number | null;
  meanNetReturnPct: number | null;
  medianNetReturnPct: number | null;
  utility: number;
}

export interface EdgeThresholdOptimizationReport {
  version: typeof EDGE_THRESHOLD_OPTIMIZER_VERSION;
  generatedAt: number;
  profileId: string;
  edgeId: EdgeId;
  baselineThreshold: number;
  candidateThreshold: number | null;
  validationContext: EdgeThresholdValidationContext | null;
  development: {
    sampleCount: number;
    regimeCount: number;
    baseline: EdgeThresholdCandidateMetrics;
    candidate: EdgeThresholdCandidateMetrics | null;
  };
  holdout: {
    sampleCount: number;
    baseline: EdgeThresholdCandidateMetrics;
    candidate: EdgeThresholdCandidateMetrics | null;
  };
  neighborStability: {
    tested: number;
    passed: number;
    passRate: number;
  };
  blockers: string[];
  eligibleForManualReview: boolean;
  automaticPromotionEnabled: false;
  shadowOnly: true;
  fingerprintSha256: string;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function metrics(rows: readonly EdgeThresholdObservation[], threshold: number): EdgeThresholdCandidateMetrics {
  const accepted = rows.filter((row) => row.score >= threshold);
  const returns = accepted.map((row) => row.netReturnPct).filter(Number.isFinite);
  const meanReturn = mean(returns);
  const medianReturn = median(returns);
  const positiveShare = returns.length ? returns.filter((value) => value > 0).length / returns.length : null;
  const sampleAdequacy = rows.length ? Math.min(1, accepted.length / Math.max(12, rows.length * 0.25)) : 0;
  const utility = accepted.length
    ? (meanReturn ?? -100) * 0.45 + (medianReturn ?? -100) * 0.45 + (positiveShare ?? 0) * 0.10 * sampleAdequacy
    : -1_000;
  return {
    threshold,
    sampleCount: rows.length,
    acceptedCount: accepted.length,
    positiveShare,
    meanNetReturnPct: meanReturn,
    medianNetReturnPct: medianReturn,
    utility,
  };
}

function candidateGrid(profile: EdgeThresholdProfile): number[] {
  const min = Math.max(0, profile.min);
  const max = Math.min(1, profile.max);
  const step = Math.max(0.001, profile.step);
  const values = new Set<number>([Number(profile.baseline.toFixed(6))]);
  for (let value = min; value <= max + step / 2; value += step) values.add(Number(Math.min(max, value).toFixed(6)));
  return [...values].sort((a, b) => a - b).slice(0, 101);
}

function normalizeObservations(edgeId: EdgeId, rows: readonly EdgeThresholdObservation[]): EdgeThresholdObservation[] {
  return rows
    .filter((row) => row.edgeId === edgeId
      && Number.isFinite(row.timestamp)
      && Number.isFinite(row.score)
      && row.score >= 0 && row.score <= 1
      && Number.isFinite(row.dataQuality)
      && row.dataQuality >= 0.50
      && Number.isFinite(row.netReturnPct))
    .map((row) => ({ ...row, regime: String(row.regime || 'UNKNOWN') }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Bounded, advisory edge-score threshold search. Development observations are
 * used for selection; HOLDOUT observations are evaluated only after the winner
 * is selected. The function never mutates a threshold registry and cannot
 * promote a candidate automatically.
 */
export function optimizeEdgeThreshold(input: {
  profile: EdgeThresholdProfile;
  observations: readonly EdgeThresholdObservation[];
  validationContext?: EdgeThresholdValidationContext | null;
  now?: number;
}): EdgeThresholdOptimizationReport {
  const observations = normalizeObservations(input.profile.edgeId, input.observations);
  const development = observations.filter((row) => row.role === 'DEVELOPMENT');
  const holdout = observations.filter((row) => row.role === 'HOLDOUT');
  const regimes = new Set(development.map((row) => row.regime).filter((value) => value !== 'UNKNOWN'));
  const baselineDevelopment = metrics(development, input.profile.baseline);
  const baselineHoldout = metrics(holdout, input.profile.baseline);
  const blockers: string[] = [];
  const validationContext = input.validationContext ?? null;
  const observedFeatureVersions = new Set(development.map((row) => String(row.sourceVersion || '')).filter(Boolean));

  if (!validationContext) blockers.push('validation_context_missing');
  else {
    if (!validationContext.sourceSet.length || validationContext.sourceSet.some((source) => !String(source).trim())) blockers.push('validation_source_set_missing');
    if (!validationContext.featureVersion.trim()) blockers.push('validation_feature_version_missing');
    if (validationContext.validationProtocol !== 'PURGED_WALK_FORWARD_HOLDOUT') blockers.push('validation_protocol_not_purged_walk_forward_holdout');
    if (!/^[a-f0-9]{64}$/i.test(validationContext.datasetFingerprintSha256)) blockers.push('validation_dataset_fingerprint_invalid');
    if (observedFeatureVersions.size > 1) blockers.push('mixed_edge_feature_versions');
    if (observedFeatureVersions.size === 1 && !observedFeatureVersions.has(validationContext.featureVersion)) blockers.push('feature_version_mismatch');
  }

  if (development.length < input.profile.minimumSamples) blockers.push(`development_samples_below_${input.profile.minimumSamples}`);
  if (regimes.size < input.profile.minimumRegimes) blockers.push(`development_regimes_below_${input.profile.minimumRegimes}`);
  if (holdout.length < Math.max(12, Math.ceil(input.profile.minimumSamples * 0.20))) blockers.push('holdout_sample_too_small');

  const minAccepted = Math.max(12, Math.ceil(input.profile.minimumSamples * 0.25));
  const ranked = candidateGrid(input.profile)
    .map((threshold) => metrics(development, threshold))
    .filter((candidate) => candidate.acceptedCount >= minAccepted)
    .sort((left, right) => right.utility - left.utility || Math.abs(left.threshold - input.profile.baseline) - Math.abs(right.threshold - input.profile.baseline));
  const selected = ranked[0] ?? null;
  const candidateThreshold = selected?.threshold ?? null;
  const candidateHoldout = candidateThreshold === null ? null : metrics(holdout, candidateThreshold);

  if (!selected) blockers.push('no_candidate_with_adequate_sample');
  if (selected && Math.abs(selected.threshold - input.profile.baseline) < 1e-9) blockers.push('baseline_remains_best');
  if (selected && Math.abs(selected.threshold - input.profile.baseline) > 0.25) blockers.push('candidate_jump_exceeds_0_25');
  if (selected && selected.utility <= baselineDevelopment.utility + 1e-9) blockers.push('development_utility_not_improved');
  if (candidateHoldout) {
    if (candidateHoldout.acceptedCount < Math.max(8, Math.ceil(holdout.length * 0.15))) blockers.push('candidate_holdout_acceptance_too_small');
    if ((candidateHoldout.meanNetReturnPct ?? -Infinity) <= 0) blockers.push('candidate_holdout_mean_not_positive');
    if ((candidateHoldout.medianNetReturnPct ?? -Infinity) <= 0) blockers.push('candidate_holdout_median_not_positive');
    if ((candidateHoldout.positiveShare ?? 0) < 0.50) blockers.push('candidate_holdout_positive_share_below_0_50');
    if (candidateHoldout.utility + 1e-9 < baselineHoldout.utility) blockers.push('candidate_holdout_worse_than_baseline');
  }

  const neighborThresholds = candidateThreshold === null ? [] : [candidateThreshold - input.profile.step, candidateThreshold + input.profile.step]
    .filter((value) => value >= input.profile.min && value <= input.profile.max)
    .map((value) => Number(value.toFixed(6)));
  const neighborMetrics = neighborThresholds.map((threshold) => metrics(holdout, threshold));
  const neighborPassed = neighborMetrics.filter((row) => row.acceptedCount >= 8
    && (row.meanNetReturnPct ?? -Infinity) > 0
    && (row.medianNetReturnPct ?? -Infinity) > 0).length;
  const neighborPassRate = neighborMetrics.length ? neighborPassed / neighborMetrics.length : 0;
  if (candidateThreshold !== null && neighborMetrics.length && neighborPassRate < 0.50) blockers.push('neighbor_stability_below_0_50');

  const withoutFingerprint: Omit<EdgeThresholdOptimizationReport, 'fingerprintSha256'> = {
    version: EDGE_THRESHOLD_OPTIMIZER_VERSION,
    generatedAt: input.now ?? Date.now(),
    profileId: input.profile.id,
    edgeId: input.profile.edgeId,
    baselineThreshold: input.profile.baseline,
    candidateThreshold,
    validationContext: validationContext ? { ...validationContext, sourceSet: [...validationContext.sourceSet].sort() } : null,
    development: {
      sampleCount: development.length,
      regimeCount: regimes.size,
      baseline: baselineDevelopment,
      candidate: selected,
    },
    holdout: {
      sampleCount: holdout.length,
      baseline: baselineHoldout,
      candidate: candidateHoldout,
    },
    neighborStability: {
      tested: neighborMetrics.length,
      passed: neighborPassed,
      passRate: clamp01(neighborPassRate),
    },
    blockers: [...new Set(blockers)],
    eligibleForManualReview: blockers.length === 0 && candidateThreshold !== null,
    automaticPromotionEnabled: false as const,
    shadowOnly: true as const,
  };
  return { ...withoutFingerprint, fingerprintSha256: fingerprint(withoutFingerprint) };
}
