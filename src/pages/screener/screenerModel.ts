import { baseAssetFromMarket } from '../../lib/marketPresentation';
import type { CandidateScore, FeatureQualityState, FeatureQualityMeta, SymbolTicker } from '../../types';
import {
  DEFAULT_SCREENER_FILTERS,
  type ScreenerFactor,
  type ScreenerFactorId,
  type ScreenerFilters,
  type ScreenerMetric,
  type ScreenerRow,
  type ScreenerSort,
  type ScreenerSummary,
} from './screenerTypes';

/**
 * Screener derivation layer.
 *
 * This module owns no data. It is a deterministic projection of the scanner
 * output the app already fetches (`CandidateScore`) joined to the market
 * snapshot it already fetches (`SymbolTicker`).
 *
 * Two rules govern everything below.
 *
 * 1. The score is not recomputed. `CandidateScore.score` is produced server-side
 *    from candles, order books and funding history that the browser never sees in
 *    full. Summing the five published sub-scores here would replace an
 *    authoritative number with a strictly worse client-side approximation that
 *    silently disagrees with every other surface in the app. The screener ranks
 *    on the published score and uses the sub-scores only to explain it.
 *
 * 2. Absent inputs stay absent. Every value that can fail to arrive is wrapped in
 *    `ScreenerMetric` with an explicit note, so an unavailable reading can never
 *    be mistaken for a real one. Nothing is defaulted to zero or to a neutral
 *    midpoint.
 *
 * No React, no DOM, no clock, no randomness: the same inputs always produce
 * byte-identical output, which is what makes the whole page testable.
 */

/** Quality states that mean "there is no usable reading", as opposed to a degraded one. */
const ABSENT_QUALITY: ReadonlySet<FeatureQualityState> = new Set<FeatureQualityState>([
  'MISSING',
  'UNAVAILABLE',
  'INSUFFICIENT_HISTORY',
]);

const FACTOR_LABELS: Record<ScreenerFactorId, string> = {
  liquidity: 'Liquidity',
  momentum: 'Momentum',
  orderFlow: 'Order flow',
  structure: 'Structure',
  funding: 'Funding',
};

/** A factor is only "strong" above this; below it the factor is not offered as a reason. */
const STRONG_FACTOR_SCORE = 60;
/** 24h turnover above this is worth calling out on its own. */
const DEEP_TURNOVER_USD = 50_000_000;

const available = (value: number): ScreenerMetric => ({ state: 'AVAILABLE', value, note: null });
const unavailable = (note: string): ScreenerMetric => ({ state: 'UNAVAILABLE', value: null, note });

function metricFrom(value: number | undefined, quality: FeatureQualityMeta | undefined, absentNote: string): ScreenerMetric {
  if (value == null || !Number.isFinite(value)) return unavailable(absentNote);
  if (quality && ABSENT_QUALITY.has(quality.state)) {
    return unavailable(`Reported as ${quality.state.replace(/_/g, ' ').toLowerCase()} by the scanner.`);
  }
  return available(value);
}

function factorsFor(candidate: CandidateScore): ScreenerFactor[] {
  const quality = candidate.featureQuality;
  const definitions: Array<{ id: ScreenerFactorId; value: number; quality?: FeatureQualityMeta }> = [
    // Liquidity has no per-feature quality entry because it is derived from
    // turnover, which is always present on a ticker the scanner accepted.
    { id: 'liquidity', value: candidate.liquidityScore },
    { id: 'momentum', value: candidate.momentumScore, quality: quality?.rocMomentum },
    { id: 'orderFlow', value: candidate.orderFlowScore, quality: quality?.orderBookImbalance },
    { id: 'structure', value: candidate.structureScore, quality: quality?.structure },
    { id: 'funding', value: candidate.fundingScore, quality: quality?.funding },
  ];
  return definitions.map(({ id, value, quality: featureQuality }) => ({
    id,
    label: FACTOR_LABELS[id],
    metric: metricFrom(value, featureQuality, 'The scanner did not report this factor for this symbol.'),
  }));
}

