import { describe, expect, it } from 'vitest';
import { buildCanonicalDecision, DECISION_ADAPTER_VERSION, projectShadowSupplementalEvidence } from '../services/canonicalDecisionAdapter';
import { MathEngine } from '../services/mathEngine';
import type { ScannerConfig, SymbolTicker } from '../types';
import type { SupplementalBundle } from '../services/providers/supplementalTypes';
import { canonicalObservationMetadata } from '../contracts/evidence/observationMetadata';

function supplementalMetadata(
  provider: string,
  dependencyFamily: 'NEWS_TEXT' | 'ONCHAIN_FLOW',
  sourceObservedAt: number | null,
  providerReadAt: number,
  decisionEligible = true,
) {
  return canonicalObservationMetadata({
    sourceObservedAt,
    providerReadAt,
    receivedAt: providerReadAt,
    cacheStoredAt: null,
    provider,
    venue: null,
    canonicalInstrumentId: 'BTC-USDT',
    providerInstrumentId: 'BTC-USDT',
    adapterVersion: 'fixture-v1',
    qualityState: decisionEligible ? 'VALID' : 'DEGRADED',
    staleReason: decisionEligible ? null : 'degraded_fixture',
    lineageId: `${provider}:${sourceObservedAt ?? 'unknown'}`,
    dependencyFamily,
    parentLineageIds: [],
    decisionEligible,
  });
}

const ticker: SymbolTicker = {
  symbol: 'BTC-USDT',
  lastPrice: 94000,
  turnover24h: 500000000,
  priceChange24hPct: 2,
  volume24h: 5000,
  high24h: 95000,
  low24h: 92000,
  fundingRate: 0.0002,
  openInterest: 1000000000,
  dataState: 'live',
  timestamp: Date.now(),
};

const candles = Array.from({ length: 30 }, (_, i) => ({
  timestamp: 1700000000000 + i * 3600000,
  open: 93000 + i * 30,
  high: 93200 + i * 35,
  low: 92900 + i * 25,
  close: 93100 + i * 32,
  volume: 1500,
}));

const scannerConfig: ScannerConfig = {
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
  directionBias: 'SHORT_ONLY',
  topRankSkip: 10,
  minVolume24hUsd: 5000000,
};

