import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it, expect } from 'vitest';
import {
  DefaultAcademyIntelligenceProvider,
  createAcademySubsystem,
} from '../features/academy/index.ts';
import { StrategyKnowledgeBase } from '../features/academy/knowledge/strategyKnowledgeBase.ts';
import { AcademyStore } from '../features/academy/storage/academyStore.ts';
import { buildTradePlan } from '../services/tradePlan.ts';
import { evaluateRiskGovernor, loadRiskGovernorPolicy } from '../services/riskGovernor.ts';
import { buildCanonicalDecision } from '../services/canonicalDecisionAdapter.ts';
import type { AcademyConsumerIntelligence } from '../features/academy/types.ts';
import type { CandidateScore, DerivedLevels } from '../types.ts';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function createMockStore(): AcademyStore {
  const root = mkdtempSync(join(tmpdir(), 'apex-academy-test-'));
  roots.push(root);
  return new AcademyStore(join(root, 'academy.json'), 60_000);
}

function createSampleLevels(symbol = 'BTC/USDT', entry = 50_000, direction: 'LONG' | 'SHORT' = 'LONG'): DerivedLevels {
  const atr = Math.max(1, entry * 0.02);
  const resistances: [number, number, number] = direction === 'LONG'
    ? [entry + atr * 2, entry + atr * 3, entry + atr * 4]
    : [entry + atr, entry + atr * 1.5, entry + atr * 2];
  const supports: [number, number, number] = direction === 'LONG'
    ? [entry - atr, entry - atr * 1.5, entry - atr * 2]
    : [entry - atr * 2, entry - atr * 3, entry - atr * 4];
  return {
    symbol,
    entry,
    resistances,
    supports,
    method: 'SWING_STRUCTURE',
    atr14: atr,
    confidenceScore: 85,
    evidenceList: [],
    riskReward: {
      nearestTarget: direction === 'LONG' ? entry + atr * 2 : entry - atr * 2,
      nearestStop: direction === 'LONG' ? entry - atr : entry + atr,
      rMultiple: 2,
      riskPct: 1,
    },
    dataState: 'live',
  };
}

function createSampleIntelligence(
  strategyId: string,
  version: number,
  state: 'VALIDATED_SHADOW' | 'BLOCKED' = 'VALIDATED_SHADOW',
): AcademyConsumerIntelligence {
  return {
    strategyId,
    strategyVersion: version,
    recordId: `${strategyId}@${version}`,
    consumer: 'RISK_GOVERNOR',
    lifecycle: state === 'BLOCKED' ? 'RETIRED' : 'SHADOW',
    state,
    regime: 'TRENDING',
    regimeCompatibility: 'SUPPORTED',
    confidenceScore: { state: 'EVALUATED', value: 0.85, evidenceIds: ['ev-001'], detail: 'Validated shadow score' },
    evidenceIds: ['ev-001'],
    blockers: state === 'BLOCKED' ? ['Blocked by policy'] : [],
    generatedAt: Date.now(),
    authority: 'ADVISORY_AND_SAFETY_GATE_ONLY',
    executionAuthorized: false,
  };
}

function createSampleRecord(strategyId: string, version: number, lifecycle: 'SHADOW' | 'INCUBATING' | 'LIVE_ELIGIBLE' = 'SHADOW'): any {
  return {
    recordId: `${strategyId}@${version}`,
    strategyId,
    version,
    name: `${strategyId} v${version}`,
    sourceKind: 'internal',
    source: 'internal',
    metadata: {},
    logic: { state: 'EVALUATED', summary: 'Sample', setupRules: [], triggerRules: [], riskRules: [], exitRules: [], noTradeRules: [] },
    indicators: { state: 'EVALUATED', values: ['ema', 'atr'], detail: 'ok' },
    parameters: [],
    marketConditions: [],
    sourceReferences: [],
    knownFailureModes: [],
    categories: ['trend'],
    evidenceHistory: [{ evidenceId: 'ev-001', kind: 'VALIDATION', source: 'internal', sourceKind: 'INTERNAL_STRATEGY_ENGINE', verification: 'INTERNAL_RECORDED', observedAt: Date.now(), ingestedAt: Date.now(), fingerprint: 'f1', dataState: 'live', datasetFingerprint: null, runId: null, notes: [] }],
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
      { regime: 'TRENDING', state: 'SUPPORTED', evidenceIds: ['ev-001'] },
    ],
    riskProfile: { state: 'EVALUATED', value: 'MODERATE', evidenceIds: ['ev-001'], detail: 'Bounded' },
  };
}

