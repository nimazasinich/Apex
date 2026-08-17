/* Copied verbatim from apex-trading-engine/src/services/mathEngine.ts, plus
 * clampHeuristicAdjustment (originally in apex-trading-engine/src/services/
 * marketData.ts) appended at the bottom so scannerCore.ts can import both
 * MathEngine and clampHeuristicAdjustment from this cohesive math module
 * without porting the rest of that 1700+ line market-data monolith
 * (which is a live-polling/state monolith, unrelated to this route layer). */

import type { OrderBook, Candlestick, MemoryLog, BinanceSentiment, OITrendDirection, Levels, ScoringBreakdown, ScoringWeights } from '../types';

export class MathEngine {

  static calculateOBI(book: OrderBook): number {
    if (!book.bids.length || !book.asks.length) return 0;
    const Vbid = book.bids.slice(0, 5).reduce((s, b) => s + b.volume, 0);
    const Vask = book.asks.slice(0, 5).reduce((s, a) => s + a.volume, 0);
    const total = Vbid + Vask;
    return total === 0 ? 0 : (Vbid - Vask) / total;
  }

  static calculateMicroPrice(book: OrderBook): number {
    if (!book.bids[0] || !book.asks[0]) return 0;
    const Pb = book.bids[0].price,  Vb = book.bids[0].volume;
    const Pa = book.asks[0].price,  Va = book.asks[0].volume;
    const total = Vb + Va;
    return total === 0 ? (Pb + Pa) / 2 : (Pa * Vb + Pb * Va) / total;
  }

  static calculateSpread(book: OrderBook): number {
    if (!book.bids[0] || !book.asks[0]) return 0;
    return book.asks[0].price - book.bids[0].price;
  }

  static calculateATR(candles: Candlestick[], period = 14): number {
    if (candles.length < 2) return 0;
    const alpha = 2 / (period + 1);
    let atr = 0;
    let initialized = false;

    for (let i = 1; i < candles.length; i++) {
      const H = candles[i].high;
      const L = candles[i].low;
      const Cp = candles[i - 1].close;
      const TR = Math.max(H - L, Math.abs(H - Cp), Math.abs(L - Cp));

      if (!initialized) {
        atr = TR;
        initialized = true;
      } else {
        atr = alpha * TR + (1 - alpha) * atr;
      }
    }
    return parseFloat(atr.toFixed(6));
  }

  static calculateQStruct(params: {
    confluence1M: number;
    confluence5M: number;
    confluence15M: number;
    zonesCount: number;
    averageZoneScore: number;
  }): number {
    const { confluence1M, confluence5M, confluence15M, zonesCount, averageZoneScore } = params;
    const raw =
      confluence1M  * 0.20 +
      confluence5M  * 0.35 +
      confluence15M * 0.45 +
      (zonesCount > 0 ? averageZoneScore * 0.8 : 0);
    return Math.max(0, Math.min(100, parseFloat(((raw / 2) * 100).toFixed(2))));
  }

