import { describe, expect, it } from 'vitest';
import type { CommanderEvidenceFamily, CommanderEvidenceV1 } from '../contracts/commander/commanderEvidence';
import type { OpportunityThesis } from '../contracts/commander/commanderContext';
import type { Candle, OrderBook, SignalDecisionLog, SymbolTicker } from '../types';
import type { SupplementalBundle } from '../services/providers/supplementalTypes';
import { attachIntelligenceParliamentShadow } from '../services/shadowComparisonPersistence';
import { governedEvidenceTrust } from '../services/strategyCommander/evidenceCompetence';
import { buildIntelligenceConsensus } from '../services/strategyCommander/intelligenceConsensus';
import { buildNativeParliamentConsensus, buildNativeParliamentSnapshot, buildParliamentScanShadow } from '../services/strategyCommander/parliamentShadow';

const observedAt = '2026-08-12T00:55:00.000Z';
const asOf = '2026-08-12T01:00:00.000Z';

function evidence(input: {
  id: string;
  expertId: string;
  family: CommanderEvidenceFamily;
  direction?: 'LONG' | 'SHORT' | 'NEUTRAL' | null;
  score?: number;
  confidence?: number;
  thesis?: OpportunityThesis;
  symbol?: string;
  quality?: CommanderEvidenceV1['valueQuality'];
  expiresAt?: string;
  conflictingReasons?: string[];
}): CommanderEvidenceV1 {
  return {
    version: 'commander_evidence_v1', evidenceId: input.id, expertId: input.expertId,
    expertVersion: '1', family: input.family, symbol: input.symbol ?? 'BTC-USDT', timeframe: '1h',
    direction: input.direction ?? null, thesisTags: input.thesis ? [input.thesis] : [],
    score: input.score ?? 0, confidence: input.confidence ?? 0.8, valueQuality: input.quality ?? 'VALID',
    observedAt, receivedAt: asOf, expiresAt: input.expiresAt ?? '2026-08-12T01:05:00.000Z',
    source: 'fixture', sourceVersion: '1', supportingReasons: [], conflictingReasons: input.conflictingReasons ?? [],
    rawEvidenceIds: [], inputFingerprint: 'fixture-input',
  };
}

function candles(count: number): Candle[] {
  const start = Date.parse('2026-08-11T23:00:00.000Z');
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index * 0.2;
    return { timestamp: start + index * 60_000, open: close - 0.1, high: close + 0.3, low: close - 0.3, close, volume: 1000 + index * 20 };
  });
}

const ticker: SymbolTicker = {
  symbol: 'BTC-USDT', lastPrice: 108, turnover24h: 100_000_000, priceChange24hPct: 3,
  volume24h: 900_000, high24h: 110, low24h: 96, fundingRate: -0.0001,
  fundingQuality: 'VALID', openInterest: 20_000_000, dataState: 'live', timestamp: Date.parse(asOf),
};

const book: OrderBook = {
  bids: [{ price: 107.99, volume: 100, cumulative: 100, percentage: 50 }],
  asks: [{ price: 108.01, volume: 100, cumulative: 100, percentage: 50 }],
  dataSource: 'live',
};

const supplementalBundle: SupplementalBundle = {
  news: {
    category: 'news', provider: 'news-fixture', symbol: 'BTC-USDT', source: 'live', status: 'OK', latencyMs: 1, updatedAt: asOf,
    data: [{ title: 'fixture', url: 'https://example.test/news', source: 'fixture', publishedAt: asOf, sentiment: 'bullish' }],
  },
  sentiment: {
    category: 'sentiment', valid: true, provider: 'sentiment-fixture', symbol: 'BTC-USDT', source: 'live', status: 'OK', latencyMs: 1, updatedAt: asOf,
    data: { value: 0.5, label: 'POSITIVE', confidence: 0.7 },
  },
  onchain: {
    category: 'onchain', provider: 'chain-fixture', symbol: 'BTC-USDT', source: 'live', status: 'OK', latencyMs: 1, updatedAt: asOf,
    data: [{ type: 'exchange_withdrawal', amount: 1, amountUSD: 100_000, direction: 'outbound', chain: 'ethereum', transactionHash: '0xfixture', timestamp: asOf }],
  },
};

