import type { Candle, CandidateScore, DerivedLevels } from '../types';

export type AnalysisRiskProfile = 'AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE';
export type ResistanceLevel = {
  tag: 'R1' | 'R2' | 'R3';
  price: number;
  lower: number;
  upper: number;
  touches: number;
  score: number;
  source: 'derived' | 'structure';
};
export type TrendlineModel = {
  kind: 'support' | 'resistance';
  startIndex: number;
  endIndex: number;
  startPrice: number;
  endPrice: number;
  slope: number;
  touches: number;
  score: number;
  latestPrice: number;
};
export type BreakoutState = 'WATCHING' | 'BUILDING' | 'CONFIRMED' | 'RETEST' | 'FAILED';
export type BreakoutInsight = {
  state: BreakoutState;
  referencePrice: number | null;
  buffer: number;
  score: number;
  volumeRatio: number;
  closeClearance: number;
  closePosition: number;
  bodyRatio: number;
  confirmationBars: number;
  requiredConfirmationBars: number;
  label: string;
  bias: 'bullish' | 'bearish' | 'neutral';
};
export type ChartStructureAnalysis = {
  atr14: number;
  riskProfile: AnalysisRiskProfile;
  resistanceLevels: ResistanceLevel[];
  trendline: TrendlineModel | null;
  breakout: BreakoutInsight;
  setupBias: 'bullish' | 'bearish' | 'neutral';
  setupScore: number | null;
  confidence: number | null;
  calibratedProbability: number | null;
  successLabel: string;
};

type PivotPoint = { index: number; time: number; price: number; strength: number };
type StructureConfig = {
  pivotLeft: number;
  pivotRight: number;
  minimumPivotDistanceBars: number;
  minimumTrendlineTouches: number;
  trendTouchToleranceAtr: number;
  zoneToleranceAtr: number;
  zoneTolerancePct: number;
  minimumResistanceScore: number;
  breakoutBufferAtr: number;
  breakoutBufferPct: number;
  minimumVolumeRatio: number;
  minimumClosePosition: number;
  minimumBodyRatio: number;
  requiredConfirmationBars: number;
  failedBreakoutWindowBars: number;
  retestToleranceAtr: number;
};

const PROFILE_CONFIG: Record<AnalysisRiskProfile, Omit<StructureConfig, 'requiredConfirmationBars'>> = {
  AGGRESSIVE: {
    pivotLeft: 2,
    pivotRight: 2,
    minimumPivotDistanceBars: 4,
    minimumTrendlineTouches: 2,
    trendTouchToleranceAtr: 0.42,
    zoneToleranceAtr: 0.45,
    zoneTolerancePct: 0.0035,
    minimumResistanceScore: 24,
    breakoutBufferAtr: 0.08,
    breakoutBufferPct: 0.0008,
    minimumVolumeRatio: 1.05,
    minimumClosePosition: 0.58,
    minimumBodyRatio: 0.30,
    failedBreakoutWindowBars: 2,
    retestToleranceAtr: 0.35,
  },
  BALANCED: {
    pivotLeft: 3,
    pivotRight: 3,
    minimumPivotDistanceBars: 5,
    minimumTrendlineTouches: 3,
    trendTouchToleranceAtr: 0.30,
    zoneToleranceAtr: 0.35,
    zoneTolerancePct: 0.0025,
    minimumResistanceScore: 40,
    breakoutBufferAtr: 0.15,
    breakoutBufferPct: 0.0015,
    minimumVolumeRatio: 1.25,
    minimumClosePosition: 0.70,
    minimumBodyRatio: 0.45,
    failedBreakoutWindowBars: 3,
    retestToleranceAtr: 0.25,
  },
  CONSERVATIVE: {
    pivotLeft: 4,
    pivotRight: 4,
    minimumPivotDistanceBars: 7,
    minimumTrendlineTouches: 3,
    trendTouchToleranceAtr: 0.24,
    zoneToleranceAtr: 0.28,
    zoneTolerancePct: 0.0018,
    minimumResistanceScore: 55,
    breakoutBufferAtr: 0.22,
    breakoutBufferPct: 0.0022,
    minimumVolumeRatio: 1.45,
    minimumClosePosition: 0.78,
    minimumBodyRatio: 0.55,
    failedBreakoutWindowBars: 4,
    retestToleranceAtr: 0.20,
  },
};

