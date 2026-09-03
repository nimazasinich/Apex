import { PARLIAMENT_PROMOTION_POLICY } from './parliamentScannerContributor';

export type ParliamentPromotionStage = 'SHADOW' | 'PAPER_FORWARD' | 'SIGNAL_ELIGIBLE';
export type ParliamentPromotionAction = 'RETAIN_SHADOW' | 'AUTO_PROMOTE_PAPER' | 'RETAIN_PAPER' | 'REQUIRE_HUMAN_SIGNAL_PROMOTION';

export interface ParliamentValidationEvidence {
  resolvedSamples: number;
  paperForwardSamples: number;
  walkForwardFolds: number;
  profitableWalkForwardFolds: number;
  walkForwardResults: Array<{ label: string; trades: number; netReturnPct: number; profitFactor: number; maxDrawdownPct: number }>;
  regimes: Record<string, { samples: number; netReturnPct: number; profitFactor: number; maxDrawdownPct: number }>;
  netReturnPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  costStressPassed: boolean;
  sealedHoldoutUsesForCandidate: number;
  materialVetoCount: number;
}

export interface ParliamentPromotionDecision {
  version: 'parliament_promotion_gate_v1';
  stage: ParliamentPromotionStage;
  action: ParliamentPromotionAction;
  authorized: boolean;
  blockers: string[];
  humanApprovalRequired: boolean;
  autonomousLiveExecutionEnabled: false;
}

/**
 * Research automation can advance a validated Parliament candidate from SHADOW
 * to PAPER_FORWARD without an operator click. It can never auto-promote the
 * contributor into live-signal authority. SIGNAL_ELIGIBLE always requires a
 * human action outside this pure gate, and neither stage grants order authority.
 */
export function evaluateParliamentPromotion(input: {
  stage: ParliamentPromotionStage;
  evidence: ParliamentValidationEvidence;
}): ParliamentPromotionDecision {
  const e = input.evidence;
  const blockers: string[] = [];
  if (e.sealedHoldoutUsesForCandidate > PARLIAMENT_PROMOTION_POLICY.sealedHoldoutUsesPerCandidate) blockers.push('sealed_holdout_reuse');
  if (e.resolvedSamples < PARLIAMENT_PROMOTION_POLICY.minimumResolvedSamples) blockers.push('resolved_sample_floor');
  if (e.walkForwardFolds < PARLIAMENT_PROMOTION_POLICY.minimumWalkForwardFolds) blockers.push('walk_forward_fold_floor');
  if (e.walkForwardResults.length !== e.walkForwardFolds) blockers.push('walk_forward_count_mismatch');
  const measuredProfitableFolds = e.walkForwardResults.filter((fold) => fold.netReturnPct > 0 && fold.profitFactor > 1).length;
  if (measuredProfitableFolds !== e.profitableWalkForwardFolds) blockers.push('walk_forward_profitable_count_mismatch');
  if (measuredProfitableFolds < Math.ceil(PARLIAMENT_PROMOTION_POLICY.minimumWalkForwardFolds * PARLIAMENT_PROMOTION_POLICY.minimumProfitableFoldFraction)) blockers.push('walk_forward_stability');
  for (const fold of e.walkForwardResults) {
    if (fold.trades < PARLIAMENT_PROMOTION_POLICY.minimumTradesPerWalkForwardFold) blockers.push(`walk_forward_trade_floor:${fold.label}`);
    if (!(fold.maxDrawdownPct <= PARLIAMENT_PROMOTION_POLICY.maximumDrawdownPct)) blockers.push(`walk_forward_drawdown_cap:${fold.label}`);
  }
  if (!(e.netReturnPct > 0)) blockers.push('net_return_nonpositive');
  if (!(e.profitFactor >= PARLIAMENT_PROMOTION_POLICY.minimumProfitFactor)) blockers.push('profit_factor_floor');
  if (!(e.maxDrawdownPct <= PARLIAMENT_PROMOTION_POLICY.maximumDrawdownPct)) blockers.push('drawdown_cap');
  if (!e.costStressPassed) blockers.push('cost_stress_failed');
  if (e.materialVetoCount > 0) blockers.push('material_veto_present');

  const regimeEntries = Object.entries(e.regimes);
  if (regimeEntries.length < PARLIAMENT_PROMOTION_POLICY.minimumProfitableRegimes) blockers.push('regime_coverage_floor');
  let profitableRegimes = 0;
  for (const [regime, result] of regimeEntries) {
    if (result.samples < PARLIAMENT_PROMOTION_POLICY.minimumSamplesPerRegime) blockers.push(`regime_sample_floor:${regime}`);
    if (!(result.maxDrawdownPct <= PARLIAMENT_PROMOTION_POLICY.maximumDrawdownPct)) blockers.push(`regime_drawdown_cap:${regime}`);
    if (result.netReturnPct > 0 && result.profitFactor > 1) profitableRegimes += 1;
  }
  if (profitableRegimes < PARLIAMENT_PROMOTION_POLICY.minimumProfitableRegimes) blockers.push('profitable_regime_floor');

  if (input.stage === 'SHADOW') {
    return {
      version: 'parliament_promotion_gate_v1', stage: input.stage,
      action: blockers.length ? 'RETAIN_SHADOW' : 'AUTO_PROMOTE_PAPER',
      authorized: blockers.length === 0,
      blockers, humanApprovalRequired: false, autonomousLiveExecutionEnabled: false,
    };
  }

  if (input.stage === 'PAPER_FORWARD') {
    if (e.paperForwardSamples < PARLIAMENT_PROMOTION_POLICY.minimumPaperForwardSamples) blockers.push('paper_forward_sample_floor');
    return {
      version: 'parliament_promotion_gate_v1', stage: input.stage,
      action: blockers.length ? 'RETAIN_PAPER' : 'REQUIRE_HUMAN_SIGNAL_PROMOTION',
      authorized: blockers.length === 0,
      blockers, humanApprovalRequired: blockers.length === 0, autonomousLiveExecutionEnabled: false,
    };
  }

  return {
    version: 'parliament_promotion_gate_v1', stage: input.stage,
    action: 'REQUIRE_HUMAN_SIGNAL_PROMOTION',
    authorized: blockers.length === 0,
    blockers, humanApprovalRequired: true, autonomousLiveExecutionEnabled: false,
  };
}
