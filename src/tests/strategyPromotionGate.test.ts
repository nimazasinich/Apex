/**
 * Automatic-promotion gate tests.
 *
 * These lock the rule that Smart Autopilot cannot promote an optimization
 * profile automatically unless the existing walk-forward / cost-stress / regime
 * gate suite passed AND the comparable rank score clears the automation bar.
 *
 * The gate is pure, so every case here is exercised without network, routes, or
 * the optimizer.
 */
import { describe, expect, it } from 'vitest';
import {
  AUTOMATIC_PROMOTION_GATE_VERSION,
  AUTOMATIC_PROMOTION_MIN_RANK_SCORE,
  evaluateAutomaticPromotionGate,
  type AutomaticPromotionGateInput,
} from '../services/strategyPromotionGate';
import {
  identifyStrategyValidationSubject,
  optimizationCandidateSubject,
  type StrategyValidationSubject,
} from '../services/strategyValidationSubject';
import type { StrategyRankScore, StrategyValidationReport } from '../types';

const REPORT_AT = 1_700_000_000_000;

/**
 * The candidate under consideration. Every helper below derives its identity
 * from this one object, so the default case is "the evidence measured exactly
 * the thing being promoted" and each test perturbs one property away from that.
 */
const CANDIDATE: StrategyValidationSubject = optimizationCandidateSubject({
  definition: { strategyId: 'orbVwapBreakout', version: 3 },
  parameters: { breakoutAtrMultiple: 1.4, vwapConfirmBars: 2 },
  scannerConfig: null,
  sourceReportAt: REPORT_AT,
  activeProfileRevision: 7,
});

/** A different identity — stands in for the already-promoted profile. */
const OTHER_PROFILE: StrategyValidationSubject = optimizationCandidateSubject({
  definition: { strategyId: 'orbVwapBreakout', version: 3 },
  parameters: { breakoutAtrMultiple: 2.6, vwapConfirmBars: 5 },
  scannerConfig: null,
  sourceReportAt: REPORT_AT - 500_000,
  activeProfileRevision: 7,
});

/** Only the fields the gate reads; the rest of the report is irrelevant here. */
function validationReport(overrides: Partial<StrategyValidationReport> = {}): StrategyValidationReport {
  return {
    strategyId: 'orbVwapBreakout',
    strategyVersion: 3,
    runAt: REPORT_AT + 1_000,
    subject: identifyStrategyValidationSubject(CANDIDATE),
    gates: {
      data: true,
      sample: true,
      outOfSample: true,
      drawdown: true,
      stability: true,
      costResilience: true,
      regime: true,
      reproducibility: true,
    },
    passedAllGates: true,
    validationScope: 'FULL_STRATEGY',
    fullStrategyValidated: true,
    ...overrides,
  } as unknown as StrategyValidationReport;
}

function rankScore(overrides: Partial<StrategyRankScore> = {}): StrategyRankScore {
  return {
    strategyId: 'orbVwapBreakout',
    strategyVersion: 3,
    score: 72.5,
    penalties: [],
    ...overrides,
  } as unknown as StrategyRankScore;
}

function input(overrides: Partial<AutomaticPromotionGateInput> = {}): AutomaticPromotionGateInput {
  return {
    strategyId: 'orbVwapBreakout',
    strategyVersion: 3,
    reportGeneratedAt: REPORT_AT,
    optimizerEligible: true,
    councilApproved: true,
    validation: validationReport(),
    rank: rankScore(),
    candidateSubject: CANDIDATE,
    ...overrides,
  };
}

describe('automatic promotion gate — happy path', () => {
  it('authorizes only when optimizer, council, gate suite and rank all hold', () => {
    const result = evaluateAutomaticPromotionGate(input());
    expect(result.authorized).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.validationPassed).toBe(true);
    expect(result.failedGates).toEqual([]);
    expect(result.rankScore).toBe(72.5);
    expect(result.version).toBe(AUTOMATIC_PROMOTION_GATE_VERSION);
    expect(result.subjectMatched).toBe(true);
    expect(result.validatedFingerprint).toBe(result.candidateFingerprint);
  });

  it('accepts validation produced at the same instant as the report', () => {
    const result = evaluateAutomaticPromotionGate(
      input({ validation: validationReport({ runAt: REPORT_AT }) }),
    );
    expect(result.authorized).toBe(true);
  });
});

