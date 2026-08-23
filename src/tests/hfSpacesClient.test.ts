import { describe, expect, it } from 'vitest';
import {
  parseSpace2HistoricalCandles,
  parseSpace4Funding,
  parseSpace4Market,
  parseSpace4OrderBook,
} from '../services/hfSpacesClient';
import { isApprovedHfSpaceContract } from '../services/hfSpaceContracts';
import {
  classifyHfPayload,
  classifyHfScalarPayload,
  collectTopLevelKeys,
  formatHfDiagnosticsTable,
  parseHfNewsPayload,
  parseHfOnChainPayload,
  type HfRequestDiagnostics,
} from '../services/hfSpaceIntel';

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

describe('HF read result-state classification', () => {
  it('separates a genuinely empty endpoint from one whose schema changed', () => {
    // Space-2 /api/news/latest: HTTP 200, success=true, but no articles. The
    // endpoint works and truthfully has nothing — that is NO_DATA.
    const empty = parseHfNewsPayload({ success: true, count: 0, articles: [] });
    expect(empty.container).toBe('articles');
    expect(empty.rawCount).toBe(0);
    expect(classifyHfPayload({ ok: true, container: empty.container, rawCount: empty.rawCount, usableCount: empty.headlines.length }))
      .toBe('NO_DATA');

    // A 200 in a shape APEX does not recognise must never be reported as empty.
    const foreign = parseHfNewsPayload({ result: { feed: [{ heading: 'BTC up' }] } });
    expect(foreign.container).toBeNull();
    expect(classifyHfPayload({ ok: true, container: foreign.container, rawCount: foreign.rawCount, usableCount: 0 }))
      .toBe('SCHEMA_MISMATCH');
    expect(collectTopLevelKeys({ result: {}, meta: 1 })).toEqual(['result', 'meta']);
  });

  it('accepts the verified Space-2 resources route and reports SUCCESS', () => {
    const parsed = parseHfNewsPayload({
      success: true,
      count: 2,
      articles: [
        { title: 'BTC reclaims range high', url: 'https://example.invalid/a', source: 'feed', published_at: '2026-08-18T10:00:00Z' },
        { headline: 'ETH funding flips positive', link: 'https://example.invalid/b' },
      ],
    });
    expect(parsed.headlines).toHaveLength(2);
    expect(parsed.headlines[0].title).toBe('BTC reclaims range high');
    expect(classifyHfPayload({ ok: true, container: parsed.container, rawCount: parsed.rawCount, usableCount: parsed.headlines.length }))
      .toBe('SUCCESS');
  });

  it('never reports an unreachable endpoint as absence of data', () => {
    expect(classifyHfPayload({ ok: false, container: null, rawCount: 0, usableCount: 0 })).toBe('NETWORK_ERROR');
    expect(classifyHfScalarPayload(false, null, false)).toBe('NETWORK_ERROR');
    // Scalar endpoints: empty data array is real emptiness, anything else is schema drift.
    expect(classifyHfScalarPayload(true, { success: true, data: [] }, false)).toBe('NO_DATA');
    expect(classifyHfScalarPayload(true, { unexpected: 1 }, false)).toBe('SCHEMA_MISMATCH');
    expect(classifyHfScalarPayload(true, { price: 60_000 }, true)).toBe('SUCCESS');
  });
});

describe('HF on-chain observations versus directional signals', () => {
  it('keeps valid directionless whale rows as raw observations', () => {
    const parsed = parseHfOnChainPayload({
      success: true,
      transactions: [
        { amount: 900, hash: '0xabc123def456', symbol: 'btc', chain: 'Bitcoin' },
        { amount: 250, tx_hash: '0xdef789', symbol: 'eth', direction: 'inbound' },
      ],
    });

    // Both rows survive: a directionless transfer is still a real observation.
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].direction).toBeUndefined();
    expect(parsed.rows[1].direction).toBe('inbound');
    expect(classifyHfPayload({ ok: true, container: parsed.container, rawCount: parsed.rawCount, usableCount: parsed.rows.length }))
      .toBe('SUCCESS');
  });

  it('reports rows that fail validation as a schema break, not as "no whales"', () => {
    const parsed = parseHfOnChainPayload({
      success: true,
      // Records are present, but none carry a usable amount + transaction id.
      transactions: [{ value_str: '900 BTC', reference: 'n/a' }, { amount: 0, hash: '' }],
    });
    expect(parsed.rawCount).toBe(2);
    expect(parsed.rows).toHaveLength(0);
    expect(classifyHfPayload({ ok: true, container: parsed.container, rawCount: parsed.rawCount, usableCount: parsed.rows.length }))
      .toBe('SCHEMA_MISMATCH');
  });

  it('reports an empty whale container as NO_DATA', () => {
    const parsed = parseHfOnChainPayload({ success: true, transactions: [] });
    expect(classifyHfPayload({ ok: true, container: parsed.container, rawCount: 0, usableCount: 0 })).toBe('NO_DATA');
  });
});