describe('Academy Production Chain Wiring & Identity Concordance (F1 - F10)', () => {
  it('F1: Propagates exact strategy identity through KnowledgeBase, TradePlan, RiskGovernor', () => {
    const store = createMockStore();
    const kb = new StrategyKnowledgeBase(store);
    const intel = createSampleIntelligence('momentum-breakout', 2);
    const record = createSampleRecord('momentum-breakout', 2);
    kb.putExact('momentum-breakout', 2, record);

    const resolved = kb.getExact('momentum-breakout', 2);
    expect(resolved).not.toBeNull();
    expect(resolved?.version).toBe(2);

    const plan = buildTradePlan({
      symbol: 'BTC/USDT',
      direction: 'LONG',
      strategyId: 'momentum-breakout',
      strategyVersion: 2,
      academyIntelligence: intel,
      levels: createSampleLevels('BTC/USDT', 50_000),
      sizing: {
        accountBalanceUsd: 10_000,
        riskMode: 'PCT',
        riskValue: 1,
        leverage: 1,
        entryPrice: 50_000,
        stopLossPrice: 49_000,
        takeProfitPrice: 53_000,
        direction: 'LONG',
        successProbModel: 65,
        successProbUserOverride: null,
      },
      spread: 0.5,
      spreadState: 'VALID',
      fundingRate: 0.0001,
      fundingState: 'VALID',
    });

    expect(plan.valid).toBe(true);
    expect(plan.strategyId).toBe('momentum-breakout');
    expect(plan.strategyVersion).toBe(2);
    expect(plan.recordId).toBe('momentum-breakout@2');

    const risk = evaluateRiskGovernor({
      order: {
        symbol: 'BTC/USDT',
        direction: 'LONG',
        quantity: plan.quantity,
        entryPrice: 50_000,
        notionalUsd: plan.sizing.positionSizeUsd,
        contractMultiplier: 1,
        leverage: 1,
        reduceOnly: false,
        exchange: 'kucoin',
        strategyId: 'momentum-breakout',
        strategyVersion: 2,
      },
      account: { equityUsd: 10_000, availableMarginUsd: 10_000, timestamp: Date.now() },
      portfolio: {
        openPositionCount: 0,
        totalOpenRiskUsd: 0,
        symbolExposureUsd: 0,
        correlatedExposureUsd: 0,
        dailyPnlUsd: 0,
        weeklyPnlUsd: 0,
        drawdownPct: 0,
        consecutiveLosses: 0,
      },
      market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
      executionMode: 'AUTOMATED',
      plan,
      academyIntelligence: intel,
      policy: loadRiskGovernorPolicy(),
    });

    expect(['APPROVED', 'APPROVED_REDUCED']).toContain(risk.decision);
    const academyCheck = risk.checks.find((c) => c.code === 'ACADEMY_STRATEGY_INTELLIGENCE');
    expect(academyCheck?.status).toBe('PASS');
  });

  it('F2: Single Academy ownership resolves exact versions and detects missing/mismatch states', () => {
    const store = createMockStore();
    const kb = new StrategyKnowledgeBase(store);
    // Persist enabled status so the provider is active
    kb.persistStatus({
      ...kb.status(),
      enabled: true,
      phase: 'IDLE',
    });
    const provider = new DefaultAcademyIntelligenceProvider(kb);

    // Unregistered strategy
    const missingRes = provider.resolve({
      strategyId: 'unregistered-strategy',
      strategyVersion: 1,
      consumer: 'RISK_GOVERNOR',
    });
    expect(missingRes.status).toBe('STRATEGY_NOT_FOUND');
    expect(missingRes.intelligence).toBeNull();

    // Register version 1
    const rec1 = createSampleRecord('mean-reversion', 1);
    kb.putExact('mean-reversion', 1, rec1);

    // Requesting version 2 when only version 1 exists returns VERSION_MISMATCH
    const mismatchRes = provider.resolve({
      strategyId: 'mean-reversion',
      strategyVersion: 2,
      consumer: 'RISK_GOVERNOR',
    });
    expect(mismatchRes.status).toBe('VERSION_MISMATCH');
    expect(mismatchRes.intelligence).toBeNull();

    // Exact resolution
    const exactRes = provider.resolve({
      strategyId: 'mean-reversion',
      strategyVersion: 1,
      consumer: 'RISK_GOVERNOR',
    });
    expect(exactRes.status).toBe('RESOLVED');
    expect(exactRes.intelligence?.strategyVersion).toBe(1);

    // Test disabled state
    kb.persistStatus({
      ...kb.status(),
      enabled: false,
      phase: 'OFF',
    });
    const disabledRes = provider.resolve({
      strategyId: 'mean-reversion',
      strategyVersion: 1,
      consumer: 'RISK_GOVERNOR',
    });
    expect(disabledRes.status).toBe('ACADEMY_DISABLED');
  });

  it('F3: Missing Academy intelligence fails closed on automated strategy execution', () => {
    const plan = buildTradePlan({
      symbol: 'ETH/USDT',
      direction: 'LONG',
      strategyId: 'unverified-bot',
      strategyVersion: 1,
      levels: createSampleLevels('ETH/USDT', 3000),
      sizing: {
        accountBalanceUsd: 10_000, riskMode: 'PCT', riskValue: 1, leverage: 1,
        entryPrice: 3000, stopLossPrice: 2900, takeProfitPrice: 3200,
        direction: 'LONG', successProbModel: 60, successProbUserOverride: null,
      },
      spread: 0.1, spreadState: 'VALID', fundingRate: 0.0001, fundingState: 'VALID',
    });

    const risk = evaluateRiskGovernor({
      order: {
        symbol: 'ETH/USDT',
        direction: 'LONG',
        quantity: plan.quantity,
        entryPrice: 3000,
        notionalUsd: plan.sizing.positionSizeUsd,
        contractMultiplier: 1,
        leverage: 1,
        reduceOnly: false,
        exchange: 'kucoin',
        strategyId: 'unverified-bot',
        strategyVersion: 1,
      },
      account: { equityUsd: 10_000, availableMarginUsd: 10_000, timestamp: Date.now() },
      portfolio: {
        openPositionCount: 0, totalOpenRiskUsd: 0, symbolExposureUsd: 0, correlatedExposureUsd: 0,
        dailyPnlUsd: 0, weeklyPnlUsd: 0, drawdownPct: 0, consecutiveLosses: 0,
      },
      market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
      executionMode: 'AUTOMATED',
      plan,
      academyIntelligence: null,
      policy: loadRiskGovernorPolicy(),
    });

    expect(risk.decision).toBe('REJECTED');
    const academyCheck = risk.checks.find((c) => c.code === 'ACADEMY_STRATEGY_INTELLIGENCE');
    expect(academyCheck?.status).toBe('FAIL');
    expect(academyCheck?.detail).toContain('exact Academy intelligence resolution; none supplied');
  });

  it('F4: Mismatched strategy identity between TradePlan and OrderIntent fails closed', () => {
    const intel = createSampleIntelligence('strategy-alpha', 1);
    const plan = buildTradePlan({
      symbol: 'BTC/USDT',
      direction: 'LONG',
      strategyId: 'strategy-alpha',
      strategyVersion: 1,
      academyIntelligence: intel,
      levels: createSampleLevels('BTC/USDT', 50_000),
      sizing: {
        accountBalanceUsd: 10_000, riskMode: 'PCT', riskValue: 1, leverage: 1,
        entryPrice: 50_000, stopLossPrice: 49_000, takeProfitPrice: 53_000,
        direction: 'LONG', successProbModel: 65, successProbUserOverride: null,
      },
      spread: 0.5, spreadState: 'VALID', fundingRate: 0.0001, fundingState: 'VALID',
    });

    const risk = evaluateRiskGovernor({
      order: {
        symbol: 'BTC/USDT',
        direction: 'LONG',
        quantity: plan.quantity,
        entryPrice: 50_000,
        notionalUsd: plan.sizing.positionSizeUsd,
        contractMultiplier: 1,
        leverage: 1,
        reduceOnly: false,
        exchange: 'kucoin',
        // Deliberate identity mismatch: strategy-beta vs strategy-alpha
        strategyId: 'strategy-beta',
        strategyVersion: 1,
      },
      account: { equityUsd: 10_000, availableMarginUsd: 10_000, timestamp: Date.now() },
      portfolio: {
        openPositionCount: 0, totalOpenRiskUsd: 0, symbolExposureUsd: 0, correlatedExposureUsd: 0,
        dailyPnlUsd: 0, weeklyPnlUsd: 0, drawdownPct: 0, consecutiveLosses: 0,
      },
      market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
      executionMode: 'AUTOMATED',
      plan,
      academyIntelligence: intel,
      policy: loadRiskGovernorPolicy(),
    });

    expect(risk.decision).toBe('REJECTED');
    const mismatchCheck = risk.checks.find((c) => c.code === 'STRATEGY_IDENTITY_MISMATCH');
    expect(mismatchCheck?.status).toBe('FAIL');
  });

  it('F5: Reduce-only order is safely permitted without blocking on missing strategy identity', () => {
    const risk = evaluateRiskGovernor({
      order: {
        symbol: 'SOL/USDT',
        direction: 'SHORT',
        quantity: 5,
        entryPrice: 150,
        notionalUsd: 750,
        contractMultiplier: 1,
        leverage: 1,
        reduceOnly: true, // Emergency or profit-taking closing order
        exchange: 'kucoin',
        strategyId: null,
        strategyVersion: null,
      },
      account: { equityUsd: 10_000, availableMarginUsd: 10_000, timestamp: Date.now() },
      portfolio: {
        openPositionCount: 1, totalOpenRiskUsd: 750, symbolExposureUsd: 750, correlatedExposureUsd: 750,
        dailyPnlUsd: 0, weeklyPnlUsd: 0, drawdownPct: 0, consecutiveLosses: 0,
      },
      market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
      executionMode: 'MANUAL',
      academyIntelligence: null,
      policy: loadRiskGovernorPolicy(),
    });

    expect(['APPROVED', 'APPROVED_REDUCED']).toContain(risk.decision);
    const academyCheck = risk.checks.find((c) => c.code === 'ACADEMY_STRATEGY_INTELLIGENCE');
    // For manual orders without strategy identity, academy check is not required or passes as reduce-only
    expect(!academyCheck || academyCheck.status === 'PASS' || academyCheck.status === 'WARN').toBe(true);
  });

  it('F6: TradePlan detects mismatch between plan input and academyIntelligence identity', () => {
    const intel = createSampleIntelligence('strategy-x', 1);
    const plan = buildTradePlan({
      symbol: 'BTC/USDT',
      direction: 'LONG',
      strategyId: 'strategy-y', // Mismatch vs strategy-x
      strategyVersion: 1,
      academyIntelligence: intel,
      levels: createSampleLevels('BTC/USDT', 50_000),
      sizing: {
        accountBalanceUsd: 10_000, riskMode: 'PCT', riskValue: 1, leverage: 1,
        entryPrice: 50_000, stopLossPrice: 49_000, takeProfitPrice: 53_000,
        direction: 'LONG', successProbModel: 65, successProbUserOverride: null,
      },
      spread: 0.5, spreadState: 'VALID', fundingRate: 0.0001, fundingState: 'VALID',
    });

    expect(plan.valid).toBe(false);
    expect(plan.validationErrors.some((e) => e.includes('does not match Academy intelligence'))).toBe(true);
  });

  it('F7: Scanner canonical decision fails closed when Academy intelligence blocks', () => {
    const blockingIntel = createSampleIntelligence('breakout-v1', 1, 'BLOCKED');
    const mockBaseline: CandidateScore = {
      score: 85,
      readinessTier: 'READY',
      guardReasons: [],
      dataState: 'live',
      featureCompletenessPct: 100,
    } as any;

    const decision = buildCanonicalDecision({
      ticker: {
        symbol: 'BTC/USDT',
        lastPrice: 50_000,
        turnover24h: 100_000_000,
        priceChange24hPct: 2.5,
        volume24h: 2000,
        high24h: 51_000,
        low24h: 49_000,
        fundingRate: 0.0001,
        openInterest: 50_000_000,
        fundingQuality: 'VALID',
        dataState: 'live',
        timestamp: Date.now(),
      },
      candles1h: [],
      orderBook: { symbol: 'BTC/USDT', bidDepthUsd: 1_000_000, askDepthUsd: 1_000_000, imbalancePct: 0, dataState: 'live', qualityState: 'VALID' },
      minLiquidityUsd: 10_000,
      scannerConfig: {
        minVolume24hUsd: 10_000,
        minScore: 50,
        maxSpreadPct: 0.1,
        maxFundingRateAbs: 0.01,
        requiredDataState: 'live',
        maxAgeSec: 60,
        weights: {} as any,
        scoreWeights: {} as any,
        directionBias: 'NEUTRAL',
        maxCandidatesPerScan: 10,
        minConfidence: 0.5,
      } as any,
      advancedInputs: {
        smoothedObi: 0.2,
        smoothedVolDelta: 100,
        atr: 500,
        microPrice: 50_000,
        spread: 0.5,
        fundingRate: 0.0001,
        academyIntelligence: blockingIntel,
      },
    }, 'LONG');

    expect(decision.direction).toBe('NO_TRADE');
    expect(decision.decisionReasonCode).toBe('ACADEMY_INTELLIGENCE_BLOCKED');
  });

  it('F8: Liquidity Hunter remains shadow/manual with explicit NOT_APPLICABLE Academy status', () => {
    const risk = evaluateRiskGovernor({
      order: {
        symbol: 'BTC/USDT',
        direction: 'LONG',
        quantity: 0.01,
        entryPrice: 50_000,
        notionalUsd: 500,
        contractMultiplier: 1,
        leverage: 1,
        reduceOnly: false,
        exchange: 'kucoin-testnet',
        strategyId: 'liquidity-hunter',
        strategyVersion: 1,
        strategy: 'liquidity-hunter-manual-testnet',
      },
      account: { equityUsd: 10_000, availableMarginUsd: 10_000, timestamp: Date.now() },
      portfolio: {
        openPositionCount: 0, totalOpenRiskUsd: 0, symbolExposureUsd: 0, correlatedExposureUsd: 0,
        dailyPnlUsd: 0, weeklyPnlUsd: 0, drawdownPct: 0, consecutiveLosses: 0,
      },
      market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
      executionMode: 'MANUAL',
      academyResolution: {
        status: 'NOT_APPLICABLE',
        strategyId: 'liquidity-hunter',
        strategyVersion: 1,
        recordId: 'liquidity-hunter@1',
        intelligence: null,
        detail: 'ACADEMY_NOT_APPLICABLE_RESEARCH_MODULE: Liquidity Hunter is a research/shadow module.',
      },
      policy: loadRiskGovernorPolicy(),
    });

    expect(['APPROVED', 'APPROVED_REDUCED']).toContain(risk.decision);
    const academyCheck = risk.checks.find((c) => c.code === 'ACADEMY_STRATEGY_INTELLIGENCE');
    expect(academyCheck?.status).toBe('PASS');
    expect(academyCheck?.detail).toContain('not applicable');
  });

  it('F9: Backtesting research evaluation role marks Academy gate as non-authorizing', () => {
    const plan = buildTradePlan({
      symbol: 'ETH/USDT',
      direction: 'SHORT',
      strategyId: 'trend-pullback',
      strategyVersion: 1,
      levels: createSampleLevels('ETH/USDT', 3000, 'SHORT'),
      sizing: {
        accountBalanceUsd: 10_000, riskMode: 'PCT', riskValue: 1, leverage: 1,
        entryPrice: 3000, stopLossPrice: 3100, takeProfitPrice: 2800,
        direction: 'SHORT', successProbModel: 60, successProbUserOverride: null,
      },
      spread: 0.1, spreadState: 'VALID', fundingRate: 0.0001, fundingState: 'VALID',
    });

    const risk = evaluateRiskGovernor({
      order: {
        symbol: 'ETH/USDT',
        direction: 'SHORT',
        quantity: plan.quantity,
        entryPrice: 3000,
        notionalUsd: plan.sizing.positionSizeUsd,
        contractMultiplier: 1,
        leverage: 1,
        reduceOnly: false,
        exchange: 'proxy-replay',
        strategyId: 'trend-pullback',
        strategyVersion: 1,
        strategy: 'trend-pullback',
      },
      account: { equityUsd: 10_000, availableMarginUsd: 10_000, timestamp: Date.now() },
      portfolio: {
        openPositionCount: 0, totalOpenRiskUsd: 0, symbolExposureUsd: 0, correlatedExposureUsd: 0,
        dailyPnlUsd: 0, weeklyPnlUsd: 0, drawdownPct: 0, consecutiveLosses: 0,
      },
      market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
      executionMode: 'AUTOMATED',
      plan,
      academyResolution: {
        status: 'NOT_APPLICABLE',
        strategyId: 'trend-pullback',
        strategyVersion: 1,
        recordId: 'trend-pullback@1',
        intelligence: null,
        detail: 'RESEARCH_EVALUATION replay: evidence-producing run; Academy gate non-authorizing.',
      },
      policy: loadRiskGovernorPolicy(),
    });

    expect(['APPROVED', 'APPROVED_REDUCED']).toContain(risk.decision);
    const academyCheck = risk.checks.find((c) => c.code === 'ACADEMY_STRATEGY_INTELLIGENCE');
    expect(academyCheck?.status).toBe('PASS');
    expect(academyCheck?.detail).toContain('not applicable');
  });

  it('F10: Subsystem enforces non-negotiable safety contract: autonomousLiveExecutionEnabled is false', () => {
    const root = mkdtempSync(join(tmpdir(), 'apex-academy-test-'));
    roots.push(root);
    const subsystem = createAcademySubsystem({
      storagePath: join(root, 'academy.json'),
      intervalMs: 60_000,
      strategyProvider: () => [],
    });

    const status = subsystem.engine.status();
    expect(status).toHaveProperty('enabled');
    expect(status.safety.autonomousLiveExecutionEnabled).toBe(false);
    expect(subsystem.provider).toBeDefined();
  });
});
