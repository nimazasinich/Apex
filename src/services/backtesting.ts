// Copied from apex-trading-engine/src/services/backtesting.ts.
// Only change from the original: import path './marketData' -> './mathEngine'
// (see mathEngine.ts header). runShortMomentumBacktest / BacktestSourceProfile
// / BacktestFetchRequest are unused by this project's route (which supplies
// its own real KuCoin candle fetch instead of the HuggingFace-space datasource
// this file was originally written against) but are kept so this stays a
// faithful copy rather than a divergent fork.
import { MathEngine } from './mathEngine';
import { buildCanonicalDecision, DECISION_ADAPTER_VERSION } from './canonicalDecisionAdapter';
import { buildTradePlan } from './tradePlan';
import { evaluateRiskGovernor, loadRiskGovernorPolicy } from './riskGovernor';
import { normalizeEffectiveScannerConfig } from './scannerConfigPolicy';
import { computeTransactionCostPct, type FundingCoverage, type FundingEvent } from './transactionCosts';
import type { BinanceSentiment, Candle, Candlestick, DataState, DerivedLevels, ScannerConfig, ScoringWeights, SignalDecisionReasonCode, SmcAvailabilityState, SymbolTicker } from '../types';
import type { NativeParliamentSnapshotV1 } from './strategyCommander/parliamentShadow';
import type { ParliamentScannerMode } from './parliamentScannerContributor';

export type BacktestInterval = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
export type BacktestSourceProfileId = 'datasourceforcryptocurrency-4' | 'datasourceforcryptocurrency-2';

export interface BacktestSourceProfile {
  id: BacktestSourceProfileId;
  label: string;
  role: string;
  sourcePage: string;
  runtimeOrigin: string;
  defaultEndpoint: string;
  dataSets: string[];
  ok?: boolean;
  status?: number;
  reason?: string;
}

export interface BacktestCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface NormalizedBacktestCandle extends BacktestCandle {
  timestamp: number;
}

interface ReplayPrecomputation {
  clean: NormalizedBacktestCandle[];
  engineCandles: Candlestick[];
  coreCandles: Candle[];
  proxy15mWindow: { rows: Candle[]; lastIndex: number };
  volumePrefix: Float64Array;
}

export interface BacktestFetchRequest {
  profileId?: BacktestSourceProfileId;
  symbol: string;
  interval: BacktestInterval;
  limit: number;
  endpointPath?: string;
}

export interface BacktestFetchResponse {
  ok: boolean;
  source: 'huggingface-space';
  profileId?: BacktestSourceProfileId;
  profileLabel?: string;
  sourcePage: string;
  runtimeOrigin: string;
  dataSets?: string[];
  profiles?: BacktestSourceProfile[];
  url?: string;
  endpointPath?: string;
  attempts?: Array<{ url: string; ok: boolean; status?: number; reason?: string }>;
  candles?: BacktestCandle[];
  rawSample?: unknown;
  message?: string;
  dataSource: 'live' | 'unavailable';
}

export interface BacktestTrade {
  id: string;
  entryTime: string;
  exitTime: string;
  direction: 'SHORT' | 'LONG';
  entry: number;
  exit: number;
  stop: number;
  target: number;
  pnlPct: number;
  outcome: 'TP' | 'SL' | 'TIME';
  barsHeld: number;
  confidence?: number;
  rawScore?: number;
  squeezeRiskScore?: number;
  evidenceAgreementScore?: number;
  entryReason?: string;
  engineVersion?: string;
  featureCompletenessPct?: number;
  grossPnlPct?: number;
  transactionCostPct?: number;
  inputAvailability?: Record<string, string>;
  tradePlanId?: string;
  riskDecision?: 'APPROVED' | 'APPROVED_REDUCED' | 'DEFERRED' | 'REJECTED';
  approvedQuantity?: number;
  marketRegime?: 'TREND_UP' | 'TREND_DOWN' | 'RANGE' | 'HIGH_VOLATILITY' | 'TRANSITION' | 'UNKNOWN';
  parliamentMode?: ParliamentScannerMode;
  parliamentCategoryConfluence?: number;
  parliamentEligibleIfPromoted?: boolean;
}

export interface BacktestSummary {
  symbol: string;
  interval: BacktestInterval;
  candles: number;
  trades: number;
  wins: number;
  losses: number;
  timed: number;
  winRate: number;
  totalPnlPct: number;
  avgPnlPct: number;
  maxDrawdownPct: number;
  profitFactor: number;
  acceptedCandidates?: number;
  rejectedCandidates?: number;
  rejectionCounts?: Partial<Record<SignalDecisionReasonCode, number>>;
  strategy?: 'SHORT_MOMENTUM_SMOKE' | 'APEX_REPLAY' | 'PROXY_REPLAY';
  replayMode?: 'PROXY_REPLAY' | 'PRODUCTION_INPUT';
  configOverrides?: Array<{ field: string; configured: number | string; effective: number | string; reason: string; policyVersion?: string }>;
  configuredScoreWeights?: ScoringWeights;
  effectiveScoreWeights?: ScoringWeights;
  smcAvailabilitySummary?: Partial<Record<SmcAvailabilityState, number>>;
  productionAlignedBars?: number;
  downgradedBars?: number;
  tradePlanRejectedCandidates?: number;
  riskRejectedCandidates?: number;
  parliamentEvaluatedBars?: number;
  parliamentEligibleBars?: number;
  parliamentMaterialVetoCount?: number;
  engineVersion?: string;
}

export interface BacktestRunResult {
  summary: BacktestSummary;
  trades: BacktestTrade[];
  equityCurve: number[];
}

function n(v: unknown): number | null {
  const x = typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v);
  return Number.isFinite(x) ? x : null;
}