describe('canonicalDecisionAdapter', () => {
  it('returns baseline scoreCandidate output with shadow summary', () => {
    const snapshot = buildCanonicalDecision({
      ticker,
      candles1h: candles,
      candles15m: candles,
      orderBook: {
        symbol: 'BTC-USDT',
        bidDepthUsd: 5000000,
        askDepthUsd: 4500000,
        imbalancePct: -8,
        dataState: 'live',
      },
      minLiquidityUsd: 10000000,
      scannerConfig,
    }, 'SHORT');

    expect(snapshot.engineVersion).toBe(DECISION_ADAPTER_VERSION);
    expect(snapshot.baseline.symbol).toBe('BTC-USDT');
    expect(snapshot.baseline.score).toBeGreaterThanOrEqual(0);
    expect(snapshot.shadow).toBeDefined();
    expect(snapshot.shadow?.engineVersion).toBe(DECISION_ADAPTER_VERSION);
    expect(snapshot.smcAvailability).toBeDefined();
  });

  it('projects configured supplemental provenance without changing the baseline score', () => {
    const now = Date.parse('2026-08-11T12:00:00.000Z');
    const bundle: SupplementalBundle = {
      news: {
        category: 'news', provider: 'Newsdata.io', symbol: 'BTC-USDT', data: [], source: 'live',
        status: 'OK', latencyMs: 42, updatedAt: '2026-08-11T11:59:00.000Z',
        metadata: supplementalMetadata('Newsdata.io', 'NEWS_TEXT', Date.parse('2026-08-11T11:59:00.000Z'), now),
      },
      sentiment: {
        category: 'sentiment', valid: true, provider: 'HuggingFace', symbol: 'BTC-USDT',
        data: { value: 0.7, label: 'POSITIVE', confidence: 0.84 }, source: 'live', status: 'OK', latencyMs: 21,
        updatedAt: '2026-08-11T11:59:30.000Z',
        metadata: supplementalMetadata('HuggingFace', 'NEWS_TEXT', Date.parse('2026-08-11T11:59:30.000Z'), now),
      },
      onchain: null,
    };
    const withoutSupplemental = buildCanonicalDecision({
      ticker, candles1h: candles, candles15m: candles,
      orderBook: { symbol: 'BTC-USDT', bidDepthUsd: 5000000, askDepthUsd: 4500000, imbalancePct: -8, dataState: 'live' },
      minLiquidityUsd: 10000000, scannerConfig,
    }, 'SHORT', { now });
    const withSupplemental = buildCanonicalDecision({
      ticker, candles1h: candles, candles15m: candles,
      orderBook: { symbol: 'BTC-USDT', bidDepthUsd: 5000000, askDepthUsd: 4500000, imbalancePct: -8, dataState: 'live' },
      minLiquidityUsd: 10000000, scannerConfig,
      advancedInputs: { supplementalBundle: bundle },
    }, 'SHORT', { now });

    expect(withSupplemental.baseline.score).toBe(withoutSupplemental.baseline.score);
    expect(withSupplemental.shadow?.shadowSupplementalEvidence?.items[0]).toMatchObject({
      category: 'news', provider: 'Newsdata.io', source: 'live', freshness: 'CURRENT', available: true,
    });
    expect(withSupplemental.shadow?.shadowSupplementalEvidence?.items[1]).toMatchObject({
      category: 'sentiment', confidence: 0.84, source: 'live', freshness: 'CURRENT', available: true,
    });
    expect(withSupplemental.shadow?.shadowSupplementalEvidence?.items[2]).toMatchObject({
      category: 'onchain', source: 'unavailable', status: 'CACHE_MISS', freshness: 'UNKNOWN', available: false,
    });
  });

  it('preserves degraded and stale provider states instead of treating them as current evidence', () => {
    const now = Date.parse('2026-08-11T12:00:00.000Z');
    const evidence = projectShadowSupplementalEvidence({
      news: { category: 'news', provider: 'fallback', symbol: 'BTC-USDT', data: [], source: 'degraded', status: 'DEGRADED', latencyMs: 10, updatedAt: '2026-08-11T11:59:00.000Z', metadata: supplementalMetadata('fallback', 'NEWS_TEXT', Date.parse('2026-08-11T11:59:00.000Z'), now, false) },
      sentiment: { category: 'sentiment', valid: false, provider: 'fallback', symbol: 'BTC-USDT', data: null, source: 'unavailable', status: 'UNAVAILABLE', latencyMs: 10, updatedAt: '2026-08-11T11:59:00.000Z', reason: 'upstream_timeout', metadata: supplementalMetadata('fallback', 'NEWS_TEXT', Date.parse('2026-08-11T11:59:00.000Z'), now, false) },
      onchain: { category: 'onchain', provider: 'fallback', symbol: 'BTC-USDT', data: [], source: 'live', status: 'OK', latencyMs: 10, updatedAt: '2026-08-11T10:00:00.000Z', metadata: supplementalMetadata('fallback', 'ONCHAIN_FLOW', Date.parse('2026-08-11T10:00:00.000Z'), now) },
    }, now);

    expect(evidence.items[0]).toMatchObject({ source: 'degraded', freshness: 'CURRENT', available: false });
    expect(evidence.items[1]).toMatchObject({ source: 'unavailable', available: false, reason: 'upstream_timeout' });
    expect(evidence.items[2]).toMatchObject({ source: 'live', freshness: 'STALE', available: false });
    expect(evidence.items[2]).not.toHaveProperty('confidence');
  });

  it('does not change candidate ranking order when supplemental evidence changes', () => {
    const base = (lastPrice: number) => buildCanonicalDecision({
      ticker: { ...ticker, lastPrice }, candles1h: candles, candles15m: candles,
      orderBook: { symbol: 'BTC-USDT', bidDepthUsd: 5000000, askDepthUsd: 4500000, imbalancePct: -8, dataState: 'live' },
      minLiquidityUsd: 10000000, scannerConfig,
    }, 'SHORT');
    const before = [base(94000), base(95000)].sort((a, b) => b.baseline.score - a.baseline.score).map((row) => row.baseline.lastPrice);
    const after = [base(94000), base(95000)].map((snapshot) => ({
      ...snapshot,
      shadow: {
        ...snapshot.shadow!,
        shadowSupplementalEvidence: projectShadowSupplementalEvidence(undefined),
      },
    })).sort((a, b) => b.baseline.score - a.baseline.score).map((row) => row.baseline.lastPrice);
    expect(after).toEqual(before);
  });
});

