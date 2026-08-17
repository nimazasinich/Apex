import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Layers3, LineChart, Loader2, Pencil, Radio, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Target, Trash2, TrendingDown, TrendingUp, WifiOff } from 'lucide-react';
import type { Candle, CandidateScore, ChartFeedStatus, DerivedLevels } from '../types';
import { formatPrice } from '../lib/marketPresentation';
import { buildChartStructureAnalysis, type AnalysisRiskProfile } from './priceChartAutoStructure';
import { calculatePriceChartGeometry, DEFAULT_CHART_WIDTH } from './priceChartGeometry';
import './PriceChartEnhancements.css';

const TIMEFRAMES: Array<{ key: string; label: string }> = [
  { key: '1m', label: '1m' },
  { key: '5m', label: '5m' },
  { key: '15m', label: '15m' },
  { key: '1h', label: '1H' },
  { key: '4h', label: '4H' },
  { key: '1d', label: '1D' },
];

function signedClass(value: number | null | undefined) {
  if (value == null || value === 0) return '';
  return value > 0 ? 'positive' : 'negative';
}

export interface PriceChartProps {
  candles: Candle[];
  symbol: string;
  lastPrice: number;
  changePct: number;
  interval: string;
  onIntervalChange: (interval: string) => void;
  feed?: ChartFeedStatus;
  onRetry?: () => void;
  analysis?: {
    levels?: DerivedLevels | null;
    longScore?: CandidateScore | null;
    shortScore?: CandidateScore | null;
  };
}

const PADDING_TOP = 14;
const PADDING_BOTTOM = 10;
const PADDING_X = 38; // reserve left gutter for the in-chart drawing rail
const PADDING_RIGHT = 54; // reserved for the price-axis scale
const MIN_VISIBLE_CANDLES = 20;

type ChartPoint = { x: number; y: number };
type ChartType = 'candles' | 'line';
type Overlay = 'ma7' | 'ma25' | 'ma99' | 'ema20' | 'boll';
type DrawTool = 'none' | 'trend' | 'hline';
type DataPoint = { time: number; price: number };
type Trendline = { id: string; a: DataPoint; b: DataPoint };
type HLine = { id: string; price: number };

const OVERLAY_META: Record<Overlay, { label: string; color: string }> = {
  ma7: { label: 'MA 7', color: '#f5a623' },
  ma25: { label: 'MA 25', color: '#6c8cff' },
  ma99: { label: 'MA 99', color: '#c76bf0' },
  ema20: { label: 'EMA 20', color: '#23c9c9' },
  boll: { label: 'BOLL 20,2', color: '#8b95a6' },
};

function smoothChartPath(points: ChartPoint[]): string {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    path += ` Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
  }
  const last = points[points.length - 1];
  path += ` Q ${last.x.toFixed(2)} ${last.y.toFixed(2)} ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
  return path;
}

function linePath(points: ChartPoint[]): string {
  if (!points.length) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}

