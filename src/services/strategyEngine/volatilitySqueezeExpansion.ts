import type { StrategyRunFn } from './replayHarness';
import { buildReplayIndicatorCache, emaSeries, finalizeReplay, rollingPercentileSeries, sanitizeCandles, simulateBracketTrade } from './replayHarness';

export const runVolatilitySqueezeExpansion: StrategyRunFn = (ctx) => {
  const candles = sanitizeCandles(ctx.candles);
  const indicators = buildReplayIndicatorCache(candles);
  const closes = indicators.closes;
  const ema50 = emaSeries(closes, 50);
  const ema200 = emaSeries(closes, 200);
  const widthLookback = Number(ctx.parameters?.widthLookback ?? ctx.parameters?.squeezeLookback ?? 80);
  const volumeThreshold = Number(ctx.parameters?.volumeExpansion ?? 1.35);
  const stopAtr = Number(ctx.parameters?.atrStopMultiplier ?? 1.25);
  const rewardRisk = Number(ctx.parameters?.rewardRisk ?? 2.1);
  const trades: Array<ReturnType<typeof simulateBracketTrade>> = [];
  const rejectionCounts: Record<string, number> = {};
  let rejected = 0;
  let nextEligibleIndex = 0;
  const widths: number[] = [];

  for (let index = 20; index < candles.length; index += 1) {
    const mean = indicators.smaClose(index, 20);
    const std = indicators.stdClose(index, 20);
    widths[index] = mean && std ? (std * 4) / mean : Number.NaN;
  }

  const widthThresholds = rollingPercentileSeries(widths, widthLookback, 0.20);

  for (let index = Math.max(210, widthLookback + 21); index < candles.length - 1; index += 1) {
    if (index < nextEligibleIndex) continue;
    const mean = indicators.smaClose(index, 20);
    const std = indicators.stdClose(index, 20);
    const currentAtr = indicators.atr(index, 14);
    const averageVolume = indicators.smaVolume(index, 20) ?? 0;
    if (!mean || !std || !currentAtr || averageVolume <= 0) continue;
    const bbUpper = mean + 2 * std;
    const bbLower = mean - 2 * std;
    const threshold = widthThresholds[index - 1] ?? 0;
    const wasSqueezed = (widths[index - 1] ?? Infinity) <= threshold;
    const relativeVolume = candles[index].volume / averageVolume;
    const longSignal = wasSqueezed && closes[index] > bbUpper && ema50[index] > ema200[index];
    const shortSignal = wasSqueezed && closes[index] < bbLower && ema50[index] < ema200[index];
    const direction = longSignal ? 'LONG' : shortSignal ? 'SHORT' : null;
    if (!direction || (ctx.direction !== 'BOTH' && direction !== ctx.direction)) continue;
    if (relativeVolume < volumeThreshold) {
      rejected += 1; rejectionCounts.NO_VOLUME_EXPANSION = (rejectionCounts.NO_VOLUME_EXPANSION ?? 0) + 1; continue;
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
      rawScore: Math.min(1, 0.52 + relativeVolume / 5),
      confidence: Math.min(1, 0.58 + relativeVolume / 6),
      entryReason: `Bollinger-width squeeze release with ${relativeVolume.toFixed(2)}× volume expansion and higher-timeframe EMA alignment.`,
    });
    trades.push(trade);
    nextEligibleIndex = index + trade.barsHeld + 1;
  }

  return finalizeReplay(candles, trades, 'volatility-squeeze-trend-volume-expansion-v1', rejected, rejectionCounts);
};
