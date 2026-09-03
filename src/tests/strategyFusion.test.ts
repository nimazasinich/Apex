import { describe, expect, it } from 'vitest';
import { evaluateStrategyFusion } from '../services/strategyFusion';
import { getStrategyDefinition } from '../services/strategyRegistry';
import type { BacktestCandle } from '../services/backtesting';
import type { NewsResult, OnChainResult, SentimentResult } from '../services/providers/supplementalTypes';
import { canonicalObservationMetadata } from '../contracts/evidence/observationMetadata';

function candles(count = 240): BacktestCandle[] {
  let price = 100;
  return Array.from({ length: count }, (_, index) => {
    const open = price;
    price *= 1.0015 + Math.sin(index / 17) * 0.0003;
    const close = price;
    return {
      time: new Date(1_700_000_000_000 + index * 3_600_000).toISOString(),
      open,
      high: Math.max(open, close) * 1.002,
      low: Math.min(open, close) * 0.998,
      close,
      volume: 1_000 + index * 4,
    };
  });
}

function timeframeCandles(intervalMs: number, count = 80): BacktestCandle[] {
  return Array.from({ length: count }, (_, index) => {
    const open = 100 + index * 0.2;
    const close = open + 0.1;
    return {
      time: new Date(1_699_920_000_000 + index * intervalMs).toISOString(),
      open,
      high: close + 0.2,
      low: open - 0.2,
      close,
      volume: 1_000 + index,
    };
  });
}

const bullishNews: NewsResult = {
  category: 'news', provider: 'fixture', symbol: 'BTC-USDT', source: 'live', status: 'OK', latencyMs: 1,
  updatedAt: new Date().toISOString(),
  data: [{ title: 'Positive catalyst', url: 'https://example.invalid/a', source: 'fixture', publishedAt: new Date().toISOString(), sentiment: 'bullish' }],
};
const positiveSentiment: SentimentResult = {
  category: 'sentiment', valid: true, provider: 'fixture', symbol: 'BTC-USDT', source: 'live', status: 'OK', latencyMs: 1,
  updatedAt: new Date().toISOString(), data: { value: 0.8, label: 'POSITIVE', confidence: 0.9 },
};
const accumulation: OnChainResult = {
  category: 'onchain', provider: 'fixture', symbol: 'BTC-USDT', source: 'live', status: 'OK', latencyMs: 1,
  updatedAt: new Date().toISOString(),
  data: [{ type: 'exchange_withdrawal', amount: 50, amountUSD: 5_000_000, direction: 'outbound', chain: 'bitcoin', transactionHash: 'a', timestamp: new Date().toISOString() }],
};