function rollingAverage(values: number[], endExclusive: number, len: number): number | null {
  if (endExclusive < len) return null;
  let sum = 0;
  for (let i = endExclusive - len; i < endExclusive; i++) sum += values[i];
  return sum / len;
}

function rollingLow(values: number[], endExclusive: number, len: number): number | null {
  if (endExclusive < len) return null;
  let out = Infinity;
  for (let i = endExclusive - len; i < endExclusive; i++) out = Math.min(out, values[i]);
  return Number.isFinite(out) ? out : null;
}

function rollingHigh(values: number[], endExclusive: number, len: number): number | null {
  if (endExclusive < len) return null;
  let out = -Infinity;
  for (let i = endExclusive - len; i < endExclusive; i++) out = Math.max(out, values[i]);
  return Number.isFinite(out) ? out : null;
}

function maxDrawdownPct(curve: number[]): number {
  let peak = curve[0] ?? 100;
  let worst = 0;
  for (const v of curve) {
    peak = Math.max(peak, v);
    const dd = peak > 0 ? ((v - peak) / peak) * 100 : 0;
    worst = Math.min(worst, dd);
  }
  return worst;
}

export function runShortMomentumBacktest(
  candles: BacktestCandle[],
  opts: { symbol: string; interval: BacktestInterval; stopPct?: number; targetPct?: number; maxBars?: number }
): BacktestRunResult {
  const clean = candles
    .map((c) => ({
      time: c.time,
      open: n(c.open) ?? NaN,
      high: n(c.high) ?? NaN,
      low: n(c.low) ?? NaN,
      close: n(c.close) ?? NaN,
      volume: n(c.volume) ?? 0,
    }))
    .filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));

  const closes = clean.map((c) => c.close);
  const volumes = clean.map((c) => c.volume);
  const stopPct = opts.stopPct ?? 0.008;
  const targetPct = opts.targetPct ?? 0.014;
  const maxBars = opts.maxBars ?? 18;
  const trades: BacktestTrade[] = [];
  let i = 24;

  while (i < clean.length - 2) {
    const prevLow = rollingLow(closes, i, 16);
    const prevHigh = rollingHigh(closes, i, 16);
    const avgVol = rollingAverage(volumes, i, 20);
    if (prevLow == null || prevHigh == null || avgVol == null) {
      i++;
      continue;
    }

    const c = clean[i];
    const range = Math.max(1e-9, prevHigh - prevLow);
    const bearishBreak = c.close < prevLow && c.volume >= avgVol * 0.85;
    const rejection = c.high > prevHigh && c.close < (prevHigh - range * 0.35);
    if (!bearishBreak && !rejection) {
      i++;
      continue;
    }

    const entryIndex = i + 1;
    const entry = clean[entryIndex].open || clean[entryIndex].close;
    const stop = entry * (1 + stopPct);
    const target = entry * (1 - targetPct);
    let exit = clean[Math.min(clean.length - 1, entryIndex + maxBars)].close;
    let exitIndex = Math.min(clean.length - 1, entryIndex + maxBars);
    let outcome: BacktestTrade['outcome'] = 'TIME';

    for (let j = entryIndex; j <= Math.min(clean.length - 1, entryIndex + maxBars); j++) {
      const bar = clean[j];
      if (bar.high >= stop) { exit = stop; exitIndex = j; outcome = 'SL'; break; }
      if (bar.low <= target) { exit = target; exitIndex = j; outcome = 'TP'; break; }
    }

    const pnlPct = ((entry - exit) / entry) * 100;
    trades.push({
      id: `${opts.symbol}-${clean[entryIndex].time}-${trades.length}`,
      entryTime: clean[entryIndex].time,
      exitTime: clean[exitIndex].time,
      direction: 'SHORT',
      entry, exit, stop, target, pnlPct, outcome,
      barsHeld: Math.max(1, exitIndex - entryIndex + 1),
    });
    i = exitIndex + 4;
  }

  const equityCurve = [100];
  for (const t of trades) equityCurve.push(equityCurve[equityCurve.length - 1] * (1 + t.pnlPct / 100));
  const wins = trades.filter((t) => t.pnlPct > 0).length;
  const losses = trades.filter((t) => t.pnlPct < 0).length;
  const grossWin = trades.filter((t) => t.pnlPct > 0).reduce((s, t) => s + t.pnlPct, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.pnlPct < 0).reduce((s, t) => s + t.pnlPct, 0));
  const totalPnlPct = equityCurve.length > 1 ? equityCurve[equityCurve.length - 1] - 100 : 0;

  return {
    trades, equityCurve,
    summary: {
      symbol: opts.symbol, interval: opts.interval, candles: clean.length, trades: trades.length,
      wins, losses, timed: trades.filter((t) => t.outcome === 'TIME').length,
      winRate: trades.length ? wins / trades.length : 0,
      totalPnlPct, avgPnlPct: trades.length ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length : 0,
      maxDrawdownPct: maxDrawdownPct(equityCurve),
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
      acceptedCandidates: trades.length, rejectedCandidates: 0, rejectionCounts: {},
      strategy: 'SHORT_MOMENTUM_SMOKE',
    },
  };
}

function asCandlestick(c: BacktestCandle): Candlestick {
  return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
}

function average(values: number[]): number {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    sum += value;
    count += 1;
  }
  return count ? sum / count : 0;
}

function candlePressureProxy(c: BacktestCandle): number {
  const range = Math.max(1e-9, c.high - c.low);
  const closeLocation = ((c.close - c.low) / range) * 2 - 1;
  const body = MathEngine.clamp((c.close - c.open) / range);
  return parseFloat(MathEngine.clamp(closeLocation * 0.62 + body * 0.38).toFixed(6));
}

