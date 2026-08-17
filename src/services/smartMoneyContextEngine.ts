/* Copied verbatim from apex-trading-engine/src/services/smartMoneyContextEngine.ts */

import type { Candlestick, SmartMoneyContext, SmartMoneySetupModel, SmartMoneyControlSide } from '../types';

export function smcAlignmentForDirection(directional: number, direction: 'SHORT' | 'LONG'): number {
  const d = Number.isFinite(directional) ? directional : 0;
  return direction === 'LONG'
    ? clamp01((d + 1) / 2)
    : clamp01((-d + 1) / 2);
}

function clamp(v: number, min = -1, max = 1): number {
  return Math.max(min, Math.min(max, Number.isFinite(v) ? v : 0));
}
function clamp01(v: number): number { return clamp(v, 0, 1); }
function avg(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}
function range(c: Candlestick): number {
  return Math.max(1e-9, c.high - c.low);
}
function body(c: Candlestick): number {
  return Math.abs(c.close - c.open);
}
function isBear(c: Candlestick): boolean {
  return c.close < c.open;
}
function isBull(c: Candlestick): boolean {
  return c.close > c.open;
}
function closeLocation(c: Candlestick): number {
  return clamp01((c.close - c.low) / range(c));
}
function normalizeByPrice(delta: number, price: number, scale = 0.003): number {
  const denom = Math.max(1e-9, Math.abs(price) * scale);
  return clamp(delta / denom);
}

function recent(candles: Candlestick[] | undefined, n: number): Candlestick[] {
  if (!Array.isArray(candles)) return [];
  return candles.filter(c =>
    Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close) &&
    c.high >= c.low && c.open > 0 && c.close > 0
  ).slice(-n);
}

function detectBearishIFC(candles: Candlestick[]): number {
  if (candles.length < 4) return 0;
  let best = 0;
  const sample = candles.slice(-10);
  for (let i = 2; i < sample.length; i++) {
    const left = sample[i - 2];
    const mid = sample[i - 1];
    const right = sample[i];
    const gap = left.low - right.high;
    const gapScore = gap > 0 ? clamp01(gap / Math.max(range(mid), range(left), 1e-9)) : 0;
    const impulse = isBear(mid) ? clamp01(body(mid) / range(mid)) : 0;
    const closeWeak = 1 - closeLocation(right);
    best = Math.max(best, gapScore * 0.55 + impulse * 0.30 + closeWeak * 0.15);
  }
  const last = sample.at(-1);
  const prev = sample.at(-2);
  if (last && prev) {
    const displacement = isBear(last) ? clamp01(body(last) / (avg(sample.map(range)) || range(last))) : 0;
    const followThrough = clamp01((prev.close - last.close) / Math.max(range(prev), 1e-9));
    best = Math.max(best, displacement * 0.55 + followThrough * 0.25);
  }
  return clamp01(best);
}

function detectBullishIFC(candles: Candlestick[]): number {
  if (candles.length < 4) return 0;
  let best = 0;
  const sample = candles.slice(-10);
  for (let i = 2; i < sample.length; i++) {
    const left = sample[i - 2];
    const mid = sample[i - 1];
    const right = sample[i];
    const gap = right.low - left.high;
    const gapScore = gap > 0 ? clamp01(gap / Math.max(range(mid), range(left), 1e-9)) : 0;
    const impulse = isBull(mid) ? clamp01(body(mid) / range(mid)) : 0;
    const closeStrong = closeLocation(right);
    best = Math.max(best, gapScore * 0.55 + impulse * 0.30 + closeStrong * 0.15);
  }
  const last = sample.at(-1);
  const prev = sample.at(-2);
  if (last && prev) {
    const displacement = isBull(last) ? clamp01(body(last) / (avg(sample.map(range)) || range(last))) : 0;
    const followThrough = clamp01((last.close - prev.close) / Math.max(range(prev), 1e-9));
    best = Math.max(best, displacement * 0.55 + followThrough * 0.25);
  }
  return clamp01(best);
}

function swingHighs(candles: Candlestick[]): number[] {
  const out: number[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i - 2].high &&
        candles[i].high >= candles[i + 1].high && candles[i].high >= candles[i + 2].high) out.push(candles[i].high);
  }
  return out;
}
function swingLows(candles: Candlestick[]): number[] {
  const out: number[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i - 2].low &&
        candles[i].low <= candles[i + 1].low && candles[i].low <= candles[i + 2].low) out.push(candles[i].low);
  }
  return out;
}