/** Simple moving average, aligned to the source array (nulls before the window fills). */
function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average, aligned to the source array. */
function ema(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    if (i === period - 1) {
      const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
      prev = seed;
      out[i] = seed;
    } else if (i >= period) {
      prev = values[i] * k + (prev as number) * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper: Array<number | null> = new Array(values.length).fill(null);
  const lower: Array<number | null> = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i += 1) {
    const m = mid[i];
    if (m == null) continue;
    const window = values.slice(i - period + 1, i + 1);
    const variance = window.reduce((acc, v) => acc + (v - m) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper[i] = m + sd * mult;
    lower[i] = m - sd * mult;
  }
  return { mid, upper, lower };
}

/** Wilder's RSI. */
function rsi(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length < period + 1) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gainSum += diff; else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function PriceChart({ candles, symbol, lastPrice, changePct, interval, onIntervalChange, feed, onRetry, analysis }: PriceChartProps) {
  const id = useId().replace(/:/g, '');
  const containerRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const geometry = useMemo(
    () => calculatePriceChartGeometry(containerSize.width || DEFAULT_CHART_WIDTH),
    [containerSize.width],
  );
  const { chartWidth, chartHeight, volumeHeight, rsiHeight } = geometry;

  const [chartType, setChartType] = useState<ChartType>('candles');
  const [overlays, setOverlays] = useState<Set<Overlay>>(new Set());
  const [showRsi, setShowRsi] = useState(false);
  const [visibleCount, setVisibleCount] = useState<number | null>(null); // null = show all
  const [offsetFromEnd, setOffsetFromEnd] = useState(0);
  const [drawTool, setDrawTool] = useState<DrawTool>('none');
  const [trendlines, setTrendlines] = useState<Trendline[]>([]);
  const [hlines, setHlines] = useState<HLine[]>([]);
  const [pendingPoint, setPendingPoint] = useState<DataPoint | null>(null);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [showAutoTrendline, setShowAutoTrendline] = useState(false);
  const [showResistanceLevels, setShowResistanceLevels] = useState(false);
  const [showBreakoutGuide, setShowBreakoutGuide] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(true);
  const [dockTab, setDockTab] = useState<'levels' | 'risk' | 'setup'>('levels');
  const [analysisRiskProfile, setAnalysisRiskProfile] = useState<AnalysisRiskProfile>(() => {
    if (typeof window === 'undefined') return 'AGGRESSIVE';
    const saved = window.localStorage.getItem('apex-chart-analysis-profile');
    return saved === 'BALANCED' || saved === 'CONSERVATIVE' ? saved : 'AGGRESSIVE';
  });
  const dragState = useRef<{ startX: number; startOffset: number; moved: boolean } | null>(null);
  const rafRef = useRef<number | null>(null);
  const isLive = offsetFromEnd === 0;

  // Esc backs out of drawing mode without needing a dedicated cancel button.
  useEffect(() => {
    if (drawTool === 'none') return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDrawTool('none'); setPendingPoint(null); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawTool]);

  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(0, Math.round(entry.contentRect.width));
      const height = Math.max(0, Math.round(entry.contentRect.height));
      setContainerSize((current) => current.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('apex-chart-analysis-profile', analysisRiskProfile);
  }, [analysisRiskProfile]);

  const toggleOverlay = (key: Overlay) => {
    setOverlays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const visible = useMemo(() => {
    if (!candles.length) return [];
    const count = Math.min(candles.length, Math.max(MIN_VISIBLE_CANDLES, visibleCount ?? candles.length));
    const maxOffset = Math.max(0, candles.length - count);
    const offset = Math.min(maxOffset, offsetFromEnd);
    const end = candles.length - offset;
    const start = Math.max(0, end - count);
    return candles.slice(start, end);
  }, [candles, visibleCount, offsetFromEnd]);

  // Indicators are computed on the FULL series (for correct warm-up) then sliced to the visible window.
  const indicators = useMemo(() => {
    if (!candles.length) return null;
    const closes = candles.map((c) => c.close);
    return {
      ma7: sma(closes, 7),
      ma25: sma(closes, 25),
      ma99: sma(closes, 99),
      ema20: ema(closes, 20),
      boll: bollinger(closes, 20, 2),
      rsi: rsi(closes, 14),
    };
  }, [candles]);

  const structureAnalysis = useMemo(() => buildChartStructureAnalysis(
    candles,
    analysis?.levels ?? null,
    analysis?.longScore ?? null,
    analysis?.shortScore ?? null,
    { riskProfile: analysisRiskProfile, interval },
  ), [candles, analysis?.levels, analysis?.longScore, analysis?.shortScore, analysisRiskProfile, interval]);

  const chart = useMemo(() => {
    if (!visible.length || !candles.length) return null;
    const firstGlobalIndex = candles.length - visible.length - offsetSafeGuard(candles, visible, offsetFromEnd);

    const highs = visible.map((c) => c.high);
    const lows = visible.map((c) => c.low);
    let maxHigh = Math.max(...highs);
    let minLow = Math.min(...lows);
    if (overlays.has('boll') && indicators) {
      const sliceUpper = indicators.boll.upper.slice(firstGlobalIndex, firstGlobalIndex + visible.length).filter((v): v is number => v != null);
      const sliceLower = indicators.boll.lower.slice(firstGlobalIndex, firstGlobalIndex + visible.length).filter((v): v is number => v != null);
      if (sliceUpper.length) maxHigh = Math.max(maxHigh, ...sliceUpper);
      if (sliceLower.length) minLow = Math.min(minLow, ...sliceLower);
    }
    const range = Math.max(maxHigh - minLow, 0.000001) * 1.0;
    const pad = range * 0.06;
    maxHigh += pad;
    minLow -= pad;
    const plotWidth = chartWidth - PADDING_X - PADDING_RIGHT;
    const plotHeight = chartHeight - PADDING_TOP - PADDING_BOTTOM;
    const slotWidth = plotWidth / visible.length;
    const bodyWidth = Math.max(1.2, Math.min(11, slotWidth * 0.62));
    const y = (price: number) => PADDING_TOP + (1 - (price - minLow) / (maxHigh - minLow)) * plotHeight;
    const xAt = (localIndex: number) => PADDING_X + slotWidth * localIndex + slotWidth / 2;

    const maxVolume = Math.max(...visible.map((c) => c.volume), 0.000001);
    const closePoints = visible.map((candle, index) => ({ x: xAt(index), y: y(candle.close) }));
    const closePath = chartType === 'line' ? linePath(closePoints) : smoothChartPath(closePoints);
    const trendTone = visible[visible.length - 1].close >= visible[0].close ? 'positive' : 'negative';
    const lastY = closePoints[closePoints.length - 1]?.y ?? y(visible[visible.length - 1].close);

    const bars = visible.map((candle, index) => {
      const cx = xAt(index);
      const isUp = candle.close >= candle.open;
      const openY = y(candle.open);
      const closeY = y(candle.close);
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));
      const volumeBarHeight = (candle.volume / maxVolume) * (volumeHeight - 6);
      return { cx, isUp, highY: y(candle.high), lowY: y(candle.low), bodyTop, bodyHeight, bodyWidth, volumeHeight: volumeBarHeight, timestamp: candle.timestamp, candle };
    });

    const overlayPaths: Array<{ key: Overlay; color: string; path: string; dashed?: boolean }> = [];
    if (indicators) {
      const buildLine = (series: Array<number | null>) => {
        const pts: ChartPoint[] = [];
        for (let i = 0; i < visible.length; i += 1) {
          const global = firstGlobalIndex + i;
          const v = series[global];
          if (v == null) continue;
          pts.push({ x: xAt(i), y: y(v) });
        }
        return linePath(pts);
      };
      if (overlays.has('ma7')) overlayPaths.push({ key: 'ma7', color: OVERLAY_META.ma7.color, path: buildLine(indicators.ma7) });
      if (overlays.has('ma25')) overlayPaths.push({ key: 'ma25', color: OVERLAY_META.ma25.color, path: buildLine(indicators.ma25) });
      if (overlays.has('ma99')) overlayPaths.push({ key: 'ma99', color: OVERLAY_META.ma99.color, path: buildLine(indicators.ma99) });
      if (overlays.has('ema20')) overlayPaths.push({ key: 'ema20', color: OVERLAY_META.ema20.color, path: buildLine(indicators.ema20) });
      if (overlays.has('boll')) {
        overlayPaths.push({ key: 'boll', color: OVERLAY_META.boll.color, path: buildLine(indicators.boll.upper), dashed: true });
        overlayPaths.push({ key: 'boll', color: OVERLAY_META.boll.color, path: buildLine(indicators.boll.mid) });
        overlayPaths.push({ key: 'boll', color: OVERLAY_META.boll.color, path: buildLine(indicators.boll.lower), dashed: true });
      }
    }

    const priceAxisTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const price = maxHigh - ratio * (maxHigh - minLow);
      return { y: PADDING_TOP + ratio * plotHeight, price };
    });

    return {
      bars, closePath, trendTone, lastY, overlayPaths, priceAxisTicks,
      y, xAt, slotWidth, firstGlobalIndex, maxHigh, minLow,
    };
  }, [visible, candles, overlays, indicators, chartType, offsetFromEnd, chartWidth, chartHeight, volumeHeight]);

  const rsiChart = useMemo(() => {
    if (!showRsi || !indicators || !chart) return null;
    const series = indicators.rsi;
    const plotHeight = rsiHeight - 12;
    const yv = (v: number) => 6 + (1 - v / 100) * plotHeight;
    const pts: ChartPoint[] = [];
    for (let i = 0; i < visible.length; i += 1) {
      const global = chart.firstGlobalIndex + i;
      const v = series[global];
      if (v == null) continue;
      pts.push({ x: chart.xAt(i), y: yv(v) });
    }
    const last = series[chart.firstGlobalIndex + visible.length - 1];
    return { path: linePath(pts), y70: yv(70), y30: yv(30), last };
  }, [showRsi, indicators, chart, visible, rsiHeight]);

  const toDataPoint = useCallback((clientX: number, clientY: number): DataPoint | null => {
    const svg = svgRef.current;
    if (!svg || !chart) return null;
    const rect = svg.getBoundingClientRect();
    const scaleX = chartWidth / rect.width;
    const scaleY = (chartHeight + volumeHeight) / rect.height;
    const vx = (clientX - rect.left) * scaleX;
    const vy = (clientY - rect.top) * scaleY;
    const localIndex = Math.round((vx - PADDING_X - chart.slotWidth / 2) / chart.slotWidth);
    const clamped = Math.max(0, Math.min(visible.length - 1, localIndex));
    const candle = visible[clamped];
    if (!candle) return null;
    const plotHeight = chartHeight - PADDING_TOP - PADDING_BOTTOM;
    const price = chart.maxHigh - ((vy - PADDING_TOP) / plotHeight) * (chart.maxHigh - chart.minLow);
    return { time: candle.timestamp, price };
  }, [chart, visible, chartWidth, chartHeight, volumeHeight]);

  /** Shared by hover-tracking and panning; runs inside a rAF so fast mouse
   *  movement never queues more redraws than the screen can show. */
  const processPointer = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg || !chart) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = chartWidth / rect.width;
    const scaleY = (chartHeight + volumeHeight) / rect.height;

    if (dragState.current) {
      const dxViewbox = (clientX - dragState.current.startX) * scaleX;
      if (Math.abs(dxViewbox) > 1) dragState.current.moved = true;
      const candleDelta = dxViewbox / chart.slotWidth;
      const count = visible.length;
      const maxOffset = Math.max(0, candles.length - count);
      const next = Math.max(0, Math.min(maxOffset, Math.round(dragState.current.startOffset - candleDelta)));
      setOffsetFromEnd(next);
      return;
    }

    const vx = (clientX - rect.left) * scaleX;
    const vy = (clientY - rect.top) * scaleY;
    const localIndex = Math.round((vx - PADDING_X - chart.slotWidth / 2) / chart.slotWidth);
    const clamped = Math.max(0, Math.min(visible.length - 1, localIndex));
    const bar = chart.bars[clamped];
    if (bar) setHover({ index: clamped, x: bar.cx, y: vy });
  }, [chart, visible.length, candles.length, chartWidth, chartHeight, volumeHeight]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const { clientX, clientY } = e;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => processPointer(clientX, clientY));
  }, [processPointer]);

  const handlePointerLeave = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    setHover(null);
    if (!dragState.current?.moved) dragState.current = null;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (drawTool === 'trend') {
      const point = toDataPoint(e.clientX, e.clientY);
      if (!point) return;
      if (!pendingPoint) {
        setPendingPoint(point);
      } else {
        setTrendlines((prev) => [...prev, { id: `tl-${Date.now()}`, a: pendingPoint, b: point }]);
        setPendingPoint(null);
        setDrawTool('none');
      }
      return;
    }
    if (drawTool === 'hline') {
      const point = toDataPoint(e.clientX, e.clientY);
      if (!point) return;
      setHlines((prev) => [...prev, { id: `hl-${Date.now()}`, price: point.price }]);
      setDrawTool('none');
      return;
    }
    // setPointerCapture keeps the drag alive even if the cursor leaves the
    // SVG mid-gesture, so a fast pan never gets stuck half-finished.
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startOffset: offsetFromEnd, moved: false };
    setIsPanning(true);
  }, [drawTool, pendingPoint, toDataPoint, offsetFromEnd]);

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    dragState.current = null;
    setIsPanning(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    setVisibleCount(null);
    setOffsetFromEnd(0);
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const svg = svgRef.current;
    const base = visibleCount ?? candles.length;
    const step = Math.max(4, Math.round(base * 0.12));
    const nextCount = Math.max(MIN_VISIBLE_CANDLES, Math.min(candles.length, e.deltaY < 0 ? base - step : base + step));

    // Anchor the zoom to the candle under the cursor rather than the window
    // edge, so the chart zooms "into" whatever you're pointing at.
    if (svg && chart && nextCount !== base) {
      const rect = svg.getBoundingClientRect();
      const scaleX = chartWidth / rect.width;
      const vx = (e.clientX - rect.left) * scaleX;
      const localIndex = Math.max(0, Math.min(visible.length - 1, (vx - PADDING_X - chart.slotWidth / 2) / chart.slotWidth));
      const anchorGlobal = chart.firstGlobalIndex + localIndex;
      const fraction = visible.length > 1 ? localIndex / (visible.length - 1) : 0.5;
      const newFirstGlobal = anchorGlobal - fraction * (nextCount - 1);
      const maxOffset = Math.max(0, candles.length - nextCount);
      const newOffset = Math.max(0, Math.min(maxOffset, candles.length - nextCount - newFirstGlobal));
      setOffsetFromEnd(Math.round(newOffset));
    }
    setVisibleCount(nextCount);
  }, [visibleCount, candles.length, chart, visible.length, chartWidth]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    // React registers wheel listeners as passive in this environment. Chart
    // zoom must deliberately suppress page scrolling while the cursor is over
    // the canvas, so bind the one cancelling listener as non-passive instead.
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const dataPointToPixel = useCallback((point: DataPoint): ChartPoint | null => {
    if (!chart) return null;
    const globalIndex = candles.findIndex((c) => c.timestamp === point.time);
    if (globalIndex < 0) return null;
    const localIndex = globalIndex - chart.firstGlobalIndex;
    return { x: chart.xAt(localIndex), y: chart.y(point.price) };
  }, [chart, candles]);

  const hoverBar = hover && chart ? chart.bars[hover.index] : null;
  const latestVisibleCandle = visible.length ? visible[visible.length - 1] : null;
  const visibleDeltaPct = latestVisibleCandle && visible.length > 1 && visible[0].close
    ? ((latestVisibleCandle.close - visible[0].close) / visible[0].close) * 100
    : changePct;

  return (
    <section
      ref={containerRef}
      className="apex-panel apex-chart-panel apex-chart-panel-pro"
      data-chart-width={containerSize.width || undefined}
      data-chart-height={containerSize.height || undefined}
      aria-describedby={`apex-chart-summary-${id}`}
    >
      <p id={`apex-chart-summary-${id}`} className="apex-visually-hidden">{`${symbol} ${interval} price chart. ${visible.length} verified candles are visible. Latest price ${formatPrice(lastPrice)}. Data state ${feed?.stale ? 'stale' : feed?.dataState || 'unknown'}.`}</p>
      <div className="apex-chart-header">
        <div className="apex-chart-title-group">
          <h1>Chart</h1>
          <span className="apex-chart-feed-label">{feed && !feed.loading ? `${feed.stale ? 'Cached' : feed.dataState === 'live' ? 'Live' : feed.dataState === 'degraded' ? 'Fallback' : 'Offline'}${feed.source ? ` · ${feed.source.replaceAll('_', ' ')}` : ''}` : 'Verified market feed'}</span>
        </div>
        <div className="apex-chart-header-controls">
          <div className="apex-tf-tabs" aria-label="Chart timeframe">
            {TIMEFRAMES.map((tf) => (
              <button key={tf.key} type="button" className={tf.key === interval ? 'active' : ''} onClick={() => onIntervalChange(tf.key)}>
                {tf.label}
              </button>
            ))}
          </div>
          <details className="apex-chart-menu">
            <summary>Indicators</summary>
            <div className="apex-chart-menu-panel" role="group" aria-label="Chart indicators">
              {(Object.keys(OVERLAY_META) as Overlay[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={overlays.has(key) ? 'active' : ''}
                  onClick={() => toggleOverlay(key)}
                >
                  {OVERLAY_META[key].label}
                </button>
              ))}
              <button type="button" className={showRsi ? 'active' : ''} onClick={() => setShowRsi((v) => !v)}>RSI 14</button>
            </div>
          </details>
          <details className="apex-chart-menu">
            <summary>Structure</summary>
            <div className="apex-chart-menu-panel" role="group" aria-label="Chart structure overlays">
              <button type="button" className={showAutoTrendline ? 'active' : ''} onClick={() => setShowAutoTrendline((value) => !value)}>Trendline</button>
              <button type="button" className={showResistanceLevels ? 'active' : ''} onClick={() => setShowResistanceLevels((value) => !value)}>R1–R3</button>
              <button type="button" className={showBreakoutGuide ? 'active' : ''} onClick={() => setShowBreakoutGuide((value) => !value)}>Breakout</button>
            </div>
          </details>
        </div>
      </div>

      {chart && (
        <div className="apex-chart-toolbar">
          <div className="apex-chart-ohlc" aria-label="Latest visible candle values">
            <strong>{symbol} · {interval.toUpperCase()}</strong>
            {latestVisibleCandle ? (
              <span>
                <em>O {formatPrice(latestVisibleCandle.open)}</em>
                <em>H {formatPrice(latestVisibleCandle.high)}</em>
                <em>L {formatPrice(latestVisibleCandle.low)}</em>
                <em>C {formatPrice(latestVisibleCandle.close)}</em>
                <em className={signedClass(visibleDeltaPct)}>{visibleDeltaPct >= 0 ? '+' : ''}{visibleDeltaPct.toFixed(2)}%</em>
              </span>
            ) : <span>Waiting for verified candles…</span>}
          </div>
          <div className="apex-chart-type-switch" role="group" aria-label="Chart type">
            <button type="button" className={chartType === 'candles' ? 'active' : ''} onClick={() => setChartType('candles')}>Candles</button>
            <button type="button" className={chartType === 'line' ? 'active' : ''} onClick={() => setChartType('line')}>Line</button>
          </div>
        </div>
      )}

      {chart ? (
        <div className="apex-chart-body">
          <div className="apex-candle-svg-wrap">
            <div className="apex-chart-side-tools" role="toolbar" aria-label="Chart drawing tools">
              <button type="button" className={drawTool === 'trend' ? 'active' : ''} aria-label="Draw trendline" title="Draw trendline" onClick={() => { setDrawTool((tool) => tool === 'trend' ? 'none' : 'trend'); setPendingPoint(null); }}><Pencil size={14} /></button>
              <button type="button" className={drawTool === 'hline' ? 'active' : ''} aria-label="Draw horizontal level" title="Draw horizontal level" onClick={() => { setDrawTool((tool) => tool === 'hline' ? 'none' : 'hline'); setPendingPoint(null); }}>—</button>
              {(trendlines.length > 0 || hlines.length > 0) && <button type="button" aria-label="Clear drawings" title="Clear drawings" onClick={() => { setTrendlines([]); setHlines([]); }}><Trash2 size={14} /></button>}
              {(visibleCount != null || offsetFromEnd !== 0) && <button type="button" aria-label="Reset zoom" title="Reset zoom" onClick={() => { setVisibleCount(null); setOffsetFromEnd(0); }}><RotateCcw size={14} /></button>}
              <button type="button" className={isLive ? 'active' : ''} aria-label={isLive ? 'Following live data' : 'Jump to live'} title={isLive ? 'Following live data' : 'Jump to live'} onClick={() => setOffsetFromEnd(0)}><Radio size={14} /></button>
            </div>
            <svg
              ref={svgRef}
              className={`apex-candle-svg${drawTool !== 'none' ? ' drawing' : ''}${isPanning ? ' panning' : ''}`}
              style={{ cursor: drawTool !== 'none' ? undefined : (isPanning ? 'grabbing' : 'grab') }}
              viewBox={`0 0 ${chartWidth} ${chartHeight + volumeHeight}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`${symbol} candlestick chart`}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onDoubleClick={handleDoubleClick}
            >
              <defs>
                <linearGradient id={`chart-area-${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={chart.trendTone === 'positive' ? '#31c44c' : '#f05b54'} stopOpacity="0.18" />
                  <stop offset="1" stopColor={chart.trendTone === 'positive' ? '#31c44c' : '#f05b54'} stopOpacity="0" />
                </linearGradient>
                <filter id={`chart-glow-${id}`} x="-20%" y="-30%" width="140%" height="160%">
                  <feGaussianBlur stdDeviation="1.4" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {chart.priceAxisTicks.map((tick, index) => (
                <g key={index}>
                  <line className="apex-chart-grid-line" x1={PADDING_X} x2={chartWidth - PADDING_RIGHT} y1={tick.y} y2={tick.y} />
                  <text className="apex-chart-axis-label" x={chartWidth - PADDING_RIGHT + 6} y={tick.y + 3}>{formatPrice(tick.price)}</text>
                </g>
              ))}

              {chartType === 'line' && (
                <path className={`apex-close-area ${chart.trendTone}`} d={`${chart.closePath} L ${chart.xAt(visible.length - 1)} ${chartHeight} L ${chart.xAt(0)} ${chartHeight} Z`} fill={`url(#chart-area-${id})`} />
              )}

              {chart.overlayPaths.map((overlay, index) => (
                <path
                  key={`${overlay.key}-${index}`}
                  className="apex-chart-overlay-line"
                  d={overlay.path}
                  stroke={overlay.color}
                  strokeDasharray={overlay.dashed ? '4 3' : undefined}
                  fill="none"
                />
              ))}

              {showResistanceLevels && structureAnalysis?.resistanceLevels.map((level, index) => (
                <g key={level.tag}>
                  <rect
                    className={`apex-auto-level-zone${index === 0 ? ' primary' : ''}`}
                    x={PADDING_X}
                    y={chart.y(level.upper)}
                    width={chartWidth - PADDING_X - PADDING_RIGHT}
                    height={Math.max(2, chart.y(level.lower) - chart.y(level.upper))}
                  />
                  <line className={`apex-auto-level-line${index === 0 ? ' primary' : ''}`} x1={PADDING_X} x2={chartWidth - PADDING_RIGHT} y1={chart.y(level.price)} y2={chart.y(level.price)} />
                  <text className={`apex-chart-axis-label structure${index === 0 ? ' primary' : ''}`} x={chartWidth - PADDING_RIGHT + 6} y={chart.y(level.price) + 3}>{`${level.tag} ${formatPrice(level.price)}`}</text>
                </g>
              ))}

              {showBreakoutGuide && structureAnalysis?.breakout.referencePrice != null && (
                <g>
                  <rect className={`apex-breakout-zone state-${structureAnalysis.breakout.state.toLowerCase()}`} x={PADDING_X} y={chart.y(structureAnalysis.breakout.referencePrice + structureAnalysis.breakout.buffer)} width={chartWidth - PADDING_X - PADDING_RIGHT} height={Math.max(2, chart.y(structureAnalysis.breakout.referencePrice) - chart.y(structureAnalysis.breakout.referencePrice + structureAnalysis.breakout.buffer))} />
                  <line className={`apex-breakout-line state-${structureAnalysis.breakout.state.toLowerCase()}`} x1={PADDING_X} x2={chartWidth - PADDING_RIGHT} y1={chart.y(structureAnalysis.breakout.referencePrice)} y2={chart.y(structureAnalysis.breakout.referencePrice)} />
                </g>
              )}

              {showAutoTrendline && structureAnalysis?.trendline && (() => {
                const firstVisibleIndex = chart.firstGlobalIndex;
                const lastVisibleIndex = chart.firstGlobalIndex + visible.length - 1;
                const startPrice = structureAnalysis.trendline.startPrice + structureAnalysis.trendline.slope * (firstVisibleIndex - structureAnalysis.trendline.startIndex);
                const endPrice = structureAnalysis.trendline.startPrice + structureAnalysis.trendline.slope * (lastVisibleIndex - structureAnalysis.trendline.startIndex);
                return <line className={`apex-auto-trendline ${structureAnalysis.trendline.kind}`} x1={chart.xAt(0)} y1={chart.y(startPrice)} x2={chart.xAt(visible.length - 1)} y2={chart.y(endPrice)} />;
              })()}

              <line className={`apex-current-price-line ${chart.trendTone}`} x1={PADDING_X} x2={chartWidth - PADDING_RIGHT} y1={chart.lastY} y2={chart.lastY} />

              {chartType === 'candles' ? chart.bars.map((bar, index) => (
                <g key={bar.timestamp ?? index} className={bar.isUp ? 'apex-candle-up' : 'apex-candle-down'}>
                  <line x1={bar.cx} x2={bar.cx} y1={bar.highY} y2={bar.lowY} strokeWidth={1} />
                  <rect x={bar.cx - bar.bodyWidth / 2} y={bar.bodyTop} width={bar.bodyWidth} height={bar.bodyHeight} rx={Math.min(1.8, bar.bodyWidth / 3)} />
                </g>
              )) : (
                <path className={`apex-close-line ${chart.trendTone}`} d={chart.closePath} filter={`url(#chart-glow-${id})`} />
              )}

              {chartType === 'candles' && chart.bars.map((bar, index) => (
                <rect
                  key={`vol-${bar.timestamp ?? index}`}
                  className={bar.isUp ? 'apex-volume-up' : 'apex-volume-down'}
                  x={bar.cx - bar.bodyWidth / 2}
                  y={chartHeight + (volumeHeight - bar.volumeHeight)}
                  width={bar.bodyWidth}
                  height={bar.volumeHeight}
                  rx={Math.min(2, bar.bodyWidth / 2)}
                />
              ))}

              <circle className={`apex-close-dot ${chart.trendTone}`} cx={chart.bars[chart.bars.length - 1]?.cx} cy={chart.lastY} r="3.2" />

              {/* User-drawn levels and trendlines, re-anchored to data on every render. */}
              {hlines.map((h) => (
                <g key={h.id}>
                  <line className="apex-chart-hline" x1={PADDING_X} x2={chartWidth - PADDING_RIGHT} y1={chart.y(h.price)} y2={chart.y(h.price)} />
                  <text className="apex-chart-axis-label drawn" x={chartWidth - PADDING_RIGHT + 6} y={chart.y(h.price) + 3}>{formatPrice(h.price)}</text>
                </g>
              ))}
              {trendlines.map((t) => {
                const pa = dataPointToPixel(t.a);
                const pb = dataPointToPixel(t.b);
                if (!pa || !pb) return null;
                return <line key={t.id} className="apex-chart-trendline" x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} />;
              })}

              {/* Crosshair + hover OHLC tooltip. */}
              {hover && hoverBar && (
                <g className="apex-chart-crosshair">
                  <line x1={hoverBar.cx} x2={hoverBar.cx} y1={PADDING_TOP} y2={chartHeight + volumeHeight} />
                  <line x1={PADDING_X} x2={chartWidth - PADDING_RIGHT} y1={hover.y} y2={hover.y} />
                </g>
              )}
            </svg>

            {hover && hoverBar && (
              <div className="apex-chart-tooltip" style={{ left: `${(hoverBar.cx / chartWidth) * 100}%` }}>
                <span>{new Date(hoverBar.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <span>O <b>{formatPrice(hoverBar.candle.open)}</b></span>
                <span>H <b>{formatPrice(hoverBar.candle.high)}</b></span>
                <span>L <b>{formatPrice(hoverBar.candle.low)}</b></span>
                <span>C <b className={hoverBar.isUp ? 'positive' : 'negative'}>{formatPrice(hoverBar.candle.close)}</b></span>
                <span>Vol <b>{hoverBar.candle.volume.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></span>
              </div>
            )}

            {drawTool !== 'none' && (
              <div className="apex-chart-draw-hint">{drawTool === 'trend' ? (pendingPoint ? 'Click the second point' : 'Click the first point') : 'Click to place a level'}</div>
            )}

            {structureAnalysis && (
              <>
                <div className="apex-chart-structure-pills">
                  {showAutoTrendline && structureAnalysis.trendline && (
                    <span className={`trend ${structureAnalysis.trendline.kind}`}>{structureAnalysis.trendline.kind === 'support' ? 'Trendline · Uptrend' : 'Trendline · Downtrend'}</span>
                  )}
                  {showResistanceLevels && structureAnalysis.resistanceLevels[0] && <span className="level">{structureAnalysis.resistanceLevels[0].tag} {formatPrice(structureAnalysis.resistanceLevels[0].price)}</span>}
                  {showBreakoutGuide && <span className={`breakout state-${structureAnalysis.breakout.state.toLowerCase()}`}>{structureAnalysis.breakout.label}</span>}
                </div>

                {(showAutoTrendline || showResistanceLevels || showBreakoutGuide) && <aside className={`apex-chart-insight-dock${dockCollapsed ? ' collapsed' : ''}`}>
                  <button type="button" className="apex-chart-dock-toggle" aria-label={dockCollapsed ? 'Expand analysis dock' : 'Collapse analysis dock'} onClick={() => setDockCollapsed((value) => !value)}>
                    {dockCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {dockCollapsed ? (
                    <div className="apex-chart-dock-mini">
                      <span>{structureAnalysis.breakout.state}</span>
                      <strong>{structureAnalysis.resistanceLevels[0] ? formatPrice(structureAnalysis.resistanceLevels[0].price) : '—'}</strong>
                    </div>
                  ) : (
                    <>
                      <div className="apex-chart-profile-switch" role="group" aria-label="Analysis risk profile">
                        {(['AGGRESSIVE', 'BALANCED', 'CONSERVATIVE'] as AnalysisRiskProfile[]).map((profile) => (
                          <button
                            key={profile}
                            type="button"
                            className={analysisRiskProfile === profile ? 'active' : ''}
                            onClick={() => setAnalysisRiskProfile(profile)}
                            title={profile === 'AGGRESSIVE' ? 'Earlier signals with more false-break risk' : profile === 'BALANCED' ? 'Moderate confirmation' : 'More confirmation and fewer signals'}
                          >
                            {profile === 'AGGRESSIVE' ? 'Aggressive' : profile === 'BALANCED' ? 'Balanced' : 'Conservative'}
                          </button>
                        ))}
                      </div>
                      <div className="apex-chart-profile-note">
                        {analysisRiskProfile === 'AGGRESSIVE' ? 'Earlier entries · softer confirmation' : analysisRiskProfile === 'BALANCED' ? 'Balanced confirmation' : 'Stricter multi-bar confirmation'}
                      </div>
                      <div className="apex-chart-dock-tabs">
                        <button type="button" className={dockTab === 'levels' ? 'active' : ''} onClick={() => setDockTab('levels')}><LineChart size={13} /> Levels</button>
                        <button type="button" className={dockTab === 'risk' ? 'active' : ''} onClick={() => setDockTab('risk')}><Target size={13} /> Risk</button>
                        <button type="button" className={dockTab === 'setup' ? 'active' : ''} onClick={() => setDockTab('setup')}><Sparkles size={13} /> Setup</button>
                      </div>

                      <div className="apex-chart-dock-body">
                        {dockTab === 'levels' && (
                          <>
                            <div className="apex-chart-toggle-pills">
                              <button type="button" className={showAutoTrendline ? 'active' : ''} onClick={() => setShowAutoTrendline((value) => !value)}><Layers3 size={13} /> Trendline</button>
                              <button type="button" className={showResistanceLevels ? 'active' : ''} onClick={() => setShowResistanceLevels((value) => !value)}>R-levels</button>
                              <button type="button" className={showBreakoutGuide ? 'active' : ''} onClick={() => setShowBreakoutGuide((value) => !value)}>Breakout</button>
                            </div>
                            <div className="apex-chart-level-list">
                              {structureAnalysis.resistanceLevels.length ? structureAnalysis.resistanceLevels.map((level) => (
                                <div key={level.tag}>
                                  <span>{level.tag}</span>
                                  <strong>{formatPrice(level.price)}</strong>
                                  <small>{level.source === 'derived' ? 'model zone' : `${level.touches} touches`}</small>
                                </div>
                              )) : <div className="empty">No resistance zones detected.</div>}
                            </div>
                            <div className="apex-chart-dock-summary">
                              <div><span>Breakout state</span><strong>{structureAnalysis.breakout.label}</strong></div>
                              <div><span>Confirmation</span><strong>{structureAnalysis.breakout.confirmationBars}/{structureAnalysis.breakout.requiredConfirmationBars} closes</strong></div>
                              <div><span>ATR 14</span><strong>{formatPrice(structureAnalysis.atr14)}</strong></div>
                            </div>
                          </>
                        )}

                        {dockTab === 'risk' && (
                          <>
                            <div className="apex-chart-dock-stat-grid">
                              <div><span>Nearest target</span><strong>{analysis?.levels ? formatPrice(analysis.levels.riskReward.nearestTarget) : structureAnalysis.resistanceLevels[0] ? formatPrice(structureAnalysis.resistanceLevels[0].price) : '—'}</strong></div>
                              <div><span>Nearest stop</span><strong>{analysis?.levels ? formatPrice(analysis.levels.riskReward.nearestStop) : structureAnalysis.trendline ? formatPrice(structureAnalysis.trendline.latestPrice) : '—'}</strong></div>
                              <div><span>R multiple</span><strong>{analysis?.levels ? analysis.levels.riskReward.rMultiple.toFixed(2) : '—'}</strong></div>
                              <div><span>Risk %</span><strong>{analysis?.levels ? `${analysis.levels.riskReward.riskPct.toFixed(2)}%` : '—'}</strong></div>
                            </div>
                            <div className="apex-chart-meter-list">
                              <div><span>Volume confirmation</span><em>{structureAnalysis.breakout.volumeRatio.toFixed(2)}×</em><i style={{ '--meter': `${Math.max(0, Math.min(1, structureAnalysis.breakout.volumeRatio / 2)) * 100}%` } as React.CSSProperties} /></div>
                              <div><span>Breakout buffer</span><em>{formatPrice(structureAnalysis.breakout.buffer)}</em><i style={{ '--meter': `${Math.max(0, Math.min(1, structureAnalysis.breakout.buffer / Math.max(structureAnalysis.atr14 * 0.5, 1e-8))) * 100}%` } as React.CSSProperties} /></div>
                            </div>
                          </>
                        )}

                        {dockTab === 'setup' && (
                          <>
                            <div className="apex-chart-bias-card">
                              <span className={`bias ${structureAnalysis.setupBias}`}>{structureAnalysis.setupBias === 'bullish' ? <TrendingUp size={14} /> : structureAnalysis.setupBias === 'bearish' ? <TrendingDown size={14} /> : <ShieldCheck size={14} />} {structureAnalysis.successLabel}</span>
                              <strong>{structureAnalysis.calibratedProbability != null ? `${structureAnalysis.calibratedProbability.toFixed(1)}% model likelihood` : structureAnalysis.confidence != null ? `${structureAnalysis.confidence}/100 setup quality` : 'Quality unavailable'}</strong>
                              <small>{structureAnalysis.breakout.label} · breakout quality {structureAnalysis.breakout.score}/100</small>
                            </div>
                            <div className="apex-chart-dock-stat-grid two">
                              <div><span>Long score</span><strong>{analysis?.longScore?.score ?? '—'}</strong></div>
                              <div><span>Short score</span><strong>{analysis?.shortScore?.score ?? '—'}</strong></div>
                              <div><span>Close position</span><strong>{Math.round(structureAnalysis.breakout.closePosition * 100)}%</strong></div>
                              <div><span>Body quality</span><strong>{Math.round(structureAnalysis.breakout.bodyRatio * 100)}%</strong></div>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </aside>}
              </>
            )}
          </div>

          {rsiChart && (
            <div className="apex-chart-rsi-wrap">
              <svg className="apex-chart-rsi-svg" viewBox={`0 0 ${chartWidth} ${rsiHeight}`} preserveAspectRatio="none">
                <line x1={PADDING_X} x2={chartWidth - PADDING_RIGHT} y1={rsiChart.y70} y2={rsiChart.y70} className="apex-chart-grid-line" />
                <line x1={PADDING_X} x2={chartWidth - PADDING_RIGHT} y1={rsiChart.y30} y2={rsiChart.y30} className="apex-chart-grid-line" />
                <path d={rsiChart.path} className="apex-chart-rsi-line" fill="none" />
              </svg>
              <span className="apex-chart-rsi-label">RSI 14 {rsiChart.last != null ? rsiChart.last.toFixed(1) : '—'}</span>
            </div>
          )}
        </div>
      ) : (
        <div className={`apex-chart-feed-state${feed?.loading ? ' loading' : ''}`}>
          <div className="apex-chart-placeholder-grid" aria-hidden="true">
            <i /><i /><i /><i /><i /><i />
            <span /><span /><span /><span /><span />
          </div>
          <div className="apex-chart-feed-copy">
            <span className="apex-chart-feed-icon">
              {feed?.loading ? <Loader2 className="spin" size={22} /> : feed?.error ? <WifiOff size={22} /> : <CheckCircle2 size={22} />}
            </span>
            <div>
              <strong>{feed?.loading ? 'Loading verified market candles…' : 'Verified candle feed is temporarily unavailable'}</strong>
              <p>
                {feed?.loading
                  ? `APEX is checking the live and fallback providers for ${symbol} (${interval}).`
                  : 'Ticker prices remain visible, but APEX will not draw synthetic candles. Retry now or choose another interval.'}
              </p>
              <div className="apex-chart-feed-meta">
                <span>{symbol}</span><span>{interval.toUpperCase()}</span>
                {feed?.source && <span>{feed.source.replaceAll('_', ' ')}</span>}
              </div>
            </div>
            {!feed?.loading && onRetry && (
              <button type="button" className="apex-secondary-button apex-chart-retry" onClick={onRetry}>
                <RefreshCw size={15} /> Retry feed
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** Guards against a stale offset once the candle series itself changes length. */
function offsetSafeGuard(candles: Candle[], visible: Candle[], offsetFromEnd: number): number {
  const maxOffset = Math.max(0, candles.length - visible.length);
  return Math.min(maxOffset, offsetFromEnd);
}
