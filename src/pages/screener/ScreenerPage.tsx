import React, { useEffect, useMemo, useState } from 'react';
import './ScreenerPage.css';
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Copy,
  RefreshCw,
  ScanSearch,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  TrendingUp,
  X,
} from 'lucide-react';
import { CoinIcon } from '../../components/CoinIcon';
import {
  DataState,
  Donut,
  KeyValueList,
  PageHeading,
  Panel,
  PanelHeader,
  StatusBadge,
  WorkspacePageFrame,
} from '../../components/ui/WorkspacePrimitives';
import { formatCompactNumber, formatPercent, formatPrice } from '../../lib/marketPresentation';
import { WATCHLIST_CHANGE_EVENT, readWatchlistFavorites, toggleWatchlistFavorite } from '../../lib/watchlistFavorites';
import { notifyWorkspace } from '../../lib/workspaceFeedback';
import type { MarketWorkspaceProps } from '../pageTypes';
import type { DataState as MarketDataState, ReadinessTier, TradeDirection } from '../../types';
import {
  applyScreenerFilters,
  buildScreenerRows,
  resetScreenerFilters,
  screenerFiltersActive,
  screenerSummary,
  sortScreenerRows,
} from './screenerModel';
import {
  DEFAULT_SCREENER_FILTERS,
  DEFAULT_SCREENER_SORT,
  type ScreenerFilters,
  type ScreenerMetric,
  type ScreenerRow,
  type ScreenerSort,
  type ScreenerSortKey,
} from './screenerTypes';

type ScreenerPageProps = MarketWorkspaceProps & { onOpenTrading: (symbol?: string) => void };

/**
 * Plain-language labels over the existing domain enums.
 *
 * `ReadinessTier` is the scanner's vocabulary and stays that way in the data. Only
 * the label is translated, so filter state and payloads never diverge from what
 * the user reads.
 */
const TIER_LABELS: Record<ReadinessTier, string> = {
  CONFIRMED: 'Opportunity',
  WATCHLIST: 'Watch',
  CAUTION: 'Risk',
  BLOCKED: 'Avoid',
};

const TIER_TONES: Record<ReadinessTier, 'positive' | 'info' | 'warning' | 'negative'> = {
  CONFIRMED: 'positive',
  WATCHLIST: 'info',
  CAUTION: 'warning',
  BLOCKED: 'negative',
};

/**
 * `DataState` is not a subset of the `UiDataState` that `StatusBadge` maps
 * internally — 'degraded' and 'not_configured' are absent from it — so the tone is
 * chosen here rather than passing `state=` and silently landing on undefined.
 */
const MARKET_STATE_TONES: Record<MarketDataState, 'positive' | 'warning' | 'negative'> = {
  live: 'positive',
  degraded: 'warning',
  not_configured: 'warning',
  unavailable: 'negative',
};

const MARKET_STATE_LABELS: Record<MarketDataState, string> = {
  live: 'Live market data',
  degraded: 'Degraded market data',
  not_configured: 'Provider not configured',
  unavailable: 'Market data unavailable',
};

/** Compact presets beat a free-text box for a liquidity floor most users only coarsely tune. */
const TURNOVER_STEPS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Any liquidity' },
  { value: 1_000_000, label: 'Over $1M / 24h' },
  { value: 10_000_000, label: 'Over $10M / 24h' },
  { value: 50_000_000, label: 'Over $50M / 24h' },
  { value: 250_000_000, label: 'Over $250M / 24h' },
];

const COLUMNS: Array<{ key: ScreenerSortKey; label: string; numeric?: boolean }> = [
  { key: 'rank', label: '#', numeric: true },
  { key: 'symbol', label: 'Symbol' },
  { key: 'direction', label: 'Bias' },
  { key: 'score', label: 'Score', numeric: true },
  { key: 'tier', label: 'Signal' },
  { key: 'change', label: '24h', numeric: true },
  { key: 'turnover', label: '24h volume', numeric: true },
];

const directionTone = (direction: TradeDirection) => direction === 'LONG' ? 'positive' : 'negative';
const changeTone = (value: number) => !Number.isFinite(value) ? 'neutral' : value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
const usdCompact = (value: number | null) => value == null || !Number.isFinite(value) ? '—' : `$${formatCompactNumber(value)}`;

