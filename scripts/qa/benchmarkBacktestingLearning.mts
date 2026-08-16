import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { BacktestExecutionCache } from '../../src/services/backtestExecutionCache.ts';
import { runApexReplayBacktestDirectional, type BacktestCandle } from '../../src/services/backtesting.ts';
import { trainLogisticRegression } from '../../src/services/mlLogisticRegression.ts';
import { MathEngine } from '../../src/services/mathEngine.ts';
import type { ScannerConfig } from '../../src/types.ts';

function positiveInteger(name: string, fallback: number): number {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 1) throw new RangeError(`${name} must be a finite positive integer.`);
  return Math.floor(parsed);
}

function quantile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function generateCandles(count: number): BacktestCandle[] {
  const candles: BacktestCandle[] = [];
  const start = Date.UTC(2026, 0, 1);
  let price = 64_000;
  for (let index = 0; index < count; index += 1) {
    const cycle = index % 72;
    const drift = cycle < 48 ? 22 : -95;
    const wave = Math.sin(index / 4) * 110;
    const open = price;
    const close = Math.max(500, open + drift + wave * 0.18);
    const high = Math.max(open, close) + 90 + Math.abs(Math.sin(index)) * 80;
    const low = Math.min(open, close) - 100 - Math.abs(Math.cos(index)) * 90;
    const volume = 900 + (index % 24) * 35 + (cycle >= 48 ? 850 : 0);
    candles.push({ time: new Date(start + index * 15 * 60_000).toISOString(), open, high, low, close, volume });
    price = close;
  }
  return candles;
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

const candleCount = positiveInteger('APEX_BENCH_CANDLES', 5_000);
const backtestIterations = positiveInteger('APEX_BENCH_BACKTEST_ITERATIONS', 12);
const learningRows = positiveInteger('APEX_BENCH_LEARNING_ROWS', 10_000);
const learningEpochs = positiveInteger('APEX_BENCH_LEARNING_EPOCHS', 900);
const learningIterations = positiveInteger('APEX_BENCH_LEARNING_ITERATIONS', 3);
const coalescedRequests = positiveInteger('APEX_BENCH_COALESCED_REQUESTS', 24);
const candles = generateCandles(candleCount);
const memoryBefore = process.memoryUsage();
const backtest = () => runApexReplayBacktestDirectional(candles, {
  symbol: 'BTC-USDT', interval: '15m', scannerConfig, direction: 'SHORT', maxBars: 24,
});

backtest();
backtest();
const backtestMs: number[] = [];
let deterministicReference = '';
for (let iteration = 0; iteration < backtestIterations; iteration += 1) {
  const startedAt = performance.now();
  const result = backtest();
  backtestMs.push(performance.now() - startedAt);
  const signature = JSON.stringify({ summary: result.summary, trades: result.trades, equityCurve: result.equityCurve });
  if (!deterministicReference) deterministicReference = signature;
  else if (signature !== deterministicReference) throw new Error('Backtest output changed across identical load iterations.');
}

const cache = new BacktestExecutionCache<ReturnType<typeof backtest>>({ ttlMs: 30_000, maxEntries: 8 });
let executions = 0;
const loadStartedAt = performance.now();
const coalesced = await Promise.all(Array.from({ length: coalescedRequests }, () => cache.execute('same-deterministic-run', async () => {
  executions += 1;
  await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
  return backtest();
})));
const coalescedMs = performance.now() - loadStartedAt;
if (executions !== 1) throw new Error(`Expected one coalesced replay execution, received ${executions}.`);
if (coalesced.filter((result) => result.state === 'COALESCED').length !== coalescedRequests - 1) {
  throw new Error('Concurrent identical replay requests were not fully coalesced.');
}

const rows = Array.from({ length: learningRows }, (_, index) => ({
  values: [
    Math.sin(index), Math.cos(index), (index % 17) / 17, (index % 31) / 31, (index % 7) / 7,
    (index % 13) / 13, (index % 5) / 5, (index % 19) / 19, (index % 23) / 23,
  ],
  label: (index % 3 ? 1 : 0) as 0 | 1,
}));
trainLogisticRegression(rows, { epochs: 20, learningRate: 0.04, l2: 0.002 });
const learningMs: number[] = [];
let modelSignature = '';
for (let iteration = 0; iteration < learningIterations; iteration += 1) {
  const startedAt = performance.now();
  const model = trainLogisticRegression(rows, { epochs: learningEpochs, learningRate: 0.04, l2: 0.002 });
  learningMs.push(performance.now() - startedAt);
  const signature = JSON.stringify({ coefficients: model.coefficients, intercept: model.intercept, standardization: model.standardization });
  if (!modelSignature) modelSignature = signature;
  else if (signature !== modelSignature) throw new Error('Learning output changed across identical load iterations.');
}

const report = {
  generatedAt: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  backtesting: {
    candleCount,
    iterations: backtestIterations,
    minMs: Math.min(...backtestMs),
    medianMs: quantile(backtestMs, 0.5),
    p95Ms: quantile(backtestMs, 0.95),
    maxMs: Math.max(...backtestMs),
    runsPerSecond: 1000 / (backtestMs.reduce((sum, value) => sum + value, 0) / backtestMs.length),
    deterministic: true,
  },
  concurrentDuplicateLoad: {
    requests: coalescedRequests,
    engineExecutions: executions,
    coalescedRequests: coalescedRequests - executions,
    totalMs: coalescedMs,
  },
  memory: {
    rssBeforeBytes: memoryBefore.rss,
    rssAfterBytes: process.memoryUsage().rss,
    heapUsedBeforeBytes: memoryBefore.heapUsed,
    heapUsedAfterBytes: process.memoryUsage().heapUsed,
  },
  learning: {
    rows: learningRows,
    features: rows[0]?.values.length ?? 0,
    epochs: learningEpochs,
    iterations: learningIterations,
    minMs: Math.min(...learningMs),
    medianMs: quantile(learningMs, 0.5),
    p95Ms: quantile(learningMs, 0.95),
    maxMs: Math.max(...learningMs),
    deterministic: true,
  },
};

const outputDir = resolve('QA/performance');
await mkdir(outputDir, { recursive: true });
const outputFile = process.env.APEX_BACKTEST_BENCH_OUTPUT || 'BACKTESTING_LEARNING_LOAD_RESULT.json';
await writeFile(resolve(outputDir, outputFile), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
