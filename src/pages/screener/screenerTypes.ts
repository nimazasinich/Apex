import type { DataState, ReadinessTier, TimeframeConfluenceState, TradeDirection } from '../../types';

/**
 * Screener contracts.
 *
 * Deliberately reuses the existing domain vocabulary instead of inventing a
 * parallel one:
 *
 * - direction is `TradeDirection` (`'LONG' | 'SHORT'`). The scanner never emits a
 *   neutral thesis, so the screener does not pretend a third bias exists.
 * - signal state is `ReadinessTier` (`'CONFIRMED' | 'WATCHLIST' | 'CAUTION' |
 *   'BLOCKED'`). Adding a second four-value enum over the same concept would be a
 *   duplicate state system with a translation layer to keep in sync forever.
 *
 * Plain-language labels for both live in the presentation layer only.
 */

/**
 * Availability of a single displayed metric.
 *
 * A metric is either backed by a real reported value or explicitly absent. There
 * is no third case, and absence is never rendered as `0`, `—` alone, or a
 * neutral midpoint: `note` explains why the value is missing so the user can tell
 * "the market has no funding" apart from "we could not read funding".
 */
export interface ScreenerMetric {
  state: 'AVAILABLE' | 'UNAVAILABLE';
  value: number | null;
  note: string | null;
}

export type ScreenerFactorId = 'liquidity' | 'momentum' | 'orderFlow' | 'structure' | 'funding';

/**
 * One component of the scanner's published score.
 *
 * These are read from `CandidateScore`, not recomputed. The scanner owns scoring;
 * the screener explains it.
 */
export interface ScreenerFactor {
  id: ScreenerFactorId;
  label: string;
  metric: ScreenerMetric;
}

export interface ScreenerRow {
  /** 1-based position in the deterministic full-universe ranking. */
  rank: number;
  /**
   * The composite that decides `rank` — defined once, in `signalStrengthOf`
   * (`screenerModel.ts`).
   *
   * This is NOT a second score and is never printed as one. `score` stays the
   * scanner's authoritative 0-100 and is what the UI shows; strength only orders
   * the list, so a guard-flagged 90 with five objections cannot sit above a clean
   * 82.
   */
  signalStrength: number;
  /** Canonical server lifecycle; older saved fixtures may omit it. */
  decisionState?: NonNullable<import('../../types').CandidateScore['decisionState']>;
  /** Canonical server ordering key; used directly when present. */
  canonicalRankScore?: number;
  symbol: string;
  baseAsset: string;
  direction: TradeDirection;
  /** The scanner's own 0-100 score. Never re-derived here. */
  score: number;
  readinessTier: ReadinessTier;
  guardPass: boolean;
  lastPrice: number;
  priceChange24hPct: number;
  turnover24h: number;
  /** Reported base-asset volume. Kept separate from USD turnover. */
  baseVolume24h: ScreenerMetric;
  /** Reported high-to-low range as a percentage of last price; not annualized volatility. */
  range24hPct: ScreenerMetric;
  openInterest: ScreenerMetric;
  fundingRate: ScreenerMetric;
  /**
   * Spread / book-depth quality.
   *
   * Always `UNAVAILABLE` today: order books are fetched for the selected chart
   * symbol only, never for the whole universe, so a per-row spread column would
   * be fabricated. `liquidity` in `factors` is the real market-wide liquidity
   * signal. Kept as a field so the UI can say so out loud rather than hiding a
   * gap the user might assume is covered.
   */
  spreadDepth: ScreenerMetric;
  /**
   * The scanner's own trade levels for this candidate.
   *
   * Copied from `CandidateScore.lifecycleContext`, where the server attaches
   * `entryPrice`, `stopLoss` and `takeProfit` produced by
   * `deriveSymbolLevels(ticker, candles1h, 'ATR_BANDS')` on every scan candidate,
   * long and short. Nothing is re-derived in the browser — no ATR, no swing
   * scan, no rounding to a nicer number — and a candidate that arrives without a
   * level reports it `UNAVAILABLE` instead of showing an invented price.
   */
  entryPrice: ScreenerMetric;
  stopLoss: ScreenerMetric;
  takeProfit: ScreenerMetric;
  /**
   * Reward-to-risk of those three prices, in R.
   *
   * Arithmetic over two distances the scanner already published, not a new market
   * reading: `|target − entry| / |entry − stop|`, direction-aware, and absent
   * whenever a leg is missing or sits on the wrong side of entry.
   */
  riskReward: ScreenerMetric;
  /** The risk leg as a percentage of entry, from the same two published prices. */
  riskPct: ScreenerMetric;
  /** Reported 24h extremes — the only real reference levels the market-wide snapshot carries. */
  high24h: ScreenerMetric;
  low24h: ScreenerMetric;
  factors: ScreenerFactor[];
  timeframeConfluence: boolean;
  timeframeConfluenceState: TimeframeConfluenceState | null;
  /** Share of scoring weight the scanner reported as evidence-backed, if reported. */
  scoreCoveragePct: number | null;
  /** Why this symbol ranked here. Derived only from reported fields. */
  reasons: string[];
  /** Everything arguing against acting on it, including raw guard reasons. */
  warnings: string[];
  dataState: DataState;
  /** Freshest input timestamp in ms, or null when no source reported one. */
  observedAtMs: number | null;
}

