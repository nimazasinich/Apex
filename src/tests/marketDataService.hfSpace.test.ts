import { describe, expect, it } from 'vitest';
import { extractBinanceUsdtPerpetualSymbols, getHfFallbackCycleTelemetry, HF_FALLBACK_CACHE_TTL_MS, HF_FALLBACK_ENRICHMENT_CONCURRENCY, isKuCoinUsdtMarginedContract, KUCOIN_KLINE_GRANULARITY_SECONDS, KUCOIN_KLINE_PAGE_SIZE, normalizeKuCoinContractMetrics, parseHfSpace4Candles, parseSpace2MarketTickers } from '../services/marketDataService';

function candle(timestamp: number, close = 100) {
  return {
    timestamp,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume: 10,
  };
}

function liveEnvelope(data: unknown[]) {
  return {
    success: true,
    sourceMode: 'LIVE',
    dataState: 'REAL',
    noTradeGuard: false,
    data,
  };
}

describe('KuCoin Futures candle contract', () => {
  it('uses the live API granularity units and page cap', () => {
    expect(KUCOIN_KLINE_GRANULARITY_SECONDS).toMatchObject({ '1m': 60, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 });
    expect(KUCOIN_KLINE_PAGE_SIZE).toBe(200);
  });
});

describe('Space-4 OHLCV fallback validation', () => {
  const now = 1_800_000_000_000;

  it('accepts real one-minute cadence and sorts rows', () => {
    const rows = [
      candle(now - 60_000, 102),
      candle(now - 180_000, 100),
      candle(now - 120_000, 101),
    ];

    const parsed = parseHfSpace4Candles(liveEnvelope(rows), '1m', 30, now);

    expect(parsed).toHaveLength(3);
    expect(parsed.map((row) => row.timestamp)).toEqual([
      now - 180_000,
      now - 120_000,
      now - 60_000,
    ]);
  });

  it('rejects a provider that labels one-hour candles as one-minute data', () => {
    const rows = Array.from({ length: 8 }, (_, index) =>
      candle(now - (7 - index) * 3_600_000, 100 + index),
    );

    expect(parseHfSpace4Candles(liveEnvelope(rows), '1m', 30, now)).toEqual([]);
  });

  it('rejects stale cache, no-trade responses, and malformed OHLC', () => {
    const rows = [candle(now - 120_000), candle(now - 60_000)];
    expect(parseHfSpace4Candles({
      ...liveEnvelope(rows),
      sourceMode: 'CACHED',
      dataState: 'CACHED',
      cacheAgeSeconds: 61,
    }, '1m', 30, now)).toEqual([]);
    expect(parseHfSpace4Candles({
      ...liveEnvelope(rows),
      noTradeGuard: true,
    }, '1m', 30, now)).toEqual([]);
    expect(parseHfSpace4Candles(liveEnvelope([
      candle(now - 120_000),
      { ...candle(now - 60_000), high: 98, close: 100 },
    ]), '1m', 30, now)).toEqual([]);
  });
});


describe('Owner-managed HF bulk ticker truthfulness', () => {

  it('keeps the slow fallback bounded, cached, explicitly degraded, and measurable', () => {
    expect(HF_FALLBACK_ENRICHMENT_CONCURRENCY).toBe(4);
    expect(HF_FALLBACK_CACHE_TTL_MS).toBe(30_000);
    expect(getHfFallbackCycleTelemetry()).toMatchObject({
      maxConcurrency: 4,
      cacheTtlMs: 30_000,
      cadence: 'DEGRADED_FALLBACK',
    });
  });
  it('accepts complete fresh Space-2 market rows, including a real zero 24h change', () => {
    const now = Date.now();
    const rows = parseSpace2MarketTickers({
      success: true,
      timestamp: now,
      data: [
        {
          symbol: 'BTC',
          price: 60_000,
          volume_24h: 1_500_000_000,
          change_24h: 0,
          high_24h: 61_000,
          low_24h: 59_000,
          last_updated: now,
        },
      ],
    }, 20);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ baseAsset: 'BTC', lastPrice: 60_000, priceChange24hPct: 0 });
  });

  it('rejects missing, stale, or internally inconsistent market fields instead of inventing values', () => {
    const now = Date.now();
    const base = {
      symbol: 'BTC',
      price: 60_000,
      volume_24h: 1_500_000_000,
      change_24h: 1.2,
      high_24h: 61_000,
      low_24h: 59_000,
      last_updated: now,
    };
    expect(parseSpace2MarketTickers({ success: true, data: [{ ...base, volume_24h: null }] }, 20)).toEqual([]);
    expect(parseSpace2MarketTickers({ success: true, data: [{ ...base, last_updated: now - 16 * 60_000 }] }, 20)).toEqual([]);
    expect(parseSpace2MarketTickers({ success: true, data: [{ ...base, high_24h: 59_500 }] }, 20)).toEqual([]);
  });
});

describe('KuCoin contract-unit normalization', () => {
  it('keeps 24h base volume unchanged and applies multiplier only to open interest', () => {
    const metrics = normalizeKuCoinContractMetrics({
      volumeOf24h: 2104.886,
      openInterest: '23800304',
      multiplier: 0.001,
    }, 62632.2);

    expect(metrics.volume24h).toBe(2104.886);
    expect(metrics.openInterestUsd).toBeCloseTo(1_490_665_400.1888, 3);
  });
});


describe('Futures symbol-universe filtering', () => {
  it('keeps only KuCoin USDT-margined futures contracts', () => {
    expect(isKuCoinUsdtMarginedContract({ symbol: 'XBTUSDTM', settleCurrency: 'USDT', quoteCurrency: 'USDT' })).toBe(true);
    expect(isKuCoinUsdtMarginedContract({ symbol: 'ETHUSDTM' })).toBe(true);
    expect(isKuCoinUsdtMarginedContract({ symbol: 'XBTUSDM', settleCurrency: 'BTC', quoteCurrency: 'USD' })).toBe(false);
    expect(isKuCoinUsdtMarginedContract({ symbol: 'ETHUSDTM', settleCurrency: 'USDC' })).toBe(false);
  });

  it('uses Binance exchange metadata to keep active USDT perpetual contracts only', () => {
    const symbols = extractBinanceUsdtPerpetualSymbols({
      symbols: [
        { symbol: 'BTCUSDT', status: 'TRADING', contractType: 'PERPETUAL', quoteAsset: 'USDT' },
        { symbol: 'ETHUSDT', status: 'BREAK', contractType: 'PERPETUAL', quoteAsset: 'USDT' },
        { symbol: 'BTCUSDC', status: 'TRADING', contractType: 'PERPETUAL', quoteAsset: 'USDC' },
        { symbol: 'BTCUSDT_260925', status: 'TRADING', contractType: 'CURRENT_QUARTER', quoteAsset: 'USDT' },
      ],
    });
    expect([...symbols]).toEqual(['BTCUSDT']);
  });
});
