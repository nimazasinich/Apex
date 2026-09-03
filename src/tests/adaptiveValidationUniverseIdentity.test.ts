import { describe, expect, it } from 'vitest';
import type { StrategyRankScore, StrategyValidationReport } from '../types';
import { getStrategyDefinition } from '../services/strategyRegistry';
import { evaluateAutomaticPromotionGate } from '../services/strategyPromotionGate';
import { buildStrategyParameterValues } from '../services/strategyParameters';
import {
  buildStrategyValidationUniverseIdentity,
  identifyStrategyValidationSubject,
  optimizationCandidateSubject,
} from '../services/strategyValidationSubject';

const definition = getStrategyDefinition('adaptive-long-short-trend-portfolio-v1')!;
const parameters = buildStrategyParameterValues(definition, undefined);

function universe(shift = 0, symbols: string[] = ['ETH-USDT', 'BTC-USDT']) {
  return Object.fromEntries(symbols.map((symbol, symbolIndex) => [symbol, Array.from({ length: 220 }, (_, index) => ({
    time: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
    open: 100 + (symbol === 'ETH-USDT' ? 10 : 0) + index + shift,
    high: 101 + (symbol === 'ETH-USDT' ? 10 : 0) + index + shift,
    low: 99 + (symbol === 'ETH-USDT' ? 10 : 0) + index + shift,
    close: 100.5 + (symbol === 'ETH-USDT' ? 10 : 0) + index + shift,
    volume: 1000 + index,
  }))]));
}

const identityA = buildStrategyValidationUniverseIdentity({ interval: '1h', universeCandles: universe() })!;
const identityReordered = buildStrategyValidationUniverseIdentity({ interval: '1h', universeCandles: universe(0, ['BTC-USDT', 'ETH-USDT']) })!;
const identityB = buildStrategyValidationUniverseIdentity({ interval: '1h', universeCandles: universe(0.25) })!;
const identityDifferentSymbols = buildStrategyValidationUniverseIdentity({ interval: '1h', universeCandles: universe(0, ['BTC-USDT', 'SOL-USDT']) })!;

const subjectA = optimizationCandidateSubject({
  definition,
  parameters,
  scannerConfig: null,
  sourceReportAt: 1_000,
  activeProfileRevision: null,
  universeIdentity: identityA,
});

const rank = { strategyId: definition.strategyId, strategyVersion: definition.version, score: 90, penalties: [] } as unknown as StrategyRankScore;

function report(subject: ReturnType<typeof identifyStrategyValidationSubject>): StrategyValidationReport {
  return {
    strategyId: definition.strategyId,
    strategyVersion: definition.version,
    runAt: 2_000,
    subject,
    gates: { data: true, sample: true, outOfSample: true, drawdown: true, stability: true, costResilience: true, regime: true, reproducibility: true },
    passedAllGates: true,
    validationScope: 'FULL_STRATEGY',
    fullStrategyValidated: true,
  } as unknown as StrategyValidationReport;
}

function gate(validationSubject: ReturnType<typeof optimizationCandidateSubject>) {
  return evaluateAutomaticPromotionGate({
    strategyId: definition.strategyId,
    strategyVersion: definition.version,
    reportGeneratedAt: 1_000,
    optimizerEligible: true,
    councilApproved: true,
    validation: report(identifyStrategyValidationSubject(validationSubject)),
    rank,
    candidateSubject: subjectA,
  });
}

describe('adaptive validation universe identity', () => {
  it('normalizes symbol ordering without changing identity', () => {
    expect(identityReordered.contentFingerprint).toBe(identityA.contentFingerprint);
    expect(identityReordered.symbols).toEqual(['BTC-USDT', 'ETH-USDT']);
  });

  it('allows the exact synchronized universe and candidate identity', () => {
    const result = gate(subjectA);
    expect(result.authorized).toBe(true);
    expect(result.subjectMatched).toBe(true);
  });

  it('blocks missing universe identity', () => {
    const missing = optimizationCandidateSubject({ definition, parameters, scannerConfig: null, sourceReportAt: 1_000, activeProfileRevision: null });
    const result = gate(missing);
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('validation_universe_identity_missing');
  });

  it('blocks a different symbol universe or materially different data window', () => {
    const foreign = optimizationCandidateSubject({ definition, parameters, scannerConfig: null, sourceReportAt: 1_000, activeProfileRevision: null, universeIdentity: identityB });
    const result = gate(foreign);
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('validation_subject_mismatch');
  });

  it('blocks a different normalized symbol set', () => {
    const foreign = optimizationCandidateSubject({ definition, parameters, scannerConfig: null, sourceReportAt: 1_000, activeProfileRevision: null, universeIdentity: identityDifferentSymbols });
    const result = gate(foreign);
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('validation_subject_mismatch');
  });

  it('keeps a single-symbol diagnostic from becoming promotion evidence', () => {
    const diagnostic = optimizationCandidateSubject({ definition, parameters, scannerConfig: null, sourceReportAt: 1_000, activeProfileRevision: null });
    const result = gate(diagnostic);
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('validation_universe_identity_missing');
  });

  it('blocks a materially different candidate even on the same universe', () => {
    const foreignCandidate = optimizationCandidateSubject({
      definition,
      parameters: { ...parameters, rewardRisk: Number(parameters.rewardRisk) + 0.1 },
      scannerConfig: null,
      sourceReportAt: 1_000,
      activeProfileRevision: null,
      universeIdentity: identityA,
    });
    const result = gate(foreignCandidate);
    expect(result.authorized).toBe(false);
    expect(result.blockers).toContain('validation_subject_mismatch');
  });
});