/** Renders a metric or says plainly that it is missing. Never prints a stand-in number. */
function MetricValue({ metric, render }: { metric: ScreenerMetric; render: (value: number) => string }) {
  if (metric.state === 'UNAVAILABLE' || metric.value == null) {
    return <span className="apex-screener-unavailable" title={metric.note ?? undefined}>Unavailable</span>;
  }
  return <>{render(metric.value)}</>;
}

function relativeAge(observedAtMs: number | null, nowMs: number): string | null {
  if (observedAtMs == null) return null;
  const ageMs = nowMs - observedAtMs;
  if (!Number.isFinite(ageMs) || ageMs < 0) return null;
  if (ageMs < 60_000) return `${Math.max(1, Math.round(ageMs / 1000))}s ago`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m ago`;
  return `${Math.round(ageMs / 3_600_000)}h ago`;
}

/** Above this the market snapshot is old enough that the user should be told. */
const STALE_AFTER_MS = 180_000;

function FactorBreakdown({ row }: { row: ScreenerRow }) {
  return (
    <ul className="apex-screener-factors">
      {row.factors.map((factor) => {
        const value = factor.metric.state === 'AVAILABLE' ? factor.metric.value : null;
        return (
          <li key={factor.id}>
            <span className="apex-screener-factor-label">{factor.label}</span>
            <span className="apex-screener-factor-meter" aria-hidden="true">
              {value == null ? <i className="empty" /> : <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />}
            </span>
            <span className="apex-screener-factor-value">
              {value == null
                ? <span className="apex-screener-unavailable" title={factor.metric.note ?? undefined}>n/a</span>
                : Math.round(value)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ScreenerPage(props: ScreenerPageProps) {
  const [filters, setFilters] = useState<ScreenerFilters>(() => ({ ...DEFAULT_SCREENER_FILTERS }));
  const [sort, setSort] = useState<ScreenerSort>(() => ({ ...DEFAULT_SCREENER_SORT }));
  const [favorites, setFavorites] = useState<Set<string>>(() => readWatchlistFavorites());

  useEffect(() => {
    const sync = () => setFavorites(readWatchlistFavorites());
    window.addEventListener(WATCHLIST_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(WATCHLIST_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const rows = useMemo(
    () => buildScreenerRows([...props.longCandidates, ...props.shortCandidates], props.tickers),
    [props.longCandidates, props.shortCandidates, props.tickers],
  );
  const visible = useMemo(() => sortScreenerRows(applyScreenerFilters(rows, filters), sort), [filters, rows, sort]);
  const summary = useMemo(() => screenerSummary(rows, visible), [rows, visible]);
  const filtersActive = screenerFiltersActive(filters);

  const selected = visible.find((row) => row.symbol === props.selectedSymbol)
    || rows.find((row) => row.symbol === props.selectedSymbol)
    || visible[0]
    || null;

  // The freshest input timestamp any row reported: a real observation time from the
  // market snapshot, not a render clock dressed up as one.
  const observedAtMs = rows.reduce<number | null>(
    (latest, row) => row.observedAtMs != null && (latest == null || row.observedAtMs > latest) ? row.observedAtMs : latest,
    null,
  );
  const nowMs = Date.now();
  const age = relativeAge(observedAtMs, nowMs);
  const stale = observedAtMs != null && nowMs - observedAtMs > STALE_AFTER_MS;

  const toggleSort = (key: ScreenerSortKey) => {
    setSort((current) => current.key === key
      ? { key, ascending: !current.ascending }
      // Identity columns read naturally ascending; measures read best highest-first.
      : { key, ascending: key === 'rank' || key === 'symbol' || key === 'direction' || key === 'tier' });
  };

  const toggleFavorite = (symbol: string) => {
    const existed = favorites.has(symbol);
    setFavorites(toggleWatchlistFavorite(favorites, symbol));
    notifyWorkspace({ title: existed ? 'Removed from watchlist' : 'Added to watchlist', detail: symbol, tone: 'success' });
  };

  const copySymbol = (symbol: string) => {
    // Clipboard access can be denied. The failure is reported, not swallowed.
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      notifyWorkspace({ title: 'Clipboard unavailable', detail: 'This browser did not expose clipboard access.', tone: 'error' });
      return;
    }
    void navigator.clipboard.writeText(symbol)
      .then(() => notifyWorkspace({ title: 'Symbol copied', detail: symbol, tone: 'success' }))
      .catch(() => notifyWorkspace({ title: 'Copy failed', detail: `${symbol} could not be copied to the clipboard.`, tone: 'error' }));
  };

  const openInTrading = (symbol: string) => {
    props.onSelectSymbol(symbol);
    props.onOpenTrading(symbol);
    notifyWorkspace({
      title: `${symbol} opened in Trading`,
      detail: 'The screener is informational; review the plan and risk before any order.',
      tone: 'info',
    });
  };

  const resultsBody = props.loading && !rows.length
    ? <DataState availability="loading" title="Scanning markets" detail="Ranked results appear as soon as the scanner returns its candidate set." />
    : !rows.length
      ? <DataState
        availability={props.dataState === 'unavailable' ? 'error' : 'empty'}
        title={props.dataState === 'unavailable' ? 'Market scan unavailable' : 'No scanner results yet'}
        detail={props.dataState === 'unavailable'
          ? 'The scanner did not return a candidate set. Retry, or check provider status in Settings.'
          : 'The scanner has not published any candidates for the current universe and liquidity floor.'}
        onRetry={props.onRefresh}
      />
      : !visible.length
        ? <div className="apex-screener-empty">
          <ScanSearch size={24} />
          <strong>No symbols match these filters</strong>
          <span>{summary.scanned} symbol{summary.scanned === 1 ? '' : 's'} were scanned, but none satisfy every active filter. Widen the score or liquidity floor, or clear the filters.</span>
          <button type="button" className="apex-v3-button primary" onClick={() => setFilters(resetScreenerFilters())}>Reset filters</button>
        </div>
        : <div className="apex-v3-table-scroll apex-screener-table-scroll">
          <table className="apex-v3-table apex-screener-table">
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={column.numeric ? 'number' : ''}
                    aria-sort={sort.key === column.key ? (sort.ascending ? 'ascending' : 'descending') : 'none'}
                  >
                    <button type="button" onClick={() => toggleSort(column.key)}>
                      {column.label}
                      {sort.key === column.key
                        ? (sort.ascending ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
                        : <ArrowUpDown size={12} className="idle" />}
                    </button>
                  </th>
                ))}
                <th>Guard</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.symbol}
                  className={row.symbol === selected?.symbol ? 'selected' : ''}
                  tabIndex={0}
                  onClick={() => props.onSelectSymbol(row.symbol)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      props.onSelectSymbol(row.symbol);
                    }
                  }}
                >
                  <td className="number" data-label="Rank">{row.rank}</td>
                  <td data-label="Symbol">
                    <span className="apex-screener-symbol">
                      <CoinIcon symbol={row.symbol} size={22} />
                      <span><strong>{row.baseAsset}</strong><small>{row.symbol}</small></span>
                    </span>
                  </td>
                  <td data-label="Bias">
                    <StatusBadge tone={directionTone(row.direction)}>{row.direction === 'LONG' ? 'Long' : 'Short'}</StatusBadge>
                  </td>
                  <td className="number apex-screener-score-cell" data-label="Score">
                    <strong>{Math.round(row.score)}</strong>
                    <span className="apex-screener-score-track" aria-hidden="true">
                      <i style={{ width: `${Math.max(0, Math.min(100, row.score))}%` }} />
                    </span>
                  </td>
                  <td data-label="Signal">
                    <StatusBadge tone={TIER_TONES[row.readinessTier]} detail={`Scanner readiness: ${row.readinessTier}`}>
                      {TIER_LABELS[row.readinessTier]}
                    </StatusBadge>
                  </td>
                  <td className={`number ${changeTone(row.priceChange24hPct)}`} data-label="24h change">
                    {formatPercent(row.priceChange24hPct)}
                  </td>
                  <td className="number" data-label="24h volume">
                    {usdCompact(Number.isFinite(row.turnover24h) ? row.turnover24h : null)}
                  </td>
                  <td data-label="Guard">
                    {row.guardPass
                      ? <span className="apex-screener-guard pass"><ShieldCheck size={13} /> Pass</span>
                      : <span className="apex-screener-guard fail" title={row.warnings[0]}><AlertTriangle size={13} /> {row.warnings.length} flag{row.warnings.length === 1 ? '' : 's'}</span>}
                  </td>
                  <td className="apex-screener-row-actions" data-label="Actions">
                    <button
                      type="button"
                      className={`apex-v3-icon-button ${favorites.has(row.symbol) ? 'active' : ''}`}
                      aria-label={`${favorites.has(row.symbol) ? 'Remove' : 'Add'} ${row.symbol} ${favorites.has(row.symbol) ? 'from' : 'to'} watchlist`}
                      onClick={(event) => { event.stopPropagation(); toggleFavorite(row.symbol); }}
                    >
                      <Star size={13} fill={favorites.has(row.symbol) ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      className="apex-v3-button secondary"
                      onClick={(event) => { event.stopPropagation(); openInTrading(row.symbol); }}
                    >Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>;

  const main = <div className="apex-screener-main">
    <PageHeading
      eyebrow="Monitor"
      title="Market Screener"
      subtitle="Symbols worth attention right now, ranked by the scanner's own score with the reasoning behind each rank."
      actions={<button type="button" className="apex-v3-button secondary" onClick={props.onRefresh} disabled={props.loading}>
        <RefreshCw size={14} className={props.loading ? 'spin' : ''} /> Refresh
      </button>}
    />

    <div className="apex-screener-chips" aria-label="Scan status">
      <span><b>{summary.scanned}</b> scanned</span>
      <span><b>{summary.opportunities}</b> opportunities</span>
      <span><b>{summary.matched}</b> shown</span>
      <span>{age ? <>Updated <b>{age}</b></> : <>Update time <b>unknown</b></>}</span>
      <StatusBadge tone={MARKET_STATE_TONES[props.dataState]}>{MARKET_STATE_LABELS[props.dataState]}</StatusBadge>
    </div>

    {stale && <p className="apex-screener-stale" role="status">
      <AlertTriangle size={14} /> The newest market observation is {age} old. Refresh before acting on these ranks.
    </p>}

    <section className="apex-screener-filters" aria-label="Screener filters">
      <div className="apex-screener-filter-lead"><SlidersHorizontal size={14} /> Filters</div>

      <div className="apex-v3-search-with-clear">
        <label className="apex-v3-search-field">
          <Search size={15} />
          <input
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            placeholder="Search symbol or asset..."
            aria-label="Search by symbol or asset"
          />
        </label>
        {filters.query && <button
          type="button"
          className="apex-v3-icon-button"
          aria-label="Clear screener search"
          onClick={() => setFilters((current) => ({ ...current, query: '' }))}
        ><X size={13} /></button>}
      </div>

      <label className="apex-screener-field">
        <span>Bias</span>
        <select
          value={filters.direction}
          onChange={(event) => setFilters((current) => ({ ...current, direction: event.target.value as ScreenerFilters['direction'] }))}
        >
          <option value="ALL">All</option>
          <option value="LONG">Long bias</option>
          <option value="SHORT">Short bias</option>
        </select>
      </label>

      <label className="apex-screener-field">
        <span>Signal</span>
        <select
          value={filters.tier}
          onChange={(event) => setFilters((current) => ({ ...current, tier: event.target.value as ScreenerFilters['tier'] }))}
        >
          <option value="ALL">All</option>
          <option value="CONFIRMED">Opportunity</option>
          <option value="WATCHLIST">Watch</option>
          <option value="CAUTION">Risk</option>
          <option value="BLOCKED">Avoid</option>
        </select>
      </label>

      <label className="apex-screener-field apex-screener-score-filter">
        <span>Min score <b>{filters.minScore}</b></span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={filters.minScore}
          onChange={(event) => setFilters((current) => ({ ...current, minScore: Number(event.target.value) }))}
        />
      </label>

      <label className="apex-screener-field">
        <span>Liquidity</span>
        <select
          value={String(filters.minTurnoverUsd)}
          onChange={(event) => setFilters((current) => ({ ...current, minTurnoverUsd: Number(event.target.value) }))}
        >
          {TURNOVER_STEPS.map((step) => <option key={step.value} value={step.value}>{step.label}</option>)}
        </select>
      </label>

      <button
        type="button"
        className="apex-v3-button secondary apex-screener-reset"
        onClick={() => setFilters(resetScreenerFilters())}
        disabled={!filtersActive}
      >Reset filters</button>
    </section>

    <Panel className="apex-v3-table-panel apex-screener-results">
      <PanelHeader
        title="Ranked results"
        subtitle={`${summary.matched} of ${summary.scanned} symbols · ${summary.partial} with partial data`}
      />
      {resultsBody}
    </Panel>
  </div>;

  const context = <div className="apex-screener-context">
    <Panel className="apex-screener-detail">
      <PanelHeader
        title={selected ? `${selected.baseAsset} detail` : 'Symbol detail'}
        subtitle={selected ? `Rank ${selected.rank} of ${summary.scanned}` : 'Nothing selected'}
        action={selected ? <button
          type="button"
          className={`apex-v3-icon-button ${favorites.has(selected.symbol) ? 'active' : ''}`}
          aria-label={`${favorites.has(selected.symbol) ? 'Remove' : 'Add'} ${selected.symbol} ${favorites.has(selected.symbol) ? 'from' : 'to'} watchlist`}
          onClick={() => toggleFavorite(selected.symbol)}
        ><Star size={15} fill={favorites.has(selected.symbol) ? 'currentColor' : 'none'} /></button> : undefined}
      />
      {selected ? <>
        <div className="apex-screener-identity">
          <CoinIcon symbol={selected.symbol} size={32} />
          <div><strong>{selected.baseAsset}</strong><span>{selected.symbol}</span></div>
          <div className="apex-screener-identity-badges">
            <StatusBadge tone={directionTone(selected.direction)}>{selected.direction === 'LONG' ? 'Long bias' : 'Short bias'}</StatusBadge>
            <StatusBadge tone={TIER_TONES[selected.readinessTier]} detail={`Scanner readiness: ${selected.readinessTier}`}>
              {TIER_LABELS[selected.readinessTier]}
            </StatusBadge>
          </div>
        </div>

        <Donut
          value={Number.isFinite(selected.score) ? selected.score : null}
          label="Scanner score"
          detail={selected.scoreCoveragePct == null
            ? 'Evidence coverage not reported'
            : `${Math.round(selected.scoreCoveragePct)}% of scoring weight evidence-backed`}
          tone={TIER_TONES[selected.readinessTier]}
        />

        <div className="apex-screener-block">
          <h3>Score breakdown</h3>
          <FactorBreakdown row={selected} />
          <p className="apex-screener-note">Sub-scores are published by the scanner. The screener ranks on its score rather than re-deriving one.</p>
        </div>

        <div className="apex-screener-block">
          <h3>Why it ranked here</h3>
          <ul className="apex-screener-reasons">
            {selected.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </div>

        <div className="apex-screener-block">
          <h3>Risk warnings</h3>
          {selected.warnings.length
            ? <ul className="apex-screener-warnings">
              {selected.warnings.map((warning) => <li key={warning}><AlertTriangle size={13} /> {warning}</li>)}
            </ul>
            : <p className="apex-screener-note">No warnings were raised for this symbol.</p>}
        </div>

        <div className="apex-screener-block">
          <h3>Market stats</h3>
          <KeyValueList rows={[
            { label: 'Price', value: Number.isFinite(selected.lastPrice) ? formatPrice(selected.lastPrice) : <span className="apex-screener-unavailable">Unavailable</span> },
            { label: '24h change', value: formatPercent(selected.priceChange24hPct), tone: changeTone(selected.priceChange24hPct) },
            { label: '24h volume', value: usdCompact(Number.isFinite(selected.turnover24h) ? selected.turnover24h : null) },
            { label: 'Open interest', value: <MetricValue metric={selected.openInterest} render={(value) => `$${formatCompactNumber(value)}`} /> },
            { label: 'Funding rate', value: <MetricValue metric={selected.fundingRate} render={(value) => `${(value * 100).toFixed(4)}%`} /> },
            { label: 'Spread / depth', value: <MetricValue metric={selected.spreadDepth} render={(value) => String(value)} /> },
            { label: 'Timeframes', value: selected.timeframeConfluenceState ?? (selected.timeframeConfluence ? 'ALIGNED' : 'NOT ALIGNED') },
          ]} />
        </div>

        <div className="apex-screener-actions">
          <button type="button" className="apex-v3-button primary full" onClick={() => openInTrading(selected.symbol)}>
            <TrendingUp size={15} /> Open {selected.baseAsset} in Trading
          </button>
          <button type="button" className="apex-v3-button secondary full" onClick={() => copySymbol(selected.symbol)}>
            <Copy size={15} /> Copy symbol
          </button>
          <p className="apex-screener-note">The screener never places, arms, or modifies an order. Opening Trading only changes the selected symbol.</p>
        </div>
      </> : <DataState
        availability="empty"
        title="No symbol selected"
        detail="Choose a row to see its score breakdown, the reasons behind its rank, and its risk warnings."
      />}
    </Panel>
  </div>;

  return <WorkspacePageFrame className="apex-screener-page" main={main} context={context} />;
}
