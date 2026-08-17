/**
 * Validation identity regression: candidate A must be validated as candidate A.
 *
 * THE BUG THIS LOCKS OUT
 *
 * `runStrategyDefinition` resolves the optimization profile with
 *
 *   const activeOptimization = args.applyActiveOptimization === false
 *     ? null
 *     : strategyOptimizationStore.getActive(optimizationContext);
 *
 * so *omitting* the flag meant "read whatever profile is currently promoted".
 * The validation suite omitted it. Validation therefore replayed active profile
 * B while the report claimed to describe the strategy, and the promotion gate —
 * which checked only strategy id, version and recency — could authorize
 * candidate A on B's evidence. It never looked like a failure. It looked like a
 * passing gate.
 *
 * WHAT THIS FILE PROVES
 *
 * With active profile B promoted and candidate A under consideration:
 *   1. A's materialized subject carries no value from B.
 *   2. Every validation replay of A pins `applyActiveOptimization: false`, so
 *      the store is not consulted and B cannot enter the parameter merge.
 *   3. Negative control — the pre-fix default really did resolve to B, using the
 *      real merge expression, so these assertions can detect the regression.
 *   4. The scanner config that reaches the engine is A's, and skipping B's
 *      deltas is materially different from applying them.
 *   5. The gate verdict follows A: B's evidence is rejected even when it is
 *      recent, same-strategy, same-version and all-gates-green.
 *
 * WHAT IT DOES NOT PROVE
 *
 * It does not replay real market history — `runStrategyDefinition` is private to
 * `registerApexNextMarketRoutes` and the suite needs 1,200 verified candles. The
 * final describe block therefore pins the route wiring structurally, and the
 * required `subject` field makes the compiler the other half of that guard.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SCANNER_CONFIG } from '../services/apexNextMarketRoutes';
import { normalizeStrategyParameterAliases } from '../services/strategyParameters';
import { applyStrategyOptimizationScannerDeltas } from '../services/strategyOptimization';
import type { StrategyOptimizationProfile } from '../services/strategyOptimizationStore';
import { getStrategyDefinition } from '../services/strategyRegistry';
import { buildScannerPresetConfig } from '../services/strategyEngine/scannerPresetAdapter';
import {
  activeProfileSubject,
  detectValidationSubjectLeak,
  fingerprintStrategyValidationSubject,
  identifyStrategyValidationSubject,
  optimizationCandidateSubject,
  validationReplayInputs,
} from '../services/strategyValidationSubject';
import { evaluateAutomaticPromotionGate } from '../services/strategyPromotionGate';
import type { ScannerConfig, StrategyDefinition, StrategyRankScore, StrategyValidationReport } from '../types';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const STRATEGY_ID = 'liquidity-sweep-fvg-reversal-v1';
const REPORT_AT = 1_700_000_000_000;

const definition = getStrategyDefinition(STRATEGY_ID) as StrategyDefinition;

function config(overrides: Partial<ScannerConfig> = {}): ScannerConfig {
  return {
    ...DEFAULT_SCANNER_CONFIG,
    scoreWeights: { ...DEFAULT_SCANNER_CONFIG.scoreWeights },
    ...overrides,
  };
}

/** Candidate A — the winner of the optimization run under consideration. */
const A_PARAMETERS = { minSmartMoneyScore: 0.44, 'weight.smc': 2.4 } as const;
const A_CONFIG = config({ minSmartMoneyScore: 0.44, minConfidence: 0.61 });

/** Active profile B — already promoted, deliberately different on every key. */
const B_PARAMETERS = { minSmartMoneyScore: 0.71, 'weight.smc': 1.1, 'fusion.sentiment': 0.2 } as const;
const PROFILE_B: StrategyOptimizationProfile = {
  strategyId: STRATEGY_ID,
  symbol: 'BTC-USDT',
  interval: '1h',
  direction: 'LONG',
  revision: 7,
  promotedAt: REPORT_AT - 900_000,
  promotedAtIso: new Date(REPORT_AT - 900_000).toISOString(),
  sourceReportAt: REPORT_AT - 950_000,
  parameters: { ...B_PARAMETERS },
  scannerConfig: config({ minSmartMoneyScore: 0.71, minConfidence: 0.88 }),
  scannerConfigDeltas: { minConfidence: 0.09, minSmartMoneyScore: 0.19 },
  source: 'AUTOMATIC_PROMOTION',
  active: true,
};

const subjectA = optimizationCandidateSubject({
  definition,
  parameters: { ...A_PARAMETERS },
  scannerConfig: A_CONFIG,
  sourceReportAt: REPORT_AT,
  activeProfileRevision: PROFILE_B.revision,
});

const subjectB = activeProfileSubject({ definition, profile: PROFILE_B });

it('uses a real registered scanner-preset strategy, not a fixture', () => {
  expect(definition).toBeTruthy();
  expect(definition.engine).toBe('scanner-preset');
});