function resolveConfig(profile: AnalysisRiskProfile, interval: string): StructureConfig {
  const base = PROFILE_CONFIG[profile];
  const fastInterval = interval === '1m' || interval === '5m';
  const requiredConfirmationBars = profile === 'AGGRESSIVE'
    ? (fastInterval ? 2 : 1)
    : profile === 'BALANCED'
      ? 2
      : 3;
  return { ...base, requiredConfirmationBars };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index];
    if (index >= period) sum -= values[index - period];
    if (index >= period - 1) out[index] = sum / period;
  }
  return out;
}

function computeAtr14(candles: Candle[]) {
  if (candles.length < 2) return 0;
  const trueRanges: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index];
    const previousClose = candles[index - 1].close;
    trueRanges.push(Math.max(
      current.high - current.low,
      Math.abs(current.high - previousClose),
      Math.abs(current.low - previousClose),
    ));
  }
  const period = Math.min(14, trueRanges.length);
  if (!period) return 0;
  let atr = average(trueRanges.slice(0, period));
  for (let index = period; index < trueRanges.length; index += 1) {
    atr = ((atr * (period - 1)) + trueRanges[index]) / period;
  }
  return atr;
}

function computePivots(candles: Candle[], left: number, right: number) {
  const highs: PivotPoint[] = [];
  const lows: PivotPoint[] = [];
  for (let index = left; index < candles.length - right; index += 1) {
    const current = candles[index];
    let isHigh = true;
    let isLow = true;
    for (let offset = 1; offset <= left; offset += 1) {
      if (current.high <= candles[index - offset].high) isHigh = false;
      if (current.low >= candles[index - offset].low) isLow = false;
    }
    for (let offset = 1; offset <= right; offset += 1) {
      if (current.high < candles[index + offset].high) isHigh = false;
      if (current.low > candles[index + offset].low) isLow = false;
    }
    const candleRange = Math.max(current.high - current.low, 1e-8);
    const strength = clampNumber(candleRange / Math.max(current.close * 0.002, 1e-8), 1, 8);
    if (isHigh) highs.push({ index, time: current.timestamp, price: current.high, strength });
    if (isLow) lows.push({ index, time: current.timestamp, price: current.low, strength });
  }
  return { highs, lows };
}

function clusterResistanceLevels(
  candles: Candle[],
  pivotHighs: PivotPoint[],
  atr14: number,
  config: StructureConfig,
  derivedLevels?: DerivedLevels | null,
): ResistanceLevel[] {
  const lastClose = candles[candles.length - 1]?.close ?? 0;
  const tolerance = Math.max(atr14 * config.zoneToleranceAtr, lastClose * config.zoneTolerancePct, 1e-8);
  const levels: ResistanceLevel[] = [];

  if (derivedLevels?.resistances?.length) {
    derivedLevels.resistances
      .filter((price) => Number.isFinite(price) && price > lastClose - Math.max(atr14 * 1.25, lastClose * 0.01))
      .sort((left, right) => left - right)
      .slice(0, 3)
      .forEach((price, index) => {
        levels.push({
          tag: (`R${index + 1}` as ResistanceLevel['tag']),
          price,
          lower: price - tolerance * 0.5,
          upper: price + tolerance * 0.5,
          touches: 0,
          score: 58 - index * 4,
          source: 'derived',
        });
      });
  }

  const eligiblePivots = pivotHighs
    .filter((pivot) => pivot.price > lastClose - Math.max(atr14 * 1.25, lastClose * 0.01))
    .sort((left, right) => left.price - right.price);
  const zones: Array<{
    prices: number[];
    touches: number;
    latestIndex: number;
    rejectionStrength: number;
    volumeWeight: number;
    pivotStrength: number;
  }> = [];

  for (const pivot of eligiblePivots) {
    const existing = zones.find((zone) => Math.abs(median(zone.prices) - pivot.price) <= tolerance);
    const candle = candles[pivot.index];
    const rejectionStrength = Math.max(0, candle.high - candle.close) / Math.max(atr14, 1e-8);
    const volumeWindow = candles.slice(Math.max(0, pivot.index - 20), pivot.index + 1).map((item) => item.volume);
    const volumeWeight = candle.volume / Math.max(average(volumeWindow), 1);
    if (existing) {
      existing.prices.push(pivot.price);
      existing.touches += 1;
      existing.latestIndex = Math.max(existing.latestIndex, pivot.index);
      existing.rejectionStrength += rejectionStrength;
      existing.volumeWeight += volumeWeight;
      existing.pivotStrength += pivot.strength;
    } else {
      zones.push({
        prices: [pivot.price],
        touches: 1,
        latestIndex: pivot.index,
        rejectionStrength,
        volumeWeight,
        pivotStrength: pivot.strength,
      });
    }
  }

  const structured = zones
    .map((zone) => {
      const price = median(zone.prices);
      const recencyWeight = 1 - ((candles.length - 1 - zone.latestIndex) / Math.max(candles.length, 1));
      const rejection = clampNumber(zone.rejectionStrength / Math.max(zone.touches, 1), 0, 2);
      const volume = clampNumber(zone.volumeWeight / Math.max(zone.touches, 1), 0.6, 2);
      const pivotStrength = clampNumber(zone.pivotStrength / Math.max(zone.touches, 1), 1, 8);
      const score = Math.round(
        zone.touches * 18
        + rejection * 12
        + volume * 9
        + recencyWeight * 18
        + pivotStrength * 3,
      );
      return {
        price,
        lower: price - tolerance * 0.5,
        upper: price + tolerance * 0.5,
        touches: zone.touches,
        score,
        source: 'structure' as const,
      };
    })
    .filter((zone) => zone.score >= config.minimumResistanceScore)
    .sort((left, right) => left.price - right.price);

  for (const candidate of structured) {
    if (levels.length >= 3) break;
    if (levels.some((level) => Math.abs(level.price - candidate.price) <= tolerance * 0.75)) continue;
    levels.push({ tag: 'R1', ...candidate });
  }

  return levels
    .sort((left, right) => left.price - right.price)
    .slice(0, 3)
    .map((level, index) => ({ ...level, tag: (`R${index + 1}` as ResistanceLevel['tag']) }));
}