function signedVolumeProxyRange(candles: NormalizedBacktestCandle[], start: number, endExclusive: number): number {
  if (endExclusive <= start) return 0;
  let volumeSum = 0;
  let signed = 0;
  for (let index = start; index < endExclusive; index += 1) {
    const candle = candles[index];
    const volume = candle.volume || 0;
    const range = Math.max(1e-9, candle.high - candle.low);
    const bodyStrength = MathEngine.clamp((candle.close - candle.open) / range);
    volumeSum += volume;
    signed += bodyStrength * volume;
  }
  const avgVol = Math.max(1e-9, volumeSum / (endExclusive - start));
  return parseFloat((signed / avgVol).toFixed(6));
}

function oiExpansionProxyAt(precomputed: ReplayPrecomputation, index: number): number {
  const recentStart = Math.max(0, index - 8);
  const baseStart = Math.max(0, index - 32);
  const baseEnd = Math.max(0, index - 8);
  const recentCount = index - recentStart;
  const baseCount = baseEnd - baseStart;
  if (!recentCount || !baseCount) return 0;
  const recentSum = precomputed.volumePrefix[index] - precomputed.volumePrefix[recentStart];
  const baseSum = precomputed.volumePrefix[baseEnd] - precomputed.volumePrefix[baseStart];
  const recentAvg = recentSum / recentCount;
  const baseAvg = baseSum / baseCount;
  if (!recentAvg || !baseAvg) return 0;
  return parseFloat(MathEngine.clamp(((recentAvg / baseAvg) - 1) * 100, -1.5, 1.5).toFixed(6));
}

function buildReplaySummary(
  opts: {
    symbol: string;
    interval: BacktestInterval;
    candles: number;
    trades: BacktestTrade[];
    equityCurve: number[];
    accepted: number;
    rejected: number;
    rejectionCounts: Partial<Record<SignalDecisionReasonCode, number>>;
    strategy: BacktestSummary['strategy'];
    replayMode?: BacktestSummary['replayMode'];
    configOverrides?: BacktestSummary['configOverrides'];
    configuredScoreWeights?: ScoringWeights;
    effectiveScoreWeights?: ScoringWeights;
    smcAvailabilitySummary?: BacktestSummary['smcAvailabilitySummary'];
  }
): BacktestSummary {
  const { trades, equityCurve } = opts;
  let wins = 0;
  let losses = 0;
  let timed = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let pnlSum = 0;
  for (const trade of trades) {
    pnlSum += trade.pnlPct;
    if (trade.outcome === 'TIME') timed += 1;
    if (trade.pnlPct > 0) {
      wins += 1;
      grossWin += trade.pnlPct;
    } else if (trade.pnlPct < 0) {
      losses += 1;
      grossLoss += Math.abs(trade.pnlPct);
    }
  }
  return {
    symbol: opts.symbol, interval: opts.interval, candles: opts.candles, trades: trades.length,
    wins, losses, timed,
    winRate: trades.length ? wins / trades.length : 0,
    totalPnlPct: equityCurve.length > 1 ? equityCurve[equityCurve.length - 1] - 100 : 0,
    avgPnlPct: trades.length ? pnlSum / trades.length : 0,
    maxDrawdownPct: maxDrawdownPct(equityCurve),
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    acceptedCandidates: opts.accepted, rejectedCandidates: opts.rejected, rejectionCounts: opts.rejectionCounts,
    strategy: opts.strategy,
    replayMode: opts.replayMode ?? 'PROXY_REPLAY',
    configOverrides: opts.configOverrides,
    configuredScoreWeights: opts.configuredScoreWeights,
    effectiveScoreWeights: opts.effectiveScoreWeights,
    smcAvailabilitySummary: opts.smcAvailabilitySummary,
  };
}

function prepareReplayConfig(scannerConfig: ScannerConfig, directionBias: ScannerConfig['directionBias'], mode: 'replay_proxy' | 'replay_production') {
  const normalized = normalizeEffectiveScannerConfig({ ...scannerConfig, directionBias }, mode);
  return {
    cfg: { ...normalized.effective, scoreWeights: MathEngine.normalizeScoreWeights(normalized.effective.scoreWeights) },
    normalized,
  };
}

export interface ProductionReplayBarInput {
  timestamp: string | number;
  bidDepthUsd: number;
  askDepthUsd: number;
  imbalancePct: number;
  obi: number;
  signedVolumeDelta: number;
  spread: number;
  microPrice: number;
  fundingRate: number;
  /** Actual provider-recorded settlement event at this bar, when one occurred. */
  fundingEvent?: FundingEvent;
  openInterestChangePct?: number | null;
  sentiment?: BinanceSentiment | null;
  candles1m?: BacktestCandle[];
  candles5m?: BacktestCandle[];
  candles15m?: BacktestCandle[];
  candles4h?: BacktestCandle[];
  quality?: Partial<Record<'obi' | 'volumeDelta' | 'qStruct' | 'atr' | 'microPrice' | 'spread' | 'funding' | 'openInterest' | 'smc', 'VALID' | 'ESTIMATED' | 'MISSING' | 'STALE' | 'UNAVAILABLE'>>;
  /** Timestamp-aligned 13-stream evidence captured at this bar. Never synthesized by the replay engine. */
  parliamentSnapshot?: NativeParliamentSnapshotV1;
}

export interface ProductionReplayDataset {
  candles: BacktestCandle[];
  inputs: ProductionReplayBarInput[];
  /** Explicit provider coverage for realized funding accounting across this dataset. */
  fundingCoverage: FundingCoverage;
}

