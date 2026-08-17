/**
 * APEX-NEXT Market Sentiment Gauge & Composite Calculator
 * Implements REQ-012, REQ-030, REQ-031.
 * Pure, testable function blending exchange-derived inputs (funding-rate skew, long/short ratio)
 * and optional headline tone without zeroing missing inputs.
 */

import {
  DataState,
  SentimentComposite,
  SentimentInput,
  SentimentZone,
} from '../types';

export interface RawSentimentReadings {
  fundingRateSkewPct?: number; // e.g. 0.0100 (%) average funding across top perpetuals
  fundingState: DataState;
  longShortRatio?: number; // e.g. 1.05 (longs / shorts ratio)
  longShortState: DataState;
  headlineToneScore?: number; // e.g. 65 (0 to 100)
  headlineState: DataState;
}

/**
 * Maps 0-100 score to one of 5 labeled zones (REQ-012)
 */
export function getSentimentZone(score: number): SentimentZone {
  if (score <= 20) return 'Extreme Fear';
  if (score <= 40) return 'Fear';
  if (score <= 60) return 'Neutral';
  if (score <= 80) return 'Greed';
  return 'Extreme Greed';
}

/**
 * Converts average funding rate skew into a 0-100 sentiment sub-score
 * High positive funding -> Greed; deep negative -> Fear
 */
export function scoreFundingRateSkew(fundingPct: number): { score: number; detail: string } {
  // Normal funding rate is around +0.01% per 8h
  // Let's normalize around +0.01% = 50 (Neutral)
  let score = 50 + (fundingPct - 0.01) * 800;
  score = Math.max(0, Math.min(100, Math.round(score)));
  let tone = 'Neutral';
  if (score > 65) tone = 'Overleveraged Long Crowding';
  else if (score < 35) tone = 'Negative Funding / Short Pressure';
  return {
    score,
    detail: `Avg Perpetual Funding: ${fundingPct >= 0 ? '+' : ''}${fundingPct.toFixed(4)}% (${tone})`,
  };
}

/**
 * Converts Long/Short account ratio into a 0-100 sentiment sub-score
 */
export function scoreLongShortRatio(lsRatio: number): { score: number; detail: string } {
  // Balanced is 1.0; > 1.3 is Greed, < 0.8 is Fear
  let score = 50 + (lsRatio - 1.0) * 100;
  score = Math.max(0, Math.min(100, Math.round(score)));
  let label = 'Balanced positioning';
  if (lsRatio >= 1.2) label = 'Long-heavy retail skew';
  else if (lsRatio <= 0.85) label = 'Short-heavy skew';
  return {
    score,
    detail: `Exchange L/S Account Ratio: ${lsRatio.toFixed(2)} (${label})`,
  };
}

/**
 * Computes composite sentiment score from available inputs (REQ-030, REQ-031).
 * An input with dataState !== 'live' is skipped from the weighted blend and shown as skipped, never zeroed.
 */
export function calculateSentimentComposite(
  readings: RawSentimentReadings
): SentimentComposite {
  const inputs: SentimentInput[] = [];

  // 1. Funding Rate Skew Input
  if (
    readings.fundingState === 'live' &&
    typeof readings.fundingRateSkewPct === 'number'
  ) {
    const scored = scoreFundingRateSkew(readings.fundingRateSkewPct);
    inputs.push({
      name: 'Funding Rate Skew',
      value: readings.fundingRateSkewPct,
      score: scored.score,
      weight: 0.45,
      dataState: 'live',
      detail: scored.detail,
    });
  } else {
    inputs.push({
      name: 'Funding Rate Skew',
      value: 0,
      score: 50,
      weight: 0,
      dataState: readings.fundingState,
      detail: 'Funding rate input unavailable — excluded from blend',
    });
  }

  // 2. Long / Short Ratio Input
  if (
    readings.longShortState === 'live' &&
    typeof readings.longShortRatio === 'number'
  ) {
    const scored = scoreLongShortRatio(readings.longShortRatio);
    inputs.push({
      name: 'Exchange L/S Ratio',
      value: readings.longShortRatio,
      score: scored.score,
      weight: 0.35,
      dataState: 'live',
      detail: scored.detail,
    });
  } else {
    inputs.push({
      name: 'Exchange L/S Ratio',
      value: 1.0,
      score: 50,
      weight: 0,
      dataState: readings.longShortState,
      detail: 'L/S ratio input unavailable — excluded from blend',
    });
  }

  // 3. Headline / News Tone Score Input
  if (
    readings.headlineState === 'live' &&
    typeof readings.headlineToneScore === 'number'
  ) {
    const sc = Math.max(0, Math.min(100, Math.round(readings.headlineToneScore)));
    inputs.push({
      name: 'Market Headline Tone',
      value: sc,
      score: sc,
      weight: 0.2,
      dataState: 'live',
      detail: `Aggregated news sentiment index: ${sc}/100`,
    });
  } else {
    inputs.push({
      name: 'Market Headline Tone',
      value: 50,
      score: 50,
      weight: 0,
      dataState: readings.headlineState || 'not_configured',
      detail: 'External news feed not configured — excluded from blend',
    });
  }

  // Blend only valid weights
  let totalScoreWeight = 0;
  let weightedSum = 0;
  let validCount = 0;

  for (const input of inputs) {
    if (input.weight > 0 && input.dataState === 'live') {
      weightedSum += input.score * input.weight;
      totalScoreWeight += input.weight;
      validCount++;
    }
  }

  let finalScore = 50; // default if no inputs valid
  let overallState: DataState = 'live';

  if (validCount === 0) {
    overallState = 'unavailable';
  } else if (validCount < inputs.length) {
    overallState = 'degraded';
    finalScore = Math.round(weightedSum / totalScoreWeight);
  } else {
    overallState = 'live';
    finalScore = Math.round(weightedSum / totalScoreWeight);
  }

  const zone = getSentimentZone(finalScore);

  return {
    score: finalScore,
    zone,
    inputs,
    dataState: overallState,
    timestamp: Date.now(),
  };
}
