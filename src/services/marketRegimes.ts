import type { BacktestCandle } from './backtesting';

export type ValidationRegime = 'trending' | 'ranging' | 'high_volatility';

export interface RegimeSlice {
  label: ValidationRegime;
  candles: BacktestCandle[];
  from: number;
  to: number;
  trendEfficiency: number;
  realizedVolatility: number;
}

export type RegimeSliceSelection =
  | { status: 'available'; slices: Record<ValidationRegime, RegimeSlice>; reason: string }
  | { status: 'insufficient_data'; slices: Partial<Record<ValidationRegime, RegimeSlice>>; reason: string };

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

function candidateSlices(candles: BacktestCandle[], minimumSliceBars: number): RegimeSlice[] {
  const sliceCount = Math.min(12, Math.floor(candles.length / minimumSliceBars));
  if (sliceCount < 3) return [];
  const size = Math.floor(candles.length / sliceCount);
  return Array.from({ length: sliceCount }, (_, index) => {
    const rows = candles.slice(index * size, index === sliceCount - 1 ? candles.length : (index + 1) * size);
    const sliceMetrics = metrics(rows);
    return {
      label: 'trending' as const,
      candles: rows,
      from: Date.parse(rows[0]?.time || ''),
      to: Date.parse(rows.at(-1)?.time || ''),
      ...sliceMetrics,
    };
  }).filter((slice) => slice.candles.length >= minimumSliceBars && Number.isFinite(slice.from) && Number.isFinite(slice.to));
}

/** Selects disjoint, characteristic-based validation samples rather than relabelling walk-forward windows. */
export function selectIndependentRegimeSlices(candles: BacktestCandle[], minimumSliceBars = 200): RegimeSliceSelection {
  const candidates = candidateSlices(candles, minimumSliceBars);
  if (candidates.length < 3) return { status: 'insufficient_data', slices: {}, reason: 'At least three disjoint 200-candle regime samples are required.' };

  const byTrend = [...candidates].sort((left, right) => right.trendEfficiency - left.trendEfficiency);
  const trending = byTrend[0];
  const ranging = byTrend.at(-1)!;
  const remaining = candidates.filter((slice) => slice.from !== trending.from && slice.from !== ranging.from);
  const highVolatility = [...remaining].sort((left, right) => right.realizedVolatility - left.realizedVolatility)[0];
  const medianVolatility = [...candidates].sort((left, right) => left.realizedVolatility - right.realizedVolatility)[Math.floor(candidates.length / 2)]?.realizedVolatility ?? 0;

  const selected: Partial<Record<ValidationRegime, RegimeSlice>> = {};
  if (trending.trendEfficiency >= 0.18) selected.trending = { ...trending, label: 'trending' };
  if (ranging.trendEfficiency <= 0.20) selected.ranging = { ...ranging, label: 'ranging' };
  if (highVolatility && highVolatility.realizedVolatility >= medianVolatility * 1.2) {
    selected.high_volatility = { ...highVolatility, label: 'high_volatility' };
  }
  const distinctTrendCoverage = trending.trendEfficiency - ranging.trendEfficiency >= 0.10;
  if (!distinctTrendCoverage || !selected.trending || !selected.ranging || !selected.high_volatility) {
    return {
      status: 'insufficient_data',
      slices: selected,
      reason: `Distinct regime coverage was not demonstrated (trend ${trending.trendEfficiency.toFixed(3)}, range ${ranging.trendEfficiency.toFixed(3)}, high-vol ratio ${medianVolatility > 0 && highVolatility ? (highVolatility.realizedVolatility / medianVolatility).toFixed(2) : 'n/a'}).`,
    };
  }
  return {
    status: 'available',
    slices: selected as Record<ValidationRegime, RegimeSlice>,
    reason: 'Three disjoint slices met trend-efficiency and realized-volatility separation requirements.',
  };
}
