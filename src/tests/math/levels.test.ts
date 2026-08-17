import { describe, expect, it } from 'vitest';
import { calculateAtr, deriveSymbolLevels } from '../../lib/levels';
import { SymbolTicker } from '../../types';

describe('Level & Entry Derivation (REQ-021, 022, 024, 025)', () => {
  const baseTicker: SymbolTicker = {
    symbol: 'ETH-USDT',
    lastPrice: 3300,
    turnover24h: 150000000,
    priceChange24hPct: 1.8,
    volume24h: 45000,
    high24h: 3360,
    low24h: 3240,
    fundingRate: -0.0001,
    openInterest: 500000000,
    dataState: 'live',
    timestamp: Date.now(),
  };

  const sampleCandles = Array.from({ length: 30 }, (_, i) => ({
    timestamp: 1700000000000 + i * 3600000,
    open: 3250 + i * 2,
    high: 3270 + i * 3,
    low: 3240 + i * 1.5,
    close: 3260 + i * 2.5,
    volume: 120,
  }));

  it('computes ATR cleanly on sample candles', () => {
    const atr = calculateAtr(sampleCandles, 14);
    expect(atr).toBeGreaterThan(0);
  });

  it('derives entry, 3 resistances above, and 3 supports below entry (REQ-021, 022)', () => {
    const derived = deriveSymbolLevels(baseTicker, sampleCandles, 'ATR_BANDS');
    expect(derived.entry).toBe(3300);
    expect(derived.resistances.length).toBe(3);
    expect(derived.supports.length).toBe(3);

    // Assert strict ordering
    expect(derived.supports[0]).toBeLessThan(derived.entry);
    expect(derived.supports[1]).toBeLessThan(derived.supports[0]);
    expect(derived.supports[2]).toBeLessThan(derived.supports[1]);

    expect(derived.resistances[0]).toBeGreaterThan(derived.entry);
    expect(derived.resistances[1]).toBeGreaterThan(derived.resistances[0]);
    expect(derived.resistances[2]).toBeGreaterThan(derived.resistances[1]);
  });

  it('computes confidence score and evidence list with tagged items (REQ-024)', () => {
    const derived = deriveSymbolLevels(baseTicker, sampleCandles, 'ATR_BANDS');
    expect(derived.confidenceScore).toBeGreaterThanOrEqual(10);
    expect(derived.confidenceScore).toBeLessThanOrEqual(95);
    expect(derived.evidenceList.length).toBeGreaterThan(0);
    expect(['supports', 'contradicts', 'neutral']).toContain(
      derived.evidenceList[0].tag
    );
  });

  it('computes risk/reward R-multiple cleanly without divide-by-zero (REQ-025)', () => {
    const derived = deriveSymbolLevels(baseTicker, sampleCandles, 'ATR_BANDS');
    expect(derived.riskReward.rMultiple).toBeGreaterThan(0);
    expect(derived.riskReward.riskPct).toBeGreaterThan(0);
  });
});