describe('HF provider telemetry', () => {
  it('reports endpoint, HTTP status, latency, parsed state and data availability', () => {
    const shortHunter = (data: unknown) => ({
      success: true, sourceMode: 'LIVE', dataState: 'REAL', noTradeGuard: false, freshnessMs: 120, data,
    });

    // States are derived from the production parsers/classifiers, not hand-written.
    const news = parseHfNewsPayload({ success: true, count: 1, articles: [{ title: 'BTC bid' }] });
    const newsEmpty = parseHfNewsPayload({ success: true, count: 0, articles: [] });
    const market = parseSpace4Market(shortHunter({ ticker: { lastPrice: 60_000 } }));
    const book = parseSpace4OrderBook(shortHunter({ bids: [[100, 5]], asks: [[101, 4]] }));

    const attempts: HfRequestDiagnostics[] = [
      {
        endpoint: '/api/resources/news/latest', provider: 'HF Space-2 · resources', latencyMs: 412, httpStatus: 200,
        resultState: classifyHfPayload({ ok: true, container: news.container, rawCount: news.rawCount, usableCount: news.headlines.length }),
        itemCount: news.headlines.length, rawItemCount: news.rawCount,
      },
      {
        endpoint: '/api/news/latest?limit=10', provider: 'HF Space-2 · news', latencyMs: 388, httpStatus: 200,
        resultState: classifyHfPayload({ ok: true, container: newsEmpty.container, rawCount: newsEmpty.rawCount, usableCount: newsEmpty.headlines.length }),
        itemCount: 0, rawItemCount: 0,
      },
      {
        endpoint: '/api/sentiment/global', provider: 'HF Space-2 · sentiment/global', latencyMs: 351, httpStatus: 200,
        resultState: classifyHfScalarPayload(true, { value: 54, classification: 'Neutral' }, true), itemCount: 1, rawItemCount: 1,
      },
      {
        endpoint: '/api/fear-greed?limit=1', provider: 'HF Space-2 · fear-greed', latencyMs: 402, httpStatus: 200,
        resultState: classifyHfScalarPayload(true, { data: [{ value: 41 }] }, true), itemCount: 1, rawItemCount: 1,
      },
      {
        endpoint: '/api/service/rate?pair=BTC/USDT', provider: 'HF Space-2 · rate service', latencyMs: 296, httpStatus: 200,
        resultState: classifyHfScalarPayload(true, { price: 60_120.5 }, true), itemCount: 1, rawItemCount: 1,
      },
      {
        endpoint: '/api/health', provider: 'HF Space-4 · health', latencyMs: 210, httpStatus: 200,
        resultState: classifyHfScalarPayload(true, { status: 'ok' }, true), itemCount: 1, rawItemCount: 1,
      },
      {
        endpoint: '/api/short-hunter/market/BTC', provider: 'HF Space-4 · Short Hunter', latencyMs: 480, httpStatus: 200,
        resultState: classifyHfScalarPayload(true, {}, market !== null), itemCount: market ? 1 : 0, rawItemCount: market ? 1 : 0,
      },
      {
        endpoint: '/api/short-hunter/orderbook/BTCUSDT', provider: 'HF Space-4 · Short Hunter', latencyMs: 505, httpStatus: 200,
        resultState: classifyHfScalarPayload(true, {}, book !== null), itemCount: book ? book.rawDepth : 0, rawItemCount: book ? book.rawDepth : 0,
      },
      {
        endpoint: '/api/whales/transactions?limit=20', provider: 'HF Space-4 · whales', latencyMs: 0, httpStatus: 0,
        resultState: 'NETWORK_ERROR', itemCount: 0, rawItemCount: 0, error: 'upstream unreachable',
      },
    ];

    const table = formatHfDiagnosticsTable(attempts);
    // Surfaced in `vitest run` output so provider state is inspectable directly.
    console.log(`\nHF provider state (fixture-driven, offline):\n${table}`);

    expect(table).toContain('ENDPOINT');
    expect(table).toContain('HTTP');
    expect(table).toContain('LATENCY_MS');
    expect(table).toContain('STATE');
    expect(table).toContain('DATA');
    // The verified-usable route reports SUCCESS with data; the empty one is NO_DATA.
    expect(table).toMatch(/\/api\/resources\/news\/latest\s+200\s+412\s+SUCCESS\s+YES\(1\)/);
    expect(table).toMatch(/\/api\/news\/latest\?limit=10\s+200\s+388\s+NO_DATA\s+NONE/);
    expect(table).toMatch(/\/api\/whales\/transactions\?limit=20\s+0\s+0\s+NETWORK_ERROR\s+NONE/);
    expect(attempts.filter((a) => a.resultState === 'SUCCESS')).toHaveLength(7);
  });

  it('marks a response with raw-but-unusable rows as RAW_ONLY rather than empty', () => {
    const table = formatHfDiagnosticsTable([{
      endpoint: '/api/service/whales?limit=20', provider: 'HF Space-2 · whales', latencyMs: 300, httpStatus: 200,
      resultState: 'SCHEMA_MISMATCH', itemCount: 0, rawItemCount: 4, receivedKeys: ['success', 'transactions'],
    }]);
    expect(table).toMatch(/SCHEMA_MISMATCH\s+RAW_ONLY\(4\)/);
  });
});