  static clamp(value: number, min = -1, max = 1): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(min, Math.min(max, value));
  }

  static calculateQStructDirectional(params: {
    confluence1M: number;
    confluence5M: number;
    confluence15M: number;
    confluence1MAvailable?: boolean;
    confluence5MAvailable?: boolean;
    confluence15MAvailable?: boolean;
  }): number {
    const inputs = [
      { value: params.confluence1M,  weight: 0.20, available: params.confluence1MAvailable ?? true },
      { value: params.confluence5M,  weight: 0.35, available: params.confluence5MAvailable ?? true },
      { value: params.confluence15M, weight: 0.45, available: params.confluence15MAvailable ?? true },
    ].filter(i => i.available && Number.isFinite(i.value));

    const totalWeight = inputs.reduce((s, i) => s + i.weight, 0);
    if (totalWeight <= 0) return 0;

    const weighted = inputs.reduce((s, i) => s + MathEngine.clamp(i.value) * i.weight, 0) / totalWeight;
    return parseFloat(MathEngine.clamp(weighted).toFixed(6));
  }

  static signedVolumeScore(netVolumeDelta: number, thresholdAbs = 1): number {
    const denom = Math.max(1e-9, Math.abs(thresholdAbs || 1));
    return parseFloat(MathEngine.clamp(netVolumeDelta / denom).toFixed(6));
  }

  static fundingBiasScore(fundingRate: number, threshold = 0.0001): number {
    const denom = Math.max(1e-9, Math.abs(threshold || 0.0001));
    return parseFloat(MathEngine.clamp(-fundingRate / denom).toFixed(6));
  }

  static oiExpansionScore(changePercent: number | undefined, thresholdPct = 0.30): number {
    if (!Number.isFinite(changePercent as number)) return 0;
    const denom = Math.max(1e-9, Math.abs(thresholdPct || 0.30));
    return parseFloat(MathEngine.clamp((changePercent as number) / denom).toFixed(6));
  }

  static atrExpansionScore(atr: number, price: number, threshold = 0.005): number {
    if (!Number.isFinite(atr) || !Number.isFinite(price) || atr <= 0 || price <= 0) return 0;
    const atrPct = atr / price;
    const denom = Math.max(1e-9, Math.abs(threshold || 0.005));
    return parseFloat(MathEngine.clamp(atrPct / denom, 0, 1).toFixed(6));
  }

  static microPriceSkewScore(microPrice: number, referencePrice: number, spread = 0): number {
    if (!Number.isFinite(microPrice) || !Number.isFinite(referencePrice) || microPrice <= 0 || referencePrice <= 0) return 0;
    const normalizer = Math.max(Math.abs(spread || 0) * 0.5, referencePrice * 0.0002, 1e-9);
    return parseFloat(MathEngine.clamp((microPrice - referencePrice) / normalizer).toFixed(6));
  }

  static liquidityQualityScore(spread: number, atr: number, price: number): number {
    if (!Number.isFinite(spread) || !Number.isFinite(price) || price <= 0) return 0.5;
    const volatilityDenom = Math.max(Number.isFinite(atr) && atr > 0 ? atr : 0, price * 0.001);
    const spreadToVol = Math.max(0, spread) / Math.max(1e-9, volatilityDenom);
    return parseFloat((1 - MathEngine.clamp(spreadToVol / 0.25, 0, 1)).toFixed(6));
  }

  static squeezeRiskScore(params: {
    direction: 'SHORT' | 'LONG';
    fundingRate?: number;
    fundingThreshold?: number;
    sentiment?: BinanceSentiment | null;
    oiChangePercent?: number;
    qStructDirectional?: number;
    liquidityQuality?: number;
  }): number {
    const dir = params.direction;
    const funding = params.fundingRate ?? 0;
    const fundingThreshold = Math.max(1e-9, Math.abs(params.fundingThreshold ?? 0.0001));

    const fundingAgainst = dir === 'SHORT'
      ? MathEngine.clamp((-funding) / fundingThreshold, 0, 1)
      : MathEngine.clamp(funding / fundingThreshold, 0, 1);

    const ls = params.sentiment?.longShortRatio;
    const taker = params.sentiment?.takerBuySellRatio;
    const sentimentAgainst = Number.isFinite(ls as number)
      ? (dir === 'SHORT'
          ? MathEngine.clamp((0.85 - (ls as number)) / 0.45, 0, 1)
          : MathEngine.clamp(((ls as number) - 1.35) / 0.65, 0, 1))
      : 0;
    const takerAgainst = Number.isFinite(taker as number)
      ? (dir === 'SHORT'
          ? MathEngine.clamp(((taker as number) - 1.05) / 0.35, 0, 1)
          : MathEngine.clamp((0.95 - (taker as number)) / 0.35, 0, 1))
      : 0;

    const oiExpansion = MathEngine.clamp(Math.max(0, params.oiChangePercent ?? 0) / 0.30, 0, 1);
    const weakStructure = 1 - MathEngine.clamp(Math.abs(params.qStructDirectional ?? 0) / 0.35, 0, 1);
    const oiTrap = oiExpansion * weakStructure;
    const liquidityRisk = 1 - MathEngine.clamp(params.liquidityQuality ?? 0.5, 0, 1);

    const risk =
      fundingAgainst * 0.28 +
      sentimentAgainst * 0.22 +
      takerAgainst * 0.20 +
      oiTrap * 0.18 +
      liquidityRisk * 0.12;
    return parseFloat(MathEngine.clamp(risk, 0, 1).toFixed(6));
  }

  static evidenceAgreementScore(breakdown: ScoringBreakdown): number {
    const factors = [
      breakdown.obi,
      breakdown.qStruct,
      breakdown.volume,
      breakdown.funding,
      breakdown.openInterest,
      breakdown.atr,
      breakdown.microstructure,
      breakdown.liquidity,
      breakdown.smc,
    ].filter(v => Number.isFinite(v));
    if (!factors.length) return 0;
    const aligned = factors.filter(v => v > 0.05).length;
    const hostile = factors.filter(v => v < -0.05).length;
    return parseFloat(MathEngine.clamp((aligned - hostile * 0.5) / factors.length, 0, 1).toFixed(6));
  }

  static readonly ATLAS_MODEL_VERSION = 'ATLAS_PLUS_V2.1_EXPLAINABLE_REPLAY';

  static proposalAtlasScoreWeights(): ScoringWeights {
    return { obi: 0.20, qStruct: 0.25, volume: 0.18, funding: 0.09, openInterest: 0.09, atr: 0.07, microstructure: 0.08, liquidity: 0.04, smc: 0.00 };
  }

  static productionScoreWeights(): ScoringWeights {
    return { obi: 0.19, qStruct: 0.24, volume: 0.17, funding: 0.08, openInterest: 0.08, atr: 0.06, microstructure: 0.08, liquidity: 0.05, smc: 0.05 };
  }

  static normalizeScoreWeights(weights: Partial<ScoringWeights> | undefined): ScoringWeights {
    const base = { ...MathEngine.productionScoreWeights(), ...(weights ?? {}) };
    const keys: Array<keyof ScoringWeights> = ['obi', 'qStruct', 'volume', 'funding', 'openInterest', 'atr', 'microstructure', 'liquidity', 'smc'];
    const clamped = Object.fromEntries(keys.map(k => [k, MathEngine.clamp(Number(base[k]), 0, 0.70)])) as unknown as ScoringWeights;
    const total = keys.reduce((sum, k) => sum + clamped[k], 0) || 1;
    const out = { ...clamped };
    keys.forEach(k => { out[k] = parseFloat((clamped[k] / total).toFixed(4)); });
    return out;
  }

  static defaultScoreWeights(): ScoringWeights {
    return MathEngine.productionScoreWeights();
  }

  static calculateDirectionalRawScore(params: {
    direction: 'SHORT' | 'LONG';
    obi: number;
    qStructDirectional: number;
    netVolumeDelta: number;
    volumeThresholdAbs?: number;
    fundingRate?: number;
    fundingThreshold?: number;
    oiChangePercent?: number;
    oiExpansionThresholdPct?: number;
    atr?: number;
    price?: number;
    atrExpansionThreshold?: number;
    microPrice?: number;
    spread?: number;
    smcDirectionalScore?: number;
    weights?: Partial<ScoringWeights>;
  }): { rawScore: number; breakdown: ScoringBreakdown } {
    const weights: ScoringWeights = MathEngine.normalizeScoreWeights(params.weights);
    const directionSign = params.direction === 'LONG' ? 1 : -1;

    const obiScore = MathEngine.clamp(params.obi);
    const qScore = MathEngine.clamp(params.qStructDirectional);
    const volScore = MathEngine.signedVolumeScore(params.netVolumeDelta, params.volumeThresholdAbs ?? 1);
    const fundingScore = MathEngine.fundingBiasScore(params.fundingRate ?? 0, params.fundingThreshold ?? 0.0001);
    const oiScore = MathEngine.oiExpansionScore(params.oiChangePercent, params.oiExpansionThresholdPct ?? 0.30);
    const atrScore = MathEngine.atrExpansionScore(params.atr ?? 0, params.price ?? 0, params.atrExpansionThreshold ?? 0.005);
    const microScore = MathEngine.microPriceSkewScore(params.microPrice ?? 0, params.price ?? 0, params.spread ?? 0);
    const liquidityScore = MathEngine.liquidityQualityScore(params.spread ?? 0, params.atr ?? 0, params.price ?? 0);
    const smcScore = MathEngine.clamp(params.smcDirectionalScore ?? 0);

    const breakdown: ScoringBreakdown = {
      obi: directionSign * obiScore,
      qStruct: directionSign * qScore,
      volume: directionSign * volScore,
      funding: directionSign * fundingScore,
      openInterest: oiScore,
      atr: atrScore,
      microstructure: directionSign * microScore,
      liquidity: liquidityScore,
      smc: directionSign * smcScore,
      weightedSum: 0,
      totalWeight: 0,
    };

    const totalWeight = Object.values(weights).reduce((sum, w) => sum + Math.max(0, Number.isFinite(w) ? w : 0), 0) || 1;
    const weightedSum =
      breakdown.obi * Math.max(0, weights.obi) +
      breakdown.qStruct * Math.max(0, weights.qStruct) +
      breakdown.volume * Math.max(0, weights.volume) +
      breakdown.funding * Math.max(0, weights.funding) +
      breakdown.openInterest * Math.max(0, weights.openInterest) +
      breakdown.atr * Math.max(0, weights.atr) +
      breakdown.microstructure * Math.max(0, weights.microstructure) +
      breakdown.liquidity * Math.max(0, weights.liquidity) +
      breakdown.smc * Math.max(0, weights.smc);

    breakdown.weightedSum = parseFloat(weightedSum.toFixed(6));
    breakdown.totalWeight = parseFloat(totalWeight.toFixed(6));
    const rawScore = parseFloat(MathEngine.clamp(weightedSum / totalWeight).toFixed(6));

    return { rawScore, breakdown };
  }

  static calculateProposalConfidence(rawScore: number): number {
    return MathEngine.plattCalibration(rawScore, 3.2, -0.35);
  }

  static calculateAdvancedConfidence(params: {
    rawScore: number;
    liquidityQuality: number;
    evidenceAgreement: number;
    squeezeRisk: number;
  }): number {
    const base = MathEngine.calculateProposalConfidence(params.rawScore);
    const liquidityMult = 0.82 + 0.18 * MathEngine.clamp(params.liquidityQuality, 0, 1);
    const agreementMult = 0.78 + 0.22 * MathEngine.clamp(params.evidenceAgreement, 0, 1);
    const squeezePenalty = 1 - 0.42 * MathEngine.clamp(params.squeezeRisk, 0, 1);
    return Math.max(0.01, Math.min(0.99, base * liquidityMult * agreementMult * squeezePenalty));
  }

  static computeRealConfluence(candles: Candlestick[]): number {
    if (candles.length < 10) return 0;
    const closes = candles.map(c => c.close);
    const n = closes.length;

    const ema = (data: number[], period: number): number => {
      const alpha = 2 / (period + 1);
      return data.reduce((prev, val, i) => i === 0 ? val : alpha * val + (1 - alpha) * prev, data[0]);
    };
    const ema5  = ema(closes.slice(-Math.min(n, 10)), 5);
    const ema20 = ema(closes.slice(-Math.min(n, 30)), 20);

    const recentAvg = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const pastAvg   = closes.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const momentum  = (recentAvg - pastAvg) / (pastAvg || 1);

    const emaBias = (ema5 - ema20) / (ema20 || 1);

    const raw = momentum * 0.6 + emaBias * 0.4;
    return Math.max(-1, Math.min(1, raw * 20));
  }

  static calculatePsiAdj(params: {
    equity: number;
    riskFixed: number;
    atrStopDistance: number;
    multiplier: number;
    confidence: number;
  }): number {
    const { equity, riskFixed, atrStopDistance, multiplier, confidence } = params;
    if (atrStopDistance === 0 || multiplier === 0) return 0;
    const maxLoss  = equity * (riskFixed / 100);
    const priceMove = (atrStopDistance / 100) * multiplier;
    const base = maxLoss / priceMove;
    const pct  = (base / equity) * confidence * 100;
    return Math.max(0.1, Math.min(100, parseFloat(pct.toFixed(2))));
  }

  static plattCalibration(rawScore: number, a = 1.5, b = -0.1): number {
    return 1 / (1 + Math.exp(-(a * rawScore + b)));
  }

  static calculateCalibratedConfidence(rawScore: number, fundingRate: number, sentiment: BinanceSentiment | null): number {
    const fundingMult = MathEngine.fundingBiasMultiplier(fundingRate);
    const sentimentMult = MathEngine.sentimentBiasMultiplier(sentiment);
    const plattVal = MathEngine.plattCalibration(rawScore);
    return Math.min(0.99, plattVal * fundingMult * sentimentMult);
  }

  static fundingBiasMultiplier(fundingRate: number): number {
    if (fundingRate > 0.0005)  return 1.20;
    if (fundingRate > 0.0001)  return 1.10;
    if (fundingRate < -0.0005) return 0.80;
    if (fundingRate < -0.0001) return 0.90;
    return 1.00;
  }

  static sentimentBiasMultiplier(sentiment: BinanceSentiment | null): number {
    if (!sentiment) return 1.0;
    if (sentiment.longShortRatio > 1.8)  return 1.15;
    if (sentiment.longShortRatio > 1.4)  return 1.08;
    if (sentiment.longShortRatio < 0.6)  return 0.85;
    if (sentiment.longShortRatio < 0.8)  return 0.92;
    return 1.0;
  }

  static detectL2Anomalies(book: OrderBook): {
    icebergDetected: boolean;
    fakeWhaleWallDetected: boolean;
    aggressiveSweepDetected: boolean;
  } {
    if (!book.bids.length || !book.asks.length) {
      return { icebergDetected: false, fakeWhaleWallDetected: false, aggressiveSweepDetected: false };
    }
    const bidTotal = book.bids.reduce((s, b) => s + b.volume, 0);
    const askTotal = book.asks.reduce((s, a) => s + a.volume, 0);
    const total = bidTotal + askTotal;
    const obi   = MathEngine.calculateOBI(book);

    return {
      icebergDetected:        Math.abs(obi) < 0.05 && total > 0,
      fakeWhaleWallDetected:  book.asks.some(a => a.volume > askTotal * 0.45) ||
                              book.bids.some(b => b.volume > bidTotal * 0.45),
      aggressiveSweepDetected: Math.abs(obi) > 0.30,
    };
  }

  static generateInitialMemoryLogs(): MemoryLog[] {
    return [];
  }

  static oiTrendMultiplier(trend: OITrendDirection | undefined): number {
    if (trend === 'EXPANDING')   return 1.12;
    if (trend === 'CONTRACTING') return 0.90;
    return 1.0;
  }

  static summarizeStructuralZones(candles: Candlestick[]): { zonesCount: number; averageZoneScore: number } {
    if (!candles || candles.length < 5) return { zonesCount: 0, averageZoneScore: 0 };
    const refPrice = candles[candles.length - 1]?.close || candles[candles.length - 1]?.open || 0;
    if (!Number.isFinite(refPrice) || refPrice <= 0) return { zonesCount: 0, averageZoneScore: 0 };

    const avgBody = candles.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / candles.length;
    const impulseThreshold = avgBody * 2.0;
    const magnitudes: number[] = [];

    for (let i = 2; i < candles.length - 1; i++) {
      const prev2 = candles[i - 2];
      const curr = candles[i];
      if (prev2.low > curr.high) magnitudes.push((prev2.low - curr.high) / refPrice);
      else if (prev2.high < curr.low) magnitudes.push((curr.low - prev2.high) / refPrice);
    }

    for (let i = 1; i < candles.length - 1; i++) {
      const ob = candles[i];
      const next = candles[i + 1];
      const nextBody = Math.abs(next.close - next.open);
      if (nextBody < impulseThreshold) continue;
      const isBearishOB = ob.close > ob.open && next.close < next.open;
      const isBullishOB = ob.close < ob.open && next.close > next.open;
      if (isBearishOB || isBullishOB) magnitudes.push(nextBody / refPrice);
    }

    const zonesCount = magnitudes.length;
    if (zonesCount === 0) return { zonesCount: 0, averageZoneScore: 0 };
    const avg = magnitudes.reduce((a, b) => a + b, 0) / zonesCount;
    const averageZoneScore = MathEngine.clamp(avg / 0.01, 0, 1);
    return { zonesCount, averageZoneScore: parseFloat(averageZoneScore.toFixed(4)) };
  }

  static buildLevels(entry: number, atr: number, direction: 'SHORT' | 'LONG'): Levels {
    const a = (Number.isFinite(atr) && atr > 0) ? atr : entry * 0.005;
    const ks = [0.5, 1.0, 1.5] as const;
    const r = (n: number) => parseFloat(n.toFixed(4));
    const above = ks.map(k => r(entry + a * k)) as [number, number, number];
    const below = ks.map(k => r(entry - a * k)) as [number, number, number];
    return direction === 'SHORT'
      ? { resistance: above, breakout: below }
      : { resistance: below, breakout: above };
  }

  static detectStructuralZones(candles: Candlestick[]): void {
    if (candles.length < 5) return;

    const avgBody =
      candles.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) /
      candles.length;
    const impulseThreshold = avgBody * 2.0;

    const fvgCandidates: Array<{ idx: number; type: 'BULLISH' | 'BEARISH'; gap: [number, number]; size: number; }> = [];

    for (let i = 2; i < candles.length - 1; i++) {
      const prev2 = candles[i - 2];
      const curr  = candles[i];

      if (prev2.low > curr.high) {
        fvgCandidates.push({ idx: i - 1, type: 'BEARISH', gap: [parseFloat(curr.high.toFixed(6)), parseFloat(prev2.low.toFixed(6))], size: prev2.low - curr.high });
      }
      if (prev2.high < curr.low) {
        fvgCandidates.push({ idx: i - 1, type: 'BULLISH', gap: [parseFloat(prev2.high.toFixed(6)), parseFloat(curr.low.toFixed(6))], size: curr.low - prev2.high });
      }
    }

    fvgCandidates.sort((a, b) => b.size - a.size).slice(0, 2).forEach(({ idx, type, gap }) => {
      candles[idx].fvg = { Type: type, gap };
    });

    const annotatedFvgIndices = new Set(fvgCandidates.slice(0, 2).map(c => c.idx));

    const obCandidates: Array<{ idx: number; type: 'BULLISH' | 'BEARISH'; range: [number, number]; impulseSize: number; }> = [];

    for (let i = 1; i < candles.length - 1; i++) {
      if (annotatedFvgIndices.has(i)) continue;

      const ob   = candles[i];
      const next = candles[i + 1];
      const nextBody = Math.abs(next.close - next.open);

      if (nextBody < impulseThreshold) continue;

      const isBearishOB = ob.close > ob.open && next.close < next.open;
      const isBullishOB = ob.close < ob.open && next.close > next.open;

      if (isBearishOB) {
        obCandidates.push({ idx: i, type: 'BEARISH', range: [parseFloat(ob.close.toFixed(6)), parseFloat(ob.high.toFixed(6))], impulseSize: nextBody });
      } else if (isBullishOB) {
        obCandidates.push({ idx: i, type: 'BULLISH', range: [parseFloat(ob.low.toFixed(6)), parseFloat(ob.open.toFixed(6))], impulseSize: nextBody });
      }
    }

    obCandidates.sort((a, b) => b.impulseSize - a.impulseSize).slice(0, 2).forEach(({ idx, type, range }) => {
      candles[idx].orderBlock = { Type: type, range };
    });
  }
}

// ── Ported from apex-trading-engine/src/services/marketData.ts (the single
// non-MathEngine symbol scannerCore.ts imports from that module). ──────────
const HEURISTIC_CLAMP_ABS = 0.15;

export function clampHeuristicAdjustment(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(-HEURISTIC_CLAMP_ABS, Math.min(HEURISTIC_CLAMP_ABS, x));
}