describe('Plan C Phase 4 Intelligence Parliament shadow', () => {
  it('keeps direction and thesis consensus independent without mutating evidence', () => {
    const rows = [
      evidence({ id: 'a', expertId: 'apex.momentum', family: 'MOMENTUM', direction: 'LONG', score: 0.8, thesis: 'REVERSAL' }),
      evidence({ id: 'b', expertId: 'apex.price_action', family: 'PRICE_ACTION', direction: 'LONG', score: 0.7, thesis: 'REVERSAL' }),
      evidence({ id: 'c', expertId: 'apex.smart_money', family: 'SMART_MONEY', direction: 'LONG', score: 0.6, thesis: 'TREND_CONTINUATION' }),
      evidence({ id: 'd', expertId: 'apex.liquidity', family: 'LIQUIDITY', direction: null, score: 0.8 }),
    ];
    const original = structuredClone(rows);
    const result = buildIntelligenceConsensus({
      symbol: 'BTC-USDT', timestamp: asOf, evidence: rows,
      expectedExpertIds: ['apex.momentum', 'apex.price_action', 'apex.smart_money', 'apex.liquidity'],
    });
    expect(rows).toEqual(original);
    expect(result.leadingDirection).toBe('LONG');
    expect(result.leadingThesis).toBe('REVERSAL');
    expect(result.directionConsensus.LONG).toBeGreaterThan(0.99);
    expect(result.thesisConsensus.REVERSAL).toBeGreaterThan(result.thesisConsensus.TREND_CONTINUATION);
    expect(result.shadowOnly).toBe(true);
  });

  it('uses static governed trust and reduces stale or estimated influence without learning', () => {
    const valid = evidence({ id: 'valid', expertId: 'apex.momentum', family: 'MOMENTUM', direction: 'LONG', score: 0.8 });
    const stale = evidence({ id: 'stale', expertId: 'apex.momentum', family: 'MOMENTUM', direction: 'LONG', score: 0.8, expiresAt: '2026-08-12T00:59:00.000Z' });
    const estimated = evidence({ id: 'estimated', expertId: 'apex.momentum', family: 'MOMENTUM', direction: 'LONG', score: 0.8, quality: 'ESTIMATED' });
    const validTrust = governedEvidenceTrust(valid, asOf);
    const staleTrust = governedEvidenceTrust(stale, asOf);
    const estimatedTrust = governedEvidenceTrust(estimated, asOf);
    expect(validTrust.adaptive).toBe(false);
    expect(staleTrust.effectiveTrust).toBeLessThan(validTrust.effectiveTrust);
    expect(estimatedTrust.effectiveTrust).toBeLessThan(validTrust.effectiveTrust);
  });

  it('preserves material vetoes even when directional consensus is strong', () => {
    const result = buildIntelligenceConsensus({
      symbol: 'BTC-USDT', timestamp: asOf,
      evidence: [
        evidence({ id: 'a', expertId: 'apex.momentum', family: 'MOMENTUM', direction: 'LONG', score: 0.9 }),
        evidence({ id: 'b', expertId: 'apex.price_action', family: 'PRICE_ACTION', direction: 'LONG', score: 0.85 }),
        evidence({ id: 'liq', expertId: 'apex.liquidity', family: 'LIQUIDITY', score: 0.1, confidence: 0.9 }),
      ],
      expectedExpertIds: ['apex.momentum', 'apex.price_action', 'apex.liquidity'],
    });
    expect(result.directionConsensus.LONG).toBeGreaterThan(0.7);
    expect(result.materialVetoes).toContain('LIQUIDITY_DEGRADATION');
    expect(result.dissent.materialVetoPenalty).toBeGreaterThan(0);
  });

  it('requires an explicit material event marker instead of treating generic bearish news as a veto', () => {
    const generic = buildIntelligenceConsensus({
      symbol: 'BTC-USDT', timestamp: asOf,
      evidence: [evidence({ id: 'news', expertId: 'apex.news', family: 'NEWS', direction: 'SHORT', score: -0.9 })],
      expectedExpertIds: ['apex.news'],
    });
    const material = buildIntelligenceConsensus({
      symbol: 'BTC-USDT', timestamp: asOf,
      evidence: [evidence({ id: 'event', expertId: 'apex.news', family: 'NEWS', direction: 'SHORT', score: -0.9, conflictingReasons: ['event_risk_material'] })],
      expectedExpertIds: ['apex.news'],
    });
    expect(generic.materialVetoes).not.toContain('EVENT_RISK');
    expect(material.materialVetoes).toContain('EVENT_RISK');
  });

  it('excludes identity-mismatched evidence and reports incomplete coverage', () => {
    const result = buildIntelligenceConsensus({
      symbol: 'BTC-USDT', timestamp: asOf,
      evidence: [evidence({ id: 'wrong', expertId: 'apex.momentum', family: 'MOMENTUM', symbol: 'ETH-USDT', direction: 'LONG', score: 1 })],
      expectedExpertIds: ['apex.momentum'],
    });
    expect(result.materialVetoes).toContain('EVIDENCE_IDENTITY_MISMATCH');
    expect(result.evidenceCompleteness).toBe(0);
    expect(result.trust[0].included).toBe(false);
    expect(result.directionConsensus.NEUTRAL).toBe(1);
  });

  it('retains the seven existing voices and appends six distinct SHADOW experts', () => {
    const rows = candles(40);
    const snapshot = buildNativeParliamentSnapshot({
      ticker, candles1h: rows, candles15m: rows, candles5m: rows, candles1m: rows,
      orderBook: book, spread: 0.02, supplementalBundle, timestamp: Date.parse(asOf), source: 'kucoin-live-fixture',
    });
    const result = snapshot.consensus;
    expect(snapshot.evidence.map((row) => row.evidenceId).sort()).toEqual(result.evidenceIds);
    expect(snapshot.evidence).toHaveLength(13);
    expect(result.evidenceIds).toHaveLength(13);
    expect(new Set(result.trust.map((entry) => entry.expertId)).size).toBe(13);
    expect(result.trust.some((entry) => entry.expertId === 'apex.direction_divergence')).toBe(true);
    expect(result.trust.some((entry) => entry.expertId === 'apex.news')).toBe(true);
    expect(result.trust.some((entry) => entry.expertId === 'apex.harmonic')).toBe(true);
    expect(result.trust.every((entry) => Number.isFinite(entry.effectiveTrust))).toBe(true);
    expect(result.reasons).toContain('adaptive_trust:false');
  });

  it('persists one fail-open Parliament snapshot per scan through existing decision memory', () => {
    const consensus = buildIntelligenceConsensus({
      symbol: 'BTC-USDT', timestamp: asOf,
      evidence: [evidence({ id: 'a', expertId: 'apex.momentum', family: 'MOMENTUM', direction: 'LONG', score: 0.8 })],
      expectedExpertIds: ['apex.momentum'],
    });
    const parliament = buildParliamentScanShadow({ timestamp: Date.parse(asOf), results: [consensus] });
    const logs: SignalDecisionLog[] = ['one', 'two'].map((id) => ({
      id, cycleId: 'cycle-1', timestamp: Date.parse(asOf), isoTime: asOf, ticker: 'BTC-USDT', direction: 'LONG',
      decision: 'ACCEPTED', reasonCode: 'ACCEPTED_BEST_CANDIDATE', reasonText: 'fixture',
    }));
    const attached = attachIntelligenceParliamentShadow(logs, parliament);
    expect(attached[0].marketSnapshotSummary?.intelligenceParliament).toEqual(parliament);
    expect(attached[1].marketSnapshotSummary?.intelligenceParliament).toBeUndefined();
    expect(logs[0].marketSnapshotSummary).toBeUndefined();
  });
});
