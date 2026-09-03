import type { Candle } from '../types';

export const CLOSED_CANDLE_VALIDATOR_VERSION = 'closed_candle_validator_v1' as const;

export interface ClosedCandleDiagnostics {
  version: typeof CLOSED_CANDLE_VALIDATOR_VERSION;
  accepted: boolean;
  inputRows: number;
  outputRows: number;
  duplicatesRemoved: number;
  openBarsRemoved: number;
  invalidRows: number;
  gapCount: number;
  maxGapIntervals: number;
  reasons: string[];
}

export interface ClosedCandleValidationResult {
  candles: Candle[];
  diagnostics: ClosedCandleDiagnostics;
}

/**
 * Shared provider boundary for closed OHLCV. Duplicate timestamps are
 * deterministically collapsed, current/open bars are removed, impossible OHLC
 * rejects the response, and only bounded missing-bar gaps are accepted.
 */
export function validateClosedCandles(input: {
  rows: Candle[];
  intervalMs: number;
  now?: number;
  limit?: number;
  minRows?: number;
  allowedGapIntervals?: number;
}): ClosedCandleValidationResult {
  const now = input.now ?? Date.now();
  const limit = Math.max(2, Math.floor(input.limit ?? input.rows.length));
  const minRows = Math.max(2, Math.floor(input.minRows ?? 2));
  const allowedGapIntervals = Math.max(1, Math.floor(input.allowedGapIntervals ?? 3));
  const reasons: string[] = [];
  const byTimestamp = new Map<number, Candle>();
  let invalidRows = 0;
  let openBarsRemoved = 0;

  for (const source of input.rows) {
    const row = { ...source };
    const valid = Number.isFinite(row.timestamp) && row.timestamp > 0
      && Number.isFinite(row.open) && row.open > 0
      && Number.isFinite(row.high) && row.high > 0
      && Number.isFinite(row.low) && row.low > 0
      && Number.isFinite(row.close) && row.close > 0
      && Number.isFinite(row.volume) && row.volume >= 0
      && row.high >= Math.max(row.open, row.close, row.low)
      && row.low <= Math.min(row.open, row.close, row.high);
    if (!valid) {
      invalidRows += 1;
      continue;
    }
    if (row.timestamp + input.intervalMs > now) {
      openBarsRemoved += 1;
      continue;
    }
    byTimestamp.set(row.timestamp, row);
  }

  const duplicatesRemoved = Math.max(0, input.rows.length - invalidRows - openBarsRemoved - byTimestamp.size);
  const candles = [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-limit);
  let gapCount = 0;
  let maxGapIntervals = 1;
  for (let index = 1; index < candles.length; index += 1) {
    const delta = candles[index].timestamp - candles[index - 1].timestamp;
    if (delta <= 0 || delta % input.intervalMs !== 0) reasons.push('non_monotonic_or_off_cadence_timestamp');
    const gapIntervals = delta / input.intervalMs;
    if (gapIntervals > 1) gapCount += 1;
    if (Number.isFinite(gapIntervals)) maxGapIntervals = Math.max(maxGapIntervals, gapIntervals);
    if (gapIntervals > allowedGapIntervals) reasons.push(`gap_exceeds_policy:${gapIntervals}`);
  }
  if (invalidRows > 0) reasons.push(`impossible_ohlcv_rows:${invalidRows}`);
  if (candles.length < minRows) reasons.push(`insufficient_closed_rows:${candles.length}`);

  return {
    candles: reasons.length ? [] : candles,
    diagnostics: {
      version: CLOSED_CANDLE_VALIDATOR_VERSION,
      accepted: reasons.length === 0,
      inputRows: input.rows.length,
      outputRows: reasons.length ? 0 : candles.length,
      duplicatesRemoved,
      openBarsRemoved,
      invalidRows,
      gapCount,
      maxGapIntervals,
      reasons,
    },
  };
}
