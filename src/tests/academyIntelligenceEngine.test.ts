import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DerivedLevels, StrategyDefinition } from '../types';
import { discoveredStrategyFromDefinition, InternalStrategySourceAdapter, StrategyCollector } from '../features/academy/discovery/strategyCollector';
import { AutomatedEvaluationPipeline } from '../features/academy/evaluation/evaluationPipeline';
import { canTransitionAcademyLifecycle } from '../features/academy/evaluation/lifecycle';
import { AcademyStore } from '../features/academy/storage/academyStore';
import { StrategyKnowledgeBase } from '../features/academy/knowledge/strategyKnowledgeBase';
import { AcademyEngine } from '../features/academy/engine/academyEngine';
import { buildAcademyConsumerIntelligence } from '../features/academy/api/strategyIntelligence';
import { evaluateScanDecision } from '../services/scannerCore';
import { MathEngine } from '../services/mathEngine';
import { buildTradePlan } from '../services/tradePlan';
import { evaluateRiskGovernor, loadRiskGovernorPolicy } from '../services/riskGovernor';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function storagePath(): string {
  const root = mkdtempSync(join(tmpdir(), 'apex-academy-'));
  roots.push(root);
  return join(root, 'academy.json');
}

function strategy(overrides: Partial<StrategyDefinition> = {}): StrategyDefinition {
  return {
    strategyId: 'academy-test-strategy',
    version: 1,
    name: 'Academy Test Strategy',
    summary: 'Trend breakout strategy with bounded risk.',
    evidenceTier: ['A'],
    wave: 'wave1-mvp',
    status: 'candidate',
    longShort: 'BOTH',
    supportedIntervals: ['1h'],
    dataRequirements: ['Verified closed candles'],
    engine: 'scanner-preset',
    regimeRules: ['Trending and range regimes must be measured.'],
    setupRules: ['Require trend alignment.'],
    triggerRules: ['Enter on a verified breakout.'],
    riskRules: ['Use canonical risk governor.'],
    exitRules: ['Exit at stop or target.'],
    noTradeRules: ['Do not trade stale data.'],
    parameters: [{ key: 'lookback', label: 'Lookback', default: 20, min: 10, max: 40, step: 1, reason: 'Bounded research range.', optimization: 'enabled' }],
    sourceReferences: ['test-fixture'],
    knownFailureModes: ['Range whipsaw.'],
    categories: ['Trending', 'Breakout'],
    componentCount: 1,
    latestSnapshot: {
      score: 87,
      winRatePct: 58,
      netReturnPct: 12,
      maxDrawdownPct: 8,
      profitFactor: 1.6,
      lastBacktestAt: 1_000,
      source: 'validation',
      symbol: 'BTC-USDT',
      interval: '1h',
      direction: 'LONG',
      sampleSize: 2_000,
      runId: 'academy-run-1',
      validationMethod: 'walk-forward-sealed-holdout',
      validationScope: 'FULL_STRATEGY',
      fullStrategyValidated: true,
      dataState: 'live',
      gates: {
        data: true,
        sample: true,
        outOfSample: true,
        drawdown: true,
        stability: true,
        costResilience: true,
        regime: true,
        reproducibility: true,
        statisticalEvidence: true,
      },
      passedAllGates: true,
      regimesMeasured: ['TRENDING', 'RANGE'],
      regimesProfitable: ['TRENDING'],
      datasetFingerprint: 'a'.repeat(64),
      holdoutProtocolStatus: 'PASSED',
    },
    ...overrides,
  };
}

const levels: DerivedLevels = {
  symbol: 'BTC-USDT',
  entry: 100,
  resistances: [110, 115, 120],
  supports: [95, 92, 90],
  method: 'ATR_BANDS',
  atr14: 5,
  confidenceScore: 80,
  evidenceList: [],
  riskReward: { nearestTarget: 110, nearestStop: 95, rMultiple: 2, riskPct: 5 },
  dataState: 'live',
};

