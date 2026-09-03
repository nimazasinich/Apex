import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Candle } from '../types';
import { canonicalObservationMetadata, observationAgeMs, withCacheStoredAt } from '../contracts/evidence/observationMetadata';
import { validateClosedCandles } from '../services/closedCandleValidator';
import { computeEventTimeFundingPct } from '../services/transactionCosts';
import { HoldoutUseLedger, fingerprintDataset, fingerprintFrozenCandidate } from '../services/sealedHoldout';
import { validateReturnEvidence } from '../services/statisticalValidation';
import { resampleClosedCandles } from '../services/strategyFusion';
import { reconcileTickerObservations } from '../services/marketReconciliation';
import { AppendOnlyEventLog } from '../services/realtime/appendOnlyEventLog';
import { __resetVerifiedTickerUniverse, rememberVerifiedTickerUniverse, staleVerifiedTickerUniverse } from '../services/apexNextMarketRoutes';
import { __resetVerifiedCandleState, getStaleVerifiedCandles, rememberVerifiedCandles } from '../services/marketDataService';

const candle = (timestamp: number, close = 100): Candle => ({
  timestamp, open: close, high: close + 1, low: close - 1, close, volume: 10,
});

describe('canonical observation time and closed-candle invariants', () => {
  it('never rejuvenates source time when a cache stores or rereads an observation', () => {
    const sourceObservedAt = 1_000;
    const value = { metadata: canonicalObservationMetadata({
      sourceObservedAt, providerReadAt: 1_100, receivedAt: 1_110, cacheStoredAt: null,
      provider: 'binance', venue: 'BINANCE_USDM', canonicalInstrumentId: 'BTC-USDT-PERP', providerInstrumentId: 'BTCUSDT',
      adapterVersion: 'test', qualityState: 'VALID', staleReason: null, lineageId: 'ticker:btc:1000',
      dependencyFamily: 'DERIVATIVES_POSITIONING', parentLineageIds: [], decisionEligible: true,
    }) };
    const cached = withCacheStoredAt(value, 9_000);
    const reread = withCacheStoredAt(cached, 15_000);
    expect(reread.metadata?.sourceObservedAt).toBe(sourceObservedAt);
    expect(observationAgeMs(reread.metadata!, 20_000)).toBe(19_000);
  });

  it('drops open bars, deduplicates timestamps, and rejects cadence gaps beyond policy', () => {
    const intervalMs = 60_000;
    const rows = [candle(60_000), candle(120_000), candle(120_000, 101), candle(180_000), candle(240_000)];
    const valid = validateClosedCandles({ rows, intervalMs, now: 299_000, minRows: 3 });
    expect(valid.diagnostics.accepted).toBe(true);
    expect(valid.diagnostics.duplicatesRemoved).toBe(1);
    expect(valid.diagnostics.openBarsRemoved).toBe(1);
    const gapped = validateClosedCandles({ rows: [candle(60_000), candle(360_000)], intervalMs, now: 500_000, allowedGapIntervals: 3 });
    expect(gapped.diagnostics.accepted).toBe(false);
    expect(gapped.diagnostics.reasons).toContain('gap_exceeds_policy:5');
  });

  it('never retains a ticker whose upstream event time is missing', () => {
    __resetVerifiedTickerUniverse();
    const ticker = {
      symbol: 'BTC-USDT', lastPrice: 100, turnover24h: 1_000, priceChange24hPct: 1,
      volume24h: 10, high24h: 101, low24h: 99, fundingRate: 0, openInterest: 100,
      dataState: 'live' as const, timestamp: 0,
    };
    rememberVerifiedTickerUniverse([ticker], 'live', 'kucoin');
    expect(staleVerifiedTickerUniverse(10, 2_000)).toBeNull();

    const verified = {
      ...ticker,
      timestamp: 1_000,
      observationMetadata: canonicalObservationMetadata({
        sourceObservedAt: 1_000, providerReadAt: 1_500, receivedAt: 1_500, cacheStoredAt: null,
        provider: 'kucoin', venue: 'KUCOIN_FUTURES', canonicalInstrumentId: 'BTC-USDT-PERP', providerInstrumentId: 'XBTUSDTM',
        adapterVersion: 'test', qualityState: 'VALID', staleReason: null, lineageId: 'ticker:btc:1000',
        dependencyFamily: 'DERIVATIVES_POSITIONING', parentLineageIds: [], decisionEligible: true,
      }),
    };
    rememberVerifiedTickerUniverse([verified], 'live', 'kucoin');
    expect(staleVerifiedTickerUniverse(10, 2_000)?.tickers[0].observationMetadata?.sourceObservedAt).toBe(1_000);
  });

  it('replays verified candles without replacing their source event time', () => {
    __resetVerifiedCandleState();
    const result = {
      candles: [candle(60_000), candle(120_000)],
      dataState: 'live' as const,
      source: 'kucoin' as const,
      stale: false,
      validation: { accepted: true } as any,
      metadata: canonicalObservationMetadata({
        sourceObservedAt: 180_000, providerReadAt: 185_000, receivedAt: 185_000, cacheStoredAt: null,
        provider: 'kucoin', venue: 'KUCOIN_FUTURES', canonicalInstrumentId: 'BTC-USDT-PERP', providerInstrumentId: 'XBTUSDTM',
        adapterVersion: 'test', qualityState: 'VALID', staleReason: null, lineageId: 'candles:btc:180000',
        dependencyFamily: 'PRICE_CANDLES', parentLineageIds: [], decisionEligible: true,
      }),
    };
    rememberVerifiedCandles('BTC-USDT:1m', result);
    const replay = getStaleVerifiedCandles('BTC-USDT:1m', 190_000);
    expect(replay?.metadata?.sourceObservedAt).toBe(180_000);
    expect(replay?.metadata?.providerReadAt).toBe(185_000);
    expect(replay?.candles.at(-1)?.timestamp).toBe(120_000);
  });
});

