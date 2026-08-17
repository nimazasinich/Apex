import { describe, expect, it } from 'vitest';
import type { MarketEvent } from '../contracts/realtime/marketEvent';
import { WorldStateStore } from '../services/realtime/worldStateStore';
import { RealtimeSeriesStore } from '../services/realtime/realtimeSeriesStore';
import { OrderBookRebuilder } from '../services/realtime/orderBookRebuilder';
import { LiquidityHunterDynamicFusionEngine } from '../services/liquidityHunter/dynamicFusionEngine';
import { authorizeLiquidityHunterTradePlan } from '../services/liquidityHunter/decisionBridge';
import { AppendOnlyEventLog } from '../services/realtime/appendOnlyEventLog';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const NOW = Date.UTC(2026, 7, 7, 13, 0, 0);

function event(type: MarketEvent['type'], source: string, sequence: number, payload: unknown, offsetMs: number): MarketEvent {
  return {
    eventId: `${source}-${type}-${sequence}`,
    type,
    source,
    symbol: 'BTC-USDT',
    exchangeTimestamp: NOW + offsetMs,
    receivedAt: NOW + offsetMs + 10,
    sequence,
    schemaVersion: 1,
    payload,
  };
}

function buildRuntime() {
  const worldState = new WorldStateStore();
  const seriesStore = new RealtimeSeriesStore({ maxEventsPerKey: 10_000, maxAgeMs: 48 * 60 * 60_000 });
  const orderBook = new OrderBookRebuilder();
  const append = (row: MarketEvent) => { seriesStore.append(row, NOW); orderBook.apply(row, row.receivedAt); };

  const fundingValues = [0.00008, 0.00011, 0.00009, 0.00010, 0.00012, 0.00007, 0.00013, 0.00009, 0.00010, 0.00011, 0.00008, 0.00012, 0.00085];
  fundingValues.forEach((rate, index) => append(event('FUNDING', 'binance-usdm', index + 1, { rate }, -12 * 60_000 + index * 50_000)));
  append(event('OPEN_INTEREST', 'binance-usdm', 1, { openInterest: 1_000 }, -20_000));
  append(event('OPEN_INTEREST', 'binance-usdm', 2, { openInterest: 1_025 }, -5_000));
  append(event('LIQUIDATION', 'verified-liqmap', 1, { clusters: [{ id: 'long-pool', side: 'LONG', lowerPrice: 98.8, upperPrice: 99.2, notionalUsd: 50_000_000, confidence: 0.92 }], methodology: 'VERIFIED_REPLAY_LIQUIDATION_TOPOLOGY_V1', predictive: true }, -3_000));

  for (const source of ['binance-usdm', 'bybit-linear']) {
    append(event('ORDERBOOK_SNAPSHOT', source, 1, { bids: [[99.0, 1], [98.9, 2]], asks: [[99.2, 2], [99.3, 3]] }, -9_000));
    [1, 2, 4, 7, 11].forEach((size, index) => append(event('ORDERBOOK_DELTA', source, index + 2, { updates: [{ side: 'BID', price: 99.0, size }] }, -5_000 + index * 1_000)));
  }

  let seqA = 1;
  let seqB = 1;
  for (let index = 0; index < 24; index += 1) {
    const source = index % 2 === 0 ? 'binance-usdm' : 'bybit-linear';
    const seq = source === 'binance-usdm' ? seqA++ : seqB++;
    append(event('TRADE', source, seq, { price: 100.4 - index * 0.025, size: 5, aggressorSide: 'BUY' }, -55_000 + index * 1_800));
  }
  for (let index = 0; index < 12; index += 1) {
    const source = index % 2 === 0 ? 'binance-usdm' : 'bybit-linear';
    const seq = source === 'binance-usdm' ? seqA++ : seqB++;
    append(event('TRADE', source, seq, { price: 99.82 - index * 0.003, size: 2, aggressorSide: 'SELL' }, -9_000 + index * 600));
  }

  const whaleRows = [
    ['s1', 'S', 'LONG', 140, 28, 8], ['s2', 'S', 'LONG', 120, 24, 10], ['a1', 'A', 'LONG', 90, 18, 14],
    ['f1', 'F', 'SHORT', 120, -22, 52], ['f2', 'F', 'SHORT', 95, -18, 48], ['f3', 'F', 'SHORT', 80, -15, 46], ['f4', 'F', 'SHORT', 70, -16, 50], ['f5', 'F', 'SHORT', 65, -14, 47],
  ] as const;
  whaleRows.forEach(([wallet, grade, direction, closedTrades, netPnlPct, maxDrawdownPct], index) => append(event('WALLET_POSITION', 'hyperliquid', index + 1, { wallet, grade, direction, closedTrades, netPnlPct, maxDrawdownPct, leverage: grade === 'F' ? 12 : 3 }, -5_000 + index * 100)));

  return { worldState, seriesStore, orderBook };
}