function reasonsFor(candidate: CandidateScore, factors: ScreenerFactor[], ticker: SymbolTicker | undefined): string[] {
  const reasons: string[] = [];

  if (candidate.readinessTier === 'CONFIRMED') reasons.push('The scanner confirmed this setup against its full checklist.');
  else if (candidate.readinessTier === 'WATCHLIST') reasons.push('The setup is forming but has not met every confirmation condition.');
  else if (candidate.readinessTier === 'CAUTION') reasons.push('The scanner flagged this setup as low quality rather than confirmed.');
  else reasons.push('The scanner blocked this setup; it appears here for visibility only.');

  const strong = factors
    .filter((factor) => factor.metric.state === 'AVAILABLE' && (factor.metric.value ?? 0) >= STRONG_FACTOR_SCORE)
    // Deterministic ordering: strongest first, then by factor id so equal scores
    // never depend on array iteration luck.
    .sort((left, right) => (right.metric.value ?? 0) - (left.metric.value ?? 0) || left.id.localeCompare(right.id))
    .slice(0, 3);
  for (const factor of strong) {
    reasons.push(`${factor.label} scored ${Math.round(factor.metric.value ?? 0)} of 100.`);
  }

  if (candidate.timeframeConfluence) {
    reasons.push(`15m and 1h momentum agree (${candidate.timeframeDetails.tf15m} / ${candidate.timeframeDetails.tf1h}).`);
  }

  if (Number.isFinite(candidate.priceChange24hPct) && Math.abs(candidate.priceChange24hPct) >= 2) {
    const move = candidate.priceChange24hPct > 0 ? 'up' : 'down';
    reasons.push(`Price is ${move} ${Math.abs(candidate.priceChange24hPct).toFixed(2)}% over 24h.`);
  }

  const turnover = Number.isFinite(candidate.turnover24h) ? candidate.turnover24h : ticker?.turnover24h;
  if (turnover != null && Number.isFinite(turnover) && turnover >= DEEP_TURNOVER_USD) {
    reasons.push('24h turnover is deep enough to absorb a normal position.');
  }

  return reasons;
}

function warningsFor(
  candidate: CandidateScore,
  factors: ScreenerFactor[],
  ticker: SymbolTicker | undefined,
  contestedDirection: boolean,
): string[] {
  const warnings: string[] = [];

  // Guard reasons are the scanner's own words. They are surfaced verbatim rather
  // than reworded, because they are the closest thing to an authoritative
  // objection and paraphrasing them loses meaning.
  if (!candidate.guardPass) {
    for (const reason of candidate.guardReasons) {
      if (reason && reason.trim()) warnings.push(reason.trim());
    }
    if (!candidate.guardReasons.some((reason) => reason && reason.trim())) {
      warnings.push('The scanner risk guard rejected this symbol without giving a reason.');
    }
  }

  if (candidate.readinessTier === 'BLOCKED') warnings.push('Readiness is BLOCKED — treat this as information, not a setup.');

  if (candidate.dataState !== 'live') {
    warnings.push(`Scanner data for this symbol is ${candidate.dataState.replace(/_/g, ' ')}.`);
  }
  if (ticker && ticker.dataState !== 'live') {
    warnings.push(`Price data for this symbol is ${ticker.dataState.replace(/_/g, ' ')}.`);
  }
  if (!ticker) warnings.push('No ticker snapshot for this symbol in the current market payload.');

  if (candidate.timeframeConfluenceState === 'CONFLICTING') warnings.push('15m and 1h momentum disagree.');
  if (candidate.timeframeConfluenceState === 'UNAVAILABLE') warnings.push('Multi-timeframe confluence could not be evaluated.');

  const coverage = candidate.featureCompletenessPct;
  if (coverage != null && Number.isFinite(coverage) && coverage < 100) {
    warnings.push(`Only ${Math.round(coverage)}% of the scoring weight is backed by usable evidence.`);
  }

  const missing = factors.filter((factor) => factor.metric.state === 'UNAVAILABLE');
  if (missing.length) {
    warnings.push(`${missing.length} of ${factors.length} score factors are unavailable: ${missing.map((factor) => factor.label.toLowerCase()).join(', ')}.`);
  }

  if (ticker?.fundingQuality === 'STALE') warnings.push('The funding reading is stale.');
  if (ticker?.fundingQuality === 'ESTIMATED') warnings.push('The funding reading is estimated rather than settled.');

  if (contestedDirection) {
    warnings.push('The scanner published both a long and a short thesis for this symbol; the higher-scoring one is shown.');
  }

  return warnings;
}

