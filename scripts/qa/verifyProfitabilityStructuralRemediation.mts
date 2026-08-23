import fs from 'node:fs';
import path from 'node:path';
import { MathEngine } from '../../src/services/mathEngine';
import { getStrategyDefinition } from '../../src/services/strategyRegistry';
import { runScannerPresetStrategy } from '../../src/services/strategyEngine/scannerPresetAdapter';
import { applyPortfolioRiskPolicy } from '../../src/services/strategyEngine/replayHarness';
import { loadHistoricalCandles, loadHistoricalSignalBundle } from '../../src/services/strategyEngine/historicalSignals';
import { transactionCostModelFromPerSideAssumptions } from '../../src/services/transactionCosts';
import type { ScannerConfig, StrategyReplayTrade } from '../../src/types';

const root = path.resolve(import.meta.dirname, '../..');
const dataDir = path.join(root, 'QA/profitability-structural-remediation/data');
const outFile = path.join(root, 'QA/profitability-structural-remediation/structural-remediation-smoke.json');
const from = Date.parse('2022-01-01T00:00:00.000Z');
const to = Date.parse('2023-12-31T23:59:59.999Z');
const scannerConfig: ScannerConfig = {
  intervalMs: 6005, obiThreshold: -0.15, volumeThreshold: 0, qStructThreshold: -0.3, fundingThreshold: 0.0001,
  oiExpansionThresholdPct: 0.3, atrExpansionThreshold: 0.005, maxSqueezeRisk: 0.46, minEvidenceAgreement: 0.64,
  minSmartMoneyScore: 0.52, smcHardRejectThreshold: 0.22, thresholdMode: 'ADAPTIVE_GUARDRAILS', scorePreset: 'ATLAS_PLUS_V2',
  adaptiveLearningRate: 0.04, adaptiveMinSamples: 24, scoreWeights: MathEngine.defaultScoreWeights(), minConfidence: 0.78,
  directionBias: 'BOTH', topRankSkip: 10, minVolume24hUsd: 5_000_000,
};
const costs = transactionCostModelFromPerSideAssumptions({ commissionPctPerSide: 0.04, slippagePctPerSide: 0.02, fundingPctEstimate: 0.01 });
const candles = loadHistoricalCandles({ dataDir, symbol: 'BTCUSDT', from, to }).candles;
const signals = loadHistoricalSignalBundle({ dataDir, symbol: 'BTCUSDT', from, to });
const ids = ['crypto-multi-alpha-ls-v1', 'funding-basis-carry-v1', 'liquidity-sweep-fvg-reversal-v1', 'whale-flow-sentiment-reversal-v1', 'news-sentiment-momentum-breakout-v1'];
const results = ids.map((id) => {
  const definition = getStrategyDefinition(id)!;
  const replay = runScannerPresetStrategy({
    candles, symbol: 'BTCUSDT', interval: '1h', direction: 'BOTH', maxBars: 36, baseConfig: scannerConfig, definition,
    transactionCostModel: costs, historicalSignals: signals, parameters: Object.fromEntries(definition.parameters.map((parameter) => [parameter.key, parameter.default])),
  });
  return { strategyId: id, replayMode: replay.summary.replayMode, trades: replay.summary.trades, sequence: replay.trades.map((trade) => trade.entryTime).join('|') };
});

const template: StrategyReplayTrade = {
  entryTime: '2022-01-01T00:00:00.000Z', exitTime: '2022-01-01T01:00:00.000Z', entry: 100, exit: 95, stop: 98, target: 104,
  outcome: 'SL', pnlPct: -5.12, grossPnlPct: -5, transactionCostPct: 0.12, barsHeld: 1, entryReason: 'risk-policy synthetic loss',
};
const syntheticLosses = Array.from({ length: 100 }, (_, index) => ({
  ...template,
  entryTime: new Date(from + index * 3_600_000).toISOString(),
  exitTime: new Date(from + (index + 1) * 3_600_000).toISOString(),
}));
const governed = applyPortfolioRiskPolicy(syntheticLosses);
let equity = 100;
let peak = 100;
let maxDrawdownPct = 0;
governed.trades.forEach((trade) => {
  equity *= 1 + trade.pnlPct / 100;
  peak = Math.max(peak, equity);
  maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - equity) / peak) * 100);
});

const checks = [
  { name: 'hash-verified real signal bundle loaded', passed: signals.funding.length > 0 && signals.positioning.length > 0 && signals.news.length > 0 && signals.sentiment.length > 0 },
  { name: 'all scanner families use native signal replay', passed: results.every((result) => result.replayMode === 'HISTORICAL_NATIVE_SIGNAL_REPLAY') },
  { name: 'scanner trade sequences are pairwise distinct in development data', passed: new Set(results.map((result) => result.sequence)).size === results.length },
  { name: 'portfolio policy prevents 50 percent drawdown under repeated losses', passed: maxDrawdownPct < 15 && governed.skippedAfterShutdown > 0 },
];
const artifact = { generatedAt: new Date().toISOString(), developmentOnly: true, range: ['2022-01-01', '2023-12-31'], checks, results: results.map(({ sequence, ...result }) => result), riskStress: { maxDrawdownPct, ...governed } };
fs.writeFileSync(outFile, `${JSON.stringify(artifact, null, 2)}\n`);
const failures = checks.filter((check) => !check.passed);
console.log(JSON.stringify({ passed: checks.length - failures.length, total: checks.length, failures: failures.map((failure) => failure.name), strategies: artifact.results, riskMaxDrawdownPct: maxDrawdownPct }, null, 2));
process.exitCode = failures.length ? 1 : 0;
