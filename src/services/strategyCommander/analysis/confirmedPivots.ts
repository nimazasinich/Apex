import type { Candle } from '../../../types';

export type PivotKind = 'HIGH' | 'LOW';

export interface ConfirmedPivot {
  index: number;
  confirmedAtIndex: number;
  timestamp: number;
  price: number;
  kind: PivotKind;
}

export interface CausalCandleWindow {
  ok: boolean;
  candles: Candle[];
  asOfIndex: number;
  reason?: string;
}

export function causalCandleWindow(candles: readonly Candle[] | undefined, asOfIndex?: number): CausalCandleWindow {
  if (!candles?.length) return { ok: false, candles: [], asOfIndex: -1, reason: 'candle_input_missing' };
  const endpoint = asOfIndex ?? candles.length - 1;
  if (!Number.isInteger(endpoint) || endpoint < 0 || endpoint >= candles.length) {
    return { ok: false, candles: [], asOfIndex: endpoint, reason: 'as_of_index_out_of_bounds' };
  }
  const closed = candles.slice(0, endpoint + 1).map((candle) => ({ ...candle }));
  for (let index = 0; index < closed.length; index += 1) {
    const candle = closed[index];
    const finite = [candle.timestamp, candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite);
    const geometry = candle.high >= candle.low
      && candle.high >= Math.max(candle.open, candle.close)
      && candle.low <= Math.min(candle.open, candle.close)
      && candle.volume >= 0;
    const chronological = index === 0 || candle.timestamp > closed[index - 1].timestamp;
    if (!finite || !geometry || !chronological) {
      return { ok: false, candles: [], asOfIndex: endpoint, reason: 'invalid_or_non_chronological_candle' };
    }
  }
  return { ok: true, candles: closed, asOfIndex: endpoint };
}

export function findConfirmedPivots(
  candles: readonly Candle[],
  left = 3,
  right = 3,
): ConfirmedPivot[] {
  if (!Number.isInteger(left) || !Number.isInteger(right) || left < 1 || right < 1) return [];
  const pivots: ConfirmedPivot[] = [];
  for (let index = left; index <= candles.length - 1 - right; index += 1) {
    const candle = candles[index];
    let isHigh = true;
    let isLow = true;
    for (let cursor = index - left; cursor <= index + right; cursor += 1) {
      if (cursor === index) continue;
      if (candles[cursor].high > candle.high) isHigh = false;
      if (candles[cursor].low < candle.low) isLow = false;
    }
    if (isHigh === isLow) continue;
    const pivot: ConfirmedPivot = {
      index,
      confirmedAtIndex: index + right,
      timestamp: candle.timestamp,
      price: isHigh ? candle.high : candle.low,
      kind: isHigh ? 'HIGH' : 'LOW',
    };
    const previous = pivots.at(-1);
    if (previous?.kind === pivot.kind) {
      const moreExtreme = pivot.kind === 'HIGH' ? pivot.price > previous.price : pivot.price < previous.price;
      if (moreExtreme) pivots[pivots.length - 1] = pivot;
    } else {
      pivots.push(pivot);
    }
  }
  return pivots;
}

export function pivotsAlternate(pivots: readonly ConfirmedPivot[]): boolean {
  return pivots.every((pivot, index) => index === 0 || pivot.kind !== pivots[index - 1].kind);
}

export const clampUnit = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
export const clampSigned = (value: number): number => Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
