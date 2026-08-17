/**
 * APEX-NEXT Level & Entry Derivation Module (REQ-021, 022, 024, 025)
 * Derives 3 resistance levels, 3 support levels, best entry, confidence score,
 * and risk/reward R-multiple using ATR-multiple bands and swing structure analysis.
 */

import {
  Candle,
  DataState,
  DerivedLevels,
  EvidenceItem,
  SymbolTicker,
} from '../types';
import { calculateRsi } from './scoring';

/**
 * Computes Average True Range (ATR) over period (default 14)
 */
export function calculateAtr(candles: Candle[], period = 14): number {
  if (!candles || candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  if (slice.length === 0) return 0;
  const avgTr = slice.reduce((acc, v) => acc + v, 0) / slice.length;
  return Number(avgTr.toFixed(6));
}

/**
 * Derives levels around current price using ATR-multiple bands & swing highs/lows.
 * Implements REQ-021, REQ-022, REQ-024, REQ-025.
 */
export function deriveSymbolLevels(
  ticker: SymbolTicker,
  candles: Candle[],
  method: 'SWING_STRUCTURE' | 'ATR_BANDS' | 'VOLUME_NODES' = 'ATR_BANDS'
): DerivedLevels {
  const currentPrice = ticker.lastPrice || 0;
  const atr = calculateAtr(candles, 14) || currentPrice * 0.018; // Default 1.8% ATR if candles minimal

  // 1. Entry price calculation (REQ-022)
  // Best entry is at current price or slight reversion to 0.4x ATR
  const entry = Number(currentPrice.toFixed(4));

  // 2. Derive 3 resistance levels (above entry) and 3 support levels (below entry)
  let r1: number, r2: number, r3: number;
  let s1: number, s2: number, s3: number;

  if (method === 'SWING_STRUCTURE' && candles.length >= 20) {
    const highs = candles.map((c) => c.high).sort((a, b) => b - a);
    const lows = candles.map((c) => c.low).sort((a, b) => a - b);
    r1 = highs[Math.floor(highs.length * 0.25)] || entry + atr * 1.2;
    r2 = highs[Math.floor(highs.length * 0.1)] || entry + atr * 2.2;
    r3 = highs[0] || entry + atr * 3.5;

    s1 = lows[Math.floor(lows.length * 0.25)] || entry - atr * 1.2;
    s2 = lows[Math.floor(lows.length * 0.1)] || entry - atr * 2.2;
    s3 = lows[0] || entry - atr * 3.5;
  } else {
    // ATR_BANDS method: entry +/- 1.2x, 2.2x, 3.4x ATR
    r1 = entry + atr * 1.2;
    r2 = entry + atr * 2.2;
    r3 = entry + atr * 3.4;

    s1 = entry - atr * 1.2;
    s2 = entry - atr * 2.2;
    s3 = entry - atr * 3.4;
  }

  // Ensure strict ordering: s3 < s2 < s1 < entry < r1 < r2 < r3
  const resistances: [number, number, number] = [
    Number(Math.max(entry * 1.002, r1).toPrecision(6)),
    Number(Math.max(entry * 1.008, r2).toPrecision(6)),
    Number(Math.max(entry * 1.015, r3).toPrecision(6)),
  ];

  const supports: [number, number, number] = [
    Number(Math.min(entry * 0.998, s1).toPrecision(6)),
    Number(Math.min(entry * 0.992, s2).toPrecision(6)),
    Number(Math.min(entry * 0.985, s3).toPrecision(6)),
  ];

  // 3. Confidence Score (0 - 100) and Evidence List (REQ-024)
  const rsi = calculateRsi(candles, 14);
  const evidenceList: EvidenceItem[] = [];
  let confidenceScore = 65;

  // Evaluate Funding Rate
  if (ticker.fundingRate < 0) {
    evidenceList.push({
      label: 'Funding Rate Skew',
      tag: 'supports',
      detail: `Negative funding (${(ticker.fundingRate * 100).toFixed(4)}%) indicates short crowding / spot demand.`,
    });
    confidenceScore += 10;
  } else if (ticker.fundingRate > 0.0005) {
    evidenceList.push({
      label: 'Funding Rate Skew',
      tag: 'contradicts',
      detail: `High positive funding (${(ticker.fundingRate * 100).toFixed(4)}%) signals long crowding.`,
    });
    confidenceScore -= 12;
  } else {
    evidenceList.push({
      label: 'Funding Rate Skew',
      tag: 'neutral',
      detail: `Funding rate (${(ticker.fundingRate * 100).toFixed(4)}%) is within normal neutral band.`,
    });
  }

  // Evaluate RSI Momentum
  if (rsi >= 45 && rsi <= 68) {
    evidenceList.push({
      label: 'RSI Momentum (14)',
      tag: 'supports',
      detail: `RSI at ${rsi.toFixed(1)} confirms healthy trend momentum without exhaustion.`,
    });
    confidenceScore += 12;
  } else if (rsi > 75 || rsi < 25) {
    evidenceList.push({
      label: 'RSI Momentum (14)',
      tag: 'contradicts',
      detail: `RSI at ${rsi.toFixed(1)} shows extreme exhaustion zone.`,
    });
    confidenceScore -= 15;
  } else {
    evidenceList.push({
      label: 'RSI Momentum (14)',
      tag: 'neutral',
      detail: `RSI at ${rsi.toFixed(1)} shows balanced momentum.`,
    });
  }

  // Evaluate Turnover / Liquidity
  const turnoverM = ticker.turnover24h / 1e6;
  if (turnoverM > 50) {
    evidenceList.push({
      label: 'Market Depth & Turnover',
      tag: 'supports',
      detail: `High 24h turnover ($${turnoverM.toFixed(1)}M) reduces slippage and wick noise.`,
    });
    confidenceScore += 10;
  } else if (turnoverM < 10) {
    evidenceList.push({
      label: 'Market Depth & Turnover',
      tag: 'contradicts',
      detail: `Low turnover ($${turnoverM.toFixed(1)}M) increases spread and squeeze risk.`,
    });
    confidenceScore -= 10;
  }

  // Bound confidence between 10 and 95
  confidenceScore = Math.max(10, Math.min(95, Math.round(confidenceScore)));

  // 4. Risk / Reward Calculation (REQ-025)
  // For a typical bullish setup: Nearest Target = r1, Nearest Stop = s1
  const nearestTarget = resistances[0];
  const nearestStop = supports[0];
  const rewardDistance = Math.abs(nearestTarget - entry);
  const riskDistance = Math.abs(entry - nearestStop);
  const rMultiple = riskDistance > 0 ? Number((rewardDistance / riskDistance).toFixed(2)) : 1.5;
  const riskPct = entry > 0 ? Number(((riskDistance / entry) * 100).toFixed(2)) : 1.2;

  return {
    symbol: ticker.symbol,
    entry,
    resistances,
    supports,
    method,
    atr14: atr,
    confidenceScore,
    evidenceList,
    riskReward: {
      nearestTarget,
      nearestStop,
      rMultiple,
      riskPct,
    },
    dataState: ticker.dataState,
  };
}
