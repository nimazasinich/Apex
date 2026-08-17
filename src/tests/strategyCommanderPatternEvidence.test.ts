import { describe, expect, it } from 'vitest';
import type { Candle } from '../types';
import { analyzeElliott } from '../services/strategyCommander/analysis/elliottAnalysis';
import { analyzeFibonacci } from '../services/strategyCommander/analysis/fibonacciAnalysis';
import { analyzeHarmonics, matchesHarmonicRatios } from '../services/strategyCommander/analysis/harmonicAnalysis';
import { causalCandleWindow, findConfirmedPivots } from '../services/strategyCommander/analysis/confirmedPivots';
import { buildElliottEvidence } from '../services/strategyCommander/evidence/elliottEvidence';
import { buildFibonacciEvidence } from '../services/strategyCommander/evidence/fibonacciEvidence';
import { buildHarmonicEvidence } from '../services/strategyCommander/evidence/harmonicEvidence';
import { validateCommanderEvidence } from '../contracts/commander/commanderEvidence';

function candles(prices: number[]): Candle[] {
  return prices.map((close, index) => ({
    timestamp: Date.parse('2026-08-10T00:00:00.000Z') + index * 60_000,
    open: close,
    high: close + 0.2,
    low: close - 0.2,
    close,
    volume: 1000 + index,
  }));
}

const basePrices = Array.from({ length: 70 }, (_, index) => 100 + index * 0.12 + Math.sin(index / 2) * 3);

describe('Plan C causal pattern analysis', () => {
  it('keeps explicit endpoint analysis independent of future bars', () => {
    const base = candles(basePrices);
    const extended = base.concat(candles([500, 450, 520, 430]).map((candle, index) => ({
      ...candle,
      timestamp: base.at(-1)!.timestamp + (index + 1) * 60_000,
    })));
    expect(analyzeFibonacci(extended, 49, 1, 1)).toEqual(analyzeFibonacci(base.slice(0, 50), undefined, 1, 1));
    expect(analyzeElliott(extended, 49, 1, 1)).toEqual(analyzeElliott(base.slice(0, 50), undefined, 1, 1));
    expect(analyzeHarmonics(extended, 49, 1, 1)).toEqual(analyzeHarmonics(base.slice(0, 50), undefined, 1, 1));
  });

  it('never emits an unconfirmed endpoint pivot', () => {
    const rows = candles([100, 101, 105, 101, 100]);
    const window = causalCandleWindow(rows, 3);
    expect(window.ok).toBe(true);
    expect(findConfirmedPivots(window.candles, 1, 2).some((pivot) => pivot.confirmedAtIndex > 3)).toBe(false);
  });

  it('fails closed for malformed history and rejects invalid Elliott geometry', () => {
    const malformed = candles(basePrices.slice(0, 40));
    malformed[10] = { ...malformed[10], timestamp: malformed[9].timestamp };
    expect(analyzeFibonacci(malformed).available).toBe(false);

    const overlapping = candles(Array.from({ length: 35 }, (_, index) => 100 + (index % 2 ? 2 : 0.5)));
    const elliott = analyzeElliott(overlapping, undefined, 1, 1);
    expect(elliott.available).toBe(false);
    expect(elliott.reasons[0]).toMatch(/elliott|pivot/i);
  });

  it('requires every defining Harmonic ratio to remain inside its band', () => {
    const valid = { AB_XA: 0.62, BC_AB: 0.6, CD_BC: 1.4, XD_XA: 0.78 };
    expect(matchesHarmonicRatios('GARTLEY', valid)).toBe(true);
    expect(matchesHarmonicRatios('GARTLEY', { ...valid, CD_BC: 1.9 })).toBe(false);
  });

  it('keeps Fibonacci outputs finite and bounded whenever analysis is available', () => {
    const result = analyzeFibonacci(candles(basePrices), undefined, 1, 1);
    expect(result.available).toBe(true);
    expect(Number.isFinite(result.score)).toBe(true);
    expect(Number.isFinite(result.confidence)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(-1);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('emits valid bounded Commander evidence or explicit zero-influence missing evidence', () => {
    const history = candles(basePrices);
    const adapterBase = {
      evidenceId: 'pattern', symbol: 'BTC-USDT', timeframe: '1h', observedAt: '2026-08-12T00:00:00.000Z',
      receivedAt: '2026-08-12T00:00:01.000Z', source: 'fixture', inputFingerprint: 'fixture-input', candles: history,
    };
    const fibonacci = buildFibonacciEvidence({ ...adapterBase, evidenceId: 'fib' });
    const elliott = buildElliottEvidence({ ...adapterBase, evidenceId: 'elliott' });
    const harmonic = buildHarmonicEvidence({ ...adapterBase, evidenceId: 'harmonic' });
    expect([fibonacci, elliott, harmonic].every((row) => validateCommanderEvidence(row).ok)).toBe(true);
    expect(Math.abs(fibonacci.score)).toBeLessThanOrEqual(0.25);
    expect(fibonacci.confidence).toBeLessThanOrEqual(0.4);
    expect(Math.abs(elliott.score)).toBeLessThanOrEqual(0.55);
    expect(elliott.confidence).toBeLessThanOrEqual(0.55);
    expect(Math.abs(harmonic.score)).toBeLessThanOrEqual(0.7);
    expect(harmonic.confidence).toBeLessThanOrEqual(0.6);
    for (const row of [elliott, harmonic]) {
      if (row.valueQuality === 'MISSING') {
        expect(row.score).toBe(0);
        expect(row.confidence).toBe(0);
      }
    }
  });
});
