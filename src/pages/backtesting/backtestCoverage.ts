import type { BacktestResult } from '../../types';
import type { BacktestRunConfig } from './backtestingTypes';

export interface BacktestCoverageSummary {
  requestedCandles: number;
  returnedCandles: number;
  usedCandles: number;
  executableCandles: number;
  warmupBars: number | null;
  missingCandles: number;
  coveragePct: number | null;
  firstTimestamp: number | null;
  lastTimestamp: number | null;
  timeframe: string;
  provider: string;
  closedCandlesOnly: boolean | null;
  status: 'pending' | 'full' | 'partial' | 'poor' | 'unavailable';
  statusLabel: string;
  explanation: string;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function minTimestamp(values: Array<number | undefined>): number | null {
  let out: number | null = null;
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    out = out == null ? value : Math.min(out, value);
  }
  return out;
}

function maxTimestamp(values: Array<number | undefined>): number | null {
  let out: number | null = null;
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    out = out == null ? value : Math.max(out, value);
  }
  return out;
}

export function formatCoverageTimestamp(value: number | null): string {
  if (value == null) return '—';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function deriveBacktestCoverage(result: BacktestResult | null, config: Pick<BacktestRunConfig, 'bars' | 'interval'>): BacktestCoverageSummary {
  const requested = finite(result?.diagnostics?.requestedBars) ?? finite(result?.requestedBars) ?? config.bars;
  const returned = finite(result?.diagnostics?.candlesReturned) ?? finite(result?.lookbackCandles) ?? finite(result?.candlesUsed) ?? 0;
  const used = finite(result?.candlesUsed) ?? 0;
  const warmup = finite(result?.diagnostics?.warmupBars);
  const executable = finite(result?.diagnostics?.executableBars) ?? Math.max(0, returned - (warmup ?? 0));
  const missing = Math.max(0, requested - returned);
  const coveragePct = requested > 0 ? Math.max(0, Math.min(100, (returned / requested) * 100)) : null;
  const firstTimestamp = result ? minTimestamp([
    result.marketCurve?.[0]?.timestamp,
    result.equityCurve?.[0]?.timestamp,
    result.timeline?.[0]?.timestamp,
  ]) : null;
  const lastTimestamp = result ? maxTimestamp([
    result.marketCurve?.[result.marketCurve.length - 1]?.timestamp,
    result.equityCurve?.[result.equityCurve.length - 1]?.timestamp,
    result.timeline?.[result.timeline.length - 1]?.timestamp,
  ]) : null;
  const status: BacktestCoverageSummary['status'] = !result
    ? 'pending'
    : returned <= 0
      ? 'unavailable'
      : coveragePct != null && coveragePct < 60
        ? 'poor'
        : missing > 0 || (coveragePct != null && coveragePct < 99.5)
          ? 'partial'
          : 'full';
  const statusLabel = status === 'pending'
    ? 'Pending run'
    : status === 'full'
      ? 'Full history'
      : status === 'partial'
        ? 'Partial history'
        : status === 'poor'
          ? 'Poor coverage'
          : 'Provider unavailable';
  const explanation = !result
    ? `The next run will request ${requested.toLocaleString()} closed ${config.interval} candles. Returned, used, and executable counts will be shown after the server responds.`
    : status === 'full'
      ? 'The provider returned the requested history and the result is based on the usable closed-candle replay window.'
      : status === 'partial'
        ? `The provider returned ${returned.toLocaleString()} of ${requested.toLocaleString()} requested candles; this backtest is based only on returned usable data.`
        : status === 'poor'
          ? `Only ${returned.toLocaleString()} of ${requested.toLocaleString()} requested candles were returned, so the result has limited credibility.`
          : 'No executable market history was returned for this configuration.';
  return {
    requestedCandles: requested,
    returnedCandles: returned,
    usedCandles: used,
    executableCandles: executable,
    warmupBars: warmup,
    missingCandles: missing,
    coveragePct,
    firstTimestamp,
    lastTimestamp,
    timeframe: result?.interval ?? config.interval,
    provider: result?.source || 'Resolved by server',
    closedCandlesOnly: result?.audit ? Boolean(result.audit.closedCandlesOnly) : null,
    status,
    statusLabel,
    explanation,
  };
}
