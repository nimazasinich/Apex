import assert from 'node:assert/strict';
import { EWMATracker, SymbolStatisticsRegistry, WelfordNormalizer } from '../../src/services/onlineStatistics';
import { KuCoinL2SequenceBook, parseStreamingFlag } from '../../src/services/kucoinStreaming';
import { buildFastAdaptiveShadowRecommendation } from '../../src/services/fastAdaptiveShadowController';
import { MathEngine } from '../../src/services/mathEngine';
import { selectScanSlice } from '../../src/services/scannerCore';
import { smcAlignmentForDirection } from '../../src/services/smartMoneyContextEngine';
import { __resetProviderRouterState, backoffDelayMs, clearProviderRouterSymbol, readLkg, storeLkg } from '../../src/services/providerRouter';
import type { Candlestick, OrderBook, RankedContract, ScannerConfig, SignalDecisionLog } from '../../src/types';



function makeBook(bids: Array<[number, number]>, asks: Array<[number, number]>): OrderBook {
  let bidCumulative = 0;
  let askCumulative = 0;
  return {
    bids: bids.map(([price, volume]) => ({ price, volume, cumulative: (bidCumulative += volume), percentage: 0 })),
    asks: asks.map(([price, volume]) => ({ price, volume, cumulative: (askCumulative += volume), percentage: 0 })),
  };
}

function candle(open: number, high: number, low: number, close: number, index = 0): Candlestick {
  return { time: String(index), open, high, low, close, volume: 1_000 + index };
}

function contractPool(size: number): RankedContract[] {
  return Array.from({ length: size }, (_, index) => ({
    ticker: `T${index}-USDT`,
    kuCoinSymbol: `T${index}USDTM`,
    turnover24hUsd: 10_000_000,
    rank: index + 1,
  }));
}

const ewma = new EWMATracker(0.25);
assert.equal(ewma.update(10), 10);
assert.equal(ewma.update(14), 11);

const welford = new WelfordNormalizer();
[2, 4, 4, 4, 5, 5, 7, 9].forEach((value) => welford.update(value));
assert.equal(welford.mean, 5);
assert.ok(Math.abs(welford.populationVariance - 4) < 1e-10);


const statisticsRegistry = new SymbolStatisticsRegistry(3);
statisticsRegistry.smoothOBI('BTC-USDT', -0.3);
statisticsRegistry.smoothATR('BTC-USDT', 125.5);
statisticsRegistry.smoothOBI('ETH-USDT', 0.2);
const recentStatistics = statisticsRegistry.listSnapshots(1);
assert.equal(recentStatistics.length, 1);
assert.equal(recentStatistics[0].symbol, 'ETH-USDT');
assert.equal(recentStatistics[0].obi?.samples, 1);

const book = new KuCoinL2SequenceBook();
book.seed({ symbol: 'BTC-USDT', sequence: 100, bids: [[100, 1]], asks: [[101, 1]] });
assert.equal(book.apply({ change: '100,buy,2', sequence: 101 }).status, 'APPLIED');
assert.equal(book.apply({ change: '100,buy,2', sequence: 103 }).status, 'GAP');
assert.equal(parseStreamingFlag('true'), true);
assert.equal(parseStreamingFlag('false'), false);

const config: ScannerConfig = {
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
  scoreWeights: {
    obi: 0.19,
    qStruct: 0.24,
    volume: 0.17,
    funding: 0.08,
    openInterest: 0.08,
    atr: 0.06,
    microstructure: 0.08,
    liquidity: 0.05,
    smc: 0.05,
  },

  minConfidence: 0.78,
  directionBias: 'SHORT_ONLY',
  topRankSkip: 10,
  minVolume24hUsd: 5_000_000,
};
const now = 1_800_000_000_000;
const rows: SignalDecisionLog[] = Array.from({ length: 24 }, (_, index) => ({
  id: `row-${index}`,
  cycleId: `cycle-${index}`,
  timestamp: now - index * 1000,
  isoTime: new Date(now - index * 1000).toISOString(),
  ticker: 'BTC-USDT',
  direction: 'SHORT',
  decision: 'REJECTED',
  reasonCode: 'HIGH_SQUEEZE_RISK',
  reasonText: 'qa',
  squeezeRiskScore: 0.75,
  evidenceAgreementScore: 0.52,
  liquidityQualityScore: 0.58,
}));