function tradePlan(academyIntelligence?: ReturnType<typeof buildAcademyConsumerIntelligence>) {
  return buildTradePlan({
    symbol: 'BTC-USDT', direction: 'LONG', levels,
    sizing: {
      accountBalanceUsd: 10_000, riskMode: 'PCT', riskValue: 1, leverage: 2,
      entryPrice: 100, stopLossPrice: 95, takeProfitPrice: 110, direction: 'LONG',
      successProbModel: 65, successProbUserOverride: null,
    },
    spread: 0.02, spreadState: 'VALID', fundingRate: 0.0001, fundingState: 'VALID', now: 1_000, ttlMs: 60_000,
    academyIntelligence,
  });
}

describe('Academy strategy ingestion and automated evaluation', () => {
  it('ingests canonical strategies with unique identity and mandatory evidence metadata', () => {
    const collector = new StrategyCollector();
    collector.register(new InternalStrategySourceAdapter(() => [strategy()], () => 2_000));
    const result = collector.collect();
    expect(result.issues).toEqual([]);
    expect(result.strategies).toHaveLength(1);
    expect(result.strategies[0].recordId).toBe('academy-test-strategy@1');
    expect(result.strategies[0].evidenceHistory.length).toBeGreaterThanOrEqual(2);
    expect(result.strategies[0].evidenceHistory.every((evidence) => Boolean(evidence.evidenceId && evidence.fingerprint))).toBe(true);
  });

  it('runs backtest, risk, robustness, scoring, and regime evaluation without filling unknown metrics', () => {
    const record = new AutomatedEvaluationPipeline().evaluate(discoveredStrategyFromDefinition(strategy(), 2_000), undefined, 2_000);
    expect(record.latestEvaluation.backtest).toMatchObject({ state: 'EVALUATED', passed: true });
    expect(record.latestEvaluation.risk).toMatchObject({ state: 'EVALUATED', passed: true });
    expect(record.latestEvaluation.robustness).toMatchObject({ state: 'EVALUATED', passed: true });
    expect(record.latestEvaluation.scoring.state).toBe('EVALUATED');
    expect(record.latestEvaluation.metrics.riskReward).toMatchObject({ state: 'NOT_EVALUATED', value: null });
    expect(record.regimeCompatibility.find((entry) => entry.regime === 'TRENDING')?.state).toBe('SUPPORTED');
    expect(record.regimeCompatibility.find((entry) => entry.regime === 'RANGE')?.state).toBe('WEAK');
  });
});

describe('Academy persistent knowledge storage and lifecycle', () => {
  it('persists and reloads strategy intelligence with evidence and validation history intact', () => {
    const path = storagePath();
    const store = new AcademyStore(path, 60_000);
    const knowledge = new StrategyKnowledgeBase(store);
    const record = new AutomatedEvaluationPipeline().evaluate(discoveredStrategyFromDefinition(strategy(), 2_000), undefined, 2_000);
    knowledge.upsert(record);
    const reloaded = new StrategyKnowledgeBase(new AcademyStore(path, 60_000)).get(record.recordId);
    expect(reloaded?.evidenceHistory).toEqual(record.evidenceHistory);
    expect(reloaded?.validationHistory).toEqual(record.validationHistory);
    expect(reloaded?.lifecycle).toBe('SHADOW');
  });

  it('enforces ordered validation lifecycle and reserves LIVE_ELIGIBLE for server governance', () => {
    expect(canTransitionAcademyLifecycle('DISCOVERED', 'BACKTESTED', 'ACADEMY_PIPELINE')).toBe(true);
    expect(canTransitionAcademyLifecycle('DISCOVERED', 'VALIDATED', 'ACADEMY_PIPELINE')).toBe(false);
    expect(canTransitionAcademyLifecycle('SHADOW', 'LIVE_ELIGIBLE', 'ACADEMY_PIPELINE')).toBe(false);
    expect(canTransitionAcademyLifecycle('SHADOW', 'LIVE_ELIGIBLE', 'SERVER_GOVERNANCE')).toBe(true);
    const record = new AutomatedEvaluationPipeline().evaluate(discoveredStrategyFromDefinition(strategy(), 2_000), undefined, 2_000);
    expect(record.lifecycleHistory.map((event) => event.to)).toEqual(['DISCOVERED', 'BACKTESTED', 'VALIDATED', 'SHADOW']);
  });

  it('starts, learns, stores, and stops without granting execution or automatic promotion authority', () => {
    const path = storagePath();
    const knowledge = new StrategyKnowledgeBase(new AcademyStore(path, 60_000));
    const collector = new StrategyCollector();
    collector.register(new InternalStrategySourceAdapter(() => [strategy()], () => 3_000));
    const engine = new AcademyEngine(collector, new AutomatedEvaluationPipeline(), knowledge, () => 3_000);
    const cycle = engine.start();
    expect(cycle.evaluated).toBe(1);
    expect(engine.status()).toMatchObject({ enabled: true, phase: 'IDLE', totalStrategies: 1 });
    expect(engine.status().safety).toEqual({ researchOnly: true, executionAuthorized: false, autonomousLiveExecutionEnabled: false, automaticPromotionEnabled: false });
    expect(engine.stop()).toMatchObject({ enabled: false, phase: 'OFF' });
  });
});