describe('automatic promotion gate — fail closed on missing evidence', () => {
  it('blocks when no validation report exists', () => {
    const result = evaluateAutomaticPromotionGate(input({ validation: null }));
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('validation_report_missing');
    expect(result.validationPassed).toBeNull();
    expect(result.validatedAt).toBeNull();
    expect(result.subjectMatched).toBeNull();
  });

  it('blocks when no rank score exists', () => {
    const result = evaluateAutomaticPromotionGate(input({ rank: null }));
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('rank_score_missing');
    expect(result.rankScore).toBeNull();
  });

  it('blocks a non-finite rank score', () => {
    const result = evaluateAutomaticPromotionGate(input({ rank: rankScore({ score: Number.NaN }) }));
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('rank_score_not_finite');
  });
});

describe('automatic promotion gate — evidence must match the candidate', () => {
  it('blocks validation from a different strategy', () => {
    const result = evaluateAutomaticPromotionGate(
      input({ validation: validationReport({ strategyId: 'volatilitySqueezeExpansion' }) }),
    );
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('validation_strategy_mismatch');
  });

  it('blocks validation from a different strategy version', () => {
    const result = evaluateAutomaticPromotionGate(
      input({ validation: validationReport({ strategyVersion: 2 }) }),
    );
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('validation_strategy_version_mismatch');
  });

  it('blocks validation that predates the optimization report', () => {
    const result = evaluateAutomaticPromotionGate(
      input({ validation: validationReport({ runAt: REPORT_AT - 1 }) }),
    );
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('validation_predates_optimization_report');
  });

  it('blocks a rank score belonging to another strategy', () => {
    const result = evaluateAutomaticPromotionGate(
      input({ rank: rankScore({ strategyId: 'regimeRoutedComposite' }) }),
    );
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('rank_strategy_mismatch');
  });

  it('blocks a report that never named what it measured', () => {
    // Reports predating subject identity are ambiguous: they may have replayed
    // the active profile. Ambiguity is a blocker, never an implicit pass.
    const result = evaluateAutomaticPromotionGate(
      input({ validation: validationReport({ subject: undefined }) }),
    );
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('validation_subject_missing');
    expect(result.validationPassed).toBeNull();
    expect(result.subjectMatched).toBeNull();
    expect(result.validatedFingerprint).toBeNull();
  });

  it('blocks evidence that measured the active profile rather than a candidate', () => {
    const result = evaluateAutomaticPromotionGate(
      input({
        validation: validationReport({
          subject: {
            ...identifyStrategyValidationSubject(CANDIDATE),
            kind: 'ACTIVE_PROFILE',
          },
        }),
      }),
    );
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('validation_subject_not_candidate');
    expect(result.subjectMatched).toBeNull();
  });

  it('blocks evidence whose fingerprint describes a different candidate', () => {
    const result = evaluateAutomaticPromotionGate(
      input({ validation: validationReport({ subject: identifyStrategyValidationSubject(OTHER_PROFILE) }) }),
    );
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('validation_subject_mismatch');
    expect(result.subjectMatched).toBeNull();
    expect(result.validatedFingerprint).not.toBe(result.candidateFingerprint);
    // The gate stops at identity: it must not report a gate verdict derived
    // from someone else's run.
    expect(result.validationPassed).toBeNull();
    expect(result.failedGates).toEqual([]);
  });

  it('ignores provenance when comparing identity', () => {
    // The same candidate values reached from a different active revision are
    // still the same candidate. Provenance is recorded, not fingerprinted.
    const reachedFromAnotherRevision = optimizationCandidateSubject({
      definition: { strategyId: 'orbVwapBreakout', version: 3 },
      parameters: { breakoutAtrMultiple: 1.4, vwapConfirmBars: 2 },
      scannerConfig: null,
      sourceReportAt: REPORT_AT + 90_000,
      activeProfileRevision: 41,
    });
    const result = evaluateAutomaticPromotionGate(
      input({ candidateSubject: reachedFromAnotherRevision }),
    );
    expect(result.authorized).toBe(true);
    expect(result.subjectMatched).toBe(true);
  });
});

