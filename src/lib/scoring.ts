/**
 * APEX-NEXT Two-Directional Candidate Scoring & No-Trade Guard
 * Pure, unit-tested scoring module used for both LONG and SHORT directions (REQ-013, 014, 016, 017).
 */

import {
  CandidateScore,
  Candle,
  DataState,
  FeatureQualityMeta,
  FeatureQualityState,
  MomentumSignal,
  OrderBookSummary,
  ReadinessTier,
  ScoringFeatureQuality,
  ScoringInput,
  SymbolTicker,
  TimeframeConfluenceResult,
  TimeframeConfluenceState,
  TradeDirection,
} from '../types';

export type { ScoringInput };

const RSI_PERIOD = 14;
const ROC_LOOKBACK = 5;
const STRUCTURE_MIN_BARS = 10;
const TF15M_MIN_BARS = 10;
const TF1H_MIN_BARS = 10;

function featureMeta(state: FeatureQualityState, source?: string, ageMs?: number): FeatureQualityMeta {
  return { state, source, ageMs };
}

/**
 * Computes Relative Strength Index (14 periods).
 * Returns 50 when history is insufficient — check featureQuality.rsi.state for validity.
 */
export function calculateRsi(candles: Candle[], period = RSI_PERIOD): number {
  if (!candles || candles.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(2));
}

export function rsiFeatureQuality(candles: Candle[], period = RSI_PERIOD): FeatureQualityMeta {
  if (!candles?.length) return featureMeta('MISSING', 'candles');
  if (candles.length < period + 1) return featureMeta('INSUFFICIENT_HISTORY', 'candles');
  return featureMeta('VALID', 'candles');
}

/**
 * Five-bar rate-of-change momentum signal (legacy name: computeMacdSignal).
 * Not a true MACD — preserved for live baseline parity.
 */
export function computeRocMomentumSignal(candles: Candle[]): MomentumSignal {
  if (!candles || candles.length < 26) return 'NEUTRAL';
  const last = candles[candles.length - 1].close;
  const prev = candles[candles.length - ROC_LOOKBACK].close;
  const roc = ((last - prev) / prev) * 100;
  if (roc > 0.5) return 'BULLISH';
  if (roc < -0.5) return 'BEARISH';
  return 'NEUTRAL';
}

/** @deprecated Use computeRocMomentumSignal — name retained for backward compatibility. */
export function computeMacdSignal(candles: Candle[]): MomentumSignal {
  return computeRocMomentumSignal(candles);
}

function ema(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const multiplier = 2 / (period + 1);
  const seed = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  const out = [seed];
  for (let i = period; i < values.length; i++) out.push((values[i] - out[out.length - 1]) * multiplier + out[out.length - 1]);
  return out;
}

/** Versioned, standard EMA(12)-EMA(26) MACD with EMA(9) signal line. Shadow-only. */
export function computeRealMacdSignal(candles: Candle[]): MomentumSignal {
  if (!candles || candles.length < 35) return 'NEUTRAL';
  const closes = candles.map((c) => c.close).filter(Number.isFinite);
  if (closes.length < 35) return 'NEUTRAL';
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const offset = fast.length - slow.length;
  const macdLine = slow.map((slowValue, index) => fast[index + offset] - slowValue);
  const signalLine = ema(macdLine, 9);
  if (!signalLine.length) return 'NEUTRAL';
  const histogram = macdLine[macdLine.length - 1] - signalLine[signalLine.length - 1];
  const scale = Math.max(1e-9, closes[closes.length - 1]);
  const normalized = histogram / scale;
  if (normalized > 0.00015) return 'BULLISH';
  if (normalized < -0.00015) return 'BEARISH';
  return 'NEUTRAL';
}

export function rocMomentumFeatureQuality(candles: Candle[]): FeatureQualityMeta {
  if (!candles?.length) return featureMeta('MISSING', 'candles');
  if (candles.length < 26) return featureMeta('INSUFFICIENT_HISTORY', 'candles');
  return featureMeta('VALID', 'candles');
}

/**
 * Detects swing structure (Higher Highs / Lower Lows over recent candles)
 */
