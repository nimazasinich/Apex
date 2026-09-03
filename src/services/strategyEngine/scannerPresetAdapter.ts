import { runApexReplayBacktestDirectional, type BacktestCandle } from '../backtesting';
import type { ScannerConfig, StrategyDefinition, StrategyReplayResult } from '../../types';
import { finalizeReplay } from './replayHarness';
import type { HistoricalSignalBundle } from './historicalSignals';
import type { TransactionCostModel } from '../transactionCosts';
import { isNativeSignalScannerStrategy, runSignalAwareScannerStrategy } from './signalAwareScannerAdapter';

export function buildScannerPresetConfig(
  base: ScannerConfig,
  definition: StrategyDefinition,
  parameters?: Record<string, number | string>,
  options: { applyDefinitionOverrides?: boolean } = {},
): ScannerConfig {
  const parameterDefinitions = new Map(definition.parameters.map((parameter) => [parameter.key, parameter]));
  const applyDefinitionOverrides = options.applyDefinitionOverrides !== false;
  const runtimeOverrides: Record<string, unknown> = applyDefinitionOverrides ? { ...(definition.scannerConfigOverrides || {}) } : {};
  const scoreWeightOverrides: Record<string, number> = {};
  for (const [key, rawValue] of Object.entries(parameters || {})) {
    const parameter = parameterDefinitions.get(key);
    if (!parameter) continue;
    if (typeof parameter.default === 'number') {
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) continue;
      const min = typeof parameter.min === 'number' ? parameter.min : Number.NEGATIVE_INFINITY;
      const max = typeof parameter.max === 'number' ? parameter.max : Number.POSITIVE_INFINITY;
      const bounded = Math.max(min, Math.min(max, parsed));
      if (key.startsWith('weight.')) {
        scoreWeightOverrides[key.slice('weight.'.length)] = bounded;
      } else if (!key.startsWith('fusion.')) {
        // fusion.* parameters are consumed by the live fusion layer. They are
        // deliberately not projected into candle-only scanner replay.
        runtimeOverrides[key] = bounded;
      }
    } else if (typeof rawValue === 'string' && !key.startsWith('fusion.')) {
      runtimeOverrides[key] = rawValue;
    }
  }
  return {
    ...base,
    ...runtimeOverrides,
    scorePreset: 'CUSTOM',
    scoreWeights: {
      ...base.scoreWeights,
      ...(applyDefinitionOverrides ? definition.scoreWeights : {}),
      ...(applyDefinitionOverrides ? definition.scannerConfigOverrides?.scoreWeights : {}),
      ...scoreWeightOverrides,
    },
  };
}

export function runScannerPresetStrategy(args: {
  candles: BacktestCandle[];
  symbol: string;
  interval: Parameters<typeof runApexReplayBacktestDirectional>[1]['interval'];
  direction: 'LONG' | 'SHORT' | 'BOTH';
  maxBars: number;
  baseConfig: ScannerConfig;
  definition: StrategyDefinition;
  transactionCostPct?: number;
  transactionCostModel?: TransactionCostModel;
  historicalSignals?: HistoricalSignalBundle;
  parameters?: Record<string, number | string>;
  applyDefinitionOverrides?: boolean;
}): StrategyReplayResult {
  if (isNativeSignalScannerStrategy(args.definition.strategyId)) {
    if (!args.transactionCostModel) throw new Error('An explicit transaction-cost model is required for native-signal scanner replay.');
    return runSignalAwareScannerStrategy({
      candles: args.candles,
      symbol: args.symbol,
      direction: args.direction,
      maxBars: args.maxBars,
      definition: args.definition,
      transactionCostModel: args.transactionCostModel,
      historicalSignals: args.historicalSignals,
      parameters: args.parameters,
    });
  }
  if (args.direction === 'BOTH') throw new Error('The legacy canonical scanner replay requires an explicit LONG or SHORT direction.');
  const scannerConfig = buildScannerPresetConfig(args.baseConfig, args.definition, args.parameters, { applyDefinitionOverrides: args.applyDefinitionOverrides });
  const result = runApexReplayBacktestDirectional(args.candles, {
    symbol: args.symbol,
    interval: args.interval,
    scannerConfig,
    direction: args.direction,
    maxBars: args.maxBars,
    strategyId: args.definition.strategyId,
    strategyVersion: args.definition.version,
    academyEvaluationRole: 'RESEARCH_EVALUATION',
  });

  const trades = result.trades.map((trade) => {
    const grossPnlPct = Number.isFinite(trade.grossPnlPct)
      ? Number(trade.grossPnlPct)
      : trade.pnlPct + Number(trade.transactionCostPct || 0);
    const transactionCostPct = Number.isFinite(args.transactionCostPct)
      ? Math.max(0, Number(args.transactionCostPct))
      : Number(trade.transactionCostPct || 0);
    return {
      entryTime: trade.entryTime,
      exitTime: trade.exitTime,
      entry: trade.entry,
      exit: trade.exit,
      stop: trade.stop,
      target: trade.target,
      outcome: trade.outcome === 'TP' ? 'TP' as const : trade.outcome === 'SL' ? 'SL' as const : 'TIMEOUT' as const,
      pnlPct: grossPnlPct - transactionCostPct,
      grossPnlPct,
      transactionCostPct,
      barsHeld: trade.barsHeld,
      rawScore: trade.rawScore,
      confidence: trade.confidence,
      entryReason: trade.entryReason || `${args.definition.name} scanner preset`,
    };
  });

  const adjusted = finalizeReplay(
    args.candles,
    trades,
    args.definition.strategyId,
    result.summary.rejectedCandidates ?? 0,
    result.summary.rejectionCounts as Record<string, number> | undefined,
  );
  adjusted.summary.replayMode = result.summary.replayMode;
  adjusted.summary.configOverrides = result.summary.configOverrides;
  adjusted.summary.effectiveScoreWeights = result.summary.effectiveScoreWeights;
  return adjusted;
}
