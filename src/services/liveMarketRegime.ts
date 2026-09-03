import type { Candle } from '../types';

export type LiveMarketRegime = 'TREND_UP' | 'TREND_DOWN' | 'RANGE' | 'HIGH_VOLATILITY' | 'TRANSITION' | 'UNKNOWN';

export interface LiveMarketRegimeSnapshot {
  regime: LiveMarketRegime;
  confidence: number;
  trendEfficiency: number | null;
  emaSpreadPct: number | null;
  realizedVolatility: number | null;
  volatilityRatio: number | null;
  atrPct: number | null;
  reasons: string[];
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function ema(values: number[], period: number): number | null {
  if (values.length < period || period <= 1) return null;
  const multiplier = 2 / (period + 1);
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (let index = period; index < values.length; index += 1) current = (values[index] - current) * multiplier + current;
  return Number.isFinite(current) ? current : null;
}

function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(Math.max(0, variance));
}

function logReturns(candles: Candle[]): number[] {
  const closes = candles.map((row) => row.close).filter((value) => Number.isFinite(value) && value > 0);
  const out: number[] = [];
  for (let index = 1; index < closes.length; index += 1) out.push(Math.log(closes[index] / closes[index - 1]));
  return out;
}

function trueRange(current: Candle, previousClose: number): number {
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previousClose),
    Math.abs(current.low - previousClose),
  );
}

function averageTrueRange(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const recent = candles.slice(-(period + 1));
  const ranges: number[] = [];
  for (let index = 1; index < recent.length; index += 1) ranges.push(trueRange(recent[index], recent[index - 1].close));
  return ranges.length ? ranges.reduce((sum, value) => sum + value, 0) / ranges.length : null;
}

/**
 * Causal live regime classifier. It consumes only candles available at decision time;
 * no centered windows, future labels or holdout-derived thresholds are used.
 */
export function detectLiveMarketRegime(candles1h: Candle[], candles4h?: Candle[]): LiveMarketRegimeSnapshot {
  const primary = (candles4h?.length ?? 0) >= 30 ? candles4h! : candles1h;
  if (primary.length < 30) {
    return {
      regime: 'UNKNOWN', confidence: 0, trendEfficiency: null, emaSpreadPct: null,
      realizedVolatility: null, volatilityRatio: null, atrPct: null,
      reasons: ['At least 30 causal candles are required for regime classification.'],
    };
  }

  const sample = primary.slice(-60);
  const closes = sample.map((row) => row.close);
  const last = closes.at(-1)!;
  const path = closes.slice(1).reduce((sum, value, index) => sum + Math.abs(value - closes[index]), 0);
  const trendEfficiency = path > 0 ? Math.abs(last - closes[0]) / path : 0;
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const emaSpreadPct = fast != null && slow != null && last > 0 ? (fast - slow) / last : null;

  const returns = logReturns(sample);
  const longVol = standardDeviation(returns.slice(-40));
  const recentVol = standardDeviation(returns.slice(-10));
  const volatilityRatio = longVol != null && longVol > 0 && recentVol != null ? recentVol / longVol : null;
  const atr = averageTrueRange(sample, 14);
  const atrPct = atr != null && last > 0 ? atr / last : null;

  const reasons: string[] = [];
  if ((volatilityRatio ?? 0) >= 1.65 || (atrPct ?? 0) >= 0.035) {
    const confidence = clamp01(Math.max(
      ((volatilityRatio ?? 1) - 1) / 1.2,
      ((atrPct ?? 0) - 0.02) / 0.03,
    ));
    reasons.push(`Volatility expansion ratio ${(volatilityRatio ?? 0).toFixed(2)}x with ATR ${(100 * (atrPct ?? 0)).toFixed(2)}% of price.`);
    return { regime: 'HIGH_VOLATILITY', confidence, trendEfficiency, emaSpreadPct, realizedVolatility: recentVol, volatilityRatio, atrPct, reasons };
  }

  const directionalStrength = emaSpreadPct == null ? 0 : Math.abs(emaSpreadPct);
  if (trendEfficiency >= 0.34 && directionalStrength >= 0.0025 && emaSpreadPct != null) {
    const regime: LiveMarketRegime = emaSpreadPct > 0 ? 'TREND_UP' : 'TREND_DOWN';
    const confidence = clamp01(0.45 + trendEfficiency * 0.55 + Math.min(0.25, directionalStrength * 20));
    reasons.push(`Trend efficiency ${trendEfficiency.toFixed(2)} with EMA spread ${(100 * emaSpreadPct).toFixed(2)}%.`);
    return { regime, confidence, trendEfficiency, emaSpreadPct, realizedVolatility: recentVol, volatilityRatio, atrPct, reasons };
  }

  if (trendEfficiency <= 0.22 && directionalStrength <= 0.006) {
    const confidence = clamp01(0.5 + (0.22 - trendEfficiency) * 1.8 + Math.max(0, 0.006 - directionalStrength) * 25);
    reasons.push(`Low trend efficiency ${trendEfficiency.toFixed(2)} and compressed EMA spread ${(100 * (emaSpreadPct ?? 0)).toFixed(2)}% indicate range behavior.`);
    return { regime: 'RANGE', confidence, trendEfficiency, emaSpreadPct, realizedVolatility: recentVol, volatilityRatio, atrPct, reasons };
  }

  const confidence = clamp01(0.35 + Math.abs(trendEfficiency - 0.28));
  reasons.push('Trend and volatility evidence are mixed; transition regime retained instead of forcing a label.');
  return { regime: 'TRANSITION', confidence, trendEfficiency, emaSpreadPct, realizedVolatility: recentVol, volatilityRatio, atrPct, reasons };
}
