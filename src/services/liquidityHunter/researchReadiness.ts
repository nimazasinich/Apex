import type { LiquidityHunterMicrostructureValidationReport } from '../replay/liquidityHunterMicrostructureValidation';
import type { LiquidityHunterWalkForwardValidationReport } from '../replay/liquidityHunterWalkForwardValidation';

export type LiquidityHunterResearchReadinessStatus =
  | 'NOT_READY'
  | 'PAPER_CANARY_OBSERVATION_ELIGIBLE'
  | 'MANUAL_REVIEW_ELIGIBLE';

export interface LiquidityHunterResearchReadinessPolicy {
  minWalkForwardCandidateShare: number;
  minWalkForwardPositiveShare: number;
  minHoldoutCandidates: number;
  minHoldoutMedianNetReturnPct: number;
  minHoldoutTwoRShare: number;
  minMicrostructureSimulations: number;
  minMicrostructureFilledShare: number;
  minMicrostructureMedianNetReturnPct: number;
}

export interface LiquidityHunterResearchReadinessReport {
  version: 'lh_research_readiness_v1';
  generatedAt: number;
  status: LiquidityHunterResearchReadinessStatus;
  walkForwardFingerprint: string;
  microstructureFingerprint: string | null;
  metrics: {
    walkForwardCandidateShare: number;
    walkForwardPositiveShare: number;
    holdoutCandidateCount: number;
    holdoutMedianNetReturnPct: number | null;
    holdoutTwoRBeforeInvalidationShare: number | null;
    microstructureSimulatedCount: number | null;
    microstructureFilledShare: number | null;
    microstructureMedianNetReturnPct: number | null;
  };
  blockers: string[];
  warnings: string[];
  policy: LiquidityHunterResearchReadinessPolicy;
  shadowOnly: true;
  authoritative: false;
  automaticPromotionEnabled: false;
  executionAuthorized: false;
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

export function evaluateLiquidityHunterResearchReadiness(input: {
  walkForward: LiquidityHunterWalkForwardValidationReport;
  microstructure?: LiquidityHunterMicrostructureValidationReport | null;
  policy?: Partial<LiquidityHunterResearchReadinessPolicy>;
  now?: number;
}): LiquidityHunterResearchReadinessReport {
  const policy: LiquidityHunterResearchReadinessPolicy = {
    minWalkForwardCandidateShare: clamp(input.policy?.minWalkForwardCandidateShare, 2 / 3, 0, 1),
    minWalkForwardPositiveShare: clamp(input.policy?.minWalkForwardPositiveShare, 2 / 3, 0, 1),
    minHoldoutCandidates: Math.floor(clamp(input.policy?.minHoldoutCandidates, 20, 1, 10_000)),
    minHoldoutMedianNetReturnPct: clamp(input.policy?.minHoldoutMedianNetReturnPct, 0, -100, 100),
    minHoldoutTwoRShare: clamp(input.policy?.minHoldoutTwoRShare, 0.35, 0, 1),
    minMicrostructureSimulations: Math.floor(clamp(input.policy?.minMicrostructureSimulations, 20, 1, 10_000)),
    minMicrostructureFilledShare: clamp(input.policy?.minMicrostructureFilledShare, 0.50, 0, 1),
    minMicrostructureMedianNetReturnPct: clamp(input.policy?.minMicrostructureMedianNetReturnPct, 0, -100, 100),
  };

  const walkForwardFoldCount = Math.max(1, input.walkForward.walkForward.length);
  const walkForwardCandidateShare = input.walkForward.consistency.walkForwardCandidateFolds / walkForwardFoldCount;
  const walkForwardPositiveShare = input.walkForward.consistency.walkForwardPositiveMedianNetFolds / walkForwardFoldCount;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (input.walkForward.shadowOnly !== true || input.walkForward.authoritative !== false || input.walkForward.automaticPromotionEnabled !== false) {
    blockers.push('walk_forward_safety_contract_invalid');
  }
  if (walkForwardCandidateShare < policy.minWalkForwardCandidateShare) blockers.push('insufficient_walk_forward_candidate_coverage');
  if (walkForwardPositiveShare < policy.minWalkForwardPositiveShare) blockers.push('insufficient_walk_forward_positive_consistency');
  if (input.walkForward.consistency.holdoutCandidateCount < policy.minHoldoutCandidates) blockers.push('insufficient_holdout_candidate_count');
  const holdoutMedian = input.walkForward.consistency.holdoutMedianNetReturnPct;
  if (holdoutMedian === null || holdoutMedian <= policy.minHoldoutMedianNetReturnPct) blockers.push('holdout_median_net_return_not_positive');
  const holdoutTwoR = input.walkForward.consistency.holdoutTwoRBeforeInvalidationShare;
  if (holdoutTwoR === null || holdoutTwoR < policy.minHoldoutTwoRShare) blockers.push('holdout_two_r_share_below_policy');

  const researchGatePassed = blockers.length === 0;
  let status: LiquidityHunterResearchReadinessStatus = researchGatePassed ? 'PAPER_CANARY_OBSERVATION_ELIGIBLE' : 'NOT_READY';

  const micro = input.microstructure ?? null;
  if (!micro) {
    warnings.push('microstructure_validation_not_supplied');
  } else {
    if (micro.shadowOnly !== true || micro.authoritative !== false || micro.executionDependency !== false) {
      blockers.push('microstructure_safety_contract_invalid');
      status = 'NOT_READY';
    } else if (researchGatePassed) {
      const microBlockers: string[] = [];
      if (micro.simulatedCount < policy.minMicrostructureSimulations) microBlockers.push('insufficient_microstructure_simulations');
      if (micro.summary.filledShare === null || micro.summary.filledShare < policy.minMicrostructureFilledShare) microBlockers.push('microstructure_fill_share_below_policy');
      if (micro.summary.medianNetReturnPct === null || micro.summary.medianNetReturnPct <= policy.minMicrostructureMedianNetReturnPct) microBlockers.push('microstructure_median_net_return_not_positive');
      if (microBlockers.length) warnings.push(...microBlockers);
      else status = 'MANUAL_REVIEW_ELIGIBLE';
    }
  }

  return {
    version: 'lh_research_readiness_v1',
    generatedAt: input.now ?? Date.now(),
    status,
    walkForwardFingerprint: input.walkForward.fingerprintSha256,
    microstructureFingerprint: micro?.fingerprintSha256 ?? null,
    metrics: {
      walkForwardCandidateShare,
      walkForwardPositiveShare,
      holdoutCandidateCount: input.walkForward.consistency.holdoutCandidateCount,
      holdoutMedianNetReturnPct: holdoutMedian,
      holdoutTwoRBeforeInvalidationShare: holdoutTwoR,
      microstructureSimulatedCount: micro?.simulatedCount ?? null,
      microstructureFilledShare: micro?.summary.filledShare ?? null,
      microstructureMedianNetReturnPct: micro?.summary.medianNetReturnPct ?? null,
    },
    blockers,
    warnings,
    policy,
    shadowOnly: true,
    authoritative: false,
    automaticPromotionEnabled: false,
    executionAuthorized: false,
  };
}