function rowFor(candidate: CandidateScore, ticker: SymbolTicker | undefined, contestedDirection: boolean): Omit<ScreenerRow, 'rank'> {
  const factors = factorsFor(candidate);
  const coverage = candidate.featureCompletenessPct;
  // The only per-symbol observation time the payloads carry is the ticker
  // timestamp. `CandidateScore` has no timestamp of its own; the scan time is a
  // payload-level field and is reported once in the page header instead of being
  // copied onto every row as if it were measured per symbol.
  const observedAtMs = ticker?.timestamp != null && Number.isFinite(ticker.timestamp) && ticker.timestamp > 0
    ? ticker.timestamp
    : null;

  return {
    symbol: candidate.symbol,
    baseAsset: baseAssetFromMarket(candidate.symbol),
    direction: candidate.direction,
    score: candidate.score,
    readinessTier: candidate.readinessTier,
    guardPass: candidate.guardPass,
    lastPrice: Number.isFinite(candidate.lastPrice) ? candidate.lastPrice : (ticker?.lastPrice ?? Number.NaN),
    priceChange24hPct: candidate.priceChange24hPct,
    turnover24h: candidate.turnover24h,
    baseVolume24h: ticker == null
      ? unavailable('No ticker snapshot for this symbol in the current market payload.')
      : metricFrom(ticker.volume24h, undefined, 'No base-asset volume was reported for this market.'),
    range24hPct: ticker == null || !Number.isFinite(ticker.lastPrice) || ticker.lastPrice <= 0
      || !Number.isFinite(ticker.high24h) || !Number.isFinite(ticker.low24h) || ticker.high24h < ticker.low24h
      ? unavailable('A valid 24h high, low, and last price are required to calculate the range.')
      : available(((ticker.high24h - ticker.low24h) / ticker.lastPrice) * 100),
    openInterest: ticker == null
      ? unavailable('No ticker snapshot for this symbol in the current market payload.')
      : metricFrom(
        Number.isFinite(ticker.openInterest) && ticker.openInterest > 0 ? ticker.openInterest : undefined,
        undefined,
        'No open-interest value was reported for this market.',
      ),
    fundingRate: ticker == null
      ? unavailable('No ticker snapshot for this symbol in the current market payload.')
      : metricFrom(ticker.fundingRate, ticker.fundingQuality ? { state: ticker.fundingQuality } : undefined,
        'No funding rate was reported for this market.'),
    // Deliberately constant. See the field comment in screenerTypes.ts: order-book
    // depth is only fetched for the selected chart symbol, so there is no honest
    // market-wide spread column to draw.
    spreadDepth: unavailable('Order-book depth is only fetched for the symbol open in Trading, so spread quality is not available across the market list.'),
    factors,
    timeframeConfluence: candidate.timeframeConfluence,
    timeframeConfluenceState: candidate.timeframeConfluenceState ?? null,
    scoreCoveragePct: coverage != null && Number.isFinite(coverage) ? coverage : null,
    reasons: reasonsFor(candidate, factors, ticker),
    warnings: warningsFor(candidate, factors, ticker, contestedDirection),
    dataState: candidate.dataState,
    observedAtMs,
  };
}

/**
 * Project scanner candidates into ranked screener rows.
 *
 * One row per symbol. When the scanner publishes both a long and a short thesis
 * for the same symbol the higher-scoring one wins — matching how the Watchlist
 * page already picks a candidate — and the loser is recorded as a contested
 * direction warning rather than dropped silently.
 */
