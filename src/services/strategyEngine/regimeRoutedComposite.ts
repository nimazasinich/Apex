import type { BacktestCandle } from '../backtesting';
import type { StrategyReplayTrade } from '../../types';
import { runAdaptiveTrendPortfolio } from './adaptiveTrendPortfolio';
import { runOrbVwapBreakout } from './orbVwapBreakout';
import type { StrategyRunContext, StrategyRunFn } from './replayHarness';
import { atr, emaSeries, finalizeReplay, rollingStd, rollingVwap, sanitizeCandles, sma } from './replayHarness';
import { runVolatilitySqueezeExpansion } from './volatilitySqueezeExpansion';
import { runVwapPullbackReacceleration } from './vwapPullbackReacceleration';

type ChildKey = 'trend' | 'squeeze' | 'breakout' | 'pullback';

interface RouteDecision {
  child: ChildKey | null;
  confidence: number;
  scores: Record<ChildKey, number>;
  reason: string;
}

const CHILD_RUNNERS: Record<ChildKey, StrategyRunFn> = {
  trend: runAdaptiveTrendPortfolio,
  squeeze: runVolatilitySqueezeExpansion,
  breakout: runOrbVwapBreakout,
  pullback: runVwapPullbackReacceleration,
};

const ROUTER_BLOCK_BARS = 96;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const finiteParameter = (ctx: StrategyRunContext, key: string, fallback: number): number => {
  const value = Number(ctx.parameters?.[key]);
  return Number.isFinite(value) ? value : fallback;
};

function classifyRegime(historyInput: BacktestCandle[], ctx: StrategyRunContext): RouteDecision {
  const history = sanitizeCandles(historyInput);
  if (history.length < 220) {
    return { child: null, confidence: 0, scores: { trend: 0, squeeze: 0, breakout: 0, pullback: 0 }, reason: 'At least 220 closed candles are required for causal routing.' };
  }

  const closes = history.map((row) => row.close);
  const volumes = history.map((row) => row.volume);
  const index = history.length - 1;
  const ema20 = emaSeries(closes, 20)[index];
  const ema50 = emaSeries(closes, 50)[index];
  const ema200 = emaSeries(closes, 200)[index];
  const currentAtr = atr(history, history.length, 14) ?? 0;
  const price = closes[index] || 1;
  const std20 = rollingStd(closes, history.length, 20) ?? 0;
  const priorStd = rollingStd(closes, history.length - 20, 60) ?? std20;
  const averageVolume = sma(volumes, history.length - 1, 30) ?? 0;
  const recentVolume = volumes[index] ?? 0;
  const relativeVolume = averageVolume > 0 ? recentVolume / averageVolume : 0;
  const recentHigh = Math.max(...history.slice(-24).map((row) => row.high));
  const recentLow = Math.min(...history.slice(-24).map((row) => row.low));
  const rangeExpansion = currentAtr > 0 ? (recentHigh - recentLow) / (currentAtr * 6) : 0;
  const vwap = rollingVwap(history, history.length, 48) ?? price;
  const trendAlignment = Math.sign(ema20 - ema50) === Math.sign(ema50 - ema200) ? 1 : 0.35;
  const trendStrength = currentAtr > 0 ? Math.abs(ema20 - ema200) / (currentAtr * 5) : 0;
  const pullbackDistance = currentAtr > 0 ? Math.abs(price - vwap) / currentAtr : 3;
  const compression = priorStd > 0 ? 1 - std20 / priorStd : 0;

  const raw: Record<ChildKey, number> = {
    trend: clamp01(trendAlignment * trendStrength),
    squeeze: clamp01(compression * 1.7 + Math.max(0, 1.05 - relativeVolume) * 0.15),
    breakout: clamp01(Math.max(0, relativeVolume - 1) * 0.55 + Math.max(0, rangeExpansion - 0.65) * 0.45),
    pullback: clamp01(trendAlignment * trendStrength * clamp01(1 - pullbackDistance / 2.2)),
  };
  const weighted: Record<ChildKey, number> = {
    trend: raw.trend * finiteParameter(ctx, 'trendWeight', 1),
    squeeze: raw.squeeze * finiteParameter(ctx, 'squeezeWeight', 1),
    breakout: raw.breakout * finiteParameter(ctx, 'breakoutWeight', 1),
    pullback: raw.pullback * finiteParameter(ctx, 'pullbackWeight', 1),
  };
  const ordered = (Object.entries(weighted) as Array<[ChildKey, number]>).sort((left, right) => right[1] - left[1]);
  const [winner, winnerScore] = ordered[0];
  const runnerUp = ordered[1]?.[1] ?? 0;
  const confidence = clamp01(winnerScore * 0.75 + Math.max(0, winnerScore - runnerUp) * 0.5);
  const child = winnerScore >= 0.24 && confidence >= 0.22 ? winner : null;
  return {
    child,
    confidence,
    scores: weighted,
    reason: child
      ? `${child} selected from prior-only regime evidence (${winnerScore.toFixed(3)} vs ${runnerUp.toFixed(3)}).`
      : `Router abstained because regime evidence was weak (${winnerScore.toFixed(3)}).`,
  };
}

