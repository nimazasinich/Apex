import type { BacktestCandle } from '../backtesting';
import type { BacktestInterval, StrategyReplayResult } from '../../types';
import { computeTransactionCostPct, transactionCostInputsFromModel, type TransactionCostModel } from '../transactionCosts';
import type { HistoricalSignalBundle } from './historicalSignals';

export interface StrategyRunContext {
  symbol: string;
  interval: BacktestInterval;
  direction: 'LONG' | 'SHORT' | 'BOTH';
  maxBars: number;
  candles: BacktestCandle[];
  universeCandles?: Record<string, BacktestCandle[]>;
  parameters?: Record<string, number | string>;
  transactionCostModel: TransactionCostModel;
  historicalSignals?: HistoricalSignalBundle;
}

export type StrategyRunFn = (ctx: StrategyRunContext) => StrategyReplayResult;

export interface PortfolioRiskPolicy {
  policyVersion: string;
  maxGrossExposureFraction: number;
  maxRiskPerTradePct: number;
  softDrawdownPct: number;
  hardDrawdownPct: number;
  softThrottleFraction: number;
}

export const DEFAULT_PORTFOLIO_RISK_POLICY: PortfolioRiskPolicy = {
  policyVersion: 'portfolio-risk-cap-v1',
  maxGrossExposureFraction: 0.35,
  maxRiskPerTradePct: 0.75,
  softDrawdownPct: 8,
  hardDrawdownPct: 12,
  softThrottleFraction: 0.5,
};

/**
 * Converts price-return trades into portfolio-return trades with a fixed risk
 * budget, gross-exposure cap, drawdown throttle and hard shutdown. The policy is
 * applied in chronological order and never consults future candles or results.
 */
export function applyPortfolioRiskPolicy(
  input: StrategyReplayResult['trades'],
  policy: PortfolioRiskPolicy = DEFAULT_PORTFOLIO_RISK_POLICY,
): { trades: StrategyReplayResult['trades']; skippedAfterShutdown: number; throttledTrades: number } {
  const ordered = [...input].sort((left, right) => Date.parse(left.entryTime) - Date.parse(right.entryTime));
  const trades: StrategyReplayResult['trades'] = [];
  let equity = 100;
  let peak = 100;
  let shutdown = false;
  let skippedAfterShutdown = 0;
  let throttledTrades = 0;

  for (const trade of ordered) {
    if (shutdown) { skippedAfterShutdown += 1; continue; }
    const drawdownPct = peak > 0 ? ((peak - equity) / peak) * 100 : policy.hardDrawdownPct;
    const throttle = drawdownPct >= policy.softDrawdownPct ? policy.softThrottleFraction : 1;
    if (throttle < 1) throttledTrades += 1;
    const stopRiskPct = trade.entry > 0 ? Math.abs(trade.entry - trade.stop) / trade.entry * 100 : Number.POSITIVE_INFINITY;
    const riskSizedExposure = stopRiskPct > 0 && Number.isFinite(stopRiskPct) ? policy.maxRiskPerTradePct / stopRiskPct : 0;
    const exposureFraction = Math.max(0, Math.min(policy.maxGrossExposureFraction, riskSizedExposure * throttle));
    const grossPnlPct = Number.isFinite(trade.unscaledGrossPnlPct)
      ? Number(trade.unscaledGrossPnlPct)
      : Number.isFinite(trade.grossPnlPct)
        ? Number(trade.grossPnlPct)
        : trade.pnlPct + Number(trade.transactionCostPct || 0);
    const transactionCostPct = Number.isFinite(trade.unscaledTransactionCostPct)
      ? Number(trade.unscaledTransactionCostPct)
      : Number(trade.transactionCostPct || 0);
    const portfolioPnlPct = (grossPnlPct - transactionCostPct) * exposureFraction;
    const governed = {
      ...trade,
      grossPnlPct: grossPnlPct * exposureFraction,
      transactionCostPct: transactionCostPct * exposureFraction,
      pnlPct: portfolioPnlPct,
      portfolioPnlPct,
      exposureFraction,
      unscaledGrossPnlPct: grossPnlPct,
      unscaledTransactionCostPct: transactionCostPct,
    };
    trades.push(governed);
    equity *= 1 + portfolioPnlPct / 100;
    peak = Math.max(peak, equity);
    const nextDrawdown = peak > 0 ? ((peak - equity) / peak) * 100 : policy.hardDrawdownPct;
    if (nextDrawdown >= policy.hardDrawdownPct) shutdown = true;
  }
  return { trades, skippedAfterShutdown, throttledTrades };
}