function computePrimaryTrendline(
  candles: Candle[],
  atr14: number,
  pivots: ReturnType<typeof computePivots>,
  config: StructureConfig,
): TrendlineModel | null {
  const closes = candles.map((candle) => candle.close);
  const movingAveragePeriod = Math.min(20, Math.max(3, closes.length));
  const movingAverage = sma(closes, movingAveragePeriod);
  const movingAverageLast = movingAverage[movingAverage.length - 1] ?? closes[closes.length - 1] ?? 0;
  const tolerance = Math.max(atr14 * config.trendTouchToleranceAtr, (closes[closes.length - 1] ?? 1) * 0.0012, 1e-8);
  const recentPivots = <T,>(items: T[]) => items.slice(Math.max(0, items.length - 10));

  const buildCandidate = (kind: 'support' | 'resistance', pool: PivotPoint[]) => {
    const recent = recentPivots(pool);
    let best: TrendlineModel | null = null;
    for (let first = 0; first < recent.length - 1; first += 1) {
      for (let second = first + 1; second < recent.length; second += 1) {
        const start = recent[first];
        const end = recent[second];
        if (end.index - start.index < config.minimumPivotDistanceBars) continue;
        if (kind === 'support' && end.price <= start.price) continue;
        if (kind === 'resistance' && end.price >= start.price) continue;

        const slope = (end.price - start.price) / (end.index - start.index);
        let touches = 0;
        let violations = 0;
        let strengthTotal = 0;
        for (const pivot of recent) {
          if (pivot.index < start.index) continue;
          const projected = start.price + slope * (pivot.index - start.index);
          const difference = pivot.price - projected;
          if (Math.abs(difference) <= tolerance) {
            touches += 1;
            strengthTotal += pivot.strength;
          }
          if (kind === 'resistance' && difference > tolerance) violations += 1;
          if (kind === 'support' && difference < -tolerance) violations += 1;
        }
        if (touches < config.minimumTrendlineTouches) continue;

        const recencyWeight = 1 - ((candles.length - 1 - end.index) / Math.max(candles.length, 1));
        const spanWeight = Math.min((end.index - start.index) / 80, 1);
        const strengthWeight = clampNumber(strengthTotal / Math.max(touches, 1), 1, 8) / 8;
        const score = touches * 20 + recencyWeight * 18 + spanWeight * 15 + strengthWeight * 12 - violations * 20;
        const latestPrice = start.price + slope * ((candles.length - 1) - start.index);
        const candidate: TrendlineModel = {
          kind,
          startIndex: start.index,
          endIndex: end.index,
          startPrice: start.price,
          endPrice: end.price,
          slope,
          touches,
          score,
          latestPrice,
        };
        if (!best || candidate.score > best.score) best = candidate;
      }
    }
    return best;
  };

  const support = buildCandidate('support', pivots.lows);
  const resistance = buildCandidate('resistance', pivots.highs);
  const preferSupport = (closes[closes.length - 1] ?? 0) >= movingAverageLast;
  const rank = (candidate: TrendlineModel | null) => {
    if (!candidate) return -Infinity;
    const distance = Math.abs((closes[closes.length - 1] ?? 0) - candidate.latestPrice) / Math.max(atr14, 1e-8);
    const biasBoost = (preferSupport && candidate.kind === 'support') || (!preferSupport && candidate.kind === 'resistance') ? 8 : 0;
    return candidate.score - distance * 7 + biasBoost;
  };
  return rank(support) >= rank(resistance) ? support : resistance;
}

