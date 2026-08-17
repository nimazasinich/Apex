import { useEffect, useRef } from 'react';
import type { BacktestResult } from '../../types';
import type { BacktestHistoryEntry, BacktestInterval, BacktestRunConfig } from './backtestingTypes';
import { writeWorkspaceContext } from '../../lib/workspaceContext';
import { INTERVAL_OPTIONS } from './backtestingPresets';

interface UseBacktestHistorySyncOptions {
  result: BacktestResult | null;
  completedConfig: BacktestRunConfig | null;
  completedStrategyName: string | null;
  setHistory: React.Dispatch<React.SetStateAction<BacktestHistoryEntry[]>>;
}

export function useBacktestHistorySync({
  result,
  completedConfig,
  completedStrategyName,
  setHistory,
}: UseBacktestHistorySyncOptions) {
  const recordedRunRef = useRef<string | null>(null);

  useEffect(() => {
    if (!result || !completedConfig) return;
    const runKey = result.audit?.runId || `${result.audit?.generatedAt ?? 0}:${result.symbol}:${result.direction}:${result.interval}`;
    if (recordedRunRef.current === runKey) return;
    recordedRunRef.current = runKey;
    const entry: BacktestHistoryEntry = {
      id: runKey,
      timestamp: result.audit?.generatedAt ?? Date.now(),
      symbol: result.symbol,
      direction: result.direction,
      interval: INTERVAL_OPTIONS.includes(result.interval as BacktestInterval) ? result.interval as BacktestInterval : completedConfig.interval,
      netReturnPct: result.totalPnlPct,
    };
    setHistory((previous) => [entry, ...previous.filter((item) => item.id !== entry.id)].slice(0, 24));
    writeWorkspaceContext({
      source: 'backtesting',
      strategyId: completedConfig.strategyId,
      strategyName: completedStrategyName ?? completedConfig.strategyId,
      strategyParameters: completedConfig.parameters,
      symbol: result.symbol,
      direction: result.direction,
      interval: entry.interval,
      lastBacktest: {
        strategyId: completedConfig.strategyId,
        symbol: result.symbol,
        direction: result.direction,
        interval: entry.interval,
        runId: result.audit?.runId,
        netReturnPct: result.totalPnlPct,
        maxDrawdownPct: result.maxDrawdownPct,
        winRatePct: result.historicalWinRatePct,
        profitFactor: result.profitFactor,
        candlesUsed: result.candlesUsed,
        trades: result.timeline.length,
        noTradeReason: result.timeline.length ? undefined : result.diagnostics?.noTradeReason,
        completedAt: entry.timestamp,
      },
    });
  }, [completedConfig, completedStrategyName, result, setHistory]);
}
