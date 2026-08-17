/**
 * Shared sparkline helpers.
 *
 * Sparklines are rendered only from provider-supplied time-series points.
 * Summary fields such as 24-hour change/high/low are not converted into a
 * decorative path because that would imply historical observations that do
 * not exist in the active data contract.
 */

import type { SymbolTicker } from '../types';

/**
 * Returns a finite provider-supplied sparkline when at least two observations
 * exist. Otherwise callers receive an empty series and render their existing
 * unavailable/placeholder state.
 */
export function getTickerSparkline(
  ticker: Pick<SymbolTicker, 'sparkline1h'>,
): number[] {
  const values = Array.isArray(ticker.sparkline1h)
    ? ticker.sparkline1h.filter(Number.isFinite)
    : [];
  return values.length >= 2 ? values : [];
}

/**
 * Determines whether a real sparkline series represents a bullish or bearish
 * trend. The optional percentage is presentation-only and is never used to
 * manufacture chart points.
 */
export function getSparklineTrend(
  data: number[],
  fallbackChangePct?: number,
): 'bullish' | 'bearish' {
  if (data.length >= 2) {
    const first = data[0];
    const last = data[data.length - 1];
    if (last > first) return 'bullish';
    if (last < first) return 'bearish';
  }
  if (fallbackChangePct !== undefined) {
    return fallbackChangePct >= 0 ? 'bullish' : 'bearish';
  }
  return 'bullish';
}