describe('automatic promotion gate — validation gate suite', () => {
  it('names every failed gate and blocks promotion', () => {
    const report = validationReport({
      gates: {
        data: true,
        sample: true,
        outOfSample: false,
        drawdown: true,
        stability: false,
        costResilience: true,
        regime: false,
        reproducibility: true,
      },
      passedAllGates: false,
    } as unknown as Partial<StrategyValidationReport>);
    const result = evaluateAutomaticPromotionGate(input({ validation: report }));
    expect(result.authorized).toBe(false);
    expect(result.validationPassed).toBe(false);
    expect(result.failedGates).toEqual(['outOfSample', 'stability', 'regime']);
    expect(result.blockers).toContain('validation_gates_failed');
  });

  it('does not trust passedAllGates when an individual gate failed', () => {
    const report = validationReport({
      gates: {
        data: true,
        sample: true,
        outOfSample: true,
        drawdown: true,
        stability: true,
        costResilience: true,
        regime: false,
        reproducibility: true,
      },
      passedAllGates: true,
    } as unknown as Partial<StrategyValidationReport>);
    const result = evaluateAutomaticPromotionGate(input({ validation: report }));
    expect(result.authorized).toBe(false);
    expect(result.failedGates).toEqual(['regime']);
  });
});


  it('blocks BASE_REPLAY even when all numerical gates pass', () => {
    const result = evaluateAutomaticPromotionGate(input({ validation: validationReport({ validationScope: 'BASE_REPLAY', fullStrategyValidated: false }) }));
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('validation_scope_not_full_strategy');
    expect(result.blockers).toContain('full_strategy_validation_required');
  });

  it('requires the explicit fullStrategyValidated proof flag', () => {
    const result = evaluateAutomaticPromotionGate(input({ validation: validationReport({ fullStrategyValidated: false }) }));
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('full_strategy_validation_required');
  });

describe('automatic promotion gate — rank threshold', () => {
  it('blocks a rank score below the automation minimum', () => {
    const result = evaluateAutomaticPromotionGate(
      input({ rank: rankScore({ score: AUTOMATIC_PROMOTION_MIN_RANK_SCORE - 0.1 }) }),
    );
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('rank_score_below_minimum');
  });

  it('accepts a rank score exactly at the minimum', () => {
    const result = evaluateAutomaticPromotionGate(
      input({ rank: rankScore({ score: AUTOMATIC_PROMOTION_MIN_RANK_SCORE }) }),
    );
    expect(result.authorized).toBe(true);
  });

  it('honours an explicit stricter minimum', () => {
    const result = evaluateAutomaticPromotionGate(input({ minRankScore: 90 }));
    expect(result.authorized).toBe(false);
    expect(result.minRankScore).toBe(90);
    expect(result.blockers).toContain('rank_score_below_minimum');
  });
});

describe('automatic promotion gate — upstream verdicts remain preconditions', () => {
  it('blocks when the optimizer found the candidate ineligible', () => {
    const result = evaluateAutomaticPromotionGate(input({ optimizerEligible: false }));
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('optimizer_promotion_not_eligible');
  });

  it('blocks when the multi-agent council did not approve', () => {
    const result = evaluateAutomaticPromotionGate(input({ councilApproved: false }));
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('multi_agent_council_not_approved');
  });

  it('can never authorize when everything upstream failed', () => {
    const result = evaluateAutomaticPromotionGate(
      input({ optimizerEligible: false, councilApproved: false, validation: null, rank: null }),
    );
    expect(result.authorized).toBe(false);
    expect(result.blockers).toHaveLength(4);
  });

  it('reports blockers without duplicates', () => {
    const result = evaluateAutomaticPromotionGate(input({ optimizerEligible: false }));
    expect(result.blockers).toEqual([...new Set(result.blockers)]);
  });
});
