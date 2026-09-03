/**
 * Automatic-promotion authorization gate.
 *
 * Before this module existed, Smart Autopilot could promote an optimization
 * profile on optimizer development evidence plus the multi-agent council
 * alone, before candidate-matched final validation. The stricter temporal-robustness / sealed-holdout / cost-stress / regime gate suite in
 * `strategyValidation.ts` and the comparable ranking in `strategyRanking.ts`
 * were computed only by the manual `/validate` route and never consulted for
 * promotion.
 *
 * This module is the missing link. It introduces NO new validation vocabulary
 * and performs NO I/O: it reads the existing `StrategyValidationReport` gates
 * and `StrategyRankScore` and answers one question — may this candidate be
 * promoted automatically?
 *
 * Fail-closed rules:
 *   - Missing validation evidence is a blocker, never a pass.
 *   - Validation evidence must belong to the same strategy AND version.
 *   - Validation must have measured THIS candidate. The report carries a
 *     fingerprint of the exact parameters and scanner config it replayed; if it
 *     does not match the candidate being promoted, the evidence describes some
 *     other identity and is rejected. Without this check, validating the
 *     already-active profile B could authorize promoting candidate A.
 *   - Validation must not predate the optimization report it is vouching for,
 *     so a stale run can never authorize a newer candidate.
 *   - This gate can only ever NARROW promotion. It never authorizes anything
 *     the optimizer and council had already rejected, and it never touches
 *     live-execution authorization, Risk Governor, or DecisionBridge.
 */
import type { StrategyRankScore, StrategyValidationReport } from '../types';
import { fingerprintStrategyValidationSubject } from './strategyValidationSubject';
import type { StrategyValidationSubject } from './strategyValidationSubject';

export const AUTOMATIC_PROMOTION_GATE_VERSION = 'automatic_promotion_gate_v1';

/**
 * Minimum comparable rank score required for automatic promotion. Manual
 * governance may still promote a lower-ranked eligible candidate; automation
 * is deliberately held to a higher bar than a human with context.
 */
export const AUTOMATIC_PROMOTION_MIN_RANK_SCORE = 55;

export interface AutomaticPromotionGateInput {
  /** Identity of the optimization candidate under consideration. */
  strategyId: string;
  strategyVersion: number;
  /** `report.generatedAt` of the optimization report being promoted. */
  reportGeneratedAt: number;
  /** Optimizer-internal eligibility (`report.promotion.eligible`). */
  optimizerEligible: boolean;
  /** Multi-agent council verdict (`council.approvedForFinalValidation`). */
  councilApproved: boolean;
  /** Temporal-robustness / sealed-holdout / cost-stress / regime evidence, when available. */
  validation: StrategyValidationReport | null;
  /** Comparable-group ranking for the same validation run, when available. */
  rank: StrategyRankScore | null;
  minRankScore?: number;
  /**
   * The exact candidate being promoted. The gate fingerprints it and requires
   * the validation report to carry the same fingerprint, which is what proves
   * candidate A was validated as candidate A.
   */
  candidateSubject: StrategyValidationSubject;
}

export interface AutomaticPromotionGateResult {
  version: typeof AUTOMATIC_PROMOTION_GATE_VERSION;
  /** True only when every upstream and validation gate holds. */
  authorized: boolean;
  blockers: string[];
  /** Gate-suite outcome, or null when no usable validation evidence existed. */
  validationPassed: boolean | null;
  /** Individual gate failures, surfaced so operators see the specific cause. */
  failedGates: string[];
  rankScore: number | null;
  minRankScore: number;
  validatedAt: number | null;
  /** Fingerprint of the candidate the caller asked to promote. */
  candidateFingerprint: string;
  /** Fingerprint the validation evidence actually measured, when it carried one. */
  validatedFingerprint: string | null;
  /**
   * True only when the evidence measured this exact candidate. Null when no
   * usable validation report existed to compare against.
   */
  subjectMatched: boolean | null;
}

/**
 * Decide whether an optimization report may be promoted without a human.
 *
 * Pure: same input always yields the same verdict.
 */
export function evaluateAutomaticPromotionGate(
  input: AutomaticPromotionGateInput,
): AutomaticPromotionGateResult {
  const minRankScore = Number.isFinite(input.minRankScore)
    ? Number(input.minRankScore)
    : AUTOMATIC_PROMOTION_MIN_RANK_SCORE;
  const blockers: string[] = [];

  // Upstream verdicts are preconditions, not substitutes. Re-checking them here
  // keeps the gate honest if a caller ever forgets one.
  if (!input.optimizerEligible) blockers.push('optimizer_promotion_not_eligible');
  if (!input.councilApproved) blockers.push('multi_agent_council_not_approved');

  const validation = input.validation;
  let validationPassed: boolean | null = null;
  const failedGates: string[] = [];
  const candidateFingerprint = fingerprintStrategyValidationSubject(input.candidateSubject);
  let validatedFingerprint: string | null = null;
  let subjectMatched: boolean | null = null;

  if (!validation) {
    blockers.push('validation_report_missing');
  } else if (validation.strategyId !== input.strategyId) {
    blockers.push('validation_strategy_mismatch');
  } else if (validation.strategyVersion !== input.strategyVersion) {
    blockers.push('validation_strategy_version_mismatch');
  } else if (validation.runAt < input.reportGeneratedAt) {
    blockers.push('validation_predates_optimization_report');
  } else if (!validation.subject) {
    // A report without a subject is ambiguous: it could be measuring the
    // already-active profile. Missing identity is a blocker, never a pass.
    blockers.push('validation_subject_missing');
  } else if (validation.subject.kind !== 'OPTIMIZATION_CANDIDATE') {
    blockers.push('validation_subject_not_candidate');
  } else {
    validatedFingerprint = validation.subject.fingerprint;
    const universeIdentityRequired = input.candidateSubject.universeIdentityRequired === true
      || validation.subject.universeIdentityRequired === true;
    if (universeIdentityRequired && (!input.candidateSubject.universeIdentity || !validation.subject.universeIdentity)) {
      blockers.push('validation_universe_identity_missing');
    } else if (validatedFingerprint !== candidateFingerprint) {
      blockers.push('validation_subject_mismatch');
    } else {
      subjectMatched = true;
      if (validation.validationScope !== 'FULL_STRATEGY') blockers.push('validation_scope_not_full_strategy');
      if (validation.fullStrategyValidated !== true) blockers.push('full_strategy_validation_required');
      for (const [gate, passed] of Object.entries(validation.gates)) {
        if (!passed) failedGates.push(gate);
      }
      validationPassed = validation.passedAllGates === true && validation.fullStrategyValidated === true && failedGates.length === 0;
      if (!validationPassed) blockers.push('validation_gates_failed');
    }
  }

  const rankScore = input.rank ? input.rank.score : null;
  if (!input.rank) {
    blockers.push('rank_score_missing');
  } else if (input.rank.strategyId !== input.strategyId) {
    blockers.push('rank_strategy_mismatch');
  } else if (!Number.isFinite(input.rank.score)) {
    blockers.push('rank_score_not_finite');
  } else if (input.rank.score < minRankScore) {
    blockers.push('rank_score_below_minimum');
  }

  const uniqueBlockers = [...new Set(blockers)];
  return {
    version: AUTOMATIC_PROMOTION_GATE_VERSION,
    authorized: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    validationPassed,
    failedGates,
    rankScore,
    minRankScore,
    validatedAt: validation ? validation.runAt : null,
    candidateFingerprint,
    validatedFingerprint,
    subjectMatched,
  };
}