const smartMoneyContext = {
  smcDirectionalScore: 0.72,
  smcContextScore: 0.70,
  setupModel: 'LIQUIDITY_SWEEP_REVERSAL' as const,
  controlSide: 'DEMAND' as const,
  smartMoneyBiasScore: 0.74,
  flipSetupScore: 0.5,
  chochSetupScore: 0.58,
  continuationScore: 0.2,
  ifcQualityScore: 0.85,
  liquiditySweepScore: 0.88,
  zoneFreshnessScore: 0.82,
  unmitigatedZoneProximity: 0.9,
  htfSupplyInControl: false,
  htfDemandInControl: true,
  reasons: ['fixture'],
};

describe('Liquidity Hunter core', () => {
  it('advances through the four layers in shadow mode without authorizing execution', async () => {
    const runtime = buildRuntime();
    const engine = new LiquidityHunterDynamicFusionEngine({
      ...runtime,
      flags: {
        liquidityHunterEnabled: true,
        shadowOnly: true,
        realtimeEventRecordingEnabled: false,
        publicFeedsEnabled: false,
        binancePublicFeedEnabled: false,
        kucoinPublicFeedEnabled: false,
        bybitPublicFeedEnabled: false,
        realtimeL2Enabled: true,
        optionsGexEnabled: false,
      deribitOptionsPublicEnabled: false,
      hyblockLiquidationTopologyEnabled: false,
        walletGradingEnabled: true, hyperliquidWalletObserverEnabled: false,
      hyperliquidWalletHistoryGradingEnabled: false,
        sentimentVelocityEnabled: false,
        metaModelEnabled: true,
        websocketEnabled: false,
      paperCanaryEnabled: false,
        testnetCanaryEnabled: false,
        autonomousLiveExecutionEnabled: false,
      },
    });
    const result = await engine.evaluate({
      symbol: 'BTC-USDT',
      now: NOW,
      currentPrice: 100,
      smartMoneyContext,
      metaModelEvaluation: { direction: 'LONG', score: 0.82, modelVersion: 'fixture-v1', featureVersion: 'fixture-features-v1', generatedAt: NOW - 500, expiresAt: NOW + 20_000 },
    });
    expect(result.shadowOnly).toBe(true);
    expect(result.authoritative).toBe(false);
    expect(result.macro.expectedSweepDirection).toBe('DOWN');
    expect(result.macro.postSweepTradeBias).toBe('LONG');
    expect(result.trigger.kind).toBe('ABSORPTION_REVERSAL_TRIGGER');
    expect(result.trigger.direction).toBe('LONG');
    expect(result.layers.slice(0, 3).every((layer) => layer.status === 'PASSED')).toBe(true);
    expect(result.shadowValidation).toMatch(/CONFIRM/);
    expect(result.setupState).toBe('READY_FOR_CONFIRMATION');
    expect(result.eligibleForManualConfirmation).toBe(true);
    expect(result.reasons).toContain('manual_confirmation_candidate_only');

    const authorization = authorizeLiquidityHunterTradePlan({
      decision: {
        symbol: 'BTC-USDT', direction: 'LONG', rankingScore: 82, confidence: 82, calibratedProbability: null,
        expectedNetEdge: null, modelUncertainty: null, featureCompletenessPct: 100,
        supportingSignals: [], conflictingSignals: [], dataQuality: 'live', engineVersion: 'canonical_v2',
        createdAt: NOW, expiresAt: NOW + 60_000, baseline: { readinessTier: 'READY' } as any, mode: 'live',
      },
      evaluation: result,
      tradePlan: {
        levels: { symbol: 'BTC-USDT', entry: 100, resistances: [104, 106, 108], supports: [98, 96, 94], method: 'ATR_BANDS', atr14: 2, confidenceScore: 80, evidenceList: [], riskReward: { nearestTarget: 104, nearestStop: 98, rMultiple: 2, riskPct: 2 }, dataState: 'live' },
        sizing: { accountBalanceUsd: 10_000, riskMode: 'PCT', riskValue: 1, leverage: 2, entryPrice: 100, stopLossPrice: 98, takeProfitPrice: 104, direction: 'LONG', successProbModel: 82, successProbUserOverride: null },
        spread: 0.02, spreadState: 'VALID', fundingRate: 0.0001, fundingState: 'VALID', now: NOW,
      },
      risk: {
        account: { equityUsd: 10_000, availableMarginUsd: 10_000, timestamp: NOW },
        portfolio: { openPositionCount: 0, totalOpenRiskUsd: 0, symbolExposureUsd: 0, correlatedExposureUsd: 0, dailyPnlUsd: 0, weeklyPnlUsd: 0, drawdownPct: 0, consecutiveLosses: 0 },
        market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true }, now: NOW,
      },
    });
    expect(authorization.tradePlan?.version).toBe('trade_plan_v1');
    expect(authorization.risk?.decision).toMatch(/APPROVED/);
    expect(authorization.executionAuthorized).toBe(false);
  });

  it('restores setup lifecycle state from the shared append-only log after restart', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'apex-lh-setup-'));
    const logPath = path.join(dir, 'events.jsonl');
    let id = 0;
    const ids = () => `durable-${String(++id).padStart(8, '0')}`;
    try {
      const firstLog = new AppendOnlyEventLog({ filePath: logPath, maxSegmentBytes: 64 * 1024, fsync: true });
      const first = new LiquidityHunterDynamicFusionEngine({ ...buildRuntime(), flags: {
        liquidityHunterEnabled: true, shadowOnly: true, realtimeEventRecordingEnabled: true, publicFeedsEnabled: false,
        binancePublicFeedEnabled: false, kucoinPublicFeedEnabled: false, bybitPublicFeedEnabled: false, realtimeL2Enabled: true,
        optionsGexEnabled: false, deribitOptionsPublicEnabled: false, hyblockLiquidationTopologyEnabled: false,
        walletGradingEnabled: true, hyperliquidWalletObserverEnabled: false, hyperliquidWalletHistoryGradingEnabled: false,
        sentimentVelocityEnabled: false, metaModelEnabled: true, websocketEnabled: false, paperCanaryEnabled: false,
        testnetCanaryEnabled: false, autonomousLiveExecutionEnabled: false,
      }, idFactory: ids, setupEventLog: firstLog });
      await first.evaluate({ symbol: 'BTC-USDT', now: NOW, currentPrice: 100, smartMoneyContext, metaModelEvaluation: { direction: 'LONG', score: 0.82, modelVersion: 'fixture-v1', featureVersion: 'fixture-v1', generatedAt: NOW - 1, expiresAt: NOW + 20_000 } });
      const before = first.setupSnapshots();
      await firstLog.close();

      const secondLog = new AppendOnlyEventLog({ filePath: logPath, maxSegmentBytes: 64 * 1024, fsync: true });
      const second = new LiquidityHunterDynamicFusionEngine({ ...buildRuntime(), flags: {
        liquidityHunterEnabled: true, shadowOnly: true, realtimeEventRecordingEnabled: true, publicFeedsEnabled: false,
        binancePublicFeedEnabled: false, kucoinPublicFeedEnabled: false, bybitPublicFeedEnabled: false, realtimeL2Enabled: true,
        optionsGexEnabled: false, deribitOptionsPublicEnabled: false, hyblockLiquidationTopologyEnabled: false,
        walletGradingEnabled: true, hyperliquidWalletObserverEnabled: false, hyperliquidWalletHistoryGradingEnabled: false,
        sentimentVelocityEnabled: false, metaModelEnabled: true, websocketEnabled: false, paperCanaryEnabled: false,
        testnetCanaryEnabled: false, autonomousLiveExecutionEnabled: false,
      }, idFactory: ids, setupEventLog: secondLog });
      expect(second.setupSnapshots()).toEqual(before);
      await secondLog.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