describe('causal costs, dependency separation, and reconciliation', () => {
  it('charges funding only when a real UTC funding event falls inside the position', () => {
    const entryAt = Date.UTC(2026, 0, 1, 1);
    const beforeFunding = Date.UTC(2026, 0, 1, 7, 59);
    const afterFunding = Date.UTC(2026, 0, 1, 8, 1);
    const events = [{ timestamp: Date.UTC(2026, 0, 1, 8), rate: 0.0001 }];
    const fundingCoverage = {
      state: 'COMPLETE' as const,
      coveredFrom: entryAt,
      coveredTo: afterFunding,
      provider: 'test',
      provenance: 'test',
      fingerprint: 'test',
    };
    expect(computeEventTimeFundingPct({ entryAt, exitAt: beforeFunding, direction: 'LONG', fundingEvents: events, fundingCoverage, fundingPolicy: 'REALIZED_SIGNED' })).toBe(0);
    expect(computeEventTimeFundingPct({ entryAt, exitAt: afterFunding, direction: 'LONG', fundingEvents: events, fundingCoverage, fundingPolicy: 'REALIZED_SIGNED' })).toBeCloseTo(0.01);
    expect(computeEventTimeFundingPct({ entryAt, exitAt: afterFunding, direction: 'SHORT', fundingEvents: events, fundingCoverage, fundingPolicy: 'REALIZED_SIGNED' })).toBeCloseTo(-0.01);
  });

  it('cannot reconstruct a lower timeframe from higher-timeframe candles', () => {
    const hourly = Array.from({ length: 10 }, (_, index) => ({ ...candle(index * 3_600_000 + 3_600_000), time: new Date(index * 3_600_000 + 3_600_000).toISOString() }));
    expect(resampleClosedCandles(hourly, 3_600_000, 300_000)).toEqual([]);
  });

  it('reports cross-venue price divergence without erasing instrument or venue identity', () => {
    const ticker = (venue: string, price: number) => ({
      symbol: 'BTC-USDT', lastPrice: price, turnover24h: 10_000, priceChange24hPct: 0, volume24h: 100,
      high24h: price, low24h: price, fundingRate: 0, openInterest: 1_000, dataState: 'live' as const, timestamp: 2_000,
      observationMetadata: canonicalObservationMetadata({
        sourceObservedAt: 1_900, providerReadAt: 2_000, receivedAt: 2_000, cacheStoredAt: null,
        provider: venue, venue, canonicalInstrumentId: 'BTC-USDT-PERP', providerInstrumentId: 'BTCUSDT', adapterVersion: 'test',
        qualityState: 'VALID', staleReason: null, lineageId: `${venue}:btc`, dependencyFamily: 'DERIVATIVES_POSITIONING', parentLineageIds: [], decisionEligible: true,
      }),
    });
    const [result] = reconcileTickerObservations([[ticker('BINANCE', 100)], [ticker('KUCOIN', 102)]], 75);
    expect(result.venues).toEqual(['BINANCE', 'KUCOIN']);
    expect(result.status).toBe('PRICE_DIVERGENCE');
  });
});

