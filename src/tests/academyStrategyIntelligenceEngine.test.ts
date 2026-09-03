import { describe, it, expect } from 'vitest';
import {
  AcademyStrategyIntelligenceEngine,
  type StrategyDescriptor,
  type StrategyEvidenceBundle,
  type CostStressEvidence,
  type RobustnessEvidence,
  type MarketRegimeContext,
} from '../features/academy/engine/strategyIntelligenceEngine.ts';

describe('AcademyStrategyIntelligenceEngine (Phase E & F)', () => {
  const stratA: StrategyDescriptor = {
    strategyId: 'trend-pullback-v1',
    strategyVersion: 1,
    recordId: 'trend-pullback-v1@1',
    name: 'Trend Pullback Strategy',
    family: 'Trend',
    categories: ['momentum', 'trend'],
    timeframes: ['1h', '4h'],
  };

  const stratB: StrategyDescriptor = {
    strategyId: 'mean-reversion-v2',
    strategyVersion: 2,
    recordId: 'mean-reversion-v2@2',
    name: 'Mean Reversion Strategy',
    family: 'Reversion',
    categories: ['mean_reversion', 'range'],
    timeframes: ['15m', '1h'],
  };

  const stratC: StrategyDescriptor = {
    strategyId: 'unverified-breakout-v1',
    strategyVersion: 1,
    recordId: 'unverified-breakout-v1@1',
    name: 'Unverified Breakout Strategy',
    family: 'Breakout',
  };

  const evidenceA: StrategyEvidenceBundle = {
    strategyId: 'trend-pullback-v1',
    strategyVersion: 1,
    recordId: 'trend-pullback-v1@1',
    evidenceId: 'ev-trend-001',
    provenance: {
      source: 'internal_walkforward',
      datasetFingerprint: 'sha256:abcd1234efgh5678',
      runId: 'run-wf-001',
      timestamp: Date.now() - 3600_000,
      verified: true,
    },
    metrics: {
      sampleSize: 180,
      winRatePct: 58.5,
      profitFactor: 2.1,
      maxDrawdownPct: 7.5,
      sharpeRatio: 1.9,
      sortinoRatio: 2.4,
      netReturnPct: 34.2,
      turnover: 1.2,
    },
    validationGates: {
      gateData: true,
      gateSample: true,
      gateOutOfSample: true,
      gateDrawdown: true,
      gateStability: true,
      gateCostResilience: true,
    },
    regimesMeasured: ['TRENDING', 'HIGH_VOLATILITY', 'RANGE'],
    regimesProfitable: ['TRENDING', 'HIGH_VOLATILITY'],
    holdoutProtocolStatus: 'SEALED',
  };

  const evidenceB: StrategyEvidenceBundle = {
    strategyId: 'mean-reversion-v2',
    strategyVersion: 2,
    recordId: 'mean-reversion-v2@2',
    evidenceId: 'ev-rev-002',
    provenance: {
      source: 'internal_walkforward',
      datasetFingerprint: 'sha256:1122334455667788',
      runId: 'run-wf-002',
      timestamp: Date.now() - 7200_000,
      verified: true,
    },
    metrics: {
      sampleSize: 140,
      winRatePct: 62.0,
      profitFactor: 1.7,
      maxDrawdownPct: 9.8,
      sharpeRatio: 1.5,
      sortinoRatio: 1.9,
      netReturnPct: 22.1,
      turnover: 3.5,
    },
    validationGates: {
      gateData: true,
      gateSample: true,
      gateOutOfSample: true,
      gateDrawdown: true,
      gateStability: true,
      gateCostResilience: true,
    },
    regimesMeasured: ['RANGE', 'LOW_VOLATILITY'],
    regimesProfitable: ['RANGE'],
    holdoutProtocolStatus: 'SEALED',
  };

  const costEvidenceA: CostStressEvidence = {
    strategyId: 'trend-pullback-v1',
    strategyVersion: 1,
    feeSlippageMultiplier: 2.0,
    passed: true,
    netEdgeRetainedPct: 78,
  };

  const robustnessA: RobustnessEvidence = {
    strategyId: 'trend-pullback-v1',
    strategyVersion: 1,
    parameterStabilityScore: 0.82,
    neighborStabilityScore: 0.79,
    deflatedSharpeRatio: 1.6,
    pboProbability: 0.12,
    bootstrapPassed: true,
  };

  it('computes multi-dimensional scores with explicit NOT_EVALUATED for missing dimensions', () => {
    const engine = new AcademyStrategyIntelligenceEngine();
    const result = engine.evaluate({
      strategies: [stratA, stratC],
      evidence: [evidenceA],
      costEvidence: [costEvidenceA],
      robustnessEvidence: [robustnessA],
      regimeContext: { currentRegime: 'TRENDING' },
    });

    expect(result.strategyScores).toHaveLength(2);
    const scoreA = result.strategyScores.find((s) => s.strategyId === 'trend-pullback-v1');
    const scoreC = result.strategyScores.find((s) => s.strategyId === 'unverified-breakout-v1');

    expect(scoreA?.compositeScore).toBeGreaterThan(60);
    expect(scoreA?.confidence).toBeGreaterThan(0.5);
    expect(scoreA?.evidenceQuality.status).toBe('EVALUATED');
    expect(scoreA?.costRobustness.status).toBe('EVALUATED');

    // Strat C has missing evidence -> explicitly NOT_EVALUATED and value is null
    expect(scoreC?.compositeScore).toBeNull();
    expect(scoreC?.evidenceQuality.status).toBe('NOT_EVALUATED');
    expect(scoreC?.evidenceQuality.value).toBeNull();
    expect(scoreC?.costRobustness.status).toBe('NOT_EVALUATED');
    expect(scoreC?.costRobustness.value).toBeNull();
    expect(scoreC?.missingDimensionsCount).toBeGreaterThan(0);
  });

  it('ranks strategies deterministically with explainable rationale', () => {
    const engine = new AcademyStrategyIntelligenceEngine();
    const result = engine.evaluate({
      strategies: [stratA, stratB, stratC],
      evidence: [evidenceA, evidenceB],
      costEvidence: [costEvidenceA],
      robustnessEvidence: [robustnessA],
      regimeContext: { currentRegime: 'TRENDING' },
    });

    expect(result.rankings).toHaveLength(3);
    expect(result.rankings[0].strategyId).toBe('trend-pullback-v1');
    expect(result.rankings[0].rank).toBe(1);
    expect(result.rankings[0].rankReasons.length).toBeGreaterThan(0);

    // Unverified strategy without evidence must rank last
    expect(result.rankings[2].strategyId).toBe('unverified-breakout-v1');
  });

  it('generates pairwise comparisons explaining why A ranks above B', () => {
    const engine = new AcademyStrategyIntelligenceEngine();
    const result = engine.evaluate({
      strategies: [stratA, stratB],
      evidence: [evidenceA, evidenceB],
      costEvidence: [costEvidenceA],
      robustnessEvidence: [robustnessA],
      regimeContext: { currentRegime: 'TRENDING' },
    });

    expect(result.comparisons).toHaveLength(1);
    const comp = result.comparisons[0];
    expect(comp.winnerId).toBe('trend-pullback-v1@1');
    expect(comp.reasons.length).toBeGreaterThan(0);
    expect(comp.reasons[0]).toContain('trend-pullback-v1@1');
  });

  it('calculates similarity and diversity matrix discouraging collinearity', () => {
    const engine = new AcademyStrategyIntelligenceEngine();
    const result = engine.evaluate({
      strategies: [stratA, stratB],
      evidence: [evidenceA, evidenceB],
    });

    const matrix = result.similarityDiversity;
    expect(matrix.strategyIds).toContain('trend-pullback-v1@1');
    expect(matrix.strategyIds).toContain('mean-reversion-v2@2');

    // Self similarity is 1.0, diversity is 0.0
    expect(matrix.similarity['trend-pullback-v1@1']['trend-pullback-v1@1']).toBe(1.0);
    expect(matrix.diversity['trend-pullback-v1@1']['trend-pullback-v1@1']).toBe(0.0);

    // Cross diversity is positive (complimentary strategies)
    const crossDiv = matrix.diversity['trend-pullback-v1@1']['mean-reversion-v2@2'];
    expect(crossDiv).toBeGreaterThan(0.4);
    expect(matrix.averagePortfolioDiversity).toBeGreaterThan(0);
  });

  it('composes fusion candidates and rejects collinear or cost-failing pairs', () => {
    const engine = new AcademyStrategyIntelligenceEngine();
    const result = engine.evaluate({
      strategies: [stratA, stratB],
      evidence: [evidenceA, evidenceB],
      costEvidence: [costEvidenceA],
      robustnessEvidence: [robustnessA],
      regimeContext: { currentRegime: 'TRENDING' },
    });

    expect(result.candidateCombinations.length).toBeGreaterThan(0);
    const cand = result.candidateCombinations[0];
    expect(cand.candidateId).toMatch(/^candidate-fusion-/);
    expect(cand.parentStrategies).toHaveLength(2);
    expect(cand.status).toBe('QUALIFIED');
    expect(cand.parentStrategies.reduce((sum, p) => sum + p.weight, 0)).toBeCloseTo(1.0, 2);
  });

  it('issues research decisions and preserves the non-negotiable safety contract', () => {
    const engine = new AcademyStrategyIntelligenceEngine();
    const result = engine.evaluate({
      strategies: [stratA, stratB],
      evidence: [evidenceA, evidenceB],
      costEvidence: [costEvidenceA],
      robustnessEvidence: [robustnessA],
      regimeContext: { currentRegime: 'TRENDING' },
    });

    // Valid decisions: REJECT, OBSERVE, NEEDS_EVIDENCE, NEEDS_ROBUSTNESS, RESEARCH_CANDIDATE, SHADOW_ELIGIBLE, BLOCKED
    expect(['RESEARCH_CANDIDATE', 'SHADOW_ELIGIBLE']).toContain(result.overallDecision);
    expect(result.safetyContract.autonomousLiveExecutionEnabled).toBe(false);
    expect(result.safetyContract.automaticPromotionEnabled).toBe(false);
    expect(result.safetyContract.riskGovernorIsAuthoritative).toBe(true);
    expect(result.safetyContract.advisoryOnly).toBe(true);
  });

  it('records outcome feedback for adaptive deterministic weighting', () => {
    const engine = new AcademyStrategyIntelligenceEngine();
    engine.recordOutcomeFeedback({
      strategyId: 'trend-pullback-v1',
      strategyVersion: 1,
      timestamp: Date.now(),
      expectedReturnPct: 5.0,
      observedReturnPct: 4.2,
      observedDrawdownPct: 2.1,
      concordance: true,
    });

    const history = engine.getOutcomeHistory();
    expect(history).toHaveLength(1);
    expect(history[0].strategyId).toBe('trend-pullback-v1');
    expect(history[0].concordance).toBe(true);
  });
});