export function buildScreenerRows(candidates: CandidateScore[], tickers: SymbolTicker[]): ScreenerRow[] {
  const tickerBySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));

  const bySymbol = new Map<string, CandidateScore[]>();
  for (const candidate of candidates) {
    if (!candidate?.symbol || !Number.isFinite(candidate.score)) continue;
    const list = bySymbol.get(candidate.symbol);
    if (list) list.push(candidate);
    else bySymbol.set(candidate.symbol, [candidate]);
  }

  const rows = [...bySymbol.entries()].map(([symbol, group]) => {
    const ordered = [...group].sort((left, right) => right.score - left.score || left.direction.localeCompare(right.direction));
    const contested = new Set(group.map((item) => item.direction)).size > 1;
    return rowFor(ordered[0], tickerBySymbol.get(symbol), contested);
  });

  return rows
    .sort((left, right) => right.score - left.score || left.symbol.localeCompare(right.symbol))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function applyScreenerFilters(
  rows: ScreenerRow[],
  filters: ScreenerFilters,
  favoriteSymbols: ReadonlySet<string> = new Set(),
): ScreenerRow[] {
  const query = filters.query.trim().toUpperCase();
  return rows.filter((row) => {
    if (query && !row.symbol.toUpperCase().includes(query) && !row.baseAsset.toUpperCase().includes(query)) return false;
    if (filters.direction !== 'ALL' && row.direction !== filters.direction) return false;
    if (filters.tier !== 'ALL' && row.readinessTier !== filters.tier) return false;
    if (Number.isFinite(filters.minScore) && row.score < filters.minScore) return false;
    // A row whose turnover never arrived cannot be proven to clear the floor, so
    // a raised floor excludes it rather than quietly admitting it.
    if (filters.minTurnoverUsd > 0 && !(Number.isFinite(row.turnover24h) && row.turnover24h >= filters.minTurnoverUsd)) return false;
    if (filters.performance === 'GAINERS' && !(Number.isFinite(row.priceChange24hPct) && row.priceChange24hPct > 0)) return false;
    if (filters.performance === 'LOSERS' && !(Number.isFinite(row.priceChange24hPct) && row.priceChange24hPct < 0)) return false;
    if (filters.performance === 'MOVERS' && !(Number.isFinite(row.priceChange24hPct) && Math.abs(row.priceChange24hPct) >= 3)) return false;
    if (filters.guard === 'PASS' && !row.guardPass) return false;
    if (filters.guard === 'FLAGGED' && row.guardPass) return false;
    if (filters.confluence === 'ALIGNED' && !(row.timeframeConfluenceState === 'ALIGNED' || (row.timeframeConfluenceState == null && row.timeframeConfluence))) return false;
    if (filters.confluence === 'CONFLICTING' && row.timeframeConfluenceState !== 'CONFLICTING') return false;
    if (filters.funding === 'AVAILABLE' && row.fundingRate.state !== 'AVAILABLE') return false;
    if (filters.funding === 'POSITIVE' && !(row.fundingRate.state === 'AVAILABLE' && Number(row.fundingRate.value) > 0)) return false;
    if (filters.funding === 'NEGATIVE' && !(row.fundingRate.state === 'AVAILABLE' && Number(row.fundingRate.value) < 0)) return false;
    if (filters.dataQuality === 'LIVE' && row.dataState !== 'live') return false;
    if (filters.dataQuality === 'PARTIAL' && row.dataState === 'live' && !row.warnings.length) return false;
    const momentum = row.factors.find((factor) => factor.id === 'momentum')?.metric;
    if (filters.minMomentum > 0 && !(momentum?.state === 'AVAILABLE' && Number(momentum.value) >= filters.minMomentum)) return false;
    if (filters.minCoveragePct > 0 && !(row.scoreCoveragePct != null && row.scoreCoveragePct >= filters.minCoveragePct)) return false;
    if (filters.favoritesOnly && !favoriteSymbols.has(row.symbol)) return false;
    return true;
  });
}

const TIER_ORDER: Record<ScreenerRow['readinessTier'], number> = {
  CONFIRMED: 0,
  WATCHLIST: 1,
  CAUTION: 2,
  BLOCKED: 3,
};

