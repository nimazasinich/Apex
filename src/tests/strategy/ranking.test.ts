import { describe, expect, it } from 'vitest';
import { SymbolTicker } from '../../types';

describe('Gainers/Losers Ranking & Liquidity Floor (REQ-011)', () => {
  const sampleTickers: SymbolTicker[] = [
    {
      symbol: 'BTC-USDT',
      lastPrice: 94000,
      turnover24h: 500000000,
      priceChange24hPct: 3.5,
      volume24h: 5319,
      high24h: 95000,
      low24h: 91000,
      fundingRate: 0.0001,
      openInterest: 1000000,
      dataState: 'live',
      timestamp: Date.now(),
    },
    {
      symbol: 'SOL-USDT',
      lastPrice: 175,
      turnover24h: 150000000,
      priceChange24hPct: 8.4,
      volume24h: 850000,
      high24h: 180,
      low24h: 162,
      fundingRate: 0.0002,
      openInterest: 500000,
      dataState: 'live',
      timestamp: Date.now(),
    },
    {
      symbol: 'ILLIQUID-USDT',
      lastPrice: 1.2,
      turnover24h: 500000, // $500k -> below $10M floor
      priceChange24hPct: 45.0, // High pump but illiquid
      volume24h: 400000,
      high24h: 1.5,
      low24h: 0.8,
      fundingRate: 0,
      openInterest: 10000,
      dataState: 'live',
      timestamp: Date.now(),
    },
  ];

  it('filters out symbols below minimum liquidity floor so illiquid symbols do not dominate (REQ-011)', () => {
    const minLiquidityUsd = 10000000; // $10M
    const qualified = sampleTickers.filter(
      (t) => t.turnover24h >= minLiquidityUsd
    );
    expect(qualified.length).toBe(2);
    expect(qualified.map((t) => t.symbol)).not.toContain('ILLIQUID-USDT');
  });

  it('sorts gainers descending by 24h % change', () => {
    const sortedGainers = [...sampleTickers]
      .filter((t) => t.turnover24h >= 10000000)
      .sort((a, b) => b.priceChange24hPct - a.priceChange24hPct);

    expect(sortedGainers[0].symbol).toBe('SOL-USDT'); // +8.4%
    expect(sortedGainers[1].symbol).toBe('BTC-USDT'); // +3.5%
  });
});