function countConsecutiveClosesAbove(candles: Candle[], level: number, buffer: number) {
  let count = 0;
  for (let index = candles.length - 1; index >= 0; index -= 1) {
    if (candles[index].close > level + buffer) count += 1;
    else break;
  }
  return count;
}

function maxConsecutiveClosesAbove(candles: Candle[], level: number, buffer: number) {
  let current = 0;
  let maximum = 0;
  for (const candle of candles) {
    if (candle.close > level + buffer) {
      current += 1;
      maximum = Math.max(maximum, current);
    } else {
      current = 0;
    }
  }
  return maximum;
}

function computeBreakoutInsight(
  candles: Candle[],
  atr14: number,
  resistanceLevels: ResistanceLevel[],
  trendline: TrendlineModel | null,
  config: StructureConfig,
  longScore?: CandidateScore | null,
  shortScore?: CandidateScore | null,
): BreakoutInsight {
  const last = candles[candles.length - 1];
  if (!last) {
    return {
      state: 'WATCHING',
      referencePrice: null,
      buffer: 0,
      score: 0,
      volumeRatio: 0,
      closeClearance: 0,
      closePosition: 0,
      bodyRatio: 0,
      confirmationBars: 0,
      requiredConfirmationBars: config.requiredConfirmationBars,
      label: 'Awaiting structure',
      bias: 'neutral',
    };
  }

  const nearestResistance = resistanceLevels.length
    ? [...resistanceLevels].sort((left, right) => Math.abs(left.price - last.close) - Math.abs(right.price - last.close))[0]
    : null;
  const referencePrice = nearestResistance?.price ?? (trendline?.kind === 'resistance' ? trendline.latestPrice : null);
  const buffer = Math.max(atr14 * config.breakoutBufferAtr, last.close * config.breakoutBufferPct, 1e-8);
  const candleRange = Math.max(last.high - last.low, 1e-8);
  const closePosition = (last.close - last.low) / candleRange;
  const bodyRatio = Math.abs(last.close - last.open) / candleRange;
  const recentVolumes = candles.slice(Math.max(0, candles.length - 20)).map((candle) => candle.volume);
  const volumeRatio = last.volume / Math.max(average(recentVolumes), 1);
  const closeClearance = referencePrice == null ? 0 : last.close - referencePrice;
  const confirmationBars = referencePrice == null ? 0 : countConsecutiveClosesAbove(candles, referencePrice, buffer);
  const priorWindow = candles.slice(Math.max(0, candles.length - config.failedBreakoutWindowBars - 1), candles.length - 1);
  const hadPriorBreak = referencePrice != null
    && maxConsecutiveClosesAbove(priorWindow, referencePrice, buffer) >= config.requiredConfirmationBars;

  let state: BreakoutState = 'WATCHING';
  if (referencePrice != null) {
    const confirmationQuality = closePosition >= config.minimumClosePosition
      && bodyRatio >= config.minimumBodyRatio
      && volumeRatio >= config.minimumVolumeRatio;
    if (hadPriorBreak && last.close < referencePrice - buffer * 0.35) state = 'FAILED';
    else if (hadPriorBreak && last.low <= referencePrice + atr14 * config.retestToleranceAtr && last.close > referencePrice) state = 'RETEST';
    else if (confirmationBars >= config.requiredConfirmationBars && confirmationQuality) state = 'CONFIRMED';
    else if (last.close > referencePrice || last.high > referencePrice + buffer * 0.35 || confirmationBars > 0) state = 'BUILDING';
  }

  const strengthSource = resistanceLevels[0]?.score ?? trendline?.score ?? 40;
  const closeNorm = clampNumber((closeClearance + buffer) / (buffer * 3), 0, 1);
  const volumeNorm = clampNumber((volumeRatio - 0.85) / 0.75, 0, 1);
  const bodyNorm = clampNumber(bodyRatio / 0.75, 0, 1);
  const positionNorm = clampNumber(closePosition, 0, 1);
  const structureNorm = clampNumber((strengthSource - 25) / 60, 0, 1);
  const alignmentNorm = longScore && shortScore
    ? clampNumber(((longScore.score - shortScore.score) + 50) / 100, 0, 1)
    : 0.5;
  const confirmationNorm = clampNumber(confirmationBars / Math.max(config.requiredConfirmationBars, 1), 0, 1);
  const score = Math.round(
    closeNorm * 24
    + volumeNorm * 20
    + bodyNorm * 13
    + positionNorm * 10
    + structureNorm * 10
    + alignmentNorm * 10
    + confirmationNorm * 13,
  );
  const bias: BreakoutInsight['bias'] = longScore && shortScore
    ? (longScore.score > shortScore.score ? 'bullish' : longScore.score < shortScore.score ? 'bearish' : 'neutral')
    : state === 'FAILED'
      ? 'bearish'
      : state === 'CONFIRMED' || state === 'RETEST' || state === 'BUILDING'
        ? 'bullish'
        : 'neutral';
  const label = state === 'CONFIRMED'
    ? 'Breakout confirmed'
    : state === 'RETEST'
      ? 'Retest holding'
      : state === 'FAILED'
        ? 'Failed breakout'
        : state === 'BUILDING'
          ? 'Pressure building'
          : 'Watching level';

  return {
    state,
    referencePrice,
    buffer,
    score,
    volumeRatio,
    closeClearance,
    closePosition,
    bodyRatio,
    confirmationBars,
    requiredConfirmationBars: config.requiredConfirmationBars,
    label,
    bias,
  };
}

