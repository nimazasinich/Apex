import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import type { BacktestCandle } from '../../src/services/backtesting.ts';
import { optimizeStrategy, type StrategyOptimizationMetrics } from '../../src/services/strategyOptimization.ts';
import type { ScannerConfig, StrategyDefinition } from '../../src/types.ts';

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
  const rows: BacktestCandle[] = [];
  const start = Date.UTC(2024, 0, 1);
  let price = 40_000;
  for (let index = 0; index < count; index += 1) {
    const regime = Math.floor(index / 240) % 3;
    const drift = regime === 0 ? 7 : regime === 1 ? -4 : 2;
    const wave = Math.sin(index / 9) * 32 + Math.cos(index / 31) * 20;
    const open = price;
    const close = Math.max(100, open + drift + wave * 0.16);
    rows.push({
      time: new Date(start + index * 60 * 60_000).toISOString(),
      open,
      high: Math.max(open, close) + 18 + Math.abs(Math.sin(index)) * 12,
      low: Math.min(open, close) - 18 - Math.abs(Math.cos(index)) * 12,
      close,
      volume: 1_000 + (index % 48) * 17 + regime * 220,
    });
    price = close;
  }
  return rows;
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
  scorePreset: 'CUSTOM',
  adaptiveLearningRate: 0.04,
  adaptiveMinSamples: 24,
  scoreWeights: { obi: 0.12, volume: 0.11, qStruct: 0.14, funding: 0.10, openInterest: 0.10, atr: 0.08, microstructure: 0.12, liquidity: 0.13, smc: 0.10 },
  minConfidence: 0.78,
  directionBias: 'BOTH',
  topRankSkip: 10,
  minVolume24hUsd: 5_000_000,
};

const definition: StrategyDefinition = {
  strategyId: 'optimizer-load-fixture-v1',
  version: 1,
  name: 'Optimizer Load Fixture',
  summary: 'Deterministic optimizer load fixture.',
  evidenceTier: ['B'],
  wave: 'wave1-mvp',
  status: 'candidate',
  longShort: 'BOTH',
  supportedIntervals: ['1h'],
  dataRequirements: ['candles'],
  engine: 'bespoke',
  runFn: 'optimizerLoadFixture',
  regimeRules: [], setupRules: [], triggerRules: [], riskRules: [], exitRules: [], noTradeRules: [],
  sourceReferences: [], knownFailureModes: [], categories: [], componentCount: 1,
  parameters: [
    { key: 'threshold', label: 'Threshold', default: 0.25, min: 0.05, max: 0.95, step: 0.025, reason: 'Load fixture threshold.' },
    { key: 'lookback', label: 'Lookback', default: 24, min: 8, max: 72, step: 4, reason: 'Load fixture lookback.' },
  ],
};

function evaluator(input: {
  candles: BacktestCandle[];
  parameters: Record<string, number | string>;
  transactionCostPct: number;
}): StrategyOptimizationMetrics {
  const threshold = Number(input.parameters.threshold);
  const lookback = Number(input.parameters.lookback);
  let movement = 0;
  let downside = 0;
  for (let index = 1; index < input.candles.length; index += 1) {
    const change = (input.candles[index].close - input.candles[index - 1].close) / Math.max(1, input.candles[index - 1].close);
    movement += Math.abs(change);
    downside += Math.min(0, change);
  }
  const regimeAdjustment = Math.min(0.04, movement * 7);
  const idealThreshold = 0.625 + regimeAdjustment;
  const thresholdQuality = Math.max(0, 1 - Math.abs(threshold - idealThreshold) * 2.3);
  const lookbackQuality = Math.max(0, 1 - Math.abs(lookback - 36) / 56);
  const quality = thresholdQuality * 0.78 + lookbackQuality * 0.22;
  const tradeCount = Math.max(8, Math.floor(input.candles.length / Math.max(18, lookback)));
  const totalPnlPct = quality * 13 + downside * 20 - input.transactionCostPct * Math.max(1, tradeCount / 8);
  return {
    totalPnlPct,
    maxDrawdownPct: 4.5 + (1 - quality) * 10,
    profitFactor: 0.95 + quality * 1.35,
    tradeCount,
    winRatePct: 45 + quality * 22,
    avgPnlPct: totalPnlPct / tradeCount,
  };
}

const candleCount = positiveInteger('APEX_OPTIMIZER_BENCH_CANDLES', 2_500);
const iterations = positiveInteger('APEX_OPTIMIZER_BENCH_ITERATIONS', 3);
const candles = generateCandles(candleCount);
const durations: number[] = [];
const reports = [];
const memoryBefore = process.memoryUsage();

for (let iteration = 0; iteration < iterations; iteration += 1) {
  const startedAt = performance.now();
  const report = await optimizeStrategy({
    definition,
    candles,
    baseScannerConfig: scannerConfig,
    baseParameters: { threshold: 0.25, lookback: 24 },
    symbol: 'BTC-USDT',
    interval: '1h',
    direction: 'LONG',
    transactionCostPct: 0.18,
    evaluator,
    autoPromote: true,
    budget: {
      coarseCandidates: 28,
      finalists: 8,
      refinementCandidates: 12,
      maxConcurrent: 4,
      minTradesPerEvaluation: 8,
      timeoutMs: 120_000,
    },
  });
  durations.push(performance.now() - startedAt);
  reports.push(report);
}

const winnerSignature = JSON.stringify({
  values: reports[0]?.winner.values,
  blockers: reports[0]?.promotion.blockers,
  eligible: reports[0]?.promotion.eligible,
});
for (const report of reports.slice(1)) {
  const signature = JSON.stringify({ values: report.winner.values, blockers: report.promotion.blockers, eligible: report.promotion.eligible });
  if (signature !== winnerSignature) throw new Error('Optimizer output changed across identical deterministic load iterations.');
}
const finalReport = reports.at(-1)!;
if (finalReport.searchEfficiency.reductionPct < 20) {
  throw new Error(`Successive-halving reduction was unexpectedly low: ${finalReport.searchEfficiency.reductionPct}%.`);
}

const output = {
  generatedAt: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  workload: { candleCount, iterations, fields: finalReport.fields.length, candidates: finalReport.triedCandidates },
  latency: {
    minMs: Math.min(...durations),
    medianMs: quantile(durations, 0.5),
    p95Ms: quantile(durations, 0.95),
    maxMs: Math.max(...durations),
  },
  searchEfficiency: finalReport.searchEfficiency,
  winner: finalReport.winner.values,
  promotion: finalReport.promotion,
  deterministic: true,
  memory: {
    rssBeforeBytes: memoryBefore.rss,
    rssAfterBytes: process.memoryUsage().rss,
    heapUsedBeforeBytes: memoryBefore.heapUsed,
    heapUsedAfterBytes: process.memoryUsage().heapUsed,
  },
};

const outputDir = resolve('QA/performance');
await mkdir(outputDir, { recursive: true });
const outputFile = process.env.APEX_OPTIMIZER_BENCH_OUTPUT || 'STRATEGY_OPTIMIZATION_LOAD_RESULT.json';
await writeFile(resolve(outputDir, outputFile), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(output, null, 2));
