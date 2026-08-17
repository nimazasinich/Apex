import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  ComposedChart,
  Line,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CandlestickChart, Info, RefreshCw, TriangleAlert } from 'lucide-react';
import type { BacktestResult } from '../../types';
import type {
  BacktestChartAggregation,
  BacktestChartView,
  BacktestEquityPoint,
  BacktestMarketPoint,
  CostAdjustedTrade,
} from './backtestingTypes';

function pct(value: number, digits = 2): string { return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`; }

function ChartTooltip({ active, payload, label, mode }: { active?: boolean; payload?: Array<{ value?: number; payload?: Record<string, unknown> }>; label?: string | number; mode: 'equity' | 'drawdown' | 'market' }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload ?? {};
  const value = Number(payload[0]?.value ?? 0);
  const dateLabel = typeof point.dateLabel === 'string' ? point.dateLabel : `Trade ${label}`;
  return (
    <div className="apex-bt-tooltip">
      <span>{dateLabel}</span>
      <strong className={value >= 0 ? 'positive' : 'negative'}>
        {mode === 'equity' ? `Equity ${value.toFixed(2)}` : mode === 'market' ? `Market index ${value.toFixed(2)}` : pct(value)}
      </strong>
    </div>
  );
}

function EmptyChart({ loading, error, result }: { loading: boolean; error: string | null; result: BacktestResult | null }) {
  const noTrades = !loading && !error && Boolean(result) && !(result?.timeline?.length);
  const Icon = loading ? RefreshCw : error ? TriangleAlert : noTrades ? Info : CandlestickChart;
  const title = loading ? 'Replay running' : error ? 'Backtest unavailable' : noTrades ? 'Run completed — no qualifying trades' : 'No result selected';
  const detail = loading
    ? 'The server has not supplied progress counts, so this is an indeterminate state.'
    : error
      ? error
      : noTrades
        ? `The engine evaluated ${result?.simulatedScans.toLocaleString() ?? 0} bars and returned zero accepted trades.`
        : 'Run a backtest to generate an evidence curve.';
  return <div className="apex-bt-empty"><Icon className={loading ? 'spin' : ''} size={20} /><strong>{title}</strong><span>{detail}</span></div>;
}

export function BacktestEquityPanel({
  result,
  loading,
  error,
  view,
  onViewChange,
  aggregation,
  onAggregationChange,
  equityData,
  marketData,
  histogramData,
  exposureData,
  trades,
}: {
  result: BacktestResult | null;
  loading: boolean;
  error: string | null;
  view: BacktestChartView;
  onViewChange: (view: BacktestChartView) => void;
  aggregation: BacktestChartAggregation;
  onAggregationChange: (aggregation: BacktestChartAggregation) => void;
  equityData: BacktestEquityPoint[];
  marketData: BacktestMarketPoint[];
  histogramData: Array<{ range: string; count: number; midpoint: number }>;
  exposureData: Array<{ tradeNumber: number; bars: number; dateLabel: string }>;
  trades: CostAdjustedTrade[];
}) {
  const hasEquity = trades.length > 0;
  const hasMarket = marketData.length > 1;
  const chartData = hasEquity ? equityData : marketData;
  const comparisonData = hasEquity && hasMarket
    ? equityData.map((point, index) => {
        const marketIndex = equityData.length <= 1
          ? 0
          : Math.round(index * (marketData.length - 1) / (equityData.length - 1));
        return { ...point, marketNormalized: marketData[marketIndex]?.normalized ?? null };
      })
    : equityData;

  return (
    <section className="apex-bt-equity-panel" aria-label="Backtest chart evidence">
      <header>
        <div>
          <strong>Equity &amp; Replay Evidence</strong>
          <small>{hasEquity ? 'Local capital-normalized curve from server trade outcomes' : 'Closed-candle market benchmark from the server result'}</small>
          {hasEquity && hasMarket && view === 'equity' && (
            <div className="apex-bt-chart-legend" aria-label="Equity chart legend">
              <span className="strategy">Strategy (Equity)</span>
              <span className="benchmark">Buy &amp; Hold (Benchmark)</span>
            </div>
          )}
        </div>
        <div className="apex-bt-chart-controls">
          <div role="tablist" aria-label="Chart view">
            {(['equity', 'drawdown', 'distribution', 'exposure'] as BacktestChartView[]).map((option) => (
              <button key={option} type="button" role="tab" aria-selected={view === option} className={view === option ? 'active' : ''} disabled={!result || ((option === 'distribution' || option === 'exposure' || option === 'drawdown') && !hasEquity)} onClick={() => onViewChange(option)}>
                {option === 'equity' ? 'Equity' : option[0].toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
          <label>
            <span className="sr-only">Chart aggregation</span>
            <select value={aggregation} disabled={!hasEquity} onChange={(event) => onAggregationChange(event.target.value as BacktestChartAggregation)}>
              <option value="cumulative">Per trade</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
        </div>
      </header>

      <div className="apex-bt-chart-stage">
        {!result && !loading && !error ? <EmptyChart loading={false} error={null} result={null} /> : view === 'distribution' && hasEquity ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogramData} margin={{ top: 18, right: 18, left: 4, bottom: 6 }}>
              <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--bt-grid)" />
              <XAxis dataKey="range" axisLine={false} tickLine={false} interval={0} tick={{ fontSize: 9, fill: 'var(--bt-muted)' }} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={32} tick={{ fontSize: 10, fill: 'var(--bt-muted)' }} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>{histogramData.map((point) => <Cell key={point.range} fill={point.midpoint >= 0 ? 'var(--bt-green)' : 'var(--bt-red)'} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : view === 'exposure' && hasEquity ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={exposureData} margin={{ top: 18, right: 18, left: 4, bottom: 6 }}>
              <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--bt-grid)" />
              <XAxis dataKey="tradeNumber" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--bt-muted)' }} />
              <YAxis axisLine={false} tickLine={false} width={36} tick={{ fontSize: 10, fill: 'var(--bt-muted)' }} />
              <Tooltip />
              <Bar dataKey="bars" fill="var(--bt-violet)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : view === 'drawdown' && hasEquity ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityData} margin={{ top: 18, right: 18, left: 4, bottom: 6 }}>
              <defs><linearGradient id="apexBtDdEvidence" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--bt-red)" stopOpacity={0.08} /><stop offset="100%" stopColor="var(--bt-red)" stopOpacity={0.34} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--bt-grid)" />
              <XAxis dataKey="dateLabel" axisLine={false} tickLine={false} minTickGap={42} tick={{ fontSize: 10, fill: 'var(--bt-muted)' }} />
              <YAxis axisLine={false} tickLine={false} width={44} domain={['auto', 0]} tickFormatter={(value: number | string) => `${Number(value).toFixed(1)}%`} tick={{ fontSize: 10, fill: 'var(--bt-muted)' }} />
              <ReferenceLine y={0} stroke="var(--bt-border-strong)" strokeDasharray="4 4" />
              <Tooltip content={<ChartTooltip mode="drawdown" />} />
              <Area type="monotoneX" dataKey="drawdown" stroke="var(--bt-red)" strokeWidth={2} fill="url(#apexBtDdEvidence)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : hasEquity ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={comparisonData} margin={{ top: 18, right: 18, left: 4, bottom: 6 }}>
              <defs><linearGradient id="apexBtEqEvidence" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--bt-green)" stopOpacity={0.28} /><stop offset="100%" stopColor="var(--bt-green)" stopOpacity={0.01} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--bt-grid)" />
              <XAxis dataKey="dateLabel" axisLine={false} tickLine={false} minTickGap={42} tick={{ fontSize: 10, fill: 'var(--bt-muted)' }} />
              <YAxis axisLine={false} tickLine={false} width={44} domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--bt-muted)' }} />
              <ReferenceLine y={100} stroke="var(--bt-border-strong)" strokeDasharray="4 4" />
              <Tooltip content={<ChartTooltip mode="equity" />} />
              <Area type="monotoneX" dataKey="equity" stroke="var(--bt-green)" strokeWidth={2.2} fill="url(#apexBtEqEvidence)" dot={false} isAnimationActive={false} />
              {hasMarket && <Line type="monotoneX" dataKey="marketNormalized" stroke="var(--bt-muted-2)" strokeWidth={1.6} dot={false} isAnimationActive={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        ) : hasMarket ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={marketData} margin={{ top: 18, right: 18, left: 4, bottom: 6 }}>
              <defs><linearGradient id="apexBtMarketEvidence" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--bt-blue)" stopOpacity={0.24} /><stop offset="100%" stopColor="var(--bt-blue)" stopOpacity={0.01} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--bt-grid)" />
              <XAxis dataKey="dateLabel" axisLine={false} tickLine={false} minTickGap={42} tick={{ fontSize: 10, fill: 'var(--bt-muted)' }} />
              <YAxis axisLine={false} tickLine={false} width={44} domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--bt-muted)' }} />
              <ReferenceLine y={100} stroke="var(--bt-border-strong)" strokeDasharray="4 4" />
              <Tooltip content={<ChartTooltip mode="market" />} />
              <Area type="monotoneX" dataKey="normalized" stroke="var(--bt-blue)" strokeWidth={2.2} fill="url(#apexBtMarketEvidence)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : <EmptyChart loading={loading} error={error} result={result} />}
      </div>
    </section>
  );
}
