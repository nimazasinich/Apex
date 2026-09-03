import { describe, expect, it } from 'vitest';
import {
  applyScreenerFilters,
  buildScreenerRows,
  resetScreenerFilters,
  screenerFiltersActive,
  screenerSummary,
  sortScreenerRows,
} from '../pages/screener/screenerModel';
import { DEFAULT_SCREENER_FILTERS, DEFAULT_SCREENER_SORT } from '../pages/screener/screenerTypes';
import type { CandidateScore, SymbolTicker } from '../types';

function candidate(overrides: Partial<CandidateScore> & Pick<CandidateScore, 'symbol'>): CandidateScore {
  return {
    lastPrice: 100,
    priceChange24hPct: 3.5,
    turnover24h: 90_000_000,
    direction: 'LONG',
    score: 70,
    readinessTier: 'CONFIRMED',
    guardPass: true,
    guardReasons: [],
    momentumScore: 72,
    orderFlowScore: 65,
    fundingScore: 61,
    structureScore: 68,
    liquidityScore: 80,
    timeframeConfluence: true,
    timeframeDetails: { tf15m: 'BULLISH', tf1h: 'BULLISH' },
    dataState: 'live',
    ...overrides,
  };
}

function ticker(overrides: Partial<SymbolTicker> & Pick<SymbolTicker, 'symbol'>): SymbolTicker {
  return {
    lastPrice: 100,
    turnover24h: 90_000_000,
    priceChange24hPct: 3.5,
    volume24h: 900_000,
    high24h: 105,
    low24h: 95,
    fundingRate: 0.0001,
    openInterest: 40_000_000,
    dataState: 'live',
    timestamp: 1_760_000_000_000,
    ...overrides,
  };
}

const universe: CandidateScore[] = [
  candidate({ symbol: 'BTC-USDT', score: 88, readinessTier: 'CONFIRMED' }),
  candidate({ symbol: 'ETH-USDT', score: 74, readinessTier: 'WATCHLIST', direction: 'SHORT', priceChange24hPct: -4.2 }),
  candidate({ symbol: 'SOL-USDT', score: 55, readinessTier: 'CAUTION', turnover24h: 12_000_000 }),
  candidate({
    symbol: 'DOGE-USDT',
    score: 31,
    readinessTier: 'BLOCKED',
    guardPass: false,
    guardReasons: ['Spread exceeds the configured maximum.'],
    direction: 'SHORT',
  }),
];

const tickers: SymbolTicker[] = [
  ticker({ symbol: 'BTC-USDT' }),
  ticker({ symbol: 'ETH-USDT', priceChange24hPct: -4.2 }),
  ticker({ symbol: 'SOL-USDT', turnover24h: 12_000_000 }),
  ticker({ symbol: 'DOGE-USDT' }),
];