describe('HF contract allow-list is shared runtime state', () => {
  it('approves every route the intel layer reads', () => {
    for (const path of [
      '/api/new-sources/status',
      '/api/resources/news/latest',
      '/api/news/latest?limit=10',
      '/api/sentiment/global',
      '/api/fear-greed?limit=1',
      '/api/service/whales?limit=20&symbol=BTC',
      '/api/service/rate?pair=BTC%2FUSDT',
      '/api/market?symbols=BTC,ETH&limit=2',
    ]) {
      expect(isApprovedHfSpaceContract('space2', 'GET', path), path).toBe(true);
    }
    for (const path of [
      '/api/health',
      '/api/news/latest?limit=10',
      '/api/sentiment/global',
      '/api/crypto/whales/transactions?limit=20',
      '/api/whales/transactions?limit=20',
      '/api/short-hunter/market/BTC',
      '/api/short-hunter/orderbook/BTCUSDT?limit=20',
      '/api/short-hunter/funding/BTCUSDT',
      '/api/short-hunter/open-interest/BTCUSDT',
      '/api/short-hunter/snapshot/BTCUSDT?limit=120',
    ]) {
      expect(isApprovedHfSpaceContract('space4', 'GET', path), path).toBe(true);
    }
  });

  it('retains the routes other consumers depend on, so none may be pruned', () => {
    // hfSpacesClient reads these; removing them from the allow-list would fail
    // closed at runtime while every source-only check still looked green.
    expect(isApprovedHfSpaceContract('space2', 'GET', '/api/trading/backtest/historical/BTCUSDT?timeframe=1h&days=7&exchange=binance')).toBe(true);
    expect(isApprovedHfSpaceContract('space2', 'GET', '/api/defi/protocols?limit=20')).toBe(true);
    expect(isApprovedHfSpaceContract('space2', 'GET', '/api/defi/yields?limit=20')).toBe(true);
    expect(isApprovedHfSpaceContract('space2', 'POST', '/api/sentiment')).toBe(true);
    expect(isApprovedHfSpaceContract('space4', 'GET', '/api/short-hunter/ohlcv/BTC?interval=1m&limit=60')).toBe(true);
  });
});
