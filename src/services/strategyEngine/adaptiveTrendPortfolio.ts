import type { BacktestCandle } from '../backtesting';
import type { StrategyRunFn } from './replayHarness';
import { buildReplayIndicatorCache, emaSeries, finalizeReplay, sanitizeCandles, simulateBracketTrade } from './replayHarness';

function momentum(candles: ReturnType<typeof sanitizeCandles>, index: number, lookback: number): number {
  if (index < lookback || candles[index - lookback].close <= 0) return 0;
  return candles[index].close / candles[index - lookback].close - 1;
}

function synchronizeUniverse(
  input: Record<string, BacktestCandle[]>,
  primarySymbol: string,
): { candlesBySymbol: Record<string, BacktestCandle[]>; synchronized: boolean } {
  const cleaned = Object.fromEntries(
    Object.entries(input)
      .map(([symbol, candles]) => [symbol, sanitizeCandles(candles)] as const)
      .filter(([, candles]) => candles.length >= 212),
  );
  const symbols = Object.keys(cleaned);
  if (symbols.length < 2) {
    const primary = cleaned[primarySymbol] ?? sanitizeCandles(input[primarySymbol] ?? Object.values(input)[0] ?? []);
    return { candlesBySymbol: primary.length ? { [primarySymbol]: primary } : {}, synchronized: false };
  }

  const timestampSets = symbols.map((symbol) => new Set(cleaned[symbol].map((row) => Date.parse(row.time))));
  const commonTimestamps = [...timestampSets[0]]
    .filter((timestamp) => Number.isFinite(timestamp) && timestampSets.every((set) => set.has(timestamp)))
    .sort((left, right) => left - right);

  // A cross-asset replay is only meaningful when enough exact shared closes
  // exist. Otherwise stay fail-closed as a single-symbol diagnostic replay;
  // automatic promotion already requires a separate multi-symbol identity.
  if (commonTimestamps.length < 212) {
    const primary = cleaned[primarySymbol] ?? Object.values(cleaned)[0] ?? [];
    return { candlesBySymbol: primary.length ? { [primarySymbol]: primary } : {}, synchronized: false };
  }

  const common = new Set(commonTimestamps);
  const aligned = Object.fromEntries(symbols.map((symbol) => [
    symbol,
    cleaned[symbol].filter((row) => common.has(Date.parse(row.time))),
  ]));
  return { candlesBySymbol: aligned, synchronized: true };
}

export const runAdaptiveTrendPortfolio: StrategyRunFn = (ctx) => {
  const universe = ctx.universeCandles && Object.keys(ctx.universeCandles).length
    ? ctx.universeCandles
    : { [ctx.symbol]: ctx.candles };
  const synchronizedUniverse = synchronizeUniverse(universe, ctx.symbol);
  const cleaned = synchronizedUniverse.candlesBySymbol;
  const primary = cleaned[ctx.symbol] ?? Object.values(cleaned)[0] ?? [];
  if (!primary.length) return finalizeReplay([], [], 'adaptive-long-short-trend-portfolio-v1');
  const indicatorsBySymbol = Object.fromEntries(Object.entries(cleaned).map(([symbol, candles]) => [symbol, buildReplayIndicatorCache(candles)]));
  const ema50BySymbol = Object.fromEntries(Object.entries(cleaned).map(([symbol, candles]) => [symbol, emaSeries(candles.map((row) => row.close), 50)]));
  const ema200BySymbol = Object.fromEntries(Object.entries(cleaned).map(([symbol, candles]) => [symbol, emaSeries(candles.map((row) => row.close), 200)]));
  const stopAtr = Number(ctx.parameters?.atrStopMultiplier ?? 1.4);
  const rewardRisk = Number(ctx.parameters?.rewardRisk ?? 2.2);
  const requestedRebalanceBars = Number(ctx.parameters?.rebalanceBars ?? 24);
  const rebalanceBars = Number.isFinite(requestedRebalanceBars)
    ? Math.max(6, Math.min(96, Math.floor(requestedRebalanceBars)))
    : 24;
  const trades: Array<ReturnType<typeof simulateBracketTrade>> = [];
  let nextEligibleIndex = 0;

  for (let index = 210; index < primary.length - 1; index += rebalanceBars) {
    if (index < nextEligibleIndex) continue;
    const candidates = Object.entries(cleaned)
      .filter(([, candles]) => candles.length > index + 2)
      .map(([symbol, candles]) => ({ symbol, candles, momentum: momentum(candles, index, 48) }))
      .sort((left, right) => Math.abs(right.momentum) - Math.abs(left.momentum));
    const selected = candidates[0];
    if (!selected) continue;
    const direction = selected.momentum >= 0 ? 'LONG' : 'SHORT';
    if (ctx.direction !== 'BOTH' && direction !== ctx.direction) continue;
    const ema50 = ema50BySymbol[selected.symbol][index];
    const ema200 = ema200BySymbol[selected.symbol][index];
    if ((direction === 'LONG' && ema50 <= ema200) || (direction === 'SHORT' && ema50 >= ema200)) continue;
    const currentAtr = indicatorsBySymbol[selected.symbol]?.atr(index, 14) ?? null;
    if (!currentAtr) continue;
    const trade = simulateBracketTrade({
      candles: selected.candles,
      signalIndex: index,
      direction,
      stopDistance: currentAtr * stopAtr,
      targetDistance: currentAtr * stopAtr * rewardRisk,
      maxBars: ctx.maxBars,
      transactionCostModel: ctx.transactionCostModel,
      rawScore: Math.min(1, Math.abs(selected.momentum) * 8),
      confidence: Math.min(1, 0.5 + Math.abs(selected.momentum) * 5),
      entryReason: `Adaptive universe selection chose ${selected.symbol} on ${Math.abs(selected.momentum * 100).toFixed(2)}% rolling momentum with 50/200 EMA regime alignment.`,
    });
    trades.push({ ...trade, symbol: selected.symbol });
    nextEligibleIndex = index + trade.barsHeld + rebalanceBars;
  }

  const result = finalizeReplay(primary, trades, 'adaptive-long-short-trend-portfolio-v1');
  result.summary.replayMode = synchronizedUniverse.synchronized ? 'CROSS_ASSET_SYNCHRONIZED_REPLAY' : 'SINGLE_SYMBOL_DIAGNOSTIC_REPLAY';
  result.summary.configOverrides = [
    {
      field: 'adaptive.universeSynchronization',
      configured: Object.keys(universe).length,
      effective: Object.keys(cleaned).length,
      reason: synchronizedUniverse.synchronized
        ? 'Cross-asset candidates use exact shared candle timestamps; trade rows retain the selected symbol.'
        : 'Insufficient exact shared timestamps for cross-asset evidence; replay remained single-symbol diagnostic.',
      policyVersion: 'adaptive-universe-sync-v1',
    },
  ];
  return result;
};
