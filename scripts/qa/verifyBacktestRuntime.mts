import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import {
  runApexReplayBacktestDirectional,
  runShortMomentumBacktest,
  type BacktestCandle,
} from '../../src/services/backtesting.ts';
import { MathEngine } from '../../src/services/mathEngine.ts';
import type { ScannerConfig } from '../../src/types.ts';

const candles: BacktestCandle[] = [];
const start = Date.UTC(2026, 0, 1, 0, 0, 0);
let price = 64_000;
for (let i = 0; i < 900; i += 1) {
  // Deterministic trend cycles with bearish breaks and recoveries. This is a
  // controlled engine fixture, not market data shown in the product UI.
  const cycle = i % 72;
  const drift = cycle < 48 ? 22 : -95;
  const wave = Math.sin(i / 4) * 110;
  const open = price;
  const close = Math.max(500, open + drift + wave * 0.18);
  const high = Math.max(open, close) + 90 + Math.abs(Math.sin(i)) * 80;
  const low = Math.min(open, close) - 100 - Math.abs(Math.cos(i)) * 90;
  const volume = 900 + (i % 24) * 35 + (cycle >= 48 ? 850 : 0);
  candles.push({
    time: new Date(start + i * 15 * 60_000).toISOString(),
    open,
    high,
    low,
    close,
    volume,
  });
  price = close;
}

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
  scorePreset: 'ATLAS_PLUS_V2',
  adaptiveLearningRate: 0.04,
  adaptiveMinSamples: 24,
  scoreWeights: MathEngine.defaultScoreWeights(),
  minConfidence: 0.78,
  directionBias: 'BOTH',
  topRankSkip: 10,
  minVolume24hUsd: 5_000_000,
};

function timed<T>(run: () => T) {
  const startedAt = performance.now();
  const value = run();
  return { value, elapsedMs: Number((performance.now() - startedAt).toFixed(3)) };
}

const baseline = timed(() => runShortMomentumBacktest(candles, {
  symbol: 'BTC-USDT',
  interval: '15m',
  stopPct: 0.008,
  targetPct: 0.014,
  maxBars: 24,
}));
const long = timed(() => runApexReplayBacktestDirectional(candles, {
  symbol: 'BTC-USDT',
  interval: '15m',
  scannerConfig,
  direction: 'LONG',
  maxBars: 24,
}));
const short = timed(() => runApexReplayBacktestDirectional(candles, {
  symbol: 'BTC-USDT',
  interval: '15m',
  scannerConfig,
  direction: 'SHORT',
  maxBars: 24,
}));
const longRepeat = runApexReplayBacktestDirectional(candles, {
  symbol: 'BTC-USDT',
  interval: '15m',
  scannerConfig,
  direction: 'LONG',
  maxBars: 24,
});

const summarize = (result: typeof long.value) => ({
  candlesProcessed: result.summary.candles,
  trades: result.summary.trades,
  wins: result.summary.wins,
  losses: result.summary.losses,
  timed: result.summary.timed,
  acceptedCandidates: result.summary.acceptedCandidates ?? result.trades.length,
  rejectedCandidates: result.summary.rejectedCandidates ?? 0,
  rejectionCounts: result.summary.rejectionCounts ?? {},
  totalPnlPct: result.summary.totalPnlPct,
  maxDrawdownPct: result.summary.maxDrawdownPct,
  profitFactor: Number.isFinite(result.summary.profitFactor) ? result.summary.profitFactor : 'Infinity',
  equityPoints: result.equityCurve.length,
});

const report = {
  checkedAt: new Date().toISOString(),
  fixture: {
    candlesSubmitted: candles.length,
    interval: '15m',
    maxHoldBars: 24,
    deterministic: true,
  },
  baselineEngine: {
    candlesProcessed: baseline.value.summary.candles,
    trades: baseline.value.summary.trades,
    wins: baseline.value.summary.wins,
    losses: baseline.value.summary.losses,
    timed: baseline.value.summary.timed,
    totalPnlPct: baseline.value.summary.totalPnlPct,
    maxDrawdownPct: baseline.value.summary.maxDrawdownPct,
    profitFactor: Number.isFinite(baseline.value.summary.profitFactor) ? baseline.value.summary.profitFactor : 'Infinity',
    equityPoints: baseline.value.equityCurve.length,
    elapsedMs: baseline.elapsedMs,
  },
  canonicalDirectionalReplay: {
    long: { ...summarize(long.value), elapsedMs: long.elapsedMs },
    short: { ...summarize(short.value), elapsedMs: short.elapsedMs },
    deterministicRepeatMatched:
      JSON.stringify(long.value.trades) === JSON.stringify(longRepeat.trades)
      && JSON.stringify(long.value.equityCurve) === JSON.stringify(longRepeat.equityCurve),
  },
};

for (const [label, result] of [['LONG', long.value], ['SHORT', short.value]] as const) {
  if (result.summary.candles !== 900) throw new Error(`${label}: expected 900 processed candles, received ${result.summary.candles}`);
  if (result.equityCurve.length !== result.summary.trades + 1) throw new Error(`${label}: equity curve/trade count mismatch`);
  if (!result.trades.every((trade) => trade.barsHeld >= 1 && Number.isFinite(trade.pnlPct))) throw new Error(`${label}: invalid trade geometry`);
}
if (!report.canonicalDirectionalReplay.deterministicRepeatMatched) throw new Error('Canonical LONG replay was not deterministic across identical runs.');
if (baseline.value.summary.candles !== 900) throw new Error(`Baseline: expected 900 processed candles, received ${baseline.value.summary.candles}`);

const outputDir = resolve('QA/backtesting-runtime');
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, 'BACKTEST_RUNTIME_RESULT.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