function bearishBreakOfStructure(candles: Candlestick[]): number {
  if (candles.length < 8) return 0;
  const lows = swingLows(candles.slice(0, -1));
  if (!lows.length) return 0;
  const last = candles.at(-1)!;
  const prevLow = lows.at(-1)!;
  const breakDepth = prevLow - last.close;
  const impulse = isBear(last) ? body(last) / range(last) : 0;
  return clamp01(normalizeByPrice(breakDepth, last.close, 0.0025) * 0.65 + impulse * 0.35);
}

function bullishBreakOfStructure(candles: Candlestick[]): number {
  if (candles.length < 8) return 0;
  const highs = swingHighs(candles.slice(0, -1));
  if (!highs.length) return 0;
  const last = candles.at(-1)!;
  const prevHigh = highs.at(-1)!;
  const breakDepth = last.close - prevHigh;
  const impulse = isBull(last) ? body(last) / range(last) : 0;
  return clamp01(normalizeByPrice(breakDepth, last.close, 0.0025) * 0.65 + impulse * 0.35);
}

function liquiditySweepBearish(candles: Candlestick[]): number {
  if (candles.length < 8) return 0;
  const sample = candles.slice(-16);
  const last = sample.at(-1)!;
  const prior = sample.slice(0, -1);
  const highCluster = Math.max(...prior.map(c => c.high));
  const tolerance = last.close * 0.0008;
  const equalHighCount = prior.filter(c => Math.abs(c.high - highCluster) <= tolerance).length;
  const swept = last.high > highCluster + tolerance && last.close < highCluster;
  const wickReject = clamp01((last.high - Math.max(last.open, last.close)) / range(last));
  return swept ? clamp01(0.50 + equalHighCount * 0.12 + wickReject * 0.35) : 0;
}

function liquiditySweepBullish(candles: Candlestick[]): number {
  if (candles.length < 8) return 0;
  const sample = candles.slice(-16);
  const last = sample.at(-1)!;
  const prior = sample.slice(0, -1);
  const lowCluster = Math.min(...prior.map(c => c.low));
  const tolerance = last.close * 0.0008;
  const equalLowCount = prior.filter(c => Math.abs(c.low - lowCluster) <= tolerance).length;
  const swept = last.low < lowCluster - tolerance && last.close > lowCluster;
  const wickReject = clamp01((Math.min(last.open, last.close) - last.low) / range(last));
  return swept ? clamp01(0.50 + equalLowCount * 0.12 + wickReject * 0.35) : 0;
}

function zoneFreshnessSupply(candles: Candlestick[]): number {
  if (candles.length < 6) return 0;
  const sample = candles.slice(-28);
  for (let i = sample.length - 3; i >= 1; i--) {
    const origin = sample[i - 1];
    const displacement = sample[i];
    if (!isBull(origin) || !isBear(displacement)) continue;
    const dispScore = clamp01(body(displacement) / (avg(sample.map(range)) || range(displacement)));
    if (dispScore < 0.55) continue;
    const zoneLow = Math.min(origin.open, origin.close);
    const zoneHigh = origin.high;
    const mitigated = sample.slice(i + 1).some(c => c.high >= zoneLow && c.low <= zoneHigh);
    const agePenalty = clamp01((sample.length - i) / 28);
    return clamp01((mitigated ? 0.25 : 1.0) * (0.70 + dispScore * 0.30) * (1 - agePenalty * 0.35));
  }
  return 0;
}

function zoneFreshnessDemand(candles: Candlestick[]): number {
  if (candles.length < 6) return 0;
  const sample = candles.slice(-28);
  for (let i = sample.length - 3; i >= 1; i--) {
    const origin = sample[i - 1];
    const displacement = sample[i];
    if (!isBear(origin) || !isBull(displacement)) continue;
    const dispScore = clamp01(body(displacement) / (avg(sample.map(range)) || range(displacement)));
    if (dispScore < 0.55) continue;
    const zoneLow = origin.low;
    const zoneHigh = Math.max(origin.open, origin.close);
    const mitigated = sample.slice(i + 1).some(c => c.high >= zoneLow && c.low <= zoneHigh);
    const agePenalty = clamp01((sample.length - i) / 28);
    return clamp01((mitigated ? 0.25 : 1.0) * (0.70 + dispScore * 0.30) * (1 - agePenalty * 0.35));
  }
  return 0;
}

