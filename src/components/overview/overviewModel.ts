import type { LiveReconciliationSummary } from '../../services/accountClient';
import type { OperationsProviderRow } from '../../services/operationsStatus';
import type { WorkspaceInsights } from '../../services/workspaceInsights';
import type { CandidateScore, SentimentComposite, SymbolTicker, SystemHealthReport } from '../../types';

export interface ScanMeta {
  scannedCount: number;
  activeCandidateCount: number;
  scanTimestamp: number | null;
}

export interface SignalFunnel {
  evaluated: number;
  qualified: number;
  confirmed: number;
  rejected: number;
  topRejection: string | null;
  highest: CandidateScore | null;
}

export interface MarketBreadth {
  bullishPct: number;
  neutralPct: number;
  bearishPct: number;
}

const TIER_ORDER: Record<CandidateScore['readinessTier'], number> = { CONFIRMED: 0, WATCHLIST: 1, CAUTION: 2, BLOCKED: 3 };

export function buildSignalFunnel(candidates: CandidateScore[], scanMeta: ScanMeta | null): SignalFunnel {
  const ranked = [...candidates].sort((a, b) => b.score - a.score || TIER_ORDER[a.readinessTier] - TIER_ORDER[b.readinessTier]);
  const qualified = ranked.filter((c) => c.guardPass && c.readinessTier !== 'BLOCKED');
  const confirmed = ranked.filter((c) => c.readinessTier === 'CONFIRMED' && c.guardPass);
  const rejected = ranked.filter((c) => !c.guardPass || c.readinessTier === 'BLOCKED');
  const rejectionCounts = new Map<string, number>();
  rejected.forEach((c) => {
    const reason = c.guardReasons[0] ?? c.readinessTier;
    rejectionCounts.set(reason, (rejectionCounts.get(reason) ?? 0) + 1);
  });
  const topRejection = [...rejectionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const evaluated = scanMeta?.scannedCount != null ? scanMeta.scannedCount * 2 : ranked.length;
  const highest = qualified[0] ?? ranked[0] ?? null;
  return {
    evaluated,
    qualified: qualified.length,
    confirmed: confirmed.length,
    rejected: rejected.length,
    topRejection,
    highest,
  };
}

export function buildMarketBreadth(tickers: SymbolTicker[]): MarketBreadth {
  if (!tickers.length) return { bullishPct: 0, neutralPct: 100, bearishPct: 0 };
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  tickers.forEach((t) => {
    if (t.priceChange24hPct > 0.15) bullish += 1;
    else if (t.priceChange24hPct < -0.15) bearish += 1;
    else neutral += 1;
  });
  const total = tickers.length;
  return {
    bullishPct: Math.round((bullish / total) * 100),
    neutralPct: Math.round((neutral / total) * 100),
    bearishPct: Math.round((bearish / total) * 100),
  };
}

export function liquidityLabel(turnover24h: number): string {
  if (!Number.isFinite(turnover24h) || turnover24h <= 0) return '—';
  if (turnover24h >= 50_000_000) return 'High';
  if (turnover24h >= 10_000_000) return 'Medium';
  return 'Low';
}

export function providerLatencyMs(row: OperationsProviderRow, now = Date.now()): number | null {
  if (row.lastCheckTime == null) return null;
  return Math.max(0, now - row.lastCheckTime);
}

export function providerRowState(row: OperationsProviderRow): string {
  if (!row.isConfigured) return 'NOT SET';
  if (row.status === 'RATE_LIMITED') return 'DEGRADED';
  if (row.status === 'HEALTHY') return 'OK';
  if (row.status === 'UNHEALTHY') return 'DEGRADED';
  if (row.status === 'DISABLED') return 'FALLBACK';
  return row.status.replace(/_/g, ' ');
}

export function dailyPnlFromInsights(insights: WorkspaceInsights | null): { usd: number | null; pct: number | null } {
  if (!insights) return { usd: null, pct: null };
  const equity = insights.account.equityUsd;
  const total = insights.analytics.totalPnlUsd;
  if (!Number.isFinite(total)) return { usd: null, pct: null };
  const base = equity - total;
  const pct = base > 0 ? (total / base) * 100 : null;
  return { usd: total, pct };
}

export function openRiskUsd(insights: WorkspaceInsights | null): number | null {
  if (!insights) return null;
  const margin = insights.account.marginUsedUsd;
  if (Number.isFinite(margin) && margin > 0) return margin;
  const exposure = insights.positions.reduce((sum, p) => sum + Math.abs(p.unrealizedPnlUsd), 0);
  return exposure > 0 ? exposure : null;
}

export function averageOrderFillPct(insights: WorkspaceInsights | null): number | null {
  if (!insights?.orders.length) return null;
  const rates = insights.orders.map((order) => order.fillPct).filter(Number.isFinite);
  if (!rates.length) return null;
  return rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
}

export interface ExecutionSnapshotView {
  avgLatencyMs: number | null;
  fillRatePct: number | null;
  slippagePct: number | null;
  timeouts1h: number;
  latencyLabel: string;
  fillLabel: string;
  slippageLabel: string;
  timeoutLabel: string;
}

export function buildExecutionSnapshot(
  health: SystemHealthReport | null,
  reconciliation: LiveReconciliationSummary | null,
  providerRows: OperationsProviderRow[],
  orderFillRatePct: number | null = null,
): ExecutionSnapshotView {
  const latencies = providerRows
    .map((row) => providerLatencyMs(row))
    .filter((v): v is number => v != null && v < 60_000);
  const avgLatencyMs = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
  const fillRatePct = orderFillRatePct;
  const slippagePct = null;
  const timeouts1h = reconciliation?.unresolvedIntentCount ?? 0;
  return {
    avgLatencyMs,
    fillRatePct,
    slippagePct,
    timeouts1h,
    latencyLabel: avgLatencyMs == null ? '—' : avgLatencyMs < 100 ? 'Good' : avgLatencyMs < 300 ? 'Fair' : 'Slow',
    fillLabel: fillRatePct == null ? '—' : fillRatePct >= 95 ? 'Excellent' : fillRatePct >= 80 ? 'Good' : 'Fair',
    slippageLabel: '—',
    timeoutLabel: timeouts1h === 0 ? 'Excellent' : timeouts1h <= 2 ? 'Fair' : 'Attention',
  };
}

export function fundingBiasLabel(rate: number | undefined): string {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return '—';
  const side = rate >= 0 ? 'Long' : 'Short';
  return `${side} ${rate >= 0 ? '+' : ''}${(rate * 100).toFixed(3)}%`;
}

export function sentimentBreadthOverlay(sentiment: SentimentComposite | null, breadth: MarketBreadth): MarketBreadth {
  if (!sentiment) return breadth;
  const zone = sentiment.zone;
  if (zone === 'Extreme Greed' || zone === 'Greed') return { bullishPct: Math.max(breadth.bullishPct, 45), neutralPct: breadth.neutralPct, bearishPct: Math.min(breadth.bearishPct, 25) };
  if (zone === 'Extreme Fear' || zone === 'Fear') return { bullishPct: Math.min(breadth.bullishPct, 25), neutralPct: breadth.neutralPct, bearishPct: Math.max(breadth.bearishPct, 45) };
  return breadth;
}