export function sanitizeCandles(candles: BacktestCandle[]): BacktestCandle[] {
  const cleaned: Array<BacktestCandle & { __timestamp: number }> = [];
  let ordered = true;
  let previousTimestamp = Number.NEGATIVE_INFINITY;

  for (const candle of candles) {
    const timestamp = Date.parse(candle.time);
    const row = {
      time: candle.time,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: Number(candle.volume || 0),
      __timestamp: timestamp,
    };
    const finite = Number.isFinite(timestamp) && [row.open, row.high, row.low, row.close, row.volume].every(Number.isFinite);
    const geometry = row.open > 0 && row.high > 0 && row.low > 0 && row.close > 0 && row.volume >= 0
      && row.high >= Math.max(row.open, row.close, row.low)
      && row.low <= Math.min(row.open, row.close, row.high);
    if (!finite || !geometry) continue;
    if (timestamp < previousTimestamp) ordered = false;
    previousTimestamp = timestamp;
    cleaned.push(row);
  }

  if (!ordered) cleaned.sort((left, right) => left.__timestamp - right.__timestamp);

  const deduplicated: BacktestCandle[] = [];
  let lastTimestamp = Number.NEGATIVE_INFINITY;
  for (const row of cleaned) {
    const normalized = { time: row.time, open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume };
    if (row.__timestamp === lastTimestamp) deduplicated[deduplicated.length - 1] = normalized;
    else {
      deduplicated.push(normalized);
      lastTimestamp = row.__timestamp;
    }
  }
  return deduplicated;
}

export interface ReplayIndicatorCache {
  closes: number[];
  volumes: number[];
  smaClose: (endExclusive: number, length: number) => number | null;
  smaVolume: (endExclusive: number, length: number) => number | null;
  stdClose: (endExclusive: number, length: number) => number | null;
  atr: (endExclusive: number, length: number) => number | null;
  vwap: (endExclusive: number, length: number) => number | null;
}

function prefixSeries(values: number[]): number[] {
  const prefix = new Array<number>(values.length + 1).fill(0);
  for (let index = 0; index < values.length; index += 1) prefix[index + 1] = prefix[index] + values[index];
  return prefix;
}

function windowSum(prefix: number[], endExclusive: number, length: number): number | null {
  if (!Number.isInteger(endExclusive) || !Number.isInteger(length) || length <= 0 || endExclusive < length || endExclusive > prefix.length - 1) return null;
  return prefix[endExclusive] - prefix[endExclusive - length];
}

/**
 * Builds O(1) rolling SMA, standard-deviation, ATR, and VWAP lookups once per
 * replay. This is intentionally local to a replay so optimization runs share no
 * mutable indicator state and remain deterministic.
 */
export function buildReplayIndicatorCache(candles: BacktestCandle[]): ReplayIndicatorCache {
  const closes = candles.map((row) => row.close);
  const volumes = candles.map((row) => row.volume);
  const closePrefix = prefixSeries(closes);
  // Variance is translation-invariant. Centering before prefixing squared values avoids
  // catastrophic cancellation from E[x^2] - E[x]^2 on high-priced instruments (BTC)
  // while preserving O(1) window lookups.
  const closeAnchor = closes.find(Number.isFinite) ?? 0;
  const centeredCloses = closes.map((value) => value - closeAnchor);
  const centeredClosePrefix = prefixSeries(centeredCloses);
  const centeredCloseSquarePrefix = prefixSeries(centeredCloses.map((value) => value * value));
  const volumePrefix = prefixSeries(volumes);
  const trueRangePrefix = prefixSeries(candles.map((_row, index) => trueRange(candles, index)));
  const typicalVolumePrefix = prefixSeries(candles.map((row) => ((row.high + row.low + row.close) / 3) * row.volume));

  const meanFrom = (prefix: number[], endExclusive: number, length: number): number | null => {
    const sum = windowSum(prefix, endExclusive, length);
    return sum === null ? null : sum / length;
  };

  return {
    closes,
    volumes,
    smaClose: (endExclusive, length) => meanFrom(closePrefix, endExclusive, length),
    smaVolume: (endExclusive, length) => meanFrom(volumePrefix, endExclusive, length),
    stdClose: (endExclusive, length) => {
      const centeredSum = windowSum(centeredClosePrefix, endExclusive, length);
      const centeredSquareSum = windowSum(centeredCloseSquarePrefix, endExclusive, length);
      if (centeredSum === null || centeredSquareSum === null) return null;
      const centeredMean = centeredSum / length;
      const variance = Math.max(0, centeredSquareSum / length - centeredMean * centeredMean);
      // Very short windows on high-price, low-volatility series can still lose
      // several ULPs even after global centering because two centered values may
      // be large and nearly equal. Keep the O(1) path for normal replay use, but
      // use the exact two-pass calculation for tiny windows where correctness is
      // more important than saving a handful of operations.
      if (length <= 8) {
        const window = closes.slice(endExclusive - length, endExclusive);
        const mean = average(window);
        return Math.sqrt(average(window.map((value) => (value - mean) ** 2)));
      }
      return Math.sqrt(variance);
    },
    atr: (endExclusive, length) => meanFrom(trueRangePrefix, endExclusive, length),
    vwap: (endExclusive, length) => {
      const volume = windowSum(volumePrefix, endExclusive, length);
      const typicalVolume = windowSum(typicalVolumePrefix, endExclusive, length);
      return volume === null || typicalVolume === null || volume <= 0 ? null : typicalVolume / volume;
    },
  };
}

