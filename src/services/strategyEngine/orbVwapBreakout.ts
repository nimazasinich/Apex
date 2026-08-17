import type { StrategyRunFn } from './replayHarness';
import { buildReplayIndicatorCache, finalizeReplay, sanitizeCandles, simulateBracketTrade } from './replayHarness';

function sessionKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export const runOrbVwapBreakout: StrategyRunFn = (ctx) => {
  const candles = sanitizeCandles(ctx.candles);
  const indicators = buildReplayIndicatorCache(candles);
  const openingRangeBars = Number(ctx.parameters?.openingRangeBars ?? 6);
  const relativeVolumeThreshold = Number(ctx.parameters?.relativeVolumeThreshold ?? 1.35);
  const atrMultiplierStop = Number(ctx.parameters?.atrStopMultiplier ?? 1.1);
  const rewardRisk = Number(ctx.parameters?.rewardRisk ?? 2.0);
  const trades: Array<ReturnType<typeof simulateBracketTrade>> = [];
  const rejectionCounts: Record<string, number> = {};
  let rejected = 0;
  let nextEligibleIndex = 0;

  const dayStarts = new Map<string, number>();
  const sessionRanges = new Map<string, { start: number; high: number; low: number }>();
  candles.forEach((row, index) => { if (!dayStarts.has(sessionKey(row.time))) dayStarts.set(sessionKey(row.time), index); });
  for (const [key, start] of dayStarts) {
    const range = candles.slice(start, start + openingRangeBars);
    if (range.length === openingRangeBars) {
      sessionRanges.set(key, { start, high: Math.max(...range.map((row) => row.high)), low: Math.min(...range.map((row) => row.low)) });
    }
  }

  for (let index = 30; index < candles.length - 1; index += 1) {
    if (index < nextEligibleIndex) continue;
    const session = sessionRanges.get(sessionKey(candles[index].time));
    if (!session || index < session.start + openingRangeBars) continue;
    const rangeHigh = session.high;
    const rangeLow = session.low;
    const averageVolume = indicators.smaVolume(index, 20) ?? 0;
    const relativeVolume = averageVolume > 0 ? candles[index].volume / averageVolume : 0;
    const currentAtr = indicators.atr(index, 14);
    const vwap = indicators.vwap(index, Math.min(24, index));
    const priorVwap = indicators.vwap(index - 3, Math.min(24, index - 3));
    if (!currentAtr || !vwap || !priorVwap) continue;

    const longSignal = candles[index].close > rangeHigh && candles[index - 1].close <= rangeHigh && candles[index].close > vwap && vwap > priorVwap;
    const shortSignal = candles[index].close < rangeLow && candles[index - 1].close >= rangeLow && candles[index].close < vwap && vwap < priorVwap;
    const direction = longSignal ? 'LONG' : shortSignal ? 'SHORT' : null;
    if (!direction || (ctx.direction !== 'BOTH' && direction !== ctx.direction)) continue;
    if (relativeVolume < relativeVolumeThreshold) {
      rejected += 1; rejectionCounts.LOW_RELATIVE_VOLUME = (rejectionCounts.LOW_RELATIVE_VOLUME ?? 0) + 1; continue;
    }
    if ((rangeHigh - rangeLow) < currentAtr * 0.55) {
      rejected += 1; rejectionCounts.RANGE_TOO_NARROW = (rejectionCounts.RANGE_TOO_NARROW ?? 0) + 1; continue;
    }

    const stopDistance = Math.max(currentAtr * atrMultiplierStop, Math.abs(candles[index].close - (direction === 'LONG' ? rangeHigh : rangeLow)) + currentAtr * 0.35);
    const trade = simulateBracketTrade({
      candles,
      signalIndex: index,
      direction,
      stopDistance,
      targetDistance: stopDistance * rewardRisk,
      maxBars: ctx.maxBars,
      transactionCostModel: ctx.transactionCostModel,
      rawScore: Math.min(1, 0.55 + relativeVolume / 5),
      confidence: Math.min(1, 0.6 + relativeVolume / 6),
      entryReason: `Opening-range ${direction.toLowerCase()} breakout with ${relativeVolume.toFixed(2)}× relative volume and VWAP slope confirmation.`,
    });
    trades.push(trade);
    nextEligibleIndex = index + trade.barsHeld + 1;
  }

  return finalizeReplay(candles, trades, 'opening-range-vwap-rvol-breakout-v1', rejected, rejectionCounts);
};