describe('candidate A is materialized without active profile B', () => {
  it('carries only A\'s values', () => {
    expect(subjectA.kind).toBe('OPTIMIZATION_CANDIDATE');
    expect(subjectA.parameters).toEqual(A_PARAMETERS);
    expect(subjectA.parameters['fusion.sentiment']).toBeUndefined();
    expect(subjectA.scannerConfig?.minSmartMoneyScore).toBe(0.44);
    expect(subjectA.scannerConfig?.minConfidence).toBe(0.61);
  });

  it('reports no leakage from B, and the leak detector is not vacuous', () => {
    expect(
      detectValidationSubjectLeak(
        subjectA,
        { parameters: PROFILE_B.parameters, scannerConfig: PROFILE_B.scannerConfig },
        { parameters: A_PARAMETERS },
      ),
    ).toEqual([]);

    // Control: the same detector fires loudly when the subject really is B.
    const leaks = detectValidationSubjectLeak(
      subjectB,
      { parameters: PROFILE_B.parameters, scannerConfig: PROFILE_B.scannerConfig },
      { parameters: A_PARAMETERS },
    );
    expect(leaks).toContain('parameter_from_foreign_profile:minSmartMoneyScore');
    expect(leaks).toContain('parameter_from_foreign_profile:weight.smc');
    expect(leaks).toContain('parameter_absent_in_intended:fusion.sentiment');
    expect(leaks).toContain('scanner_config_identity_from_foreign_profile');
  });

  it('fingerprints A and B differently', () => {
    expect(fingerprintStrategyValidationSubject(subjectA))
      .not.toBe(fingerprintStrategyValidationSubject(subjectB));
  });

  it('is a snapshot, so promoting again mid-suite cannot move it', () => {
    const before = fingerprintStrategyValidationSubject(subjectA);
    // Simulate a promotion landing while the suite is still running.
    PROFILE_B.parameters.minSmartMoneyScore = 0.99;
    PROFILE_B.revision = 8;
    try {
      expect(fingerprintStrategyValidationSubject(subjectA)).toBe(before);
      expect(validationReplayInputs(subjectA).parameters).toEqual(A_PARAMETERS);
    } finally {
      PROFILE_B.parameters.minSmartMoneyScore = B_PARAMETERS.minSmartMoneyScore;
      PROFILE_B.revision = 7;
    }
  });
});

/**
 * The parameter merge from `runStrategyDefinition`, driven by the real
 * normalizer. `applyActiveOptimization` is passed through exactly as the replay
 * receives it so the pre-fix default (undefined) can be contrasted with the
 * pinned literal the validation suite now supplies.
 */
function effectiveParameters(replay: {
  parameters?: Record<string, number | string>;
  applyActiveOptimization?: boolean;
}): Record<string, number | string> {
  const activeOptimization = replay.applyActiveOptimization === false ? null : PROFILE_B;
  return normalizeStrategyParameterAliases(definition, {
    ...(activeOptimization?.parameters || {}),
    ...(replay.parameters || {}),
  });
}

describe('every validation replay of A is store-independent', () => {
  it('pins applyActiveOptimization to false rather than defaulting it', () => {
    const replay = validationReplayInputs(subjectA);
    expect(replay.applyActiveOptimization).toBe(false);
    expect(replay.parameters).toEqual(A_PARAMETERS);
    expect(replay.scannerConfig).toBe(A_CONFIG);
    // An explicit config is authoritative, so the definition's own overrides are
    // not re-applied on top of a config that already includes them.
    expect(replay.scannerConfigAuthoritative).toBe(true);
  });

  it('resolves to A even with B promoted', () => {
    const resolved = effectiveParameters(validationReplayInputs(subjectA));
    expect(resolved.minSmartMoneyScore).toBe(0.44);
    expect(resolved['weight.smc']).toBe(2.4);
    expect(resolved['fusion.sentiment']).toBeUndefined();
  });

  it('NEGATIVE CONTROL — the pre-fix default resolved to B', () => {
    // Omitting the flag is exactly what the suite used to do.
    const preFix = effectiveParameters({ parameters: {} });
    expect(preFix.minSmartMoneyScore).toBe(0.71);
    expect(preFix['fusion.sentiment']).toBe(0.2);

    // And B's values survived even when A's parameters were supplied, wherever A
    // did not happen to define the same key.
    const partiallyContaminated = effectiveParameters({ parameters: { ...A_PARAMETERS } });
    expect(partiallyContaminated.minSmartMoneyScore).toBe(0.44);
    expect(partiallyContaminated['fusion.sentiment']).toBe(0.2);
  });

  it('perturbs A when running stability neighbours, never B', () => {
    const replay = validationReplayInputs(subjectA, { 'weight.smc': 2.9 });
    expect(replay.applyActiveOptimization).toBe(false);
    expect(replay.parameters).toEqual({ minSmartMoneyScore: 0.44, 'weight.smc': 2.9 });
    expect(effectiveParameters(replay)['fusion.sentiment']).toBeUndefined();
  });

  it('hands the engine A\'s scanner config, and skipping B\'s deltas is material', () => {
    const replay = validationReplayInputs(subjectA);
    const resolved = buildScannerPresetConfig(
      replay.scannerConfig ?? DEFAULT_SCANNER_CONFIG,
      definition,
      effectiveParameters(replay),
      { applyDefinitionOverrides: !replay.scannerConfigAuthoritative },
    );
    expect(resolved.minSmartMoneyScore).toBe(0.44);
    expect(resolved.minConfidence).toBe(0.61);

    // Had B's profile been resolved, its deltas would have been layered on — so
    // not applying them is a real difference in what the engine measures.
    const withBDeltas = applyStrategyOptimizationScannerDeltas(resolved, PROFILE_B.scannerConfigDeltas);
    expect(withBDeltas.minConfidence).not.toBe(resolved.minConfidence);
    expect(withBDeltas.minSmartMoneyScore).not.toBe(resolved.minSmartMoneyScore);
  });
});