function lowerBound(values: number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Rolling percentile without sorting a complete lookback window on every bar. */
export function rollingPercentileSeries(values: number[], lookback: number, percentile: number): Array<number | null> {
  const output: Array<number | null> = new Array(values.length).fill(null);
  if (!Number.isInteger(lookback) || lookback < 1) return output;
  const sorted: number[] = [];
  const boundedPercentile = Math.max(0, Math.min(1, percentile));

  for (let index = 0; index < values.length; index += 1) {
    const incoming = values[index];
    if (Number.isFinite(incoming)) sorted.splice(lowerBound(sorted, incoming), 0, incoming);
    if (index >= lookback) {
      const outgoing = values[index - lookback];
      if (Number.isFinite(outgoing)) {
        const removal = lowerBound(sorted, outgoing);
        if (removal < sorted.length && sorted[removal] === outgoing) sorted.splice(removal, 1);
      }
    }
    if (index >= lookback - 1 && sorted.length) {
      output[index] = sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * boundedPercentile))];
    }
  }
  return output;
}

export function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function sma(values: number[], endExclusive: number, length: number): number | null {
  if (endExclusive < length || length <= 0) return null;
  return average(values.slice(endExclusive - length, endExclusive));
}

export function emaSeries(values: number[], length: number): number[] {
  if (!values.length) return [];
  const alpha = 2 / (length + 1);
  const out = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    out.push(values[index] * alpha + out[index - 1] * (1 - alpha));
  }
  return out;
}

export function trueRange(candles: BacktestCandle[], index: number): number {
  const row = candles[index];
  const previousClose = candles[Math.max(0, index - 1)]?.close ?? row.close;
  return Math.max(row.high - row.low, Math.abs(row.high - previousClose), Math.abs(row.low - previousClose));
}

export function atr(candles: BacktestCandle[], endExclusive: number, length: number): number | null {
  if (endExclusive < length + 1) return null;
  const values: number[] = [];
  for (let index = endExclusive - length; index < endExclusive; index += 1) values.push(trueRange(candles, index));
  return average(values);
}

export function rollingStd(values: number[], endExclusive: number, length: number): number | null {
  if (endExclusive < length) return null;
  const window = values.slice(endExclusive - length, endExclusive);
  const mean = average(window);
  return Math.sqrt(average(window.map((value) => (value - mean) ** 2)));
}

export function rollingVwap(candles: BacktestCandle[], endExclusive: number, length: number): number | null {
  if (endExclusive < length) return null;
  let numerator = 0;
  let denominator = 0;
  for (let index = endExclusive - length; index < endExclusive; index += 1) {
    const row = candles[index];
    const typical = (row.high + row.low + row.close) / 3;
    numerator += typical * row.volume;
    denominator += row.volume;
  }
  return denominator > 0 ? numerator / denominator : null;
}

