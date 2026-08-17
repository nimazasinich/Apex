import { describe, expect, it } from 'vitest';
import type { Candle, DerivedLevels } from '../types';
import { buildChartStructureAnalysis } from '../components/priceChartAutoStructure';

function makeCandles(): Candle[] {
  const rows: Candle[] = [];
  for (let index = 0; index < 120; index += 1) {
    let close = 100 + index * 0.04 + Math.sin(index / 5) * 1.2;
    if (index === 117) close = 107.05;
    if (index === 118) close = 107.30;
    if (index === 119) close = 107.55;
    const open = close - 0.35;
    rows.push({
      timestamp: 1_700_000_000_000 + index * 900_000,
      open,
      high: close + 0.45,
      low: open - 0.35,
      close,
      volume: 1_000 + (index >= 117 ? 450 : 0),
    });
  }
  return rows;
}

const levels: DerivedLevels = {
  symbol: 'BTC-USDT',
  entry: 106,
  resistances: [107, 109, 111],
  supports: [104, 102, 100],
  method: 'SWING_STRUCTURE',
  atr14: 1,
  confidenceScore: 68,
  evidenceList: [],
  riskReward: { nearestTarget: 107, nearestStop: 104, rMultiple: 1.5, riskPct: 1 },
  dataState: 'live',
};

describe('price chart automatic structure analysis', () => {
  it('keeps the recently broken R1 zone visible for retest analysis', () => {
    const result = buildChartStructureAnalysis(makeCandles(), levels, null, null, {
      riskProfile: 'AGGRESSIVE',
      interval: '15m',
    });
    expect(result?.resistanceLevels.map((level) => level.price)).toEqual([107, 109, 111]);
    expect(result?.breakout.referencePrice).toBe(107);
  });

  it('uses softer confirmation in aggressive mode without removing confirmation entirely', () => {
    const aggressive = buildChartStructureAnalysis(makeCandles(), levels, null, null, {
      riskProfile: 'AGGRESSIVE',
      interval: '15m',
    });
    const conservative = buildChartStructureAnalysis(makeCandles(), levels, null, null, {
      riskProfile: 'CONSERVATIVE',
      interval: '15m',
    });
    expect(aggressive?.breakout.requiredConfirmationBars).toBe(1);
    expect(conservative?.breakout.requiredConfirmationBars).toBe(3);
    expect(aggressive?.breakout.score).toBeGreaterThanOrEqual(conservative?.breakout.score ?? 0);
  });

  it('requires two closes even in aggressive mode on very fast charts', () => {
    const result = buildChartStructureAnalysis(makeCandles(), levels, null, null, {
      riskProfile: 'AGGRESSIVE',
      interval: '5m',
    });
    expect(result?.breakout.requiredConfirmationBars).toBe(2);
  });
});