describe('sealed governance and immutable archives', () => {
  it('allows one holdout use per frozen candidate and dataset, then retires failures', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'apex-holdout-'));
    const ledger = new HoldoutUseLedger(path.join(dir, 'ledger.json'));
    const rows = Array.from({ length: 3 }, (_, index) => ({ time: new Date(index * 60_000).toISOString(), open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 }));
    const datasetFingerprint = fingerprintDataset(rows);
    const candidateFingerprint = fingerprintFrozenCandidate({
      strategyId: 's', strategyVersion: 1, parameters: { x: 1 }, scannerConfig: {},
      transactionCostProfileFingerprint: 'cost',
      validationPolicyFingerprint: 'policy',
      searchObjectiveFingerprint: 'objective',
      developmentDatasetFingerprint: datasetFingerprint,
      featureVersions: ['v1'], authorityConfiguration: { stage: 'RESEARCH' },
    });
    ledger.open(candidateFingerprint, datasetFingerprint, 1);
    expect(ledger.complete(candidateFingerprint, datasetFingerprint, false, 2).status).toBe('FAILED_RETIRED');
    expect(() => ledger.open(candidateFingerprint, datasetFingerprint, 3)).toThrow('sealed_holdout_reuse_blocked');
  });

  it('requires a multiplicity-corrected positive lower confidence bound', () => {
    const positive = validateReturnEvidence(Array.from({ length: 60 }, () => 0.2), { triedVariants: 20, bootstrapSamples: 500 });
    const noisy = validateReturnEvidence(Array.from({ length: 60 }, (_, index) => index % 2 ? 1 : -1), { triedVariants: 20, bootstrapSamples: 500 });
    expect(positive.passed).toBe(true);
    expect(noisy.passed).toBe(false);
  });

  it('archives a content-addressed segment before rolling deletion', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'apex-archive-'));
    const filePath = path.join(dir, 'events.jsonl');
    const archiveDir = path.join(dir, 'archive');
    const log = new AppendOnlyEventLog({ filePath, researchArchiveDir: archiveDir, fsync: false, maxSegmentBytes: 64 * 1024, maxSegments: 1 });
    for (let index = 0; index < 90; index += 1) {
      await log.append({
        eventId: `event-${index}`, type: 'TRADE', source: 'test', symbol: 'BTC-USDT', exchangeTimestamp: 1_000 + index,
        receivedAt: 2_000 + index, sequence: index, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { price: 100, blob: 'x'.repeat(2_000) },
      });
    }
    await log.close();
    expect(existsSync(path.join(archiveDir, 'manifest.jsonl'))).toBe(true);
    const manifest = readFileSync(path.join(archiveDir, 'manifest.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(manifest.length).toBeGreaterThan(0);
    expect(readdirSync(archiveDir).some((name) => name === `${manifest[0].sha256}.jsonl`)).toBe(true);
    // Every append restricts file ACLs to the owner via a synchronous icacls.exe
    // spawn on Windows; that real per-write security hardening cost, not test
    // flakiness, is why this integration test needs headroom beyond the default.
  }, 30_000);
});