const hardeningBook = makeBook([[100, 900], [99, 100]], [[101, 100], [102, 50]]);
const hardeningObi = MathEngine.calculateOBI(hardeningBook);
const hardeningMicroPrice = MathEngine.calculateMicroPrice(hardeningBook);
assert.ok(hardeningObi > 0 && hardeningObi <= 1);
assert.ok(hardeningMicroPrice >= 100 && hardeningMicroPrice <= 101);

const lowVolCandles = Array.from({ length: 15 }, (_, index) => candle(100, 101, 99, 100, index));
const highVolCandles = Array.from({ length: 15 }, (_, index) => candle(100, 120, 80, 100, index));
assert.ok(MathEngine.calculateATR(highVolCandles) > MathEngine.calculateATR(lowVolCandles));
const calibrated = [-10, -2, 0, 2, 10].map((score) => MathEngine.plattCalibration(score));
calibrated.forEach((value) => assert.ok(value > 0 && value < 1));
for (let index = 1; index < calibrated.length; index += 1) assert.ok(calibrated[index] > calibrated[index - 1]);
const flatCandles = Array.from({ length: 12 }, (_, index) => candle(100, 100.05, 99.95, 100, index));
assert.deepEqual(MathEngine.summarizeStructuralZones(flatCandles), { zonesCount: 0, averageZoneScore: 0 });

const seen = new Set<string>();
let scanCursor = 0;
for (let cycle = 0; cycle < 3; cycle += 1) {
  const result = selectScanSlice(contractPool(10), scanCursor, 4, new Set(['T1-USDT']));
  assert.ok(result.slice.length <= 4);
  assert.equal(result.slice.some((item) => item.ticker === 'T1-USDT'), false);
  result.slice.forEach((item) => seen.add(item.ticker));
  scanCursor = result.nextCursor;
}
assert.equal(seen.size, 9);

for (const directional of [-0.8, -0.2, 0, 0.4, 0.9]) {
  const total = smcAlignmentForDirection(directional, 'LONG') + smcAlignmentForDirection(directional, 'SHORT');
  assert.ok(Math.abs(total - 1) < 1e-10);
}
assert.ok(Math.abs(smcAlignmentForDirection(Number.NaN, 'LONG') - 0.5) < 1e-10);

__resetProviderRouterState();
storeLkg('ticker', 'BTC-USDT', 'kucoin', { price: 100 });
storeLkg('ticker', 'ETH-USDT', 'kucoin', { price: 200 });
assert.deepEqual(readLkg('ticker', 'BTC-USDT')?.value, { price: 100 });
assert.equal(readLkg('orderbook', 'BTC-USDT'), null);
clearProviderRouterSymbol('BTC-USDT');
assert.equal(readLkg('ticker', 'BTC-USDT'), null);
assert.deepEqual(readLkg('ticker', 'ETH-USDT')?.value, { price: 200 });
const firstBackoff = backoffDelayMs(0);
const laterBackoff = backoffDelayMs(5);
const cappedBackoff = backoffDelayMs(100);
assert.ok(firstBackoff >= 500 && firstBackoff < 750);
assert.ok(laterBackoff >= 16_000 && laterBackoff < 16_250);
assert.ok(cappedBackoff >= 30_000 && cappedBackoff < 30_250);


const recommendation = buildFastAdaptiveShadowRecommendation(config, rows, { now, minSamples: 24 });
assert.equal(recommendation.shadowOnly, true);
assert.equal(recommendation.sourceHorizon, '1m');
assert.ok(recommendation.recommendedConfig.maxSqueezeRisk < config.maxSqueezeRisk);

console.log(JSON.stringify({
  ok: true,
  checks: {
    ewma: true,
    welford: true,
    marketStatisticsRegistry: true,
    l2SequenceValidation: true,
    streamingFlag: true,
    fastAdaptiveShadow: true,
    mathEngineHardening: true,
    scannerRotationBudget: true,
    smcDirectionalSymmetry: true,
    providerLkgAndBackoff: true,
  },
}, null, 2));
