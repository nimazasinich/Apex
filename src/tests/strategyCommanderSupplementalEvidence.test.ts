import { describe, expect, it } from 'vitest';
import type { SupplementalBundle } from '../services/providers/supplementalTypes';
import { validateCommanderEvidence } from '../contracts/commander/commanderEvidence';
import { buildNewsEvidence } from '../services/strategyCommander/evidence/newsEvidence';
import { buildSentimentEvidence } from '../services/strategyCommander/evidence/sentimentEvidence';
import { buildWhaleEvidence } from '../services/strategyCommander/evidence/whaleEvidence';
import { canonicalObservationMetadata } from '../contracts/evidence/observationMetadata';

const now = '2026-08-12T01:00:00.000Z';
const base = {
  evidenceId: 'fixture', symbol: 'BTC-USDT', timeframe: 'realtime', observedAt: now, receivedAt: now,
  source: 'cache-fixture', sourceVersion: 'v1', inputFingerprint: 'fixture-fingerprint',
};

function metadata(
  provider: string,
  dependencyFamily: 'NEWS_TEXT' | 'ONCHAIN_FLOW',
  sourceObservedAt = Date.parse(now),
  decisionEligible = true,
) {
  return canonicalObservationMetadata({
    sourceObservedAt,
    providerReadAt: Date.parse(now),
    receivedAt: Date.parse(now),
    cacheStoredAt: null,
    provider,
    venue: null,
    canonicalInstrumentId: 'BTC-USDT',
    providerInstrumentId: 'BTC-USDT',
    adapterVersion: 'fixture-v1',
    qualityState: decisionEligible ? 'VALID' : 'DEGRADED',
    staleReason: null,
    lineageId: `${provider}:${sourceObservedAt}`,
    dependencyFamily,
    parentLineageIds: [],
    decisionEligible,
  });
}

function bundle(): SupplementalBundle {
  return {
    news: {
      category: 'news', provider: 'news-fixture', symbol: 'BTC-USDT', source: 'live', status: 'OK', latencyMs: 1, updatedAt: now,
      metadata: metadata('news-fixture', 'NEWS_TEXT'),
      data: [
        { title: 'a', url: 'https://example.test/a', source: 'x', publishedAt: now, sentiment: 'bullish' },
        { title: 'b', url: 'https://example.test/b', source: 'x', publishedAt: now, sentiment: 'bearish' },
        { title: 'c', url: 'https://example.test/c', source: 'x', publishedAt: now },
      ],
    },
    sentiment: {
      category: 'sentiment', valid: true, provider: 'sentiment-fixture', symbol: 'BTC-USDT', source: 'degraded', status: 'OK', latencyMs: 1, updatedAt: now,
      metadata: metadata('sentiment-fixture', 'NEWS_TEXT', Date.parse(now), false),
      data: { value: 0.7, label: 'POSITIVE', confidence: 0.8, modelVersion: 'fixture-model' },
    },
    onchain: {
      category: 'onchain', provider: 'chain-fixture', symbol: 'BTC-USDT', source: 'live', status: 'OK', latencyMs: 1, updatedAt: now,
      metadata: metadata('chain-fixture', 'ONCHAIN_FLOW'),
      data: [
        { type: 'exchange_withdrawal', amount: 1, amountUSD: 750_000, direction: 'outbound', chain: 'ethereum', transactionHash: '0x1', timestamp: now },
        { type: 'exchange_deposit', amount: 1, amountUSD: 250_000, direction: 'inbound', chain: 'ethereum', transactionHash: '0x2', timestamp: now },
        { type: 'whale_transfer', amount: 500, direction: 'outbound', chain: 'ethereum', transactionHash: '0x3', timestamp: now },
      ],
    },
  };
}

describe('Plan C supplemental Commander evidence', () => {
  it('uses only explicit news labels and validated sentiment output', () => {
    const input = bundle();
    const news = buildNewsEvidence({ ...base, evidenceId: 'news', supplementalBundle: input });
    const sentiment = buildSentimentEvidence({ ...base, evidenceId: 'sentiment', supplementalBundle: input });
    expect(news.valueQuality).toBe('VALID');
    expect(news.score).toBe(0);
    expect(news.rawEvidenceIds).toHaveLength(2);
    expect(sentiment.valueQuality).toBe('ESTIMATED');
    expect(sentiment.score).toBe(0.7);
    expect([news, sentiment].every((row) => validateCommanderEvidence(row).ok)).toBe(true);
  });

  it('uses only USD-valued classified exchange flows for whale direction', () => {
    const whale = buildWhaleEvidence({ ...base, evidenceId: 'whale', supplementalBundle: bundle() });
    expect(whale.valueQuality).toBe('VALID');
    expect(whale.score).toBe(0.5);
    expect(whale.rawEvidenceIds).toEqual(['0x1', '0x2']);
  });

  it('fails closed for absent direction, unknown units, and wrong identity', () => {
    const ambiguous = bundle();
    ambiguous.onchain!.data = [{ type: 'whale_transfer', amount: 10_000, direction: 'outbound', chain: 'ethereum', transactionHash: 'x', timestamp: now }];
    expect(buildWhaleEvidence({ ...base, evidenceId: 'ambiguous', supplementalBundle: ambiguous }).valueQuality).toBe('MISSING');
    const wrong = bundle();
    wrong.news!.symbol = 'ETH-USDT';
    expect(buildNewsEvidence({ ...base, evidenceId: 'wrong', supplementalBundle: wrong }).valueQuality).toBe('INVALID');
  });

  it('keeps provider failure missing and marks expired evidence stale', () => {
    const failed = bundle();
    failed.sentiment = { ...failed.sentiment!, valid: false, data: null, source: 'unavailable', status: 'FAILED' };
    const missing = buildSentimentEvidence({ ...base, evidenceId: 'failed', supplementalBundle: failed });
    expect(missing.valueQuality).toBe('MISSING');
    expect(missing.score).toBe(0);
    expect(missing.confidence).toBe(0);

    const stale = bundle();
    stale.news!.updatedAt = now;
    stale.news!.metadata = metadata('news-fixture', 'NEWS_TEXT', Date.parse('2026-08-12T00:50:00.000Z'));
    expect(buildNewsEvidence({ ...base, evidenceId: 'stale', supplementalBundle: stale }).valueQuality).toBe('STALE');
  });

  it('does not launder provider read time into event-time freshness', () => {
    const missingEventTime = bundle();
    missingEventTime.news!.updatedAt = now;
    delete missingEventTime.news!.metadata;
    const evidence = buildNewsEvidence({ ...base, evidenceId: 'missing-event-time', supplementalBundle: missingEventTime });
    expect(evidence.valueQuality).toBe('INVALID');
    expect(evidence.observedAt).toBe(now);
    expect(evidence.score).toBe(0);
  });
});
