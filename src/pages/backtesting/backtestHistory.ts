import type { BacktestHistoryEntry, BacktestInterval } from './backtestingTypes';

export const BACKTEST_HISTORY_KEY = 'apex:backtest-history:v2';

const HISTORY_INTERVALS: BacktestInterval[] = ['5m', '15m', '1h', '4h', '1d'];

export function readBacktestHistory(): BacktestHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BACKTEST_HISTORY_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is BacktestHistoryEntry => {
      if (!entry || typeof entry !== 'object') return false;
      const row = entry as Partial<BacktestHistoryEntry>;
      return typeof row.id === 'string'
        && Number.isFinite(row.timestamp)
        && typeof row.symbol === 'string'
        && (row.direction === 'LONG' || row.direction === 'SHORT')
        && HISTORY_INTERVALS.includes(row.interval as BacktestInterval)
        && Number.isFinite(row.netReturnPct);
    }).slice(0, 24);
  } catch {
    return [];
  }
}

export function persistBacktestHistory(history: BacktestHistoryEntry[]): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(BACKTEST_HISTORY_KEY, JSON.stringify(history.slice(0, 24)));
  }
}