export function classifyStructure(candles: Candle[]): {
  trend: MomentumSignal;
  higherHighs: boolean;
  lowerLows: boolean;
} {
  if (!candles || candles.length < STRUCTURE_MIN_BARS) {
    return { trend: 'NEUTRAL', higherHighs: false, lowerLows: false };
  }
  const recent = candles.slice(-10);
  const midPoint = Math.floor(recent.length / 2);
  const firstHalfHigh = Math.max(...recent.slice(0, midPoint).map((c) => c.high));
  const secondHalfHigh = Math.max(...recent.slice(midPoint).map((c) => c.high));
  const firstHalfLow = Math.min(...recent.slice(0, midPoint).map((c) => c.low));
  const secondHalfLow = Math.min(...recent.slice(midPoint).map((c) => c.low));

  const higherHighs = secondHalfHigh > firstHalfHigh;
  const lowerLows = secondHalfLow < firstHalfLow;

  if (higherHighs && secondHalfLow >= firstHalfLow) {
    return { trend: 'BULLISH', higherHighs: true, lowerLows: false };
  }
  if (lowerLows && secondHalfHigh <= firstHalfHigh) {
    return { trend: 'BEARISH', higherHighs: false, lowerLows: true };
  }
  return { trend: 'NEUTRAL', higherHighs, lowerLows };
}

export function structureFeatureQuality(candles: Candle[]): FeatureQualityMeta {
  if (!candles?.length) return featureMeta('MISSING', 'candles');
  if (candles.length < STRUCTURE_MIN_BARS) return featureMeta('INSUFFICIENT_HISTORY', 'candles');
  return featureMeta('VALID', 'candles');
}

function signalSupportsDirection(signal: MomentumSignal, direction: TradeDirection): boolean {
  return direction === 'LONG' ? signal === 'BULLISH' : signal === 'BEARISH';
}

function signalOpposesDirection(signal: MomentumSignal, direction: TradeDirection): boolean {
  return direction === 'LONG' ? signal === 'BEARISH' : signal === 'BULLISH';
}

/**
 * Structured 15m/1h confluence — requires both series when claiming ALIGNED.
 */
export function evaluateTimeframeConfluence(
  direction: TradeDirection,
  tf15m: MomentumSignal,
  tf1h: MomentumSignal,
  tf15mQuality: FeatureQualityMeta,
  tf1hQuality: FeatureQualityMeta,
): TimeframeConfluenceResult {
  const tf15Available = tf15mQuality.state === 'VALID';
  const tf1hAvailable = tf1hQuality.state === 'VALID';

  if (!tf15Available && !tf1hAvailable) {
    return { state: 'UNAVAILABLE', tf15m, tf1h, aligned: false };
  }
  if (!tf15Available || !tf1hAvailable) {
    return { state: 'PARTIAL', tf15m, tf1h, aligned: false };
  }
  if (signalOpposesDirection(tf15m, direction) && signalOpposesDirection(tf1h, direction)) {
    return { state: 'CONFLICTING', tf15m, tf1h, aligned: false };
  }
  if (signalSupportsDirection(tf15m, direction) && signalSupportsDirection(tf1h, direction)) {
    return { state: 'ALIGNED', tf15m, tf1h, aligned: true };
  }
  if (signalOpposesDirection(tf15m, direction) || signalOpposesDirection(tf1h, direction)) {
    return { state: 'CONFLICTING', tf15m, tf1h, aligned: false };
  }
  return { state: 'PARTIAL', tf15m, tf1h, aligned: false };
}

/**
 * Evaluates the No-Trade Guard (REQ-016)
 */
export function evaluateNoTradeGuard(
  input: ScoringInput,
  direction: TradeDirection,
  confluence: TimeframeConfluenceResult | boolean,
  dataState: DataState,
): { guardPass: boolean; guardReasons: string[] } {
  const reasons: string[] = [];
  const confluenceResult: TimeframeConfluenceResult =
    typeof confluence === 'boolean'
      ? {
          state: confluence ? 'ALIGNED' : 'CONFLICTING',
          tf15m: 'NEUTRAL',
          tf1h: 'NEUTRAL',
          aligned: confluence,
        }
      : confluence;

  if (dataState === 'unavailable' || dataState === 'degraded') {
    reasons.push(`Data feed is ${dataState} — safety guard triggered.`);
  }

  if (input.ticker.turnover24h < input.minLiquidityUsd) {
    reasons.push(
      `Turnover ($${(input.ticker.turnover24h / 1e6).toFixed(1)}M) below liquidity floor ($${(
        input.minLiquidityUsd / 1e6
      ).toFixed(1)}M).`
    );
  }

  const totalBookDepth = input.orderBook.bidDepthUsd + input.orderBook.askDepthUsd;
  if (totalBookDepth > 0 && totalBookDepth < 100000) {
    reasons.push('Abnormal squeeze risk: thin order-book depth (<$100k total depth).');
  }

  if (direction === 'SHORT' && input.ticker.fundingRate < -0.001) {
    reasons.push('Short squeeze warning: deeply negative funding rate (< -0.10%).');
  } else if (direction === 'LONG' && input.ticker.fundingRate > 0.0015) {
    reasons.push('Long squeeze warning: heavily elevated positive funding (> +0.15%).');
  }

  if (confluenceResult.state === 'CONFLICTING') {
    reasons.push('Cross-timeframe contradiction: 15m and 1h momentum signals conflict.');
  } else if (confluenceResult.state === 'UNAVAILABLE') {
    reasons.push('Multi-timeframe confluence unavailable: independent 15m and 1h data required.');
  } else if (confluenceResult.state === 'PARTIAL') {
    reasons.push('Multi-timeframe confluence partial: both 15m and 1h series required for alignment.');
  }

  return {
    guardPass: reasons.length === 0,
    guardReasons: reasons,
  };
}

