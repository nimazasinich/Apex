import type {
  Candlestick,
  CandlestickSeries,
  DirectionDivergenceClassification,
  DivergenceTrendDirection,
  ExchangeDataSource,
  DirectionMarketDataSource,
} from '../types';

const EMA_PERIOD = 20;
const SLOPE_LOOKBACK = 5;
const STRUCTURE_WINDOW = 8;

export interface TimeframeDirection {
  direction: DivergenceTrendDirection;
  strength: number;
  candleCount: number;
}

export interface DirectionMarketContext {
  perTimeframe: Record<string, TimeframeDirection>;
  fundingRate?: number;
  oiChangePercent?: number;
  longShortRatio?: number;
  marketDataSource?: DirectionMarketDataSource;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function finiteCandle(candle: Candlestick): boolean {
  return [candle.open, candle.high, candle.low, candle.close, candle.volume]
    .every(Number.isFinite);
}

function averageTrueRange(candles: Candlestick[], period = 14): number {
  const start = Math.max(1, candles.length - period);
  const ranges: number[] = [];
  for (let i = start; i < candles.length; i++) {
    const previousClose = candles[i - 1].close;
    ranges.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - previousClose),
      Math.abs(candles[i].low - previousClose),
    ));
  }
  return ranges.length ? ranges.reduce((sum, value) => sum + value, 0) / ranges.length : 0;
}

function emaSeries(values: number[], period: number): number[] {
  if (!values.length) return [];
  const alpha = 2 / (period + 1);
  const result = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
  }
  return result;
}

function structureDirection(candles: Candlestick[]): { sign: number; strength: number } {
  const recent = candles.slice(-STRUCTURE_WINDOW);
  if (recent.length < 4) return { sign: 0, strength: 0 };
  let upward = 0;
  let downward = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].high > recent[i - 1].high && recent[i].low >= recent[i - 1].low) upward++;
    if (recent[i].low < recent[i - 1].low && recent[i].high <= recent[i - 1].high) downward++;
  }
  const total = Math.max(1, upward + downward);
  return {
    sign: upward === downward ? 0 : upward > downward ? 1 : -1,
    strength: clamp(Math.abs(upward - downward) / total),
  };
}

export function computeTimeframeDirection(
  candles: CandlestickSeries | undefined,
): TimeframeDirection {
  if (!candles || candles.length < EMA_PERIOD + SLOPE_LOOKBACK || !candles.every(finiteCandle)) {
    return { direction: 'UNAVAILABLE', strength: 0, candleCount: candles?.length ?? 0 };
  }
  const closes = candles.map(candle => candle.close);
  const ema = emaSeries(closes, EMA_PERIOD);
  const current = ema[ema.length - 1];
  const prior = ema[ema.length - 1 - SLOPE_LOOKBACK];
  const atr = averageTrueRange(candles);
  if (!Number.isFinite(atr) || atr <= 0) {
    return { direction: 'UNAVAILABLE', strength: 0, candleCount: candles.length };
  }

  const slope = current - prior;
  const slopeSign = Math.sign(slope);
  const slopeStrength = clamp(Math.abs(slope) / (atr * SLOPE_LOOKBACK));
  const structure = structureDirection(candles);
  const combinedSign = slopeSign * 0.6 + structure.sign * structure.strength * 0.4;
  const strength = clamp(slopeStrength * 0.6 + structure.strength * 0.4);
  if (strength < 0.15 || Math.abs(combinedSign) < 0.2) {
    return { direction: 'NEUTRAL', strength, candleCount: candles.length };
  }
  return {
    direction: combinedSign > 0 ? 'BULLISH' : 'BEARISH',
    strength,
    candleCount: candles.length,
  };
}

function sourceForContext(context: DirectionMarketContext, available: number): ExchangeDataSource {
  if (available === 0) return 'unavailable';
  if (context.marketDataSource === 'kucoin_live' || context.marketDataSource === 'kucoin_plus_binance_live') {
    return 'live';
  }
  return 'degraded';
}

export function classifyDirectionDivergence(
  orderDirection: 'SHORT' | 'LONG',
  context: DirectionMarketContext,
): DirectionDivergenceClassification {
  const entries = Object.entries(context.perTimeframe);
  const available = entries.filter(([, value]) => value.direction !== 'UNAVAILABLE');
  const signalSign = orderDirection === 'LONG' ? 1 : -1;
  const weightedDirection = available.reduce(
    (sum, [, value]) => sum + (value.direction === 'BULLISH' ? 1 : value.direction === 'BEARISH' ? -1 : 0) * value.strength,
    0,
  );
  const totalStrength = available.reduce((sum, [, value]) => sum + value.strength, 0);
  const alignmentScore = totalStrength > 0 ? clamp(signalSign * weightedDirection / totalStrength, -1, 1) : 0;
  const trendStrength = available.length ? clamp(totalStrength / available.length) : 0;
  const agreeing = available.filter(([, value]) =>
    (orderDirection === 'LONG' && value.direction === 'BULLISH') ||
    (orderDirection === 'SHORT' && value.direction === 'BEARISH')
  ).length;
  const timeframeAgreement = available.length ? agreeing / available.length : 0;
  const category: DirectionDivergenceClassification['category'] =
    !available.length ? 'UNAVAILABLE' :
      trendStrength < 0.25 || Math.abs(alignmentScore) < 0.25 ? 'RANGE' :
        alignmentScore >= 0.25 ? 'WITH_TREND' : 'COUNTER_TREND';

  return {
    orderDirection,
    alignmentScore,
    trendStrength,
    timeframeAgreement,
    category,
    dataCompleteness: entries.length ? available.length / entries.length : 0,
    dataSource: sourceForContext(context, available.length),
    perTimeframe: Object.fromEntries(entries),
    fundingRate: Number.isFinite(context.fundingRate) ? context.fundingRate : undefined,
    oiChangePercent: Number.isFinite(context.oiChangePercent) ? context.oiChangePercent : undefined,
    longShortRatio: Number.isFinite(context.longShortRatio) ? context.longShortRatio : undefined,
  };
}

export function buildDirectionDivergence(
  orderDirection: 'SHORT' | 'LONG',
  timeframes: Record<string, CandlestickSeries | undefined>,
  context: Omit<DirectionMarketContext, 'perTimeframe'> = {},
): DirectionDivergenceClassification {
  const perTimeframe = Object.fromEntries(
    Object.entries(timeframes).map(([name, candles]) => [name, computeTimeframeDirection(candles)]),
  );
  return classifyDirectionDivergence(orderDirection, { ...context, perTimeframe });
}