function demandFailureFlip(candles: Candlestick[]): number {
  if (candles.length < 10) return 0;
  const sample = candles.slice(-18);
  const last = sample.at(-1)!;
  const highs = swingHighs(sample);
  const lows = swingLows(sample);
  const noNewHigh = highs.length >= 2 ? highs.at(-1)! <= highs.at(-2)! * 1.001 : last.high < Math.max(...sample.slice(0, -4).map(c => c.high));
  const brokenDemand = bearishBreakOfStructure(sample);
  const ifc = detectBearishIFC(sample);
  return clamp01((noNewHigh ? 0.28 : 0) + brokenDemand * 0.42 + ifc * 0.30 + (lows.length ? 0.05 : 0));
}

function supplyFailureFlip(candles: Candlestick[]): number {
  if (candles.length < 10) return 0;
  const sample = candles.slice(-18);
  const last = sample.at(-1)!;
  const highs = swingHighs(sample);
  const lows = swingLows(sample);
  const noNewLow = lows.length >= 2 ? lows.at(-1)! >= lows.at(-2)! * 0.999 : last.low > Math.min(...sample.slice(0, -4).map(c => c.low));
  const brokenSupply = bullishBreakOfStructure(sample);
  const ifc = detectBullishIFC(sample);
  return clamp01((noNewLow ? 0.28 : 0) + brokenSupply * 0.42 + ifc * 0.30 + (highs.length ? 0.05 : 0));
}

function trendBias(candles: Candlestick[]): number {
  if (candles.length < 8) return 0;
  const sample = candles.slice(-30);
  const first = sample[0].close;
  const last = sample.at(-1)!.close;
  const slope = normalizeByPrice(last - first, last, 0.012);
  const highs = swingHighs(sample);
  const lows = swingLows(sample);
  const lowerHighs = highs.length >= 2 && highs.at(-1)! < highs.at(-2)! ? -0.18 : 0;
  const lowerLows = lows.length >= 2 && lows.at(-1)! < lows.at(-2)! ? -0.18 : 0;
  const higherHighs = highs.length >= 2 && highs.at(-1)! > highs.at(-2)! ? 0.18 : 0;
  const higherLows = lows.length >= 2 && lows.at(-1)! > lows.at(-2)! ? 0.18 : 0;
  return clamp(slope + lowerHighs + lowerLows + higherHighs + higherLows);
}

export interface SmartMoneyInput {
  candles1m?: Candlestick[];
  candles5m?: Candlestick[];
  candles15m?: Candlestick[];
  candles4h?: Candlestick[];
  direction?: 'SHORT' | 'LONG';
}