export function deriveReadinessTier(score: number, guardPass: boolean, hasHardBlock: boolean): ReadinessTier {
  if (hasHardBlock) return 'BLOCKED';
  if (!guardPass) {
    return score >= 65 ? 'CAUTION' : 'BLOCKED';
  }
  if (score >= 75) return 'CONFIRMED';
  if (score >= 55) return 'WATCHLIST';
  return 'CAUTION';
}

function fundingFeatureQuality(ticker: SymbolTicker): FeatureQualityMeta {
  if (ticker.dataState === 'unavailable') return featureMeta('UNAVAILABLE', 'ticker');
  if (!Number.isFinite(ticker.fundingRate)) return featureMeta('MISSING', 'ticker.fundingRate');
  if (ticker.fundingQuality) return featureMeta(ticker.fundingQuality, 'ticker.fundingRate');
  return featureMeta('VALID', 'ticker.fundingRate');
}

function orderBookFeatureQuality(orderBook: OrderBookSummary): FeatureQualityMeta {
  if (orderBook.dataState === 'unavailable') return featureMeta('UNAVAILABLE', 'orderBook');
  const depth = orderBook.bidDepthUsd + orderBook.askDepthUsd;
  if (depth <= 0 && orderBook.imbalancePct === 0) return featureMeta('MISSING', 'orderBook');
  if (orderBook.qualityState) return featureMeta(orderBook.qualityState, 'orderBook');
  return featureMeta('VALID', 'orderBook');
}

function qualityAvailability(state: FeatureQualityMeta['state']): number {
  if (state === 'VALID') return 1;
  if (state === 'ESTIMATED') return 0.5;
  return 0;
}

/**
 * Scores a candidate symbol for a specific direction (LONG or SHORT)
 */
