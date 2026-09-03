import type { BacktestCandle } from './backtesting';

export type ValidationRegime = 'trending' | 'ranging' | 'high_volatility';

export interface RegimeSlice {
  label: ValidationRegime;
  candles: BacktestCandle[];
  from: number;
  to: number;
  trendEfficiency: number;
  realizedVolatility: number;
  classifiedFrom: { from: number; to: number };
}

export type RegimeSliceSelection =
  | { status: 'available'; slices: Record<ValidationRegime, RegimeSlice>; allSlices: Record<ValidationRegime, RegimeSlice[]>; reason: string }
  | { status: 'insufficient_data'; slices: Partial<Record<ValidationRegime, RegimeSlice>>; allSlices: Partial<Record<ValidationRegime, RegimeSlice[]>>; reason: string };

function metrics(candles: BacktestCandle[]): { trendEfficiency: number; realizedVolatility: number } {
  const closes = candles.map((row) => Number(row.close)).filter((value) => Number.isFinite(value) && value > 0);
  if (closes.length < 2) return { trendEfficiency: 0, realizedVolatility: 0 };
  const changes: number[] = [];
  const logReturns: number[] = [];
  for (let index = 1; index < closes.length; index += 1) {
    changes.push(Math.abs(closes[index] - closes[index - 1]));
    logReturns.push(Math.log(closes[index] / closes[index - 1]));
  }
  const path = changes.reduce((sum, value) => sum + value, 0);
  const trendEfficiency = path > 0 ? Math.abs(closes.at(-1)! - closes[0]) / path : 0;
  const mean = logReturns.reduce((sum, value) => sum + value, 0) / logReturns.length;
  const variance = logReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / logReturns.length;
  return { trendEfficiency, realizedVolatility: Math.sqrt(Math.max(0, variance)) };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Classifies every eligible OOS period from its immediately preceding period.
 * Strategy returns, trade outcomes, and future candles never affect the label.
 */
export function selectIndependentRegimeSlices(candles: BacktestCandle[], minimumSliceBars = 200): RegimeSliceSelection {
  const sorted = [...candles].sort((left, right) => Date.parse(left.time) - Date.parse(right.time));
  const count = Math.min(12, Math.floor(sorted.length / minimumSliceBars));
  if (count < 4) return { status: 'insufficient_data', slices: {}, allSlices: {}, reason: 'At least four chronological periods are required for causal regime classification.' };
  const size = Math.floor(sorted.length / count);
  const periods = Array.from({ length: count }, (_, index) => sorted.slice(index * size, index === count - 1 ? sorted.length : (index + 1) * size));
  const allSlices: Record<ValidationRegime, RegimeSlice[]> = { trending: [], ranging: [], high_volatility: [] };
  const pastVolatility: number[] = [];
  for (let index = 1; index < periods.length; index += 1) {
    const classifier = periods[index - 1];
    const target = periods[index];
    const observed = metrics(classifier);
    const historicalMedianVolatility = median(pastVolatility);
    const label: ValidationRegime = pastVolatility.length >= 2 && historicalMedianVolatility > 0 && observed.realizedVolatility >= historicalMedianVolatility * 1.35
      ? 'high_volatility'
      : observed.trendEfficiency >= 0.24
        ? 'trending'
        : 'ranging';
    pastVolatility.push(observed.realizedVolatility);
    allSlices[label].push({
      label,
      candles: target,
      from: Date.parse(target[0]?.time || ''),
      to: Date.parse(target.at(-1)?.time || ''),
      ...observed,
      classifiedFrom: { from: Date.parse(classifier[0]?.time || ''), to: Date.parse(classifier.at(-1)?.time || '') },
    });
  }
  const slices = Object.fromEntries(Object.entries(allSlices).filter(([, rows]) => rows.length).map(([label, rows]) => [label, rows[0]])) as Partial<Record<ValidationRegime, RegimeSlice>>;
  if (!allSlices.trending.length || !allSlices.ranging.length || !allSlices.high_volatility.length) {
    return {
      status: 'insufficient_data', slices, allSlices,
      reason: `Causal OOS coverage was incomplete (trend ${allSlices.trending.length}, range ${allSlices.ranging.length}, high-vol ${allSlices.high_volatility.length}).`,
    };
  }
  return {
    status: 'available',
    slices: slices as Record<ValidationRegime, RegimeSlice>,
    allSlices,
    reason: `All causal OOS periods were retained (trend ${allSlices.trending.length}, range ${allSlices.ranging.length}, high-vol ${allSlices.high_volatility.length}).`,
  };
}
