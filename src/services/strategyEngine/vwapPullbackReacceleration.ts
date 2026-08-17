import type { StrategyRunFn } from './replayHarness';
import { buildReplayIndicatorCache, emaSeries, finalizeReplay, sanitizeCandles, simulateBracketTrade } from './replayHarness';

export const runVwapPullbackReacceleration: StrategyRunFn = (ctx) => {
  const candles = sanitizeCandles(ctx.candles);
  const indicators = buildReplayIndicatorCache(candles);
  const closes = indicators.closes;
  const ema20 = emaSeries(closes, 20);
  const ema50 = emaSeries(closes, 50);
  const ema200 = emaSeries(closes, 200);
  const vwapLength = Number(ctx.parameters?.vwapLength ?? 48);
  const pullbackAtr = Number(ctx.parameters?.pullbackAtrTolerance ?? 0.35);
  const volumeThreshold = Number(ctx.parameters?.reaccelerationVolume ?? 1.15);
  const stopAtr = Number(ctx.parameters?.atrStopMultiplier ?? 1.15);
  const rewardRisk = Number(ctx.parameters?.rewardRisk ?? 1.9);
  const trades: Array<ReturnType<typeof simulateBracketTrade>> = [];
  let rejected = 0;
  const rejectionCounts: Record<string, number> = {};
  let nextEligibleIndex = 0;

  for (let index = 210; index < candles.length - 1; index += 1) {
    if (index < nextEligibleIndex) continue;
    const currentAtr = indicators.atr(index, 14);
    const vwap = indicators.vwap(index, vwapLength);
    const priorVwap = indicators.vwap(index - 4, vwapLength);
    const averageVolume = indicators.smaVolume(index, 20) ?? 0;
    if (!currentAtr || !vwap || !priorVwap || averageVolume <= 0) continue;
    const relativeVolume = candles[index].volume / averageVolume;
    const previous = candles[index - 1];
    const longTrend = ema20[index] > ema50[index] && ema50[index] > ema200[index] && vwap > priorVwap;
    const shortTrend = ema20[index] < ema50[index] && ema50[index] < ema200[index] && vwap < priorVwap;
    const longPullback = previous.low <= vwap + currentAtr * pullbackAtr && previous.close >= vwap - currentAtr * pullbackAtr;
    const shortPullback = previous.high >= vwap - currentAtr * pullbackAtr && previous.close <= vwap + currentAtr * pullbackAtr;
    const longSignal = longTrend && longPullback && candles[index].close > previous.high && candles[index].close > ema20[index];
    const shortSignal = shortTrend && shortPullback && candles[index].close < previous.low && candles[index].close < ema20[index];
    const direction = longSignal ? 'LONG' : shortSignal ? 'SHORT' : null;
    if (!direction || (ctx.direction !== 'BOTH' && direction !== ctx.direction)) continue;
    if (relativeVolume < volumeThreshold) {
      rejected += 1; rejectionCounts.WEAK_REACCELERATION = (rejectionCounts.WEAK_REACCELERATION ?? 0) + 1; continue;
    }
    const stopDistance = currentAtr * stopAtr;
    const trade = simulateBracketTrade({
      candles,
      signalIndex: index,
      direction,
      stopDistance,
      targetDistance: stopDistance * rewardRisk,
      maxBars: ctx.maxBars,
      transactionCostModel: ctx.transactionCostModel,
      rawScore: Math.min(1, 0.56 + relativeVolume / 6),
      confidence: Math.min(1, 0.62 + relativeVolume / 7),
      entryReason: `VWAP pullback held inside an aligned EMA trend, followed by ${relativeVolume.toFixed(2)}× volume reacceleration.`,
    });
    trades.push(trade);
    nextEligibleIndex = index + trade.barsHeld + 1;
  }

  return finalizeReplay(candles, trades, 'multi-timeframe-vwap-pullback-reacceleration-v1', rejected, rejectionCounts);
};