const parityNow = 1_700_216_000_000;
const parityCandles = Array.from({ length: 60 }, (_, i) => ({
  timestamp: parityNow - (59 - i) * 3_600_000,
  open: 82_000 + i * 220,
  high: 82_300 + i * 220,
  low: 81_800 + i * 220,
  close: 82_200 + i * 220,
  volume: 1_500 + i * 5,
}));
const parityConfig: ScannerConfig = {
  ...scannerConfig,
  directionBias: 'LONG_ONLY',
  minConfidence: 0.50,
  minEvidenceAgreement: 0.40,
  maxSqueezeRisk: 0.70,
  minSmartMoneyScore: 0.40,
  smcHardRejectThreshold: 0.30,
};
const parityAdvancedInputs = {
  smoothedObi: 0.7,
  smoothedVolDelta: 2,
  qStructDirectional: 0.7,
  atr: 1_200,
  microPrice: 94_020,
  spread: 10,
  fundingRate: -0.0002,
  oiChangePercent: 1,
  oiTrend: 'EXPANDING' as const,
  smartMoneyContext: {
    smcDirectionalScore: 0.82,
    smcContextScore: 0.91,
    setupModel: 'CONTINUATION' as const,
    controlSide: 'DEMAND' as const,
    smartMoneyBiasScore: 0.76,
    flipSetupScore: -0.1,
    chochSetupScore: -0.1,
    continuationScore: -0.7,
    ifcQualityScore: -0.5,
    liquiditySweepScore: -0.1,
    zoneFreshnessScore: -0.6,
    unmitigatedZoneProximity: 0.8,
    htfSupplyInControl: false,
    htfDemandInControl: true,
    reasons: ['Fixture: demand-side SMC context.'],
  },
  quality: {
    obi: 'VALID' as const,
    volumeDelta: 'VALID' as const,
    qStruct: 'VALID' as const,
    atr: 'VALID' as const,
    microPrice: 'VALID' as const,
    spread: 'VALID' as const,
    funding: 'VALID' as const,
    openInterest: 'VALID' as const,
    smc: 'VALID' as const,
  },
};
function parityContext(mode: 'live' | 'replay_production') {
  return {
    ticker: { ...ticker, lastPrice: 94_000, fundingRate: -0.0002, timestamp: parityNow },
    candles1h: parityCandles,
    candles15m: parityCandles,
    orderBook: {
      symbol: 'BTC-USDT', bidDepthUsd: 8_000_000, askDepthUsd: 5_000_000,
      imbalancePct: 70, dataState: 'live' as const,
    },
    orderBookDetail: {
      summary: { symbol: 'BTC-USDT', bidDepthUsd: 8_000_000, askDepthUsd: 5_000_000, imbalancePct: 70, dataState: 'live' as const },
      book: { bids: [], asks: [] }, obi: 0.7, microPrice: 94_020, spread: 10,
      dataState: 'live' as const, source: 'fixture', latencyMs: 1,
    } as any,
    qStructDirectional: 0.7,
    minLiquidityUsd: 10_000_000,
    scannerConfig: parityConfig,
    advancedInputs: parityAdvancedInputs,
    mode,
  };
}

