import { useMemo } from 'react';
import type { BacktestResult } from '../../types';
import { deriveLocalBacktestSummary } from './backtestMetrics';
import type { BacktestChartAggregation, BacktestInterval, CostAdjustedTrade } from './backtestingTypes';

function intervalMinutes(interval: BacktestInterval): number {
  if (interval === '5m') return 5;
  if (interval === '15m') return 15;
  if (interval === '1h') return 60;
  if (interval === '4h') return 240;
  return 1_440;
}

export function useBacktestDerivedEvidence(
  result: BacktestResult | null,
  riskPct: number,
  capital: number,
  chartAggregation: BacktestChartAggregation,
  bars: number,
  interval: BacktestInterval,
) {
  const trades = useMemo<CostAdjustedTrade[]>(() => {
    if (!result?.timeline.length) return [];
    let equity = 100;
    let peak = 100;
    return result.timeline.map((trade, index) => {
      const adjustedReturnPct = trade.rMultiple * riskPct;
      equity *= 1 + adjustedReturnPct / 100;
      peak = Math.max(peak, equity);
      const date = new Date(trade.timestamp);
      return {
        ...trade,
        adjustedReturnPct,
        equity,
        drawdownPct: peak > 0 ? ((equity - peak) / peak) * 100 : 0,
        tradeNumber: index + 1,
        dateLabel: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
        timeLabel: date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      };
    });
  }, [result, riskPct]);

  const summary = useMemo(() => deriveLocalBacktestSummary(result, trades, capital), [capital, result, trades]);

  const equityData = useMemo(() => {
    if (result?.equityCurve?.length) {
      return result.equityCurve.map((point, index) => ({
        tradeNumber: point.step,
        equity: point.equity,
        drawdown: point.drawdownPct,
        dateLabel: point.timestamp ? new Date(point.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : index === 0 ? 'Start' : `Step ${point.step}`,
        timestamp: point.timestamp ?? 0,
      }));
    }
    return [{ tradeNumber: 0, equity: 100, drawdown: 0, dateLabel: 'Start', timestamp: 0 }];
  }, [result]);

  const aggregatedEquityData = useMemo(() => {
    if (chartAggregation === 'cumulative' || equityData.length <= 2) return equityData;
    const buckets = new Map<string, typeof equityData[number]>();
    for (const point of equityData) {
      if (!point.timestamp) {
        buckets.set('__start__', point);
        continue;
      }
      const date = new Date(point.timestamp);
      if (chartAggregation === 'weekly') {
        const monday = new Date(date);
        monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
        buckets.set(monday.toISOString().slice(0, 10), point);
      } else {
        buckets.set(date.toISOString().slice(0, 10), point);
      }
    }
    return Array.from(buckets.values());
  }, [chartAggregation, equityData]);

  const marketData = useMemo(() => (result?.marketCurve ?? []).map((point) => ({
    ...point,
    dateLabel: new Date(point.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  })), [result]);

  const histogramData = useMemo(() => {
    if (!trades.length) return [];
    const values = trades.map((trade) => trade.adjustedReturnPct);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binCount = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(values.length))));
    const width = max === min ? 1 : (max - min) / binCount;
    const bins = Array.from({ length: binCount }, (_, index) => ({
      min: min + index * width,
      max: index === binCount - 1 ? max + Number.EPSILON : min + (index + 1) * width,
      count: 0,
    }));
    for (const value of values) {
      const index = Math.min(binCount - 1, Math.max(0, Math.floor((value - min) / width)));
      bins[index].count += 1;
    }
    return bins.map((bin) => ({ range: `${bin.min.toFixed(1)} to ${bin.max.toFixed(1)}%`, count: bin.count, midpoint: (bin.min + bin.max) / 2 }));
  }, [trades]);

  const exposureData = useMemo(() => trades.map((trade) => ({ tradeNumber: trade.tradeNumber, bars: Number(trade.barsHeld || 0), dateLabel: trade.dateLabel })), [trades]);
  const dateRangeLabel = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - bars * intervalMinutes(interval) * 60_000);
    const format = (date: Date) => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${format(start)} → ${format(end)}`;
  }, [bars, interval]);

  return { trades, summary, aggregatedEquityData, marketData, histogramData, exposureData, dateRangeLabel };
}