/**
 * An all-green report. Everything the old gate checked is deliberately correct —
 * same strategy, same version, produced after the optimization report, every gate
 * passing — so the only thing that can distinguish A's evidence from B's is the
 * subject.
 */
function report(subject: StrategyValidationReport['subject']): StrategyValidationReport {
  return {
    strategyId: STRATEGY_ID,
    strategyVersion: definition.version,
    runAt: REPORT_AT + 5_000,
    subject,
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
  } as unknown as StrategyValidationReport;
}

const rank = {
  strategyId: STRATEGY_ID,
  strategyVersion: definition.version,
  score: 81.4,
  penalties: [],
} as unknown as StrategyRankScore;

function gate(validation: StrategyValidationReport) {
  return evaluateAutomaticPromotionGate({
    strategyId: STRATEGY_ID,
    strategyVersion: definition.version,
    reportGeneratedAt: REPORT_AT,
    optimizerEligible: true,
    councilApproved: true,
    validation,
    rank,
    candidateSubject: subjectA,
  });
}

describe('the promotion verdict for A derives from A', () => {
  it('authorizes A on evidence that measured A', () => {
    const result = gate(report(identifyStrategyValidationSubject(subjectA)));
    expect(result.authorized).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.subjectMatched).toBe(true);
    expect(result.validationPassed).toBe(true);
    expect(result.validatedFingerprint).toBe(fingerprintStrategyValidationSubject(subjectA));
  });

  it('refuses to promote A on active profile B\'s evidence', () => {
    const result = gate(report(identifyStrategyValidationSubject(subjectB)));
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('validation_subject_not_candidate');
    expect(result.subjectMatched).toBeNull();
    // No verdict is inherited from a run that measured something else.
    expect(result.validationPassed).toBeNull();
    expect(result.failedGates).toEqual([]);
  });

  it('refuses even when B\'s evidence is relabelled as a candidate', () => {
    // The narrowest version of the bug: B's numbers, A's kind. Only the
    // fingerprint separates them.
    const relabelled = { ...identifyStrategyValidationSubject(subjectB), kind: 'OPTIMIZATION_CANDIDATE' as const };
    const result = gate(report(relabelled));
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('validation_subject_mismatch');
    expect(result.validatedFingerprint).toBe(fingerprintStrategyValidationSubject(subjectB));
    expect(result.candidateFingerprint).toBe(fingerprintStrategyValidationSubject(subjectA));
    expect(result.validationPassed).toBeNull();
  });

  it('refuses a report that never named what it measured', () => {
    const result = gate(report(undefined));
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('validation_subject_missing');
  });
});

/**
 * `runStrategyDefinition` is private to `registerApexNextMarketRoutes`, so the
 * assertions above cannot reach the route itself. These pin the wiring instead.
 * The compiler is the other half of the guard: `subject` is a required field on
 * the suite and `candidateSubject` is required on the gate, so a caller that
 * drops one does not build.
 */
describe('both callers share one candidate-specific runner', () => {
  it('routes every validation replay through the pinned subject', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    // The suite takes its identity from the caller and never decides for itself.
    expect(routes).toContain('subject: StrategyValidationSubject;');
    // Slice replays, including stability neighbours, are built by the helper that
    // pins the literal false.
    expect(routes).toContain('...validationReplayInputs(subject, overrides),');
    expect(routes).toContain('subject: identifyStrategyValidationSubject(subject),');
    // Neighbour perturbations come from the subject, not from a store lookup.
    expect(routes).toContain('Object.entries(subject.parameters)');
    // No replay inside the suite may re-enable the store read.
    expect(routes).not.toMatch(/validationReplayInputs\([^)]*\)[\s\S]{0,120}applyActiveOptimization:\s*true/);
  });

  it('gives the automatic path one object for both validating and promoting', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    expect(routes).toContain('const candidateSubject = optimizationCandidateSubject({');
    expect(routes).toContain('subject: candidateSubject,');
    expect(routes).toContain('candidateSubject,');
    // The active profile may appear only as an explicit comparison.
    expect(routes).toContain('? activeProfileSubject({ definition: args.definition, profile: activeProfile })');
  });

  it('makes the manual /validate route state its subject', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    expect(routes).toContain('const subject = activeProfile');
    expect(routes).toContain('? activeProfileSubject({ definition, profile: activeProfile })');
    expect(routes).toContain(': definitionDefaultsSubject(definition);');
    expect(routes).toContain('costAssumptions, subject,');
  });
});
