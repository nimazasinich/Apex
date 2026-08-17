import { describe, expect, it } from 'vitest';
import { buildCanonicalDecision, DECISION_ADAPTER_VERSION, projectShadowSupplementalEvidence } from '../services/canonicalDecisionAdapter';
import { MathEngine } from '../services/mathEngine';
import type { ScannerConfig, SymbolTicker } from '../types';
import type { SupplementalBundle } from '../services/providers/supplementalTypes';

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
      },
      sentiment: {
        category: 'sentiment', valid: true, provider: 'HuggingFace', symbol: 'BTC-USDT',
        data: { value: 0.7, label: 'POSITIVE', confidence: 0.84 }, source: 'live', status: 'OK', latencyMs: 21,
        updatedAt: '2026-08-11T11:59:30.000Z',
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
      news: { category: 'news', provider: 'fallback', symbol: 'BTC-USDT', data: [], source: 'degraded', status: 'DEGRADED', latencyMs: 10, updatedAt: '2026-08-11T11:59:00.000Z' },
      sentiment: { category: 'sentiment', valid: false, provider: 'fallback', symbol: 'BTC-USDT', data: null, source: 'unavailable', status: 'UNAVAILABLE', latencyMs: 10, updatedAt: '2026-08-11T11:59:00.000Z', reason: 'upstream_timeout' },
      onchain: { category: 'onchain', provider: 'fallback', symbol: 'BTC-USDT', data: [], source: 'live', status: 'OK', latencyMs: 10, updatedAt: '2026-08-11T10:00:00.000Z' },
    }, now);

    expect(evidence.items[0]).toMatchObject({ source: 'degraded', freshness: 'CURRENT', available: true });
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