export function finalizeReplay(
  candles: BacktestCandle[],
  rawTrades: StrategyReplayResult['trades'],
  strategyId: string,
  rejectedCandidates = 0,
  rejectionCounts: Record<string, number> = {},
  riskPolicy: PortfolioRiskPolicy = DEFAULT_PORTFOLIO_RISK_POLICY,
): StrategyReplayResult {
  const governed = applyPortfolioRiskPolicy(rawTrades, riskPolicy);
  const trades = governed.trades;
  const equityCurve = [100];
  let grossWins = 0;
  let grossLosses = 0;
  let wins = 0;
  let losses = 0;
  let timed = 0;

  trades.forEach((trade) => {
    equityCurve.push(equityCurve[equityCurve.length - 1] * (1 + trade.pnlPct / 100));
    // Performance wins/losses are net-of-cost outcomes. TP/SL/TIMEOUT remains
    // the execution outcome on the trade itself; a tiny TP that loses money
    // after fees/slippage must not inflate win rate or profit factor.
    if (trade.pnlPct > 0) { wins += 1; grossWins += trade.pnlPct; }
    else if (trade.pnlPct < 0) { losses += 1; grossLosses += Math.abs(trade.pnlPct); }
    if (trade.outcome === 'TIMEOUT') timed += 1;
  });

  let peak = equityCurve[0] ?? 100;
  let maxDrawdownPct = 0;
  equityCurve.forEach((equity) => {
    peak = Math.max(peak, equity);
    if (peak > 0) maxDrawdownPct = Math.min(maxDrawdownPct, ((equity - peak) / peak) * 100);
  });

  const totalPnlPct = (equityCurve.at(-1) ?? 100) - 100;
  const avgPnlPct = trades.length ? trades.reduce((sum, trade) => sum + trade.pnlPct, 0) / trades.length : 0;
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Number.POSITIVE_INFINITY : 0;

  return {
    trades,
    equityCurve,
    summary: {
      candles: candles.length,
      trades: trades.length,
      wins,
      losses,
      timed,
      winRate: trades.length ? wins / trades.length : 0,
      avgPnlPct,
      totalPnlPct,
      maxDrawdownPct: Math.abs(maxDrawdownPct),
      profitFactor,
      acceptedCandidates: trades.length,
      rejectedCandidates,
      rejectionCounts,
      strategy: strategyId,
      replayMode: 'DETERMINISTIC_STRATEGY_REPLAY',
      riskPolicy: {
        policyVersion: riskPolicy.policyVersion,
        maxGrossExposureFraction: riskPolicy.maxGrossExposureFraction,
        maxRiskPerTradePct: riskPolicy.maxRiskPerTradePct,
        softDrawdownPct: riskPolicy.softDrawdownPct,
        hardDrawdownPct: riskPolicy.hardDrawdownPct,
        skippedAfterShutdown: governed.skippedAfterShutdown,
        throttledTrades: governed.throttledTrades,
      },
    },
  };
}

export function simulateBracketTrade(args: {
  candles: BacktestCandle[];
  signalIndex: number;
  direction: 'LONG' | 'SHORT';
  stopDistance: number;
  targetDistance: number;
  maxBars: number;
  transactionCostModel: TransactionCostModel;
  rawScore?: number;
  confidence?: number;
  entryReason: string;
}): StrategyReplayResult['trades'][number] {
  const { candles, signalIndex, direction, stopDistance, targetDistance, maxBars, transactionCostModel } = args;
  const entryIndex = signalIndex + 1;
  const entryBar = candles[entryIndex];
  if (!entryBar) throw new Error('A signal must have a following candle available for a causal next-bar fill.');
  const entry = entryBar.open || entryBar.close;
  const stop = direction === 'LONG' ? entry - stopDistance : entry + stopDistance;
  const target = direction === 'LONG' ? entry + targetDistance : entry - targetDistance;
  let exit = entry;
  let exitIndex = Math.min(candles.length - 1, entryIndex + maxBars);
  let outcome: 'TP' | 'SL' | 'TIMEOUT' = 'TIMEOUT';

  for (let index = entryIndex; index <= exitIndex; index += 1) {
    const bar = candles[index];
    const hitStop = direction === 'LONG' ? bar.low <= stop : bar.high >= stop;
    const hitTarget = direction === 'LONG' ? bar.high >= target : bar.low <= target;
    if (hitStop && hitTarget) { outcome = 'SL'; exit = stop; exitIndex = index; break; }
    if (hitStop) { outcome = 'SL'; exit = stop; exitIndex = index; break; }
    if (hitTarget) { outcome = 'TP'; exit = target; exitIndex = index; break; }
    exit = bar.close;
  }

  const grossPnlPct = direction === 'LONG' ? ((exit - entry) / entry) * 100 : ((entry - exit) / entry) * 100;
  const barsHeld = Math.max(1, exitIndex - entryIndex + 1);
  const entryAt = Date.parse(entryBar.time);
  const exitAt = Date.parse(candles[exitIndex].time);
  const transactionCostPct = computeTransactionCostPct(transactionCostInputsFromModel(transactionCostModel, entry, {
    entryAt,
    exitAt,
    direction,
    fundingEvents: [], // historical funding requires a bound event dataset; never inferred from bars
  }));
  return {
    entryTime: entryBar.time,
    exitTime: candles[exitIndex].time,
    entry,
    exit,
    stop,
    target,
    outcome,
    pnlPct: grossPnlPct - transactionCostPct,
    grossPnlPct,
    transactionCostPct,
    barsHeld,
    rawScore: args.rawScore,
    confidence: args.confidence,
    entryReason: args.entryReason,
  };
}
