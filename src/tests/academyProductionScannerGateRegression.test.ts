import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StrategyKnowledgeBase } from '../features/academy/knowledge/strategyKnowledgeBase';
import { AcademyStore } from '../features/academy/storage/academyStore';
import { DefaultAcademyIntelligenceProvider } from '../features/academy/services/academyIntelligenceProvider';
import { evaluateScanDecision } from '../services/scannerCore';
import type { ScannerConfig } from '../types';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function createMockStore(): AcademyStore {
  const root = mkdtempSync(join(tmpdir(), 'apex-academy-test-'));
  roots.push(root);
  return new AcademyStore(join(root, 'academy.json'), 60_000);
}

function createSampleRecord(strategyId: string, version: number, lifecycle: 'SHADOW' | 'INCUBATING' | 'LIVE_ELIGIBLE' = 'SHADOW'): any {
  return {
    recordId: `${strategyId}@${version}`,
    strategyId,
    version,
    name: `${strategyId} v${version}`,
    sourceKind: 'internal_source',
    source: 'internal',
    metadata: {},
    logic: { summary: 'Sample', setupRules: [], triggerRules: [], riskRules: [], exitRules: [], noTradeRules: [] },
    indicators: { state: 'EVALUATED', values: ['ema', 'atr'], detail: 'ok' },
    parameters: [],
    marketConditions: [],
    sourceReferences: [],
    knownFailureModes: [],
    categories: ['trend'],
    evidenceHistory: [
      {
        evidenceId: 'ev-001',
        kind: 'VALIDATION',
        source: 'internal',
        sourceKind: 'INTERNAL_STRATEGY_ENGINE',
        verification: 'INTERNAL_RECORDED',
        observedAt: Date.now(),
        ingestedAt: Date.now(),
        fingerprint: 'f1',
        dataState: 'live',
        datasetFingerprint: null,
        runId: null,
        notes: [],
      },
    ],
    latestSnapshot: null,
    performanceEvidenceTrusted: true,
    registryStatus: 'validated',
    lifecycle,
    lifecycleHistory: [],
    validationHistory: [],
    latestEvaluation: {
      overall: 'EVALUATED',
      confidenceScore: { state: 'EVALUATED', value: 0.85, evidenceIds: ['ev-001'], detail: 'High' },
      rankScore: { state: 'EVALUATED', value: 85, evidenceIds: ['ev-001'], detail: 'Rank' },
      blockers: [],
      evaluatedAt: Date.now(),
      evidenceFingerprint: 'f1',
      backtest: { state: 'EVALUATED', passed: true, evidenceIds: ['ev-001'], detail: 'Pass' },
      risk: { state: 'EVALUATED', passed: true, evidenceIds: ['ev-001'], detail: 'Pass' },
      robustness: { state: 'EVALUATED', passed: true, evidenceIds: ['ev-001'], detail: 'Pass' },
      scoring: { state: 'EVALUATED', passed: true, evidenceIds: ['ev-001'], detail: 'Pass' },
      metrics: {
        winRatePct: { state: 'EVALUATED', value: 60, evidenceIds: ['ev-001'], detail: 'Win' },
        profitFactor: { state: 'EVALUATED', value: 1.8, evidenceIds: ['ev-001'], detail: 'PF' },
        maxDrawdownPct: { state: 'EVALUATED', value: 8, evidenceIds: ['ev-001'], detail: 'DD' },
        riskReward: { state: 'EVALUATED', value: 2, evidenceIds: ['ev-001'], detail: 'RR' },
        stability: { state: 'EVALUATED', value: true, evidenceIds: ['ev-001'], detail: 'Stab' },
        marketRegimePerformance: { state: 'EVALUATED', value: { measured: ['TRENDING'], profitable: ['TRENDING'] }, evidenceIds: ['ev-001'], detail: 'Regime' },
        dataQuality: { state: 'EVALUATED', value: 'LIVE', evidenceIds: ['ev-001'], detail: 'Data' },
      },
    },
    regimeCompatibility: [
      { regime: 'TRENDING', state: 'SUPPORTED', evidenceIds: ['ev-001'], detail: 'strong' },
      { regime: 'HIGH_VOLATILITY', state: 'WEAK', evidenceIds: ['ev-001'], detail: 'weak' },
    ],
    riskProfile: { value: 'LOW', state: 'EVALUATED', evidenceIds: ['ev-001'], detail: 'low' },
    embedding: [],
    similarityClusterId: null,
    patterns: [],
    evolutionSuggestions: [],
    knowledgeRank: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

import { MathEngine } from '../services/mathEngine';

const testScannerConfig: ScannerConfig = {
  intervalMs: 6005,
  obiThreshold: -0.15,
  volumeThreshold: 0,
  qStructThreshold: -0.30,
  fundingThreshold: 0.0001,
  oiExpansionThresholdPct: 0.30,
  atrExpansionThreshold: 0.005,
  maxSqueezeRisk: 0.46,
  minEvidenceAgreement: 0.64,
  minSmartMoneyScore: 0.52,
  smcHardRejectThreshold: 0.22,
  thresholdMode: 'ADAPTIVE_GUARDRAILS',
  adaptiveLearningRate: 0.04,
  adaptiveMinSamples: 24,
  scoreWeights: MathEngine.defaultScoreWeights(),
  minConfidence: 0.78,
  directionBias: 'BOTH',
  topRankSkip: 10,
  minVolume24hUsd: 100_000,
};

describe('Academy Production Scanner Gate Regression', () => {
  it('passes validated shadow strategy intelligence with compatible regime through scanner gate', () => {
    const store = createMockStore();
    const kb = new StrategyKnowledgeBase(store);
    const baseRecord = createSampleRecord('trend-pullback', 2, 'SHADOW');
    kb.putExact('trend-pullback', 2, baseRecord);
    kb.persistStatus({ ...kb.status(), enabled: true, phase: 'IDLE' });
    const provider = new DefaultAcademyIntelligenceProvider(kb);

    const resolution = provider.resolve({
      strategyId: 'trend-pullback',
      strategyVersion: 2,
      consumer: 'SCANNER',
      regime: 'TRENDING',
    });

    expect(resolution.status).toBe('RESOLVED');
    expect(resolution.intelligence?.state).toBe('VALIDATED_SHADOW');

    const decision = evaluateScanDecision({
      smoothedObi: 0.25,
      smoothedVolDelta: 1500,
      qStructDirectional: 0.35,
      price: 50_000,
      atr: 500,
      microPrice: 50_005,
      spread: 2,
      fundingRate: 0.00005,
      sentiment: null,
      cfg: testScannerConfig,
      heuristicAdj: 0,
      academyIntelligence: resolution.intelligence ?? undefined,
    });

    expect(decision.reasonCode).not.toBe('ACADEMY_INTELLIGENCE_BLOCKED');
  });

  it('rejects scanner evaluation when Academy intelligence fails closed on weak regime', () => {
    const store = createMockStore();
    const kb = new StrategyKnowledgeBase(store);
    const baseRecord = createSampleRecord('trend-pullback', 2, 'SHADOW');
    kb.putExact('trend-pullback', 2, baseRecord);
    kb.persistStatus({ ...kb.status(), enabled: true, phase: 'IDLE' });
    const provider = new DefaultAcademyIntelligenceProvider(kb);

    const resolution = provider.resolve({
      strategyId: 'trend-pullback',
      strategyVersion: 2,
      consumer: 'SCANNER',
      regime: 'HIGH_VOLATILITY', // WEAK regime compatibility
    });

    expect(resolution.status).toBe('RESOLVED');
    expect(resolution.intelligence?.regimeCompatibility).toBe('WEAK');

    const decision = evaluateScanDecision({
      smoothedObi: 0.25,
      smoothedVolDelta: 1500,
      qStructDirectional: 0.35,
      price: 50_000,
      atr: 500,
      microPrice: 50_005,
      spread: 2,
      fundingRate: 0.00005,
      sentiment: null,
      cfg: testScannerConfig,
      heuristicAdj: 0,
      academyIntelligence: resolution.intelligence ?? undefined,
    });

    expect(decision.status).toBe('REJECTED');
    expect(decision.reasonCode).toBe('ACADEMY_INTELLIGENCE_BLOCKED');
  });

  it('fails closed on exact version mismatch between requested and stored strategy', () => {
    const store = createMockStore();
    const kb = new StrategyKnowledgeBase(store);
    const baseRecord = createSampleRecord('trend-pullback', 2, 'SHADOW');
    kb.putExact('trend-pullback', 2, baseRecord); // stored at version 2
    kb.persistStatus({ ...kb.status(), enabled: true, phase: 'IDLE' });
    const provider = new DefaultAcademyIntelligenceProvider(kb);

    const resolution = provider.resolve({
      strategyId: 'trend-pullback',
      strategyVersion: 1, // requesting version 1
      consumer: 'SCANNER',
    });

    expect(resolution.status).toBe('VERSION_MISMATCH');
    expect(resolution.intelligence).toBeNull();
  });

  it('allows strategy-agnostic market scan without attaching Academy intelligence', () => {
    const decision = evaluateScanDecision({
      smoothedObi: 0.25,
      smoothedVolDelta: 1500,
      qStructDirectional: 0.35,
      price: 50_000,
      atr: 500,
      microPrice: 50_005,
      spread: 2,
      fundingRate: 0.00005,
      sentiment: null,
      cfg: testScannerConfig,
      heuristicAdj: 0,
      // No academyIntelligence
    });

    expect(decision.reasonCode).not.toBe('ACADEMY_INTELLIGENCE_BLOCKED');
  });
});
