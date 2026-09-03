import type { LiveReconciliationSummary } from '../../services/accountClient';
import type { OperationsProviderRow } from '../../services/operationsStatus';
import type { WorkspaceInsights } from '../../services/workspaceInsights';
import type { CandidateScore, SentimentComposite, SymbolTicker, SystemHealthReport } from '../../types';

export interface ScanMeta {
  scannedCount: number;
  activeCandidateCount: number;
  qualifiedSetupCount?: number;
  watchCandidateCount?: number;
  abstainedCandidateCount?: number;
  universeCount?: number;
  eligibleUniverseCount?: number;
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
  const qualified = ranked.filter((c) => c.decisionState
    ? c.decisionState === 'SIGNAL' || c.decisionState === 'QUALIFIED_SETUP'
    : c.guardPass && c.readinessTier !== 'BLOCKED');
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

/**
 * Age of a provider's last health check, in milliseconds.
 *
 * Deliberately NOT named "latency": `OperationsProviderRow` carries no round-trip timing
 * field (only the `lastCheckTime` / `lastSuccessTime` epochs), so no request duration is
 * derivable from this data. The former name `providerLatencyMs` caused the Provider / Data
 * Health table to render check age beneath a "Latency" heading, which is why every row
 * showed the same implausible figure (~5,601,384ms == ~93 minutes since the last sweep).
 */
export function providerCheckAgeMs(row: OperationsProviderRow, now = Date.now()): number | null {
  // ProviderHealth uses 0 as the fail-closed NEVER_PROBED sentinel. Treat non-finite
  // or non-positive values as no observation so the UI never renders epoch-sized ages.
  if (row.lastCheckTime == null || !Number.isFinite(row.lastCheckTime) || row.lastCheckTime <= 0) return null;
  return Math.max(0, now - row.lastCheckTime);
}

/** Compact human-readable age for a check timestamp: "12s", "4m", "1h 33m", "2d 4h". */
export function formatCheckAge(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const remainderMinutes = minutes % 60;
    return remainderMinutes ? `${hours}h ${remainderMinutes}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainderHours = hours % 24;
  return remainderHours ? `${days}d ${remainderHours}h` : `${days}d`;
}

export function providerRowState(row: OperationsProviderRow): string {
  if (!row.isConfigured) return 'NOT SET';
  if (row.status === 'RATE_LIMITED') return 'DEGRADED';
  if (row.status === 'HEALTHY') return 'OK';
  if (row.status === 'UNHEALTHY') return 'DEGRADED';
  if (row.status === 'DISABLED') return 'FALLBACK';
  return row.status.replace(/_/g, ' ');
}

export function averageOrderFillPct(insights: WorkspaceInsights | null): number | null {
  if (!insights?.orders.length) return null;
  const rates = insights.orders.map((order) => order.fillPct).filter((rate): rate is number => rate != null && Number.isFinite(rate));
  if (!rates.length) return null;
  return rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
}

export interface ExecutionSnapshotView {
  avgLatencyMs: number | null;
  fillRatePct: number | null;
  slippagePct: number | null;
  timeouts1h: number;
  timeoutsAvailable: boolean;
  latencyLabel: string;
  fillLabel: string;
  slippageLabel: string;
  timeoutLabel: string;
  instrumentedMetricCount: number;
}

export function buildExecutionSnapshot(
  health: SystemHealthReport | null,
  reconciliation: LiveReconciliationSummary | null,
  providerRows: OperationsProviderRow[],
  orderFillRatePct: number | null = null,
): ExecutionSnapshotView {
  // Execution latency is NOT measurable in this build. Neither `SystemHealthReport` nor
  // `OperationsProviderRow` carries a request duration, so there is nothing honest to average.
  // This previously averaged provider *check age* behind a `< 60_000` cutoff, which meant that
  // whenever a health sweep happened to be under 60s old the panel printed that age as
  // "Avg Latency" — a plausible-looking but fabricated number. Reported as unavailable until
  // real timing instrumentation is wired in.
  const avgLatencyMs: number | null = null;
  const fillRatePct = orderFillRatePct;
  const slippagePct = null;
  const timeouts1h = reconciliation?.unresolvedIntentCount ?? 0;
  const instrumentedMetricCount = [avgLatencyMs, fillRatePct, slippagePct, reconciliation == null ? null : timeouts1h]
    .filter((value) => value != null && Number.isFinite(value)).length;
  return {
    avgLatencyMs,
    fillRatePct,
    slippagePct,
    timeouts1h,
    timeoutsAvailable: reconciliation != null,
    latencyLabel: avgLatencyMs == null ? '—' : avgLatencyMs < 100 ? 'Good' : avgLatencyMs < 300 ? 'Fair' : 'Slow',
    fillLabel: fillRatePct == null ? '—' : fillRatePct >= 95 ? 'Excellent' : fillRatePct >= 80 ? 'Good' : 'Fair',
    slippageLabel: '—',
    timeoutLabel: reconciliation == null ? '—' : timeouts1h === 0 ? 'Clear' : timeouts1h <= 2 ? 'Review' : 'Attention',
    instrumentedMetricCount,
  };
}

export function fundingBiasLabel(rate: number | undefined): string {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return '—';
  const side = rate >= 0 ? 'Long' : 'Short';
  return `${side} ${rate >= 0 ? '+' : ''}${(rate * 100).toFixed(3)}%`;
}

/**
 * A breadth triple is a distribution and must sum to 100, otherwise the stacked bar
 * under-fills its track. The sentiment overlay below clamps bullish/bearish but used to
 * pass `neutralPct` through untouched, which left the rendered bar summing to roughly 73%
 * of its width. Neutral is therefore derived as the remainder rather than carried over.
 */
function normalizeBreadth(bullishPct: number, bearishPct: number): MarketBreadth {
  const bullish = Math.max(0, Math.min(100, Math.round(bullishPct)));
  const bearish = Math.max(0, Math.min(100 - bullish, Math.round(bearishPct)));
  return { bullishPct: bullish, neutralPct: 100 - bullish - bearish, bearishPct: bearish };
}

export function sentimentBreadthOverlay(sentiment: SentimentComposite | null, breadth: MarketBreadth): MarketBreadth {
  if (!sentiment) return breadth;
  const zone = sentiment.zone;
  if (zone === 'Extreme Greed' || zone === 'Greed') return normalizeBreadth(Math.max(breadth.bullishPct, 45), Math.min(breadth.bearishPct, 25));
  if (zone === 'Extreme Fear' || zone === 'Fear') return normalizeBreadth(Math.min(breadth.bullishPct, 25), Math.max(breadth.bearishPct, 45));
  return breadth;
}
