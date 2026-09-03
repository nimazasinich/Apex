import type { TradeDirection } from '../types';

export const WORKSPACE_CONTEXT_KEY = 'apex:workspace-context:v1';

export type WorkspaceContextSource = 'trading' | 'backtesting' | 'strategies';

export interface WorkspaceContextSnapshot {
  strategyId?: string;
  strategyName?: string;
  symbol?: string;
  direction?: TradeDirection;
  interval?: '5m' | '15m' | '1h' | '4h' | '1d';
  strategyParameters?: Record<string, number | string>;
  source: WorkspaceContextSource;
  updatedAt: number;
  lastBacktest?: {
    strategyId: string;
    symbol: string;
    direction: TradeDirection;
    interval: '5m' | '15m' | '1h' | '4h' | '1d';
    runId?: string;
    netReturnPct: number;
    maxDrawdownPct: number;
    winRatePct: number;
    profitFactor: number | null;
    candlesUsed: number;
    trades: number;
    noTradeReason?: string;
    completedAt: number;
  };
}

export type BacktestEvidenceIdentity = Pick<WorkspaceContextSnapshot, 'strategyId' | 'symbol' | 'direction' | 'interval'>;

/**
 * Keeps replay evidence bound to the exact strategy, market, direction, and
 * timeframe that produced it. Legacy payloads without identity fail closed.
 */
export function matchesBacktestEvidence(
  snapshot: WorkspaceContextSnapshot | null | undefined,
  expected: BacktestEvidenceIdentity,
): boolean {
  const evidence = snapshot?.lastBacktest;
  return Boolean(
    evidence
      && expected.strategyId
      && expected.symbol
      && expected.direction
      && expected.interval
      && evidence.strategyId === expected.strategyId
      && evidence.symbol === expected.symbol
      && evidence.direction === expected.direction
      && evidence.interval === expected.interval,
  );
}

export function readWorkspaceContext(): WorkspaceContextSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(WORKSPACE_CONTEXT_KEY) || 'null') as WorkspaceContextSnapshot | null;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.updatedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeWorkspaceContext(next: Omit<WorkspaceContextSnapshot, 'updatedAt'> & { updatedAt?: number }): WorkspaceContextSnapshot {
  const current = readWorkspaceContext();
  const snapshot: WorkspaceContextSnapshot = {
    ...current,
    ...next,
    lastBacktest: next.lastBacktest ?? current?.lastBacktest,
    updatedAt: next.updatedAt ?? Date.now(),
  };
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(WORKSPACE_CONTEXT_KEY, JSON.stringify(snapshot));
  }
  return snapshot;
}

export type NavigableWorkspacePage =
  | 'overview'
  | 'markets'
  | 'watchlist'
  | 'screener'
  | 'portfolio'
  | 'trading'
  | 'orders'
  | 'positions'
  | 'alerts'
  | 'history'
  | 'analytics'
  | 'backtesting'
  | 'strategies'
  | 'settings'
  | 'help';

export function navigateWorkspace(page: NavigableWorkspacePage) {
  if (typeof window === 'undefined') return;
  window.location.hash = `#/${page}`;
}