describe('screener model', () => {
  it('ranks rows by the scanner score and numbers them from one', () => {
    const rows = buildScreenerRows(universe, tickers);
    expect(rows.map((row) => row.symbol)).toEqual(['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'DOGE-USDT']);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 4]);
  });

  it('does not recompute the score from its published sub-scores', () => {
    const rows = buildScreenerRows([candidate({ symbol: 'BTC-USDT', score: 88 })], tickers);
    // The five sub-scores sum to 346; the row must still carry the authoritative 88.
    expect(rows[0].score).toBe(88);
  });

  // The rule `signalStrengthOf` exists for: position reflects how clean a signal is,
  // not just how high its number is. Without the guard, tier and flag terms the 90
  // below leads the list while contradicting its own RISK badge.
  it('ranks a clean signal above a noisier one carrying a higher raw score', () => {
    const noisy = candidate({
      symbol: 'NOISY-USDT',
      score: 90,
      readinessTier: 'CAUTION',
      guardPass: false,
      guardReasons: ['Spread exceeds the configured maximum.', 'Funding is against the thesis.'],
      timeframeConfluence: false,
      timeframeDetails: { tf15m: 'BULLISH', tf1h: 'BEARISH' },
    });
    const clean = candidate({ symbol: 'CLEAN-USDT', score: 82, readinessTier: 'CONFIRMED' });
    const rows = buildScreenerRows(
      [noisy, clean],
      [ticker({ symbol: 'NOISY-USDT' }), ticker({ symbol: 'CLEAN-USDT' })],
    );
    expect(rows.map((row) => row.symbol)).toEqual(['CLEAN-USDT', 'NOISY-USDT']);
    expect(rows.map((row) => row.rank)).toEqual([1, 2]);
    // Reordering must never touch the published numbers — only the position.
    expect(rows.map((row) => row.score)).toEqual([82, 90]);
    expect(rows[0].signalStrength).toBeGreaterThan(rows[1].signalStrength);
    expect(rows[1].warnings.length).toBeGreaterThan(rows[0].warnings.length);
  });

  // Strength is a ranking key, never a second score: it is not displayed, and a raw
  // score sort must still be a raw score sort.
  it('keeps the score column sorting on the published score, not on strength', () => {
    const rows = buildScreenerRows(universe, tickers);
    expect(sortScreenerRows(rows, { key: 'score', ascending: false }).map((row) => row.score))
      .toEqual([88, 74, 55, 31]);
  });

  it('sorts by any column with a total order and a stable rank tie-break', () => {
    const rows = buildScreenerRows(universe, tickers);
    expect(sortScreenerRows(rows, { key: 'score', ascending: true }).map((row) => row.symbol))
      .toEqual(['DOGE-USDT', 'SOL-USDT', 'ETH-USDT', 'BTC-USDT']);
    expect(sortScreenerRows(rows, { key: 'symbol', ascending: true }).map((row) => row.symbol))
      .toEqual(['BTC-USDT', 'DOGE-USDT', 'ETH-USDT', 'SOL-USDT']);
    expect(sortScreenerRows(rows, { key: 'change', ascending: true })[0].symbol).toBe('ETH-USDT');
    expect(sortScreenerRows(rows, { key: 'tier', ascending: true }).map((row) => row.readinessTier))
      .toEqual(['CONFIRMED', 'WATCHLIST', 'CAUTION', 'BLOCKED']);
    expect(sortScreenerRows(rows, DEFAULT_SCREENER_SORT).map((row) => row.rank)).toEqual([1, 2, 3, 4]);
  });

  it('ties in a sorted column fall back to rank rather than input order', () => {
    const tied = buildScreenerRows([
      candidate({ symbol: 'AAA-USDT', score: 60, priceChange24hPct: 1 }),
      candidate({ symbol: 'BBB-USDT', score: 90, priceChange24hPct: 1 }),
    ], []);
    expect(sortScreenerRows(tied, { key: 'change', ascending: false }).map((row) => row.symbol))
      .toEqual(['BBB-USDT', 'AAA-USDT']);
  });

  it('filters by symbol and by base asset, case-insensitively', () => {
    const rows = buildScreenerRows(universe, tickers);
    expect(applyScreenerFilters(rows, { ...DEFAULT_SCREENER_FILTERS, query: 'eth' }).map((row) => row.symbol))
      .toEqual(['ETH-USDT']);
    expect(applyScreenerFilters(rows, { ...DEFAULT_SCREENER_FILTERS, query: 'USDT' })).toHaveLength(4);
    expect(applyScreenerFilters(rows, { ...DEFAULT_SCREENER_FILTERS, query: 'no-such-market' })).toEqual([]);
  });

  it('filters by direction', () => {
    const rows = buildScreenerRows(universe, tickers);
    expect(applyScreenerFilters(rows, { ...DEFAULT_SCREENER_FILTERS, direction: 'SHORT' }).map((row) => row.symbol))
      .toEqual(['ETH-USDT', 'DOGE-USDT']);
    expect(applyScreenerFilters(rows, { ...DEFAULT_SCREENER_FILTERS, direction: 'LONG' }).map((row) => row.symbol))
      .toEqual(['BTC-USDT', 'SOL-USDT']);
  });

  it('filters by readiness tier and by minimum score', () => {
    const rows = buildScreenerRows(universe, tickers);
    expect(applyScreenerFilters(rows, { ...DEFAULT_SCREENER_FILTERS, tier: 'BLOCKED' }).map((row) => row.symbol))
      .toEqual(['DOGE-USDT']);
    expect(applyScreenerFilters(rows, { ...DEFAULT_SCREENER_FILTERS, minScore: 74 }).map((row) => row.score))
      .toEqual([88, 74]);
  });

  it('combines advanced crypto filters without admitting unknown readings', () => {
    const rows = buildScreenerRows(universe, tickers);
    const visible = applyScreenerFilters(rows, {
      ...DEFAULT_SCREENER_FILTERS,
      performance: 'GAINERS',
      guard: 'PASS',
      confluence: 'ALIGNED',
      funding: 'POSITIVE',
      dataQuality: 'LIVE',
      minMomentum: 70,
    });
    expect(visible.map((row) => row.symbol)).toEqual(['BTC-USDT', 'SOL-USDT']);
  });

  it('filters to favorites only using the shared watchlist identity', () => {
    const rows = buildScreenerRows(universe, tickers);
    const visible = applyScreenerFilters(
      rows,
      { ...DEFAULT_SCREENER_FILTERS, favoritesOnly: true },
      new Set(['ETH-USDT', 'DOGE-USDT']),
    );
    expect(visible.map((row) => row.symbol)).toEqual(['ETH-USDT', 'DOGE-USDT']);
  });

  it('a raised liquidity floor excludes rows whose turnover never arrived', () => {
    const rows = buildScreenerRows([candidate({ symbol: 'AAA-USDT', turnover24h: Number.NaN })], []);
    expect(applyScreenerFilters(rows, { ...DEFAULT_SCREENER_FILTERS, minTurnoverUsd: 1 })).toEqual([]);
    // With no floor the row is still listed — it is unknown turnover, not zero turnover.
    expect(applyScreenerFilters(rows, DEFAULT_SCREENER_FILTERS)).toHaveLength(1);
  });

  it('marks missing metrics unavailable instead of substituting a value', () => {
    const rows = buildScreenerRows([
      candidate({
        symbol: 'AAA-USDT',
        featureQuality: {
          rsi: { state: 'VALID' },
          rocMomentum: { state: 'VALID' },
          structure: { state: 'INSUFFICIENT_HISTORY' },
          orderBookImbalance: { state: 'MISSING' },
          funding: { state: 'VALID' },
          tf15m: { state: 'VALID' },
          tf1h: { state: 'VALID' },
        },
      }),
    ], [ticker({ symbol: 'AAA-USDT', openInterest: 0 })]);

    const factors = new Map(rows[0].factors.map((factor) => [factor.id, factor.metric]));
    expect(factors.get('structure')).toMatchObject({ state: 'UNAVAILABLE', value: null });
    expect(factors.get('orderFlow')).toMatchObject({ state: 'UNAVAILABLE', value: null });
    expect(factors.get('momentum')).toMatchObject({ state: 'AVAILABLE', value: 72 });
    expect(rows[0].openInterest).toMatchObject({ state: 'UNAVAILABLE', value: null });
    expect(rows[0].openInterest.note).toBeTruthy();
    // Spread/depth has no market-wide source at all, so it is always declared absent.
    expect(rows[0].spreadDepth.state).toBe('UNAVAILABLE');
  });

  it('derives the labeled 24h high-low range only from a valid ticker range', () => {
    const [row] = buildScreenerRows(
      [candidate({ symbol: 'AAA-USDT' })],
      [ticker({ symbol: 'AAA-USDT', lastPrice: 100, high24h: 112, low24h: 92, volume24h: 44_000 })],
    );
    expect(row.range24hPct).toEqual({ state: 'AVAILABLE', value: 20, note: null });
    expect(row.baseVolume24h).toEqual({ state: 'AVAILABLE', value: 44_000, note: null });

    const [invalid] = buildScreenerRows(
      [candidate({ symbol: 'BBB-USDT' })],
      [ticker({ symbol: 'BBB-USDT', lastPrice: 0, high24h: 0, low24h: 0 })],
    );
    expect(invalid.range24hPct.state).toBe('UNAVAILABLE');
  });

  it('sorts missing derivatives readings after reported values in either direction', () => {
    const rows = buildScreenerRows(
      [candidate({ symbol: 'KNOWN-USDT' }), candidate({ symbol: 'MISSING-USDT', score: 69 })],
      [ticker({ symbol: 'KNOWN-USDT', fundingRate: -0.0002 })],
    );
    expect(sortScreenerRows(rows, { key: 'funding', ascending: true }).map((row) => row.symbol))
      .toEqual(['KNOWN-USDT', 'MISSING-USDT']);
    expect(sortScreenerRows(rows, { key: 'funding', ascending: false }).map((row) => row.symbol))
      .toEqual(['KNOWN-USDT', 'MISSING-USDT']);
  });

  it('a symbol with no ticker keeps its scanner fields and reports the gap', () => {
    const rows = buildScreenerRows([candidate({ symbol: 'AAA-USDT', score: 66 })], []);
    expect(rows[0].score).toBe(66);
    expect(rows[0].fundingRate.state).toBe('UNAVAILABLE');
    expect(rows[0].warnings).toContain('No ticker snapshot for this symbol in the current market payload.');
  });

  it('preserves guard reasons verbatim and explains why a row ranked', () => {
    const rows = buildScreenerRows(universe, tickers);
    const blocked = rows.find((row) => row.symbol === 'DOGE-USDT');
    expect(blocked?.warnings).toContain('Spread exceeds the configured maximum.');
    expect(blocked?.warnings).toContain('Readiness is BLOCKED — treat this as information, not a setup.');

    const confirmed = rows.find((row) => row.symbol === 'BTC-USDT');
    expect(confirmed?.warnings).toEqual([]);
    expect(confirmed?.reasons[0]).toBe('The scanner confirmed this setup against its full checklist.');
    expect(confirmed?.reasons).toContain('Liquidity scored 80 of 100.');
    expect(confirmed?.reasons.some((reason) => reason.includes('15m and 1h momentum agree'))).toBe(true);
  });

  it('keeps one row per symbol and reports a contested direction rather than dropping it', () => {
    const rows = buildScreenerRows([
      candidate({ symbol: 'BTC-USDT', direction: 'LONG', score: 62 }),
      candidate({ symbol: 'BTC-USDT', direction: 'SHORT', score: 81 }),
    ], tickers);
    expect(rows).toHaveLength(1);
    expect(rows[0].direction).toBe('SHORT');
    expect(rows[0].score).toBe(81);
    expect(rows[0].warnings).toContain('The scanner published both directions; the server-authoritative higher-qualification thesis is shown.');
  });

  it('uses the server decision state before raw score when directions conflict', () => {
    const rows = buildScreenerRows([
      candidate({ symbol: 'EDGE-USDT', direction: 'LONG', score: 96, decisionState: 'REJECTED', canonicalRankScore: 196 }),
      candidate({ symbol: 'EDGE-USDT', direction: 'SHORT', score: 71, decisionState: 'QUALIFIED_SETUP', canonicalRankScore: 471 }),
    ], [ticker({ symbol: 'EDGE-USDT' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].direction).toBe('SHORT');
    expect(rows[0].decisionState).toBe('QUALIFIED_SETUP');
    expect(rows[0].score).toBe(71);
  });

  it('warns on degraded data and incomplete scoring evidence', () => {
    const rows = buildScreenerRows(
      [candidate({ symbol: 'AAA-USDT', dataState: 'degraded', featureCompletenessPct: 62, timeframeConfluenceState: 'CONFLICTING' })],
      [ticker({ symbol: 'AAA-USDT', fundingQuality: 'STALE' })],
    );
    expect(rows[0].warnings).toContain('Scanner data for this symbol is degraded.');
    expect(rows[0].warnings).toContain('Only 62% of the scoring weight is backed by usable evidence.');
    expect(rows[0].warnings).toContain('15m and 1h momentum disagree.');
    expect(rows[0].warnings).toContain('The funding reading is stale.');
    expect(rows[0].scoreCoveragePct).toBe(62);
  });

  it('resetting filters restores every row', () => {
    const rows = buildScreenerRows(universe, tickers);
    const narrowed = { ...DEFAULT_SCREENER_FILTERS, query: 'btc', direction: 'LONG' as const, minScore: 80 };
    expect(applyScreenerFilters(rows, narrowed)).toHaveLength(1);
    expect(screenerFiltersActive(narrowed)).toBe(true);

    const reset = resetScreenerFilters();
    expect(screenerFiltersActive(reset)).toBe(false);
    expect(applyScreenerFilters(rows, reset)).toHaveLength(rows.length);
  });

  it('summarises the universe and the filtered view separately', () => {
    const rows = buildScreenerRows(universe, tickers);
    const visible = applyScreenerFilters(rows, { ...DEFAULT_SCREENER_FILTERS, direction: 'SHORT' });
    const summary = screenerSummary(rows, visible);
    expect(summary.scanned).toBe(4);
    expect(summary.matched).toBe(2);
    // CONFIRMED + WATCHLIST that also pass the guard.
    expect(summary.opportunities).toBe(2);
    expect(summary.flagged).toBe(1);
  });

  it('derivation is deterministic for identical input', () => {
    const first = buildScreenerRows(universe, tickers);
    const second = buildScreenerRows([...universe].reverse(), [...tickers].reverse());
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