export function scoreCandidate(input: ScoringInput, direction: TradeDirection): CandidateScore {
  const { ticker, candles, orderBook, minLiquidityUsd } = input;

  const rsiQuality = rsiFeatureQuality(candles);
  const rocQuality = rocMomentumFeatureQuality(candles);
  const structureQuality = structureFeatureQuality(candles);
  const fundingQuality = fundingFeatureQuality(ticker);
  const obQuality = orderBookFeatureQuality(orderBook);

  const rsi = calculateRsi(candles, RSI_PERIOD);
  const roc = computeRocMomentumSignal(candles);
  const structure = classifyStructure(candles);

  let momentumScore = 50;
  if (rsiQuality.state === 'VALID') {
    if (direction === 'LONG') {
      if (rsi >= 40 && rsi <= 65) momentumScore += 25;
      else if (rsi < 30) momentumScore += 15;
      else if (rsi > 75) momentumScore -= 20;
    } else {
      if (rsi >= 45 && rsi <= 70) momentumScore += 25;
      else if (rsi > 75) momentumScore += 30;
      else if (rsi < 30) momentumScore -= 25;
    }
  }
  if (rocQuality.state === 'VALID') {
    if (direction === 'LONG') {
      if (roc === 'BULLISH') momentumScore += 25;
      else if (roc === 'BEARISH') momentumScore -= 20;
    } else {
      if (roc === 'BEARISH') momentumScore += 25;
      else if (roc === 'BULLISH') momentumScore -= 20;
    }
  }
  momentumScore = Math.max(0, Math.min(100, momentumScore));

  let orderFlowScore = 50;
  if (obQuality.state === 'VALID' || obQuality.state === 'ESTIMATED') {
    const imbalance = orderBook.imbalancePct;
    orderFlowScore += direction === 'LONG' ? imbalance * 0.5 : -imbalance * 0.5;
  }
  orderFlowScore = Math.max(0, Math.min(100, Math.round(orderFlowScore)));

  let fundingScore = 50;
  if (fundingQuality.state === 'VALID' || fundingQuality.state === 'ESTIMATED') {
    const fr = ticker.fundingRate;
    if (direction === 'LONG') {
      if (fr < -0.0002) fundingScore += 35;
      else if (fr < 0) fundingScore += 15;
      else if (fr > 0.0005) fundingScore -= 25;
    } else {
      if (fr > 0.0003) fundingScore += 35;
      else if (fr > 0) fundingScore += 15;
      else if (fr < -0.0003) fundingScore -= 25;
    }
  }
  fundingScore = Math.max(0, Math.min(100, fundingScore));

  let structureScore = 50;
  if (structureQuality.state === 'VALID') {
    if (direction === 'LONG' && structure.trend === 'BULLISH') structureScore = 85;
    else if (direction === 'LONG' && structure.trend === 'BEARISH') structureScore = 25;
    else if (direction === 'SHORT' && structure.trend === 'BEARISH') structureScore = 85;
    else if (direction === 'SHORT' && structure.trend === 'BULLISH') structureScore = 25;
  }

  const turnoverM = ticker.turnover24h / 1e6;
  const liquidityScore = Math.min(100, Math.max(20, Math.round(Math.log10(Math.max(1, turnoverM)) * 35)));

  const momentumAvailability = qualityAvailability(rsiQuality.state) * 0.5 + qualityAvailability(rocQuality.state) * 0.5;
  const liquidityAvailability = Number.isFinite(ticker.turnover24h) && ticker.turnover24h > 0 && ticker.dataState !== 'unavailable' ? 1 : 0;
  const weightedComponents = [
    { score: momentumScore, weight: 0.30, availability: momentumAvailability },
    { score: structureScore, weight: 0.25, availability: qualityAvailability(structureQuality.state) },
    { score: orderFlowScore, weight: 0.20, availability: qualityAvailability(obQuality.state) },
    { score: fundingScore, weight: 0.15, availability: qualityAvailability(fundingQuality.state) },
    { score: liquidityScore, weight: 0.10, availability: liquidityAvailability },
  ];
  const availableWeight = weightedComponents.reduce((sum, component) => sum + component.weight * component.availability, 0);
  const weightedEvidence = weightedComponents.reduce((sum, component) => sum + component.score * component.weight * component.availability, 0);
  const rawScore = availableWeight > 0 ? weightedEvidence / availableWeight : 0;
  const featureCompletenessPct = Math.round(availableWeight * 100);
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  const tf15mQuality: FeatureQualityMeta =
    input.candles15m && input.candles15m.length >= TF15M_MIN_BARS
      ? featureMeta('VALID', 'candles15m')
      : featureMeta('INSUFFICIENT_HISTORY', 'candles15m');

  const tf1hQuality: FeatureQualityMeta =
    candles.length >= TF1H_MIN_BARS
      ? featureMeta('VALID', 'candles1h')
      : featureMeta('INSUFFICIENT_HISTORY', 'candles1h');

  const tf15m =
    tf15mQuality.state === 'VALID' && input.candles15m
      ? computeRocMomentumSignal(input.candles15m)
      : 'NEUTRAL';
  const tf1h = structureQuality.state === 'VALID' ? structure.trend : 'NEUTRAL';

  const confluence = evaluateTimeframeConfluence(direction, tf15m, tf1h, tf15mQuality, tf1hQuality);

  const featureQuality: ScoringFeatureQuality = {
    rsi: rsiQuality,
    rocMomentum: rocQuality,
    structure: structureQuality,
    orderBookImbalance: obQuality,
    funding: fundingQuality,
    tf15m: tf15mQuality,
    tf1h: tf1hQuality,
  };

  const guard = evaluateNoTradeGuard(input, direction, confluence, ticker.dataState);
  if (featureCompletenessPct < 60) {
    guard.guardReasons.push(`Feature evidence completeness is ${featureCompletenessPct}% — missing evidence cannot be treated as neutral confirmation.`);
  }
  const guardPass = guard.guardReasons.length === 0;
  const guardReasons = guard.guardReasons;

  const hasHardBlock =
    ticker.dataState === 'unavailable' ||
    ticker.turnover24h < minLiquidityUsd * 0.5 ||
    featureCompletenessPct < 40;

  const readinessTier = deriveReadinessTier(score, guardPass, hasHardBlock);
  const macdV1 = computeRealMacdSignal(candles);

  return {
    symbol: ticker.symbol,
    lastPrice: ticker.lastPrice,
    priceChange24hPct: ticker.priceChange24hPct,
    turnover24h: ticker.turnover24h,
    direction,
    score,
    readinessTier,
    guardPass,
    guardReasons,
    momentumScore,
    orderFlowScore,
    fundingScore,
    structureScore,
    liquidityScore,
    timeframeConfluence: confluence.aligned,
    timeframeConfluenceState: confluence.state,
    timeframeDetails: { tf15m, tf1h },
    featureQuality,
    featureCompletenessPct,
    momentumShadow: { roc, macdV1, agreement: roc === macdV1, version: 'macd_12_26_9_v1' },
    dataState: ticker.dataState,
  };
}
