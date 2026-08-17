import { describe, expect, it } from 'vitest';
import {
  parseSpace2HistoricalCandles,
  parseSpace4Funding,
  parseSpace4Market,
  parseSpace4OrderBook,
} from '../services/hfSpacesClient';
import { isApprovedHfSpaceContract } from '../services/hfSpaceContracts';

function shortHunterEnvelope(data: unknown) {
  return {
    success: true,
    sourceMode: 'LIVE',
    dataState: 'REAL',
    noTradeGuard: false,
    freshnessMs: 150,
    providerUsed: 'kucoin_futures',
    data,
  };
}

describe('Space-4 fail-closed parsers', () => {
  it('accepts actual bid/ask depth arrays and preserves unknown contract units', () => {
    const parsed = parseSpace4OrderBook(shortHunterEnvelope({
      bids: [[100, 10], [99, 20]],
      asks: [[101, 12], [102, 18]],
    }));

    expect(parsed).not.toBeNull();
    expect(parsed?.book.bids).toHaveLength(2);
    expect(parsed?.book.asks).toHaveLength(2);
    expect(parsed?.book.bids[1].cumulative).toBe(30);
    expect(parsed?.volumeUnit).toBe('contracts_unknown');
  });

  it('rejects no-trade, stale, and crossed books', () => {
    expect(parseSpace4OrderBook({
      ...shortHunterEnvelope({ bids: [[100, 1]], asks: [[101, 1]] }),
      noTradeGuard: true,
    })).toBeNull();
    expect(parseSpace4OrderBook({
      ...shortHunterEnvelope({ bids: [[100, 1]], asks: [[101, 1]] }),
      freshnessMs: 30_001,
    })).toBeNull();
    expect(parseSpace4OrderBook(shortHunterEnvelope({
      bids: [[102, 1]],
      asks: [[101, 1]],
    }))).toBeNull();
  });


  it('does not coerce a missing funding rate into a fabricated zero', () => {
    const missing = parseSpace4Market(shortHunterEnvelope({
      ticker: { lastPrice: 60_000 },
      fundingRate: null,
      openInterest: 1_000_000,
    }));
    const realZero = parseSpace4Market(shortHunterEnvelope({
      ticker: { lastPrice: 60_000 },
      fundingRate: 0,
      openInterest: 1_000_000,
    }));

    expect(missing?.fundingRate).toBeNull();
    expect(realZero?.fundingRate).toBe(0);
  });

  it('uses modelled funding history only when values are numeric', () => {
    const parsed = parseSpace4Funding(shortHunterEnvelope({
      currentFundingRate: 0.000061,
      nextFundingTime: 1_800_000_000_000,
      history: [
        { fundingTime: null, fundingRate: 0.000076 },
        { fundingTime: 1_799_000_000_000, fundingRate: 'bad' },
      ],
    }));
    expect(parsed?.currentFundingRate).toBe(0.000061);
    expect(parsed?.history).toHaveLength(1);
    expect(parsed?.historyTimestampsComplete).toBe(false);
  });

  it('does not reinterpret a generic timePoint as the next funding settlement', () => {
    const parsed = parseSpace4Funding(shortHunterEnvelope({
      currentFundingRate: 0.00005,
      timePoint: 1_800_000_000_000,
      history: [],
    }));
    expect(parsed?.nextFundingTime).toBeNull();
  });
});

describe('Space-2 historical candle validation', () => {
  it('parses UTC timestamps, enforces cadence, and removes the open candle', () => {
    const now = Date.parse('2026-08-01T18:30:00Z');
    const rows = ['14:00:00', '15:00:00', '16:00:00', '17:00:00', '18:00:00'].map((time, index) => ({
      timestamp: `2026-08-01T${time}`,
      open: 100 + index,
      high: 102 + index,
      low: 99 + index,
      close: 101 + index,
      volume: 10,
    }));
    const parsed = parseSpace2HistoricalCandles({
      success: true,
      exchange: 'binance',
      candles: rows,
    }, 3_600_000, 10, now);

    expect(parsed?.candles).toHaveLength(4);
    expect(parsed?.candles.at(-1)?.timestamp).toBe(Date.parse('2026-08-01T17:00:00Z'));
  });

  it('rejects invalid exchanges and cadence gaps', () => {
    const now = Date.parse('2026-08-01T18:30:00Z');
    const candles = [
      { timestamp: '2026-08-01T14:00:00', open: 100, high: 102, low: 99, close: 101, volume: 10 },
      { timestamp: '2026-08-01T16:00:00', open: 101, high: 103, low: 100, close: 102, volume: 10 },
    ];
    expect(parseSpace2HistoricalCandles({ success: true, exchange: 'unknown', candles }, 3_600_000, 10, now)).toBeNull();
    expect(parseSpace2HistoricalCandles({ success: true, exchange: 'binance', candles }, 3_600_000, 10, now)).toBeNull();
  });
});


describe('HF Space executable contract allowlist', () => {
  it('allows only explicitly verified Space-2 contracts', () => {
    expect(isApprovedHfSpaceContract('space2', 'GET', '/api/trading/backtest/historical/BTCUSDT?timeframe=1h&days=7&exchange=binance')).toBe(true);
    expect(isApprovedHfSpaceContract('space2', 'POST', '/api/sentiment')).toBe(true);
    expect(isApprovedHfSpaceContract('space2', 'GET', '/api/trading/ohlcv/BTCUSDT')).toBe(false);
    expect(isApprovedHfSpaceContract('space2', 'GET', '/api/unknown')).toBe(false);
    expect(isApprovedHfSpaceContract('space2', 'POST', '/api/market')).toBe(false);
  });

  it('keeps Space-4 on its verified route family', () => {
    expect(isApprovedHfSpaceContract('space4', 'GET', '/api/short-hunter/orderbook/BTCUSDT?limit=20')).toBe(true);
    expect(isApprovedHfSpaceContract('space4', 'GET', '/api/short-hunter/market/ETH')).toBe(true);
    expect(isApprovedHfSpaceContract('space4', 'GET', '/api/short-hunter/ohlcv/BTC?interval=1m&limit=60')).toBe(true);
    expect(isApprovedHfSpaceContract('space4', 'GET', '/api/trading/backtest/historical/BTCUSDT')).toBe(false);
    expect(isApprovedHfSpaceContract('space4', 'POST', '/api/sentiment')).toBe(false);
  });
});