export interface ScreenerFilters {
  query: string;
  direction: 'ALL' | TradeDirection;
  tier: 'ALL' | ReadinessTier;
  /** Inclusive lower bound on the scanner score, 0-100. */
  minScore: number;
  /** Inclusive lower bound on 24h USD turnover. */
  minTurnoverUsd: number;
  performance: 'ALL' | 'GAINERS' | 'LOSERS' | 'MOVERS';
  guard: 'ALL' | 'PASS' | 'FLAGGED';
  confluence: 'ALL' | 'ALIGNED' | 'CONFLICTING';
  funding: 'ALL' | 'POSITIVE' | 'NEGATIVE' | 'AVAILABLE';
  dataQuality: 'ALL' | 'LIVE' | 'PARTIAL';
  minMomentum: number;
  minCoveragePct: number;
  favoritesOnly: boolean;
}

export const DEFAULT_SCREENER_FILTERS: ScreenerFilters = {
  query: '',
  direction: 'ALL',
  tier: 'ALL',
  minScore: 0,
  minTurnoverUsd: 0,
  performance: 'ALL',
  guard: 'ALL',
  confluence: 'ALL',
  funding: 'ALL',
  dataQuality: 'ALL',
  minMomentum: 0,
  minCoveragePct: 0,
  favoritesOnly: false,
};

export type ScreenerSortKey =
  | 'rank' | 'symbol' | 'direction' | 'score' | 'tier' | 'change' | 'turnover'
  | 'momentum' | 'structure' | 'funding' | 'openInterest' | 'coverage' | 'range' | 'warnings';

export interface ScreenerSort {
  key: ScreenerSortKey;
  ascending: boolean;
}

export const DEFAULT_SCREENER_SORT: ScreenerSort = { key: 'rank', ascending: true };

export type ScreenerColumnSet = 'overview' | 'momentum' | 'derivatives' | 'quality';
export type ScreenerViewMode = 'table' | 'map';

export interface ScreenerWorkspaceState {
  filters: ScreenerFilters;
  sort: ScreenerSort;
  columnSet: ScreenerColumnSet;
  viewMode: ScreenerViewMode;
}

export interface SavedScreenerScreen {
  id: string;
  name: string;
  createdAt: number;
  workspace: ScreenerWorkspaceState;
}

export const DEFAULT_SCREENER_WORKSPACE: ScreenerWorkspaceState = {
  filters: DEFAULT_SCREENER_FILTERS,
  sort: DEFAULT_SCREENER_SORT,
  columnSet: 'overview',
  viewMode: 'table',
};

export interface ScreenerSummary {
  /** Distinct symbols the scanner returned a thesis for. */
  scanned: number;
  /** Rows passing the guard with a CONFIRMED or WATCHLIST tier. */
  opportunities: number;
  /** Rows currently visible under the active filters. */
  matched: number;
  /** Rows carrying at least one warning. */
  flagged: number;
  /** Rows with at least one unavailable metric. */
  partial: number;
}