function tradeIdentity(trade: StrategyReplayTrade): string {
  return `${trade.entryTime}|${trade.entry.toFixed(10)}|${trade.stop.toFixed(10)}|${trade.target.toFixed(10)}`;
}

/**
 * Causal, block-routed composite. The child for each block is selected only from
 * candles that closed before the block starts; future candles cannot influence
 * the routing decision. Child rules, risk and exits remain unchanged.
 */
export const runRegimeRoutedComposite: StrategyRunFn = (ctx) => {
  const candles = sanitizeCandles(ctx.candles);
  if (candles.length < 260) return finalizeReplay(candles, [], 'regime-routed-ai-ensemble-v1');

  const warmupBars = 240;
  const routeBars = ROUTER_BLOCK_BARS;
  const routedTrades: StrategyReplayTrade[] = [];
  const seen = new Set<string>();
  const routeCounts: Record<ChildKey | 'abstain', number> = { trend: 0, squeeze: 0, breakout: 0, pullback: 0, abstain: 0 };
  const routeReasons: string[] = [];

  for (let blockStart = warmupBars; blockStart < candles.length - 2; blockStart += routeBars) {
    const blockEnd = Math.min(candles.length, blockStart + routeBars);
    const decision = classifyRegime(candles.slice(Math.max(0, blockStart - warmupBars), blockStart), ctx);
    if (!decision.child) {
      routeCounts.abstain += 1;
      routeReasons.push(`bar ${blockStart}: ${decision.reason}`);
      continue;
    }
    routeCounts[decision.child] += 1;
    routeReasons.push(`bar ${blockStart}: ${decision.reason}`);
    const sliceStart = Math.max(0, blockStart - warmupBars);
    const childCandles = candles.slice(sliceStart, blockEnd);
    const blockStartTime = Date.parse(candles[blockStart].time);
    const blockEndTime = blockEnd < candles.length ? Date.parse(candles[blockEnd].time) : Number.POSITIVE_INFINITY;
    const childResult = CHILD_RUNNERS[decision.child]({ ...ctx, candles: childCandles });
    for (const trade of childResult.trades) {
      const entryTime = Date.parse(trade.entryTime);
      if (!Number.isFinite(entryTime) || entryTime < blockStartTime || entryTime >= blockEndTime) continue;
      const key = tradeIdentity(trade);
      if (seen.has(key)) continue;
      seen.add(key);
      routedTrades.push({ ...trade, entryReason: `[${decision.child} router ${decision.confidence.toFixed(2)}] ${trade.entryReason}` });
    }
  }

  routedTrades.sort((left, right) => Date.parse(left.entryTime) - Date.parse(right.entryTime));
  const result = finalizeReplay(candles, routedTrades, 'regime-routed-ai-ensemble-v1');
  result.summary.replayMode = 'CAUSAL_BLOCK_REGIME_ROUTER';
  result.summary.configOverrides = [
    {
      field: 'router.blockBars',
      configured: ROUTER_BLOCK_BARS,
      effective: routeBars,
      reason: 'Bounded causal routing cadence; each decision uses prior closed candles only.',
      policyVersion: 'regime-router-v1',
    },
    {
      field: 'router.routes',
      configured: 'dynamic',
      effective: Object.entries(routeCounts).map(([key, value]) => `${key}:${value}`).join(','),
      reason: routeReasons.slice(-6).join(' | '),
      policyVersion: 'regime-router-v1',
    },
  ];
  return result;
};