export function sortScreenerRows(rows: ScreenerRow[], sort: ScreenerSort): ScreenerRow[] {
  const metricValue = (row: ScreenerRow, id: ScreenerFactorId): number | null => {
    const metric = row.factors.find((factor) => factor.id === id)?.metric;
    return metric?.state === 'AVAILABLE' && metric.value != null ? metric.value : null;
  };
  const optionalCompare = (left: number | null, right: number | null): number => {
    // Missing readings remain at the bottom in both directions. They are not zero.
    if (left == null && right == null) return 0;
    if (left == null) return sort.ascending ? 1 : -1;
    if (right == null) return sort.ascending ? -1 : 1;
    return left - right;
  };
  const compare = (left: ScreenerRow, right: ScreenerRow): number => {
    switch (sort.key) {
      case 'symbol': return left.symbol.localeCompare(right.symbol);
      case 'direction': return left.direction.localeCompare(right.direction);
      case 'score': return left.score - right.score;
      case 'tier': return TIER_ORDER[left.readinessTier] - TIER_ORDER[right.readinessTier];
      case 'change': return left.priceChange24hPct - right.priceChange24hPct;
      case 'turnover': return left.turnover24h - right.turnover24h;
      case 'momentum': return optionalCompare(metricValue(left, 'momentum'), metricValue(right, 'momentum'));
      case 'structure': return optionalCompare(metricValue(left, 'structure'), metricValue(right, 'structure'));
      case 'funding': return optionalCompare(left.fundingRate.value, right.fundingRate.value);
      case 'openInterest': return optionalCompare(left.openInterest.value, right.openInterest.value);
      case 'coverage': return optionalCompare(left.scoreCoveragePct, right.scoreCoveragePct);
      case 'range': return optionalCompare(left.range24hPct.value, right.range24hPct.value);
      case 'warnings': return left.warnings.length - right.warnings.length;
      default: return left.rank - right.rank;
    }
  };
  // Rank is the tie-breaker for every column, so the order is total and stable
  // regardless of the engine's sort implementation.
  return [...rows].sort((left, right) => {
    const primary = compare(left, right);
    const directed = sort.ascending ? primary : -primary;
    return directed || left.rank - right.rank;
  });
}

export function screenerSummary(rows: ScreenerRow[], visible: ScreenerRow[]): ScreenerSummary {
  return {
    scanned: rows.length,
    opportunities: rows.filter((row) => row.guardPass && (row.readinessTier === 'CONFIRMED' || row.readinessTier === 'WATCHLIST')).length,
    matched: visible.length,
    flagged: rows.filter((row) => row.warnings.length > 0).length,
    partial: rows.filter((row) => row.factors.some((factor) => factor.metric.state === 'UNAVAILABLE')).length,
  };
}

export function resetScreenerFilters(): ScreenerFilters {
  return { ...DEFAULT_SCREENER_FILTERS };
}

export function screenerFiltersActive(filters: ScreenerFilters): boolean {
  return filters.query.trim() !== ''
    || filters.direction !== DEFAULT_SCREENER_FILTERS.direction
    || filters.tier !== DEFAULT_SCREENER_FILTERS.tier
    || filters.minScore !== DEFAULT_SCREENER_FILTERS.minScore
    || filters.minTurnoverUsd !== DEFAULT_SCREENER_FILTERS.minTurnoverUsd
    || filters.performance !== DEFAULT_SCREENER_FILTERS.performance
    || filters.guard !== DEFAULT_SCREENER_FILTERS.guard
    || filters.confluence !== DEFAULT_SCREENER_FILTERS.confluence
    || filters.funding !== DEFAULT_SCREENER_FILTERS.funding
    || filters.dataQuality !== DEFAULT_SCREENER_FILTERS.dataQuality
    || filters.minMomentum !== DEFAULT_SCREENER_FILTERS.minMomentum
    || filters.minCoveragePct !== DEFAULT_SCREENER_FILTERS.minCoveragePct
    || filters.favoritesOnly !== DEFAULT_SCREENER_FILTERS.favoritesOnly;
}