describe('canonical regime-aware ensemble authority', () => {
  it('uses OBI/QStruct/microstructure as the live authority even when shadow diagnostics are disabled', () => {
    const snapshot = buildCanonicalDecision(parityContext('live'), 'LONG', { includeShadow: false, now: parityNow });
    expect(snapshot.authority).toBe('REGIME_ENSEMBLE');
    expect(snapshot.shadow?.status).toBe('ACCEPTED');
    expect(snapshot.direction).toBe('LONG');
    expect(snapshot.intelligence?.status).toBe('ACCEPTED');
    expect(snapshot.rankingScore).toBe(Math.round((snapshot.intelligence?.score ?? 0) * 100));
    expect(['ENSEMBLE_ACCEPTED', 'ENSEMBLE_RESCUE_ACCEPTED']).toContain(snapshot.decisionReasonCode);
  });

  it('keeps the legacy no-trade guard in front of the advanced authority', () => {
    const context = parityContext('live');
    context.ticker = { ...context.ticker, dataState: 'degraded' };
    const snapshot = buildCanonicalDecision(context, 'LONG', { includeShadow: false, now: parityNow });
    expect(snapshot.shadow?.status).toBe('ACCEPTED');
    expect(snapshot.baseline.guardPass).toBe(false);
    expect(snapshot.direction).toBe('NO_TRADE');
    expect(snapshot.decisionReasonCode).toBe('BASELINE_GUARD_BLOCKED');
  });

  it('does not let legacy ROC/structure confluence veto an advanced accepted signal', () => {
    const context = parityContext('live');
    context.candles15m = [...parityCandles].reverse().map((row, index) => ({
      ...row,
      timestamp: parityNow - (59 - index) * 900_000,
    }));
    const snapshot = buildCanonicalDecision(context, 'LONG', { includeShadow: false, now: parityNow });
    expect(snapshot.baseline.guardPass).toBe(false);
    expect(snapshot.baseline.guardReasons.some((reason) => reason.startsWith('Cross-timeframe contradiction:'))).toBe(true);
    expect(snapshot.safetyGuardReasons).toEqual([]);
    expect(snapshot.shadow?.status).toBe('ACCEPTED');
    expect(snapshot.direction).toBe('LONG');
    expect(snapshot.authority).toBe('REGIME_ENSEMBLE');
  });

  it('does not rescue a live directional gate miss without an approved rescue profile', () => {
    const context = parityContext('live');
    context.advancedInputs = { ...parityAdvancedInputs, qStructDirectional: -0.7 };
    context.qStructDirectional = -0.7;
    const snapshot = buildCanonicalDecision(context, 'LONG', { includeShadow: false, now: parityNow });
    expect(snapshot.baseline.guardPass).toBe(true);
    expect(snapshot.shadow?.status).toBe('REJECTED');
    expect(snapshot.shadow?.reasonCode).toBe('GATE_QSTRUCT_FAILED');
    expect(snapshot.direction).toBe('NO_TRADE');
    expect(snapshot.intelligence?.rescuedAdvancedGate).toBe(false);
    expect(snapshot.decisionReasonCode).toBe('ENSEMBLE_CONFLICT');
  });

  it('never lets the ensemble override an advanced safety-quality rejection', () => {
    const context = parityContext('live');
    context.advancedInputs = { ...parityAdvancedInputs, spread: 4_000 };
    const snapshot = buildCanonicalDecision(context, 'LONG', { includeShadow: false, now: parityNow });
    expect(snapshot.shadow?.status).toBe('REJECTED');
    expect(snapshot.shadow?.reasonCode).toBe('LOW_LIQUIDITY_QUALITY');
    expect(snapshot.intelligence?.reasonCode).toBe('ADVANCED_HARD_REJECT');
    expect(snapshot.direction).toBe('NO_TRADE');
  });

  it('produces identical live and production-replay decisions for identical advanced inputs', () => {
    const live = buildCanonicalDecision(parityContext('live'), 'LONG', { includeShadow: false, now: parityNow });
    const replay = buildCanonicalDecision(parityContext('replay_production'), 'LONG', { includeShadow: false, now: parityNow });
    expect({
      authority: live.authority, direction: live.direction, rankingScore: live.rankingScore,
      confidence: live.confidence, reasonCode: live.decisionReasonCode,
      shadow: live.shadow && { status: live.shadow.status, reasonCode: live.shadow.reasonCode, rawScore: live.shadow.rawScore, confidence: live.shadow.confidence },
    }).toEqual({
      authority: replay.authority, direction: replay.direction, rankingScore: replay.rankingScore,
      confidence: replay.confidence, reasonCode: replay.decisionReasonCode,
      shadow: replay.shadow && { status: replay.shadow.status, reasonCode: replay.shadow.reasonCode, rawScore: replay.shadow.rawScore, confidence: replay.shadow.confidence },
    });
  });
});
