import { describe, expect, it } from 'vitest';
import type { Candlestick, OrderBook } from '../types';
import { validateCommanderEvidence } from '../contracts/commander/commanderEvidence';
import { buildDirectionDivergenceEvidence } from '../services/strategyCommander/evidence/directionDivergenceEvidence';
import { buildFundingOiEvidence } from '../services/strategyCommander/evidence/fundingOiEvidence';
import { buildLiquidityEvidence } from '../services/strategyCommander/evidence/liquidityEvidence';
import { buildMomentumEvidence } from '../services/strategyCommander/evidence/momentumEvidence';
import { buildPriceActionEvidence } from '../services/strategyCommander/evidence/priceActionEvidence';
import { buildSmartMoneyEvidence } from '../services/strategyCommander/evidence/smartMoneyEvidence';
import { buildVolatilityEvidence } from '../services/strategyCommander/evidence/volatilityEvidence';

const baseInput = {
  evidenceId: 'test-evidence', symbol: 'BTC-USDT', timeframe: '1h',
  observedAt: '2026-08-12T00:00:00.000Z', receivedAt: '2026-08-12T00:00:01.000Z',
  source: 'test-fixture', sourceVersion: 'fixture-v1', inputFingerprint: 'fixture-input-v1',
};

function candles(count: number, start = 100): Candlestick[] {
  return Array.from({ length: count }, (_, index) => {
    const close = start + index * 0.2 + (index % 3) * 0.03;
    return {
      time: new Date(Date.parse('2026-08-11T00:00:00.000Z') + index * 60_000).toISOString(),
      open: close - 0.08, high: close + 0.12, low: close - 0.15, close, volume: 1000 + index,
    };
  });
}

const book: OrderBook = {
  bids: [{ price: 109.99, volume: 100, cumulative: 100, percentage: 50 }],
  asks: [{ price: 110.01, volume: 100, cumulative: 100, percentage: 50 }],
  dataSource: 'degraded',
};

describe('Plan C Phase 2 native evidence adapters', () => {
  it('uses only the closed candle window and is causal under future-bar changes', () => {
    const history = candles(60);
    const first = buildMomentumEvidence({ ...baseInput, asOfIndex: 35, candles: history });
    const extended = history.concat(candles(10, 500).map((candle, index) => ({
      ...candle,
      time: new Date(Date.parse('2026-08-12T00:00:00.000Z') + index * 60_000).toISOString(),
    })));
    const second = buildMomentumEvidence({ ...baseInput, asOfIndex: 35, candles: extended });
    expect(second).toEqual(first);
    expect(validateCommanderEvidence(first).ok).toBe(true);
  });

  it('preserves missing and invalid evidence instead of manufacturing a signal', () => {
    const missing = buildMomentumEvidence({ ...baseInput, candles: undefined });
    expect(missing.valueQuality).toBe('MISSING');
    expect(missing.score).toBe(0);
    expect(missing.confidence).toBe(0);

    const invalid = buildPriceActionEvidence({ ...baseInput, candles: candles(30).map((candle, index) => index === 5 ? { ...candle, time: 'invalid' } : candle) });
    expect(invalid.valueQuality).toBe('MISSING');
    expect(invalid.conflictingReasons).toContain('invalid_or_non_chronological_closed_candle');
  });

  it('builds direction divergence from available timeframes and retains partial completeness', () => {
    const result = buildDirectionDivergenceEvidence({
      ...baseInput, orderDirection: 'LONG',
      timeframes: { '1h': candles(40), '4h': undefined },
      asOfIndex: 30, marketDataSource: 'unavailable',
    });
    expect(result.family).toBe('MOMENTUM');
    expect(result.valueQuality).toBe('VALID');
    expect(result.supportingReasons).toContain('data_completeness:0.500');
    expect(validateCommanderEvidence(result).ok).toBe(true);
  });

  it('keeps Smart Money timeframe identity stable when only a sparse series is supplied', () => {
    const result = buildSmartMoneyEvidence({ ...baseInput, candles15m: candles(40), direction: 'LONG' });
    expect(result.valueQuality).toBe('VALID');
    expect(result.supportingReasons.some((reason) => reason.startsWith('setup_model:'))).toBe(true);
    expect(validateCommanderEvidence(result).ok).toBe(true);
  });

  it('adapts liquidity, volatility, and funding/OI from existing MathEngine calculations', () => {
    const history = candles(30);
    const liquidity = buildLiquidityEvidence({ ...baseInput, candles: history, orderBook: book });
    const volatility = buildVolatilityEvidence({ ...baseInput, candles: history });
    const fundingOi = buildFundingOiEvidence({ ...baseInput, fundingRate: -0.0002, oiChangePercent: 0.6 });
    const partial = buildFundingOiEvidence({ ...baseInput, fundingRate: -0.0002 });
    expect([liquidity, volatility, fundingOi].every((value) => validateCommanderEvidence(value).ok)).toBe(true);
    expect(liquidity.valueQuality).toBe('VALID');
    expect(volatility.valueQuality).toBe('VALID');
    expect(fundingOi.valueQuality).toBe('VALID');
    expect(partial.valueQuality).toBe('ESTIMATED');
  });
});