function resolveCalibratedProbability(longScore?: CandidateScore | null, shortScore?: CandidateScore | null) {
  const preferred = longScore && shortScore
    ? (longScore.score >= shortScore.score ? longScore : shortScore)
    : longScore ?? shortScore ?? null;
  const probability = preferred?.canonicalDecision?.calibratedProbability;
  if (probability == null || !Number.isFinite(probability)) return null;
  return probability <= 1 ? probability * 100 : probability;
}

export function buildChartStructureAnalysis(
  candles: Candle[],
  derivedLevels?: DerivedLevels | null,
  longScore?: CandidateScore | null,
  shortScore?: CandidateScore | null,
  options?: { riskProfile?: AnalysisRiskProfile; interval?: string },
): ChartStructureAnalysis | null {
  if (!candles.length) return null;
  const riskProfile = options?.riskProfile ?? 'AGGRESSIVE';
  const interval = options?.interval ?? '15m';
  const config = resolveConfig(riskProfile, interval);
  const atr14 = computeAtr14(candles);
  const pivots = computePivots(candles, config.pivotLeft, config.pivotRight);
  const resistanceLevels = clusterResistanceLevels(candles, pivots.highs, atr14, config, derivedLevels);
  const trendline = computePrimaryTrendline(candles, atr14, pivots, config);
  const breakout = computeBreakoutInsight(candles, atr14, resistanceLevels, trendline, config, longScore, shortScore);
  const setupBias: ChartStructureAnalysis['setupBias'] = longScore && shortScore
    ? (longScore.score > shortScore.score ? 'bullish' : longScore.score < shortScore.score ? 'bearish' : 'neutral')
    : breakout.bias;
  const setupScore = longScore && shortScore ? Math.max(longScore.score, shortScore.score) : null;
  const confidence = derivedLevels?.confidenceScore
    ?? (setupScore != null ? Math.round((setupScore + breakout.score) / 2) : breakout.score);
  const calibratedProbability = resolveCalibratedProbability(longScore, shortScore);
  const successLabel = confidence >= 80
    ? 'High quality'
    : confidence >= 65
      ? 'Constructive'
      : confidence >= 50
        ? 'Developing'
        : 'Early / mixed';
  return {
    atr14,
    riskProfile,
    resistanceLevels,
    trendline,
    breakout,
    setupBias,
    setupScore,
    confidence,
    calibratedProbability,
    successLabel,
  };
}