export function deriveSmartMoneyContext(input: SmartMoneyInput): SmartMoneyContext {
  const c1 = recent(input.candles1m, 80);
  const c5 = recent(input.candles5m, 80);
  const c15 = recent(input.candles15m, 80);
  const c4h = recent(input.candles4h, 60);

  const m1 = c1.length ? c1 : c5;
  const m5 = c5.length ? c5 : c15;
  const htf = c4h.length ? c4h : (c15.length ? c15 : c5);

  const bearishIFC = clamp01(detectBearishIFC(m1) * 0.60 + detectBearishIFC(m5) * 0.40);
  const bullishIFC = clamp01(detectBullishIFC(m1) * 0.60 + detectBullishIFC(m5) * 0.40);
  const bearishBOS = clamp01(bearishBreakOfStructure(m1) * 0.62 + bearishBreakOfStructure(m5) * 0.38);
  const bullishBOS = clamp01(bullishBreakOfStructure(m1) * 0.62 + bullishBreakOfStructure(m5) * 0.38);
  const bearFlip = clamp01(demandFailureFlip(m1) * 0.65 + demandFailureFlip(m5) * 0.35);
  const bullFlip = clamp01(supplyFailureFlip(m1) * 0.65 + supplyFailureFlip(m5) * 0.35);
  const bearSweep = clamp01(liquiditySweepBearish(m1) * 0.70 + liquiditySweepBearish(m5) * 0.30);
  const bullSweep = clamp01(liquiditySweepBullish(m1) * 0.70 + liquiditySweepBullish(m5) * 0.30);
  const supplyFresh = clamp01(zoneFreshnessSupply(c5) * 0.50 + zoneFreshnessSupply(c15) * 0.35 + zoneFreshnessSupply(c4h) * 0.15);
  const demandFresh = clamp01(zoneFreshnessDemand(c5) * 0.50 + zoneFreshnessDemand(c15) * 0.35 + zoneFreshnessDemand(c4h) * 0.15);

  const htfBias = trendBias(htf);
  const midBias = trendBias(m5);
  const fastBias = trendBias(m1);
  const smartMoneyBiasScore = clamp(htfBias * 0.45 + midBias * 0.35 + fastBias * 0.20);

  const htfSupplyInControl = smartMoneyBiasScore < -0.12 || supplyFresh > demandFresh + 0.15;
  const htfDemandInControl = smartMoneyBiasScore > 0.12 || demandFresh > supplyFresh + 0.15;

  const bearishChoch = clamp01(bearishBOS * 0.55 + bearishIFC * 0.25 + (htfSupplyInControl ? 0.20 : 0));
  const bullishChoch = clamp01(bullishBOS * 0.55 + bullishIFC * 0.25 + (htfDemandInControl ? 0.20 : 0));
  const bearishContinuation = clamp01((smartMoneyBiasScore < -0.10 ? 0.35 : 0) + bearishIFC * 0.25 + supplyFresh * 0.25 + bearishBOS * 0.15);
  const bullishContinuation = clamp01((smartMoneyBiasScore > 0.10 ? 0.35 : 0) + bullishIFC * 0.25 + demandFresh * 0.25 + bullishBOS * 0.15);

  const bearishModelScore = clamp01(
    bearFlip * 0.28 + bearishChoch * 0.22 + bearishContinuation * 0.16 + bearishIFC * 0.12 + bearSweep * 0.12 + supplyFresh * 0.10
  );
  const bullishModelScore = clamp01(
    bullFlip * 0.28 + bullishChoch * 0.22 + bullishContinuation * 0.16 + bullishIFC * 0.12 + bullSweep * 0.12 + demandFresh * 0.10
  );

  const directional = clamp(bullishModelScore - bearishModelScore + smartMoneyBiasScore * 0.30);
  const shortAlignment = clamp01((-directional + 1) / 2);
  const longAlignment = clamp01((directional + 1) / 2);
  const smcContextScore = input.direction === 'LONG' ? longAlignment : input.direction === 'SHORT' ? shortAlignment : Math.max(shortAlignment, longAlignment);

  let setupModel: SmartMoneySetupModel = 'NONE';
  const dominantBear = Math.max(bearFlip, bearishChoch, bearishContinuation, bearSweep);
  const dominantBull = Math.max(bullFlip, bullishChoch, bullishContinuation, bullSweep);
  const dominant = Math.max(dominantBear, dominantBull);
  if (dominant > 0.30) {
    if (dominant === Math.max(bearFlip, bullFlip)) setupModel = 'FLIP';
    else if (dominant === Math.max(bearishChoch, bullishChoch)) setupModel = 'CHOCH';
    else if (dominant === Math.max(bearSweep, bullSweep)) setupModel = 'LIQUIDITY_SWEEP_REVERSAL';
    else setupModel = 'CONTINUATION';
  }

  const controlSide: SmartMoneyControlSide =
    htfSupplyInControl && !htfDemandInControl ? 'SUPPLY' :
    htfDemandInControl && !htfSupplyInControl ? 'DEMAND' :
    directional < -0.12 ? 'SUPPLY' :
    directional > 0.12 ? 'DEMAND' : 'NEUTRAL';

  const reasons: string[] = [];
  if (htfSupplyInControl) reasons.push('HTF supply appears in control.');
  if (htfDemandInControl) reasons.push('HTF demand appears in control.');
  if (bearFlip > 0.45) reasons.push('Bearish S/D flip: demand failed and was broken with displacement.');
  if (bearishChoch > 0.45) reasons.push('Bearish CHoCH/BOS with imbalance.');
  if (bearSweep > 0.40) reasons.push('Liquidity above was swept and rejected.');
  if (supplyFresh > 0.45) reasons.push('Fresh or lightly mitigated supply zone is nearby.');
  if (!reasons.length) reasons.push('SMC context is neutral or still warming.');

  return {
    smcDirectionalScore: Number(directional.toFixed(6)),
    smcContextScore: Number(smcContextScore.toFixed(6)),
    setupModel,
    controlSide,
    smartMoneyBiasScore: Number(smartMoneyBiasScore.toFixed(6)),
    flipSetupScore: Number((bearFlip - bullFlip).toFixed(6)),
    chochSetupScore: Number((bearishChoch - bullishChoch).toFixed(6)),
    continuationScore: Number((bearishContinuation - bullishContinuation).toFixed(6)),
    ifcQualityScore: Number((bearishIFC - bullishIFC).toFixed(6)),
    liquiditySweepScore: Number((bearSweep - bullSweep).toFixed(6)),
    zoneFreshnessScore: Number((supplyFresh - demandFresh).toFixed(6)),
    unmitigatedZoneProximity: Number(Math.max(supplyFresh, demandFresh).toFixed(6)),
    htfSupplyInControl,
    htfDemandInControl,
    reasons,
  };
}
