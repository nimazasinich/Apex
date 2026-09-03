import { describe, expect, it } from 'vitest';
import type { SymbolTicker } from '../types';
import {
  canonicalizeBinanceSymbol,
  canonicalizeKuCoinContractSymbol,
  sanitizeTickerUniverse,
} from '../lib/tickerUniverse';

function ticker(symbol: string, changes: Partial<SymbolTicker> = {}): SymbolTicker {
  return {
    symbol,
    lastPrice: 100,
    turnover24h: 1_000,
    priceChange24hPct: 0,
    volume24h: 10,
    high24h: 101,
    low24h: 99,
    fundingRate: 0,
    openInterest: 500,
    dataState: 'degraded',
    timestamp: 100,
    ...changes,
  };
}

describe('ticker universe boundary', () => {
  it('rejects quote-only provider ids instead of producing -USDT', () => {
    expect(canonicalizeBinanceSymbol('USDT')).toBeNull();
    expect(canonicalizeKuCoinContractSymbol('USDTM')).toBeNull();
    expect(canonicalizeBinanceSymbol('-USDT')).toBeNull();
    expect(canonicalizeBinanceSymbol('BTCUSDT')).toBe('BTC-USDT');
    expect(canonicalizeKuCoinContractSymbol('XBTUSDTM')).toBe('BTC-USDT');
  });

  it('deduplicates canonical symbols and prefers live, newer observations', () => {
    const rows = sanitizeTickerUniverse([
      ticker('-USDT'),
      ticker('BTC-USDT', { timestamp: 200 }),
      ticker('BTCUSDT', { dataState: 'live', timestamp: 150 }),
      ticker('ETH-USDT', { timestamp: 300 }),
      ticker('USDT'),
    ]);
    expect(rows.map((row) => row.symbol)).toEqual(['BTC-USDT', 'ETH-USDT']);
    expect(rows[0]).toMatchObject({ dataState: 'live', timestamp: 150 });
    expect(new Set(rows.map((row) => row.symbol)).size).toBe(rows.length);
  });
});