describe('dynamic strategy fusion', () => {
  const definition = getStrategyDefinition('whale-flow-sentiment-reversal-v1')!;

  it('fails closed when required live evidence is missing', () => {
    const snapshot = evaluateStrategyFusion({ definition, symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', candles: candles() });
    expect(snapshot.actionable).toBe(false);
    expect(snapshot.state).toBe('INCOMPLETE');
    expect(snapshot.missingRequired.length).toBeGreaterThan(0);
  });

  it('does not relabel one candle series as three-timeframe smart-money confluence', () => {
    const snapshot = evaluateStrategyFusion({
      definition,
      symbol: 'BTC-USDT',
      interval: '1h',
      direction: 'LONG',
      candles: candles(),
    });
    expect(snapshot.components.find((component) => component.key === 'smartMoney')).toMatchObject({
      available: false,
      quality: 'MISSING',
    });
  });

  it('accepts smart-money context only from explicit cadence-valid 5m, 15m, and 4h sets', () => {
    const snapshot = evaluateStrategyFusion({
      definition,
      symbol: 'BTC-USDT',
      interval: '1h',
      direction: 'LONG',
      candles: candles(),
      candles5m: timeframeCandles(5 * 60_000),
      candles15m: timeframeCandles(15 * 60_000),
      candles4h: timeframeCandles(4 * 60 * 60_000),
    });
    expect(snapshot.components.find((component) => component.key === 'smartMoney')).toMatchObject({
      available: true,
      quality: 'HISTORICAL',
    });
  });

  it('combines live news, sentiment and exchange-classified whale flow without inventing provenance', () => {
    const snapshot = evaluateStrategyFusion({
      definition, symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', candles: candles(),
      news: bullishNews, sentiment: positiveSentiment, onchain: accumulation,
    });
    expect(snapshot.components.find((component) => component.key === 'news')?.available).toBe(true);
    expect(snapshot.components.find((component) => component.key === 'sentiment')?.value).toBeGreaterThan(0);
    expect(snapshot.components.find((component) => component.key === 'whaleFlow')?.value).toBeGreaterThan(0);
    expect(snapshot.score).toBeGreaterThan(0);
  });

  it('does not treat degraded alternative data as actionable live evidence', () => {
    const snapshot = evaluateStrategyFusion({
      definition, symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', candles: candles(),
      news: { ...bullishNews, source: 'degraded' },
      sentiment: { ...positiveSentiment, source: 'degraded' },
      onchain: { ...accumulation, source: 'degraded' },
    });
    expect(snapshot.actionable).toBe(false);
    expect(snapshot.components.find((component) => component.key === 'sentiment')?.available).toBe(false);
    expect(snapshot.components.find((component) => component.key === 'whaleFlow')?.available).toBe(false);
  });


  it('treats unavailable neutral-shaped sentiment as missing evidence', () => {
    const unavailable: SentimentResult = {
      ...positiveSentiment,
      valid: false,
      source: 'unavailable',
      status: 'NO_DATA',
      data: { value: 0, label: 'NEUTRAL', confidence: 0 },
    };
    const snapshot = evaluateStrategyFusion({
      definition, symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', candles: candles(), sentiment: unavailable,
    });
    const component = snapshot.components.find((row) => row.key === 'sentiment');
    expect(component?.quality).toBe('MISSING');
    expect(component?.available).toBe(false);
    expect(component?.value).toBe(0);
  });



  it('never scores an unconfigured sentiment result with a null payload as neutral evidence', () => {
    const notConfigured: SentimentResult = {
      category: 'sentiment',
      valid: false,
      provider: 'aggregated',
      symbol: 'BTC-USDT',
      source: 'not_configured',
      status: 'NOT_CONFIGURED',
      latencyMs: 0,
      updatedAt: new Date().toISOString(),
      data: null,
    };
    const snapshot = evaluateStrategyFusion({
      definition, symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', candles: candles(),
      news: bullishNews, sentiment: notConfigured, onchain: accumulation,
    });
    const component = snapshot.components.find((row) => row.key === 'sentiment');
    expect(component?.quality).toBe('MISSING');
    expect(component?.available).toBe(false);
    expect(component?.value).toBe(0);
  });

  it('does not assign direction to an unclassified generic whale transfer', () => {
    const generic: OnChainResult = {
      ...accumulation,
      data: [{ type: 'whale_transfer', amount: 50, amountUSD: 5_000_000, direction: 'outbound', chain: 'bitcoin', transactionHash: 'b', timestamp: new Date().toISOString() }],
    };
    const snapshot = evaluateStrategyFusion({ definition, symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', candles: candles(), onchain: generic });
    expect(snapshot.components.find((component) => component.key === 'whaleFlow')?.available).toBe(false);
  });

  it('clamps and dependency-adjusts manual live-layer weights', () => {
    const snapshot = evaluateStrategyFusion({
      definition, symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', candles: candles(),
      news: bullishNews, sentiment: positiveSentiment, onchain: accumulation,
      parameters: { 'fusion.sentiment': 999 },
    });
    const component = snapshot.components.find((row) => row.key === 'sentiment');
    const blueprint = definition.fusion?.components.find((row) => row.key === 'sentiment');
    expect(component?.configuredWeight).toBeGreaterThan(0);
    expect(component?.effectiveWeight).toBeLessThanOrEqual(blueprint?.maxWeight ?? 0);
  });
  it('is structurally shadow-only and cannot become live-authoritative from preview scoring', () => {
    const snapshot = evaluateStrategyFusion({ definition, symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', candles: candles() });
    expect(snapshot.authorityStage).toBe('SHADOW');
    expect(snapshot.liveAuthoritative).toBe(false);
  });

  it('does not accept bare funding numbers as verified observed evidence', () => {
    const bare = evaluateStrategyFusion({ definition, symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', candles: candles(), fundingDirectional: 0.8 });
    expect(bare.components.find((row) => row.key === 'funding')?.available).toBe(false);

    const metadata = canonicalObservationMetadata({
      sourceObservedAt: Date.now() - 1_000, providerReadAt: Date.now(), receivedAt: Date.now(), cacheStoredAt: null,
      provider: 'kucoin', venue: 'kucoin', canonicalInstrumentId: 'BTC-USDT', providerInstrumentId: 'XBTUSDTM',
      adapterVersion: 'test', qualityState: 'VALID', staleReason: null, lineageId: 'funding:test', dependencyFamily: 'FUNDING', parentLineageIds: [], decisionEligible: true,
    });
    const observed = evaluateStrategyFusion({ definition, symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', candles: candles(), fundingDirectional: 0.8, fundingMetadata: metadata });
    expect(observed.components.find((row) => row.key === 'funding')).toMatchObject({ available: true, quality: 'LIVE' });
  });

});