function toCoreCandle(c: BacktestCandle, timestamp = Date.parse(c.time)): Candle {
  return { timestamp, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
}

function appendProxy15m(hour: NormalizedBacktestCandle, rows: Candle[]): void {
  const points = [hour.open, (hour.open + hour.close) / 2, hour.close, hour.close];
  for (let part = 0; part < 4; part += 1) {
    const open = part === 0 ? hour.open : points[part - 1];
    const close = points[part];
    rows.push({
      timestamp: hour.timestamp + part * 15 * 60_000,
      open,
      close,
      high: Math.max(open, close, hour.high - (hour.high - Math.max(open, close)) * 0.45),
      low: Math.min(open, close, hour.low + (Math.min(open, close) - hour.low) * 0.45),
      volume: Math.max(0, hour.volume / 4),
    });
  }
}

function normalizeReplayCandles(candles: BacktestCandle[]): NormalizedBacktestCandle[] {
  const clean: NormalizedBacktestCandle[] = [];
  let sorted = true;
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  for (const candle of candles) {
    const timestamp = Date.parse(candle.time);
    const normalized: NormalizedBacktestCandle = {
      time: candle.time,
      timestamp,
      open: n(candle.open) ?? NaN,
      high: n(candle.high) ?? NaN,
      low: n(candle.low) ?? NaN,
      close: n(candle.close) ?? NaN,
      volume: n(candle.volume) ?? 0,
    };
    if (![normalized.open, normalized.high, normalized.low, normalized.close].every(Number.isFinite) || !Number.isFinite(timestamp)) continue;
    if (timestamp < previousTimestamp) sorted = false;
    previousTimestamp = timestamp;
    clean.push(normalized);
  }
  if (!sorted) clean.sort((left, right) => left.timestamp - right.timestamp);
  return clean;
}

function precomputeReplay(candles: BacktestCandle[]): ReplayPrecomputation {
  const clean = normalizeReplayCandles(candles);
  const engineCandles = new Array<Candlestick>(clean.length);
  const coreCandles = new Array<Candle>(clean.length);
  const proxy15mWindow = { rows: [] as Candle[], lastIndex: -1 };
  const volumePrefix = new Float64Array(clean.length + 1);
  for (let index = 0; index < clean.length; index += 1) {
    const candle = clean[index];
    engineCandles[index] = asCandlestick(candle);
    coreCandles[index] = toCoreCandle(candle, candle.timestamp);
    volumePrefix[index + 1] = volumePrefix[index] + (candle.volume || 0);
  }
  return { clean, engineCandles, coreCandles, proxy15mWindow, volumePrefix };
}

function proxy15mWindowAt(precomputed: ReplayPrecomputation, index: number): Candle[] {
  const state = precomputed.proxy15mWindow;
  const requiredStart = Math.max(0, index - 17);
  let appendStart = state.lastIndex + 1;
  if (state.lastIndex < requiredStart - 1 || index <= state.lastIndex) {
    state.rows.length = 0;
    appendStart = requiredStart;
  }
  for (let candleIndex = appendStart; candleIndex <= index; candleIndex += 1) {
    appendProxy15m(precomputed.clean[candleIndex], state.rows);
  }
  state.lastIndex = index;
  const maxRows = 18 * 4;
  if (state.rows.length > maxRows) state.rows.splice(0, state.rows.length - maxRows);
  return state.rows.slice();
}

function windowTickerStats(clean: NormalizedBacktestCandle[], start: number, endInclusive: number) {
  let volume = 0;
  let turnover = 0;
  let high = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  for (let index = start; index <= endInclusive; index += 1) {
    const row = clean[index];
    volume += row.volume;
    turnover += row.volume * row.close;
    if (row.high > high) high = row.high;
    if (row.low < low) low = row.low;
  }
  const count = Math.max(1, endInclusive - start + 1);
  return { volume, averageTurnover: turnover / count, high, low };
}

function proxyContext(precomputed: ReplayPrecomputation, i: number, symbol: string, cfg: ScannerConfig, direction: 'LONG' | 'SHORT') {
  const { clean, engineCandles, coreCandles } = precomputed;
  const historyStart = Math.max(0, i - 64);
  const engineHistory = engineCandles.slice(historyStart, i + 1);
  const c = clean[i];
  const atr = MathEngine.calculateATR(engineHistory, 14) || c.close * 0.006;
  const spread = Math.max(c.close * 0.00035, atr * 0.025);
  const pressure = candlePressureProxy(c);
  const qStructDirectional = MathEngine.calculateQStructDirectional({
    confluence1M: MathEngine.computeRealConfluence(engineHistory.slice(-16)),
    confluence5M: MathEngine.computeRealConfluence(engineHistory.slice(-32)),
    confluence15M: MathEngine.computeRealConfluence(engineHistory.slice(-64)),
    confluence1MAvailable: engineHistory.length >= 16,
    confluence5MAvailable: engineHistory.length >= 32,
    confluence15MAvailable: engineHistory.length >= 48,
  });
  const signedVolumeDelta = signedVolumeProxyRange(clean, Math.max(0, i - 8), i + 1);
  const oiChangePercent = oiExpansionProxyAt(precomputed, i);
  const stats = windowTickerStats(clean, historyStart, i);
  const ticker: SymbolTicker = {
    symbol, lastPrice: c.close, turnover24h: Math.max(10_000_000, stats.averageTurnover * 24),
    priceChange24hPct: i > historyStart ? ((c.close - clean[historyStart].close) / clean[historyStart].close) * 100 : 0,
    volume24h: stats.volume, high24h: stats.high, low24h: stats.low, fundingRate: 0, openInterest: 0,
    fundingQuality: 'ESTIMATED', dataState: 'live', timestamp: c.timestamp,
  };
  const bidDepthUsd = 500_000 * (1 + Math.max(-0.8, pressure));
  const askDepthUsd = 500_000 * (1 - Math.min(0.8, pressure));
  return {
    context: {
      ticker,
      candles1h: coreCandles.slice(historyStart, i + 1),
      candles15m: proxy15mWindowAt(precomputed, i),
      orderBook: { symbol, bidDepthUsd, askDepthUsd, imbalancePct: pressure * 100, dataState: 'live' as DataState, qualityState: 'ESTIMATED' as const },
      qStructDirectional,
      minLiquidityUsd: cfg.minVolume24hUsd,
      scannerConfig: cfg,
      mode: 'replay_proxy' as const,
      advancedInputs: {
        smoothedObi: pressure, smoothedVolDelta: signedVolumeDelta, qStructDirectional, atr,
        microPrice: c.close + pressure * spread * 0.5, spread, fundingRate: 0,
        oiChangePercent, oiTrend: oiChangePercent > 0.15 ? 'EXPANDING' as const : oiChangePercent < -0.15 ? 'CONTRACTING' as const : 'NEUTRAL' as const,
        quality: { obi: 'ESTIMATED' as const, volumeDelta: 'ESTIMATED' as const, qStruct: 'ESTIMATED' as const, atr: 'ESTIMATED' as const, microPrice: 'ESTIMATED' as const, spread: 'ESTIMATED' as const, funding: 'ESTIMATED' as const, openInterest: 'ESTIMATED' as const, smc: 'MISSING' as const },
      },
    },
    spread,
    spreadState: 'ESTIMATED' as const,
    fundingRate: 0,
    fundingState: 'ESTIMATED' as const,
    inputAvailability: { mode: 'PROXY_REPLAY', orderBook: 'ESTIMATED', funding: 'ESTIMATED', openInterest: 'ESTIMATED', smc: 'MISSING' },
  };
}

function productionContext(precomputed: ReplayPrecomputation, i: number, symbol: string, cfg: ScannerConfig, direction: 'LONG' | 'SHORT', input: ProductionReplayBarInput | undefined, parliamentMode: ParliamentScannerMode = 'SHADOW') {
  const { clean, engineCandles, coreCandles } = precomputed;
  const historyStart = Math.max(0, i - 64);
  const c = clean[i];
  const missing = !input;
  const stats = windowTickerStats(clean, historyStart, i);
  const ticker: SymbolTicker = {
    symbol, lastPrice: c.close, turnover24h: Math.max(10_000_000, stats.averageTurnover * 24),
    priceChange24hPct: i > historyStart ? ((c.close - clean[historyStart].close) / clean[historyStart].close) * 100 : 0,
    volume24h: stats.volume, high24h: stats.high, low24h: stats.low, fundingRate: input?.fundingRate ?? NaN, openInterest: 0,
    fundingQuality: input?.quality?.funding ?? (missing ? 'MISSING' : 'VALID'), dataState: missing ? 'unavailable' : 'live', timestamp: c.timestamp,
  };
  const convert = (rows?: BacktestCandle[]) => rows?.map((row) => toCoreCandle(row));
  const orderBook = input ? {
    symbol, bidDepthUsd: input.bidDepthUsd, askDepthUsd: input.askDepthUsd,
    imbalancePct: input.imbalancePct, dataState: 'live' as DataState, qualityState: input.quality?.obi ?? 'VALID',
  } : { symbol, bidDepthUsd: 0, askDepthUsd: 0, imbalancePct: 0, dataState: 'unavailable' as DataState, qualityState: 'MISSING' as const };
  const engineHistory = engineCandles.slice(historyStart, i + 1);
  const atr = MathEngine.calculateATR(engineHistory, 14) || null;
  const qStructDirectional = input?.quality?.qStruct === 'MISSING' ? null : MathEngine.calculateQStructDirectional({
    confluence1M: MathEngine.computeRealConfluence((input?.candles1m || []).map(asCandlestick)),
    confluence5M: MathEngine.computeRealConfluence((input?.candles5m || []).map(asCandlestick)),
    confluence15M: MathEngine.computeRealConfluence((input?.candles15m || []).map(asCandlestick)),
    confluence1MAvailable: (input?.candles1m?.length || 0) >= 16,
    confluence5MAvailable: (input?.candles5m?.length || 0) >= 16,
    confluence15MAvailable: (input?.candles15m?.length || 0) >= 12,
  });
  return {
    context: {
      ticker, candles1h: coreCandles.slice(historyStart, i + 1), candles15m: convert(input?.candles15m), candles1m: convert(input?.candles1m),
      candles5m: convert(input?.candles5m), candles4h: convert(input?.candles4h), orderBook,
      qStructDirectional, minLiquidityUsd: cfg.minVolume24hUsd, scannerConfig: cfg, mode: 'replay_production' as const,
      advancedInputs: input ? {
        smoothedObi: input.obi, smoothedVolDelta: input.signedVolumeDelta, qStructDirectional, atr,
        microPrice: input.microPrice, spread: input.spread, fundingRate: input.fundingRate,
        sentiment: input.sentiment ?? null, oiChangePercent: input.openInterestChangePct,
        oiTrend: (input.openInterestChangePct ?? 0) > 0.15 ? 'EXPANDING' as const : (input.openInterestChangePct ?? 0) < -0.15 ? 'CONTRACTING' as const : 'NEUTRAL' as const,
        quality: input.quality,
      } : { quality: { obi: 'MISSING' as const, volumeDelta: 'MISSING' as const, qStruct: 'MISSING' as const, atr: 'MISSING' as const, microPrice: 'MISSING' as const, spread: 'MISSING' as const, funding: 'MISSING' as const, openInterest: 'MISSING' as const, smc: 'MISSING' as const } },
      parliamentSnapshot: input?.parliamentSnapshot,
      parliamentMode,
    },
    spread: input?.spread ?? 0,
    spreadState: input?.quality?.spread ?? (input ? 'VALID' as const : 'MISSING' as const),
    fundingRate: input?.fundingRate ?? 0,
    fundingState: input?.quality?.funding ?? (input ? 'VALID' as const : 'MISSING' as const),
    inputAvailability: input ? Object.fromEntries(Object.entries(input.quality || {}).map(([key, value]) => [key, value || 'VALID'])) : { snapshot: 'MISSING' },
  };
}

function runCanonicalReplay(
  candles: BacktestCandle[],
  opts: {
    symbol: string;
    interval: BacktestInterval;
    scannerConfig: ScannerConfig;
    direction: 'LONG' | 'SHORT';
    maxBars?: number;
    mode: 'replay_proxy' | 'replay_production';
    inputs?: ProductionReplayBarInput[];
    fundingCoverage?: FundingCoverage;
    parliamentMode?: ParliamentScannerMode;
    transactionCostMultiplier?: number;
    strategyId?: string;
    strategyVersion?: number;
    academyEvaluationRole?: 'RESEARCH_EVALUATION' | 'PRODUCTION_REPLAY';
  },
): BacktestRunResult {
  const precomputed = precomputeReplay(candles);
  const { clean } = precomputed;
  const { cfg, normalized } = prepareReplayConfig(opts.scannerConfig, opts.direction === 'LONG' ? 'LONG_ONLY' : 'SHORT_ONLY', opts.mode);
  const inputByTimestamp = new Map((opts.inputs || []).map((input) => [typeof input.timestamp === 'number' ? input.timestamp : Date.parse(input.timestamp), input]));
  const smcAvailabilitySummary: Partial<Record<SmcAvailabilityState, number>> = {};
  const trades: BacktestTrade[] = [];
  const rejectionCounts: Partial<Record<SignalDecisionReasonCode, number>> = {};
  let accepted = 0;
  let rejected = 0;
  let productionAlignedBars = 0;
  let downgradedBars = 0;
  let tradePlanRejectedCandidates = 0;
  let riskRejectedCandidates = 0;
  let parliamentEvaluatedBars = 0;
  let parliamentEligibleBars = 0;
  let parliamentMaterialVetoCount = 0;
  let simulatedEquityUsd = 10_000;
  let equityPeakUsd = simulatedEquityUsd;
  let consecutiveLosses = 0;
  let i = 64;
  const maxBars = opts.maxBars ?? 24;
  const riskPolicy = loadRiskGovernorPolicy();

  while (i < clean.length - 2) {
    const c = clean[i];
    const prepared = opts.mode === 'replay_proxy'
      ? proxyContext(precomputed, i, opts.symbol, cfg, opts.direction)
      : productionContext(precomputed, i, opts.symbol, cfg, opts.direction, inputByTimestamp.get(c.timestamp), opts.parliamentMode ?? 'SHADOW');
    const snapshot = buildCanonicalDecision(prepared.context, opts.direction, { includeShadow: true, now: c.timestamp });
    if (snapshot.parliamentContribution) {
      parliamentEvaluatedBars += 1;
      if (snapshot.parliamentContribution.eligibleIfPromoted) parliamentEligibleBars += 1;
      parliamentMaterialVetoCount += snapshot.parliamentContribution.materialVetoes.length;
    }
    if (snapshot.smcAvailability) smcAvailabilitySummary[snapshot.smcAvailability] = (smcAvailabilitySummary[snapshot.smcAvailability] ?? 0) + 1;
    const productionCriticalQuality = snapshot.shadow?.inputQuality;
    const productionCriticalKeys = ['obi', 'volumeDelta', 'qStruct', 'atr', 'microPrice', 'spread', 'funding', 'openInterest'];
    const productionMissingCritical = opts.mode === 'replay_production' && (!productionCriticalQuality || productionCriticalKeys.some((key) =>
      ['MISSING', 'UNAVAILABLE', 'STALE', 'INSUFFICIENT_HISTORY'].includes(productionCriticalQuality[key] || 'MISSING')));
    const productionFullyAligned = opts.mode === 'replay_production'
      && !productionMissingCritical
      && productionCriticalKeys.every((key) => productionCriticalQuality?.[key] === 'VALID')
      && snapshot.smcAvailability === 'AVAILABLE';
    if (productionFullyAligned) productionAlignedBars += 1;
    else downgradedBars += 1;

    if (productionMissingCritical || snapshot.direction !== opts.direction) {
      rejected += 1;
      const reason = productionMissingCritical ? 'SNAPSHOT_UNAVAILABLE' : snapshot.shadow?.reasonCode ?? (snapshot.baseline.readinessTier === 'BLOCKED' ? 'DATA_NOT_READY' : 'GATES_FAILED');
      rejectionCounts[reason] = (rejectionCounts[reason] ?? 0) + 1;
      i += 1;
      continue;
    }

    const entryIndex = i + 1;
    const entry = clean[entryIndex].open || clean[entryIndex].close;
    const history = precomputed.engineCandles.slice(Math.max(0, i - 64), i + 1);
    const atr = MathEngine.calculateATR(history, 14) || entry * 0.006;
    const levelBands = MathEngine.buildLevels(entry, atr, opts.direction);
    const stop = levelBands.resistance[2];
    const targets = levelBands.breakout;
    const target = targets[0];
    const derivedLevels: DerivedLevels = {
      symbol: opts.symbol,
      entry,
      resistances: opts.direction === 'LONG' ? targets : [stop, stop, stop],
      supports: opts.direction === 'LONG' ? [stop, stop, stop] : targets,
      method: 'ATR_BANDS',
      atr14: atr,
      confidenceScore: snapshot.confidence * 100,
      evidenceList: [],
      riskReward: {
        nearestTarget: target,
        nearestStop: stop,
        rMultiple: Math.abs(target - entry) / Math.max(1e-9, Math.abs(entry - stop)),
        riskPct: Math.abs(entry - stop) / entry * 100,
      },
      dataState: 'live',
    };
    const plan = buildTradePlan({
      symbol: opts.symbol,
      direction: opts.direction,
      strategyId: opts.strategyId ?? null,
      strategyVersion: opts.strategyVersion ?? null,
      levels: derivedLevels,
      sizing: {
        accountBalanceUsd: simulatedEquityUsd,
        riskMode: 'PCT',
        riskValue: 1,
        leverage: 1,
        entryPrice: entry,
        stopLossPrice: stop,
        takeProfitPrice: target,
        direction: opts.direction,
        successProbModel: snapshot.calibratedProbability == null ? null : snapshot.calibratedProbability * 100,
        successProbUserOverride: null,
      },
      decisionRef: { score: snapshot.rankingScore, readinessTier: snapshot.baseline.readinessTier, engineVersion: snapshot.engineVersion, createdAt: snapshot.createdAt },
      spread: prepared.spread,
      spreadState: prepared.spreadState === 'UNAVAILABLE' ? 'MISSING' : prepared.spreadState,
      fundingRate: prepared.fundingRate,
      fundingState: prepared.fundingState === 'UNAVAILABLE' ? 'MISSING' : prepared.fundingState,
      now: c.timestamp,
      ttlMs: Math.max(60_000, clean[entryIndex].timestamp - c.timestamp + 60_000),
    });
    if (!plan.valid) {
      rejected += 1;
      tradePlanRejectedCandidates += 1;
      rejectionCounts.DATA_NOT_READY = (rejectionCounts.DATA_NOT_READY ?? 0) + 1;
      i += 1;
      continue;
    }
    const drawdownPct = equityPeakUsd > 0 ? Math.max(0, (equityPeakUsd - simulatedEquityUsd) / equityPeakUsd * 100) : 0;
    const isResearchEval = opts.academyEvaluationRole === 'RESEARCH_EVALUATION' || opts.mode === 'replay_proxy';
    const academyResolution = isResearchEval ? {
      status: 'NOT_APPLICABLE' as const,
      strategyId: opts.strategyId || 'canonical-replay',
      strategyVersion: opts.strategyVersion || 1,
      recordId: `${opts.strategyId || 'canonical-replay'}@${opts.strategyVersion || 1}`,
      intelligence: null,
      detail: 'RESEARCH_EVALUATION replay: evidence-producing run; Academy gate non-authorizing.',
    } : undefined;

    const risk = evaluateRiskGovernor({
      order: {
        symbol: opts.symbol,
        direction: opts.direction,
        quantity: plan.quantity,
        entryPrice: entry,
        notionalUsd: plan.sizing.positionSizeUsd,
        leverage: plan.leverage,
        reduceOnly: false,
        exchange: opts.mode === 'replay_proxy' ? 'proxy-replay' : 'production-replay',
        strategyId: opts.strategyId ?? null,
        strategyVersion: opts.strategyVersion ?? null,
        strategy: opts.strategyId ?? 'canonical-replay',
      },
      academyResolution,
      account: { equityUsd: simulatedEquityUsd, availableMarginUsd: simulatedEquityUsd, timestamp: c.timestamp },
      portfolio: {
        openPositionCount: 0,
        totalOpenRiskUsd: 0,
        symbolExposureUsd: 0,
        correlatedExposureUsd: 0,
        dailyPnlUsd: 0,
        weeklyPnlUsd: 0,
        drawdownPct,
        consecutiveLosses,
      },
      market: { dataState: 'live', ageMs: 0, exchangeDegraded: false, reconciliationHealthy: true },
      executionMode: 'AUTOMATED',
      plan,
      policy: riskPolicy,
      now: c.timestamp,
    });
    if (risk.decision === 'REJECTED' || risk.decision === 'DEFERRED') {
      rejected += 1;
      riskRejectedCandidates += 1;
      rejectionCounts.DATA_NOT_READY = (rejectionCounts.DATA_NOT_READY ?? 0) + 1;
      i += 1;
      continue;
    }
    accepted += 1;
    let exit = clean[Math.min(clean.length - 1, entryIndex + maxBars)].close;
    let exitIndex = Math.min(clean.length - 1, entryIndex + maxBars);
    let outcome: BacktestTrade['outcome'] = 'TIME';

    for (let j = entryIndex; j <= Math.min(clean.length - 1, entryIndex + maxBars); j++) {
      const bar = clean[j];
      if (opts.direction === 'SHORT') {
        if (bar.high >= stop) { exit = stop; exitIndex = j; outcome = 'SL'; break; }
        if (bar.low <= target) { exit = target; exitIndex = j; outcome = 'TP'; break; }
      } else {
        if (bar.low <= stop) { exit = stop; exitIndex = j; outcome = 'SL'; break; }
        if (bar.high >= target) { exit = target; exitIndex = j; outcome = 'TP'; break; }
      }
    }

    const grossPnlPct = opts.direction === 'SHORT' ? ((entry - exit) / entry) * 100 : ((exit - entry) / entry) * 100;
    const transactionCostMultiplier = Number.isFinite(opts.transactionCostMultiplier) && Number(opts.transactionCostMultiplier) > 0
      ? Number(opts.transactionCostMultiplier)
      : 1;
    const fundingEvents = opts.mode === 'replay_production'
      ? (opts.inputs ?? []).slice(entryIndex, exitIndex + 1).flatMap((row) => row?.fundingEvent ? [row.fundingEvent] : [])
      : [];
    const transactionCostPct = computeTransactionCostPct({
      entryPrice: entry,
      feePct: 0.12 * transactionCostMultiplier,
      spread: prepared.spread * transactionCostMultiplier,
      fundingRate: prepared.fundingRate,
      entryAt: clean[entryIndex].timestamp,
      exitAt: clean[exitIndex].timestamp,
      direction: opts.direction,
      fundingEvents,
      fundingCoverage: opts.fundingCoverage,
      fundingAccountingMode: opts.mode === 'replay_production' ? 'REALIZED_EVENT_TIME' : 'CONSERVATIVE_EXPECTED',
      fundingScheduleUtcHours: [0, 8, 16],
      fundingPolicy: 'CONSERVATIVE_NO_CREDIT',
    });
    const pnlPct = grossPnlPct - transactionCostPct;
    trades.push({
      id: `${opts.symbol}-${clean[entryIndex].time}-canonical-${trades.length}`,
      entryTime: clean[entryIndex].time, exitTime: clean[exitIndex].time, direction: opts.direction,
      entry, exit, stop, target, pnlPct, outcome, barsHeld: Math.max(1, exitIndex - entryIndex + 1),
      confidence: snapshot.confidence, rawScore: snapshot.rankingScore / 100,
      squeezeRiskScore: snapshot.shadow?.squeezeRiskScore ?? undefined,
      evidenceAgreementScore: snapshot.shadow?.evidenceAgreementScore ?? undefined,
      entryReason: `Canonical ${snapshot.authority ?? 'BASELINE_PROXY'} decision ${snapshot.decisionReasonCode ?? 'n/a'}; baseline guard ${snapshot.baseline.readinessTier}; advanced ${snapshot.shadow?.status ?? 'not_run'}.`,
      engineVersion: snapshot.engineVersion, featureCompletenessPct: snapshot.featureCompletenessPct,
      grossPnlPct, transactionCostPct, inputAvailability: prepared.inputAvailability,
      tradePlanId: plan.id, riskDecision: risk.decision, approvedQuantity: risk.approvedQuantity,
      marketRegime: snapshot.intelligence?.regime.regime,
      parliamentMode: snapshot.parliamentContribution?.mode,
      parliamentCategoryConfluence: snapshot.parliamentContribution?.categoryConfluence,
      parliamentEligibleIfPromoted: snapshot.parliamentContribution?.eligibleIfPromoted,
    });
    const tradePnlUsd = simulatedEquityUsd * (pnlPct / 100);
    simulatedEquityUsd = Math.max(0.01, simulatedEquityUsd + tradePnlUsd);
    equityPeakUsd = Math.max(equityPeakUsd, simulatedEquityUsd);
    consecutiveLosses = pnlPct < 0 ? consecutiveLosses + 1 : 0;
    i = exitIndex + 4;
  }

  const equityCurve = [100];
  for (const trade of trades) equityCurve.push(equityCurve[equityCurve.length - 1] * (1 + trade.pnlPct / 100));
  return {
    trades,
    equityCurve,
    summary: {
      ...buildReplaySummary({
        symbol: opts.symbol, interval: opts.interval, candles: clean.length, trades, equityCurve, accepted, rejected, rejectionCounts,
        strategy: opts.mode === 'replay_proxy' ? 'PROXY_REPLAY' : 'APEX_REPLAY', replayMode: opts.mode === 'replay_proxy' ? 'PROXY_REPLAY' : 'PRODUCTION_INPUT',
        configOverrides: normalized.overrides, configuredScoreWeights: normalized.configured.scoreWeights, effectiveScoreWeights: cfg.scoreWeights, smcAvailabilitySummary,
      }),
      productionAlignedBars,
      downgradedBars,
      tradePlanRejectedCandidates,
      riskRejectedCandidates,
      parliamentEvaluatedBars,
      parliamentEligibleBars,
      parliamentMaterialVetoCount,
      engineVersion: DECISION_ADAPTER_VERSION,
    },
  };
}

export function runApexReplayBacktest(
  candles: BacktestCandle[],
  opts: { symbol: string; interval: BacktestInterval; scannerConfig: ScannerConfig; maxBars?: number },
): BacktestRunResult {
  return runCanonicalReplay(candles, { ...opts, direction: 'SHORT', mode: 'replay_proxy' });
}

export function runApexReplayBacktestDirectional(
  candles: BacktestCandle[],
  opts: {
    symbol: string;
    interval: BacktestInterval;
    scannerConfig: ScannerConfig;
    direction: 'LONG' | 'SHORT';
    maxBars?: number;
    strategyId?: string;
    strategyVersion?: number;
    academyEvaluationRole?: 'RESEARCH_EVALUATION' | 'PRODUCTION_REPLAY';
  },
): BacktestRunResult {
  return runCanonicalReplay(candles, { ...opts, mode: 'replay_proxy' });
}

export function runApexProductionInputReplay(
  dataset: ProductionReplayDataset,
  opts: {
    symbol: string;
    interval: BacktestInterval;
    scannerConfig: ScannerConfig;
    direction: 'LONG' | 'SHORT';
    maxBars?: number;
    parliamentMode?: ParliamentScannerMode;
    transactionCostMultiplier?: number;
    strategyId?: string;
    strategyVersion?: number;
    academyEvaluationRole?: 'RESEARCH_EVALUATION' | 'PRODUCTION_REPLAY';
  },
): BacktestRunResult {
  return runCanonicalReplay(dataset.candles, { ...opts, mode: 'replay_production', inputs: dataset.inputs, fundingCoverage: dataset.fundingCoverage });
}