describe('Academy integration with Scanner, TradePlan, and RiskGovernor', () => {
  it('fails closed for an explicitly supplied retired strategy across all three decision layers', () => {
    const pipeline = new AutomatedEvaluationPipeline();
    const retired = pipeline.evaluate(discoveredStrategyFromDefinition(strategy({ status: 'blocked' }), 2_000), undefined, 2_000);
    expect(retired.lifecycle).toBe('RETIRED');

    const scannerIntelligence = buildAcademyConsumerIntelligence(retired, 'SCANNER', null, 2_000);
    const scan = evaluateScanDecision({
      smoothedObi: 0.5, smoothedVolDelta: 10, qStructDirectional: 0.5,
      price: 100, atr: 2, microPrice: 100.01, spread: 0.02, fundingRate: 0,
      sentiment: null, oiChangePercent: 1,
      cfg: {
        obiThreshold: -0.15, volumeThreshold: 0, qStructThreshold: -0.3, fundingThreshold: 0.0001,
        oiExpansionThresholdPct: 0.3, atrExpansionThreshold: 0.005, maxSqueezeRisk: 0.8,
        minEvidenceAgreement: 0.1, minSmartMoneyScore: 0, smcHardRejectThreshold: 0,
        scoreWeights: MathEngine.defaultScoreWeights(), directionBias: 'LONG_ONLY', minConfidence: 0.1,
      },
      heuristicAdj: 0,
      academyIntelligence: scannerIntelligence,
    });
    expect(scan).toMatchObject({ status: 'REJECTED', reasonCode: 'ACADEMY_INTELLIGENCE_BLOCKED' });

    const plan = tradePlan(buildAcademyConsumerIntelligence(retired, 'TRADE_PLAN', null, 2_000));
    expect(plan.valid).toBe(false);
    expect(plan.validationErrors.some((error) => error.includes('Academy'))).toBe(true);

    const validPlan = tradePlan();
    const risk = evaluateRiskGovernor({
      order: {
        symbol: validPlan.symbol, direction: validPlan.direction, quantity: validPlan.quantity,
        entryPrice: validPlan.entryPrice, notionalUsd: validPlan.sizing.positionSizeUsd,
        leverage: validPlan.leverage, reduceOnly: false, exchange: 'paper', strategy: retired.strategyId,
      },
      account: { equityUsd: 10_000, availableMarginUsd: 10_000, timestamp: 1_000 },
      portfolio: { openPositionCount: 0, totalOpenRiskUsd: 0, symbolExposureUsd: 0, correlatedExposureUsd: 0, dailyPnlUsd: 0, weeklyPnlUsd: 0, drawdownPct: 0, consecutiveLosses: 0 },
      market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
      executionMode: 'AUTOMATED', plan: validPlan, policy: loadRiskGovernorPolicy({}), now: 1_000,
      academyIntelligence: buildAcademyConsumerIntelligence(retired, 'RISK_GOVERNOR', null, 2_000),
    });
    expect(risk.decision).toBe('REJECTED');
    expect(risk.checks.find((check) => check.code === 'ACADEMY_STRATEGY_INTELLIGENCE')?.status).toBe('FAIL');
  });
});

