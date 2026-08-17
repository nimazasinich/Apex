import React, { useEffect, useId, useMemo, useState } from 'react';
import './MarketsPage.css';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Gauge,
  LayoutGrid,
  List,
  MoreHorizontal,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  TrendingUp,
} from 'lucide-react';
import type { CandidateScore, DataState, SentimentComposite, SymbolTicker } from '../../types';
import { formatCompactNumber, formatPercent, formatPrice } from '../../lib/marketPresentation';
import {
  WATCHLIST_CHANGE_EVENT,
  readWatchlistFavorites,
  toggleWatchlistFavorite,
} from '../../lib/watchlistFavorites';
import { CoinIcon } from '../CoinIcon';
import { MiniSparkline } from '../MiniSparkline';

interface MarketsPageProps {
  tickers: SymbolTicker[];
  sentiment: SentimentComposite | null;
  longCandidates: CandidateScore[];
  shortCandidates: CandidateScore[];
  dataState: DataState;
  loading: boolean;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onRefresh: () => void;
  onOpenTrading?: (symbol?: string) => void;
  onOpenWatchlist?: () => void;
}

const signed = (value: number | null | undefined) => (value == null || value === 0 ? '' : value > 0 ? 'positive' : 'negative');

type SentimentBucket = 'bearish' | 'neutral' | 'bullish';

function classifyMove(pct: number): SentimentBucket {
  if (pct <= -0.5) return 'bearish';
  if (pct >= 0.5) return 'bullish';
  return 'neutral';
}

function useBreadth(tickers: SymbolTicker[]) {
  return useMemo(() => {
    const total = tickers.length;
    let bearish = 0;
    let neutral = 0;
    let bullish = 0;
    for (const ticker of tickers) {
      const bucket = classifyMove(ticker.priceChange24hPct);
      if (bucket === 'bearish') bearish += 1;
      else if (bucket === 'bullish') bullish += 1;
      else neutral += 1;
    }
    const pct = (count: number) => (total ? Math.round((count / total) * 100) : 0);
    return {
      total,
      bearish,
      neutral,
      bullish,
      bearishPct: pct(bearish),
      neutralPct: pct(neutral),
      bullishPct: pct(bullish),
    };
  }, [tickers]);
}

/* ---------------------------------- Header --------------------------------- */

function MarketsHeader({ loading, onRefresh, customizeOpen, onToggleCustomize }: { loading?: boolean; onRefresh?: () => void; customizeOpen: boolean; onToggleCustomize: () => void }) {
  return (
    <div className="apex-mkt2-header">
      <div>
        <span className="apex-eyebrow">Real-time discovery</span>
        <h1>Market Overview</h1>
        <p>Real-time snapshot of the global crypto &amp; derivatives markets</p>
      </div>
      <div className="apex-mkt2-header-actions">
        <button type="button" className="apex-secondary-button" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
        <button type="button" className={`apex-mkt2-customize-btn ${customizeOpen ? 'active' : ''}`} aria-expanded={customizeOpen} onClick={onToggleCustomize}>
          <SlidersHorizontal size={14} /> Customize
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------- Metrics --------------------------------- */
/* Compact horizontal stat ribbon — replaces the six oversized metric cards so
   the market discovery table below can dominate the viewport. Same underlying
   data, packed into one dense ~52px row with decision-relevant readouts. */

function RangeStat({ low, high, last }: { low: number; high: number; last: number }) {
  const span = Math.max(high - low, 0.000001);
  const position = Math.max(0, Math.min(100, ((last - low) / span) * 100));
  return (
    <div className="apex-mkt2-stat-range">
      <div className="apex-mkt2-stat-range-values"><span>{formatPrice(low)}</span><span>{formatPrice(high)}</span></div>
      <div className="apex-mkt2-stat-range-track"><span className="apex-mkt2-stat-range-dot" style={{ left: `${position}%` }} /></div>
    </div>
  );
}

function MarketsStatBar({ selected, breadth }: { selected: SymbolTicker | undefined; breadth: ReturnType<typeof useBreadth> }) {
  const spark = selected?.sparkline1h;
  const changeTone = signed(selected?.priceChange24hPct);
  const fundingTone = signed(selected?.fundingRate);
  return (
    <div className="apex-mkt2-statbar" role="group" aria-label="Selected market summary">
      <div className="apex-mkt2-stat apex-mkt2-stat-anchor">
        <span className="apex-mkt2-stat-icon accent-amber"><CircleDollarSign size={15} /></span>
        <div className="apex-mkt2-stat-body">
          <span className="apex-mkt2-stat-label">{selected?.symbol ?? 'Price'}</span>
          <span className="apex-mkt2-stat-value">
            {selected ? formatPrice(selected.lastPrice) : '—'}
            {selected && <em className={`apex-mkt2-stat-delta ${changeTone}`}>{formatPercent(selected.priceChange24hPct)}</em>}
          </span>
        </div>
        {spark && spark.length > 1 && (
          <div className="apex-mkt2-stat-spark"><MiniSparkline values={spark} tone={changeTone === 'positive' ? 'positive' : changeTone === 'negative' ? 'negative' : 'neutral'} /></div>
        )}
      </div>

      <div className="apex-mkt2-stat">
        <span className="apex-mkt2-stat-icon accent-blue"><Activity size={14} /></span>
        <div className="apex-mkt2-stat-body">
          <span className="apex-mkt2-stat-label">24h Volume</span>
          <span className="apex-mkt2-stat-value">{formatCompactNumber(selected?.turnover24h, 'USDT')}</span>
        </div>
      </div>

      <div className="apex-mkt2-stat">
        <span className="apex-mkt2-stat-icon accent-green"><Gauge size={14} /></span>
        <div className="apex-mkt2-stat-body">
          <span className="apex-mkt2-stat-label">Funding 8h</span>
          <span className={`apex-mkt2-stat-value ${fundingTone}`}>{selected ? `${(selected.fundingRate * 100).toFixed(4)}%` : '—'}</span>
        </div>
      </div>

      <div className="apex-mkt2-stat">
        <span className="apex-mkt2-stat-icon accent-violet"><TrendingUp size={14} /></span>
        <div className="apex-mkt2-stat-body">
          <span className="apex-mkt2-stat-label">Open Interest</span>
          <span className="apex-mkt2-stat-value">{formatCompactNumber(selected?.openInterest, 'USDT')}</span>
        </div>
      </div>

      <div className="apex-mkt2-stat apex-mkt2-stat-wide">
        <span className="apex-mkt2-stat-icon accent-rose"><ArrowUpRight size={14} /></span>
        <div className="apex-mkt2-stat-body">
          <span className="apex-mkt2-stat-label">24h Range</span>
          {selected ? <RangeStat low={selected.low24h} high={selected.high24h} last={selected.lastPrice} /> : <span className="apex-mkt2-stat-value">—</span>}
        </div>
      </div>

      <div className="apex-mkt2-stat apex-mkt2-stat-breadth">
        <span className="apex-mkt2-stat-icon accent-blue"><BarChart3 size={14} /></span>
        <div className="apex-mkt2-stat-body">
          <span className="apex-mkt2-stat-label">Breadth · {breadth.total}</span>
          <span className="apex-mkt2-stat-value apex-mkt2-breadth-inline">
            <em className="positive">▲ {breadth.bullish}</em>
            <em className="muted">● {breadth.neutral}</em>
            <em className="negative">▼ {breadth.bearish}</em>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Table + filters ------------------------------ */

type TabFilter = 'all' | 'favorites' | 'gainers' | 'losers' | 'new';
type ContractFilter = 'all' | 'spot' | 'perpetual' | 'futures';
type MarketViewMode = 'table' | 'grid';
type OptionalColumn = 'funding' | 'openInterest' | 'range' | 'status';

const TABS: Array<{ id: TabFilter; label: string }> = [
  { id: 'all', label: 'All Markets' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'gainers', label: 'Top Gainers' },
  { id: 'losers', label: 'Top Losers' },
  { id: 'new', label: 'New Listings' },
];

const CONTRACT_FILTERS: Array<{ id: ContractFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'spot', label: 'Spot' },
  { id: 'perpetual', label: 'Perpetual' },
  { id: 'futures', label: 'Futures' },
];

const PAGE_SIZES = [10, 25, 50];

function RangeBarCell({ low, high, last }: { low: number; high: number; last: number }) {
  const span = Math.max(high - low, 0.000001);
  const position = Math.max(0, Math.min(100, ((last - low) / span) * 100));
  return (
    <div className="apex-mkt2-range-cell">
      <div className="apex-mkt2-range-cell-values">
        <span>{formatPrice(low)}</span>
        <span>{formatPrice(high)}</span>
      </div>
      <div className="apex-mkt2-range-cell-track">
        <span className="apex-mkt2-range-cell-dot" style={{ left: `${position}%` }} />
      </div>
    </div>
  );
}

function MarketsTablePanel({
  tickers,
  selectedSymbol,
  onSelectSymbol,
  favorites,
  onToggleFavorite,
  customizeOpen,
  onOpenTrading,
  onOpenWatchlist,
}: {
  tickers: SymbolTicker[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  favorites: Set<string>;
  onToggleFavorite: (symbol: string) => void;
  customizeOpen: boolean;
  onOpenTrading?: (symbol?: string) => void;
  onOpenWatchlist?: () => void;
}) {
  const [tab, setTab] = useState<TabFilter>('all');
  const [contractFilter, setContractFilter] = useState<ContractFilter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [viewMode, setViewMode] = useState<MarketViewMode>('table');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rowMenuSymbol, setRowMenuSymbol] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<OptionalColumn>>(() => new Set(['funding', 'openInterest', 'range', 'status']));

  const filtered = useMemo(() => {
    // APEX streams KuCoin Futures perpetual contracts only — Spot / Futures
    // tabs are kept for layout parity but honestly report no coverage yet.
    if (contractFilter === 'spot' || contractFilter === 'futures') return [];
    // "New Listings" needs a real listing-date feed we don't have wired up yet.
    if (tab === 'new') return [];

    let list = tickers;
    const normalized = query.trim().toUpperCase();
    if (normalized) list = list.filter((ticker) => ticker.symbol.includes(normalized));
    if (tab === 'favorites') list = list.filter((ticker) => favorites.has(ticker.symbol));
    if (tab === 'gainers') list = list.slice().sort((a, b) => b.priceChange24hPct - a.priceChange24hPct);
    if (tab === 'losers') list = list.slice().sort((a, b) => a.priceChange24hPct - b.priceChange24hPct);
    return list;
  }, [contractFilter, favorites, query, tab, tickers]);

  useEffect(() => { setPage(1); }, [tab, contractFilter, query, pageSize]);

  useEffect(() => {
    if (!rowMenuSymbol) return;
    const close = () => setRowMenuSymbol(null);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [rowMenuSymbol]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = filtered.length ? (safePage - 1) * pageSize : 0;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);

  const pageButtons = useMemo(() => {
    const items: Array<number | 'ellipsis'> = [];
    for (let index = 1; index <= totalPages; index += 1) {
      if (index === 1 || index === totalPages || Math.abs(index - safePage) <= 1) items.push(index);
      else if (items[items.length - 1] !== 'ellipsis') items.push('ellipsis');
    }
    return items;
  }, [safePage, totalPages]);

  return (
    <section className="apex-panel apex-mkt2-table-panel">
      <div className="apex-mkt2-tabs" role="tablist" aria-label="Market list filter">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} disabled={item.id === 'new'} title={item.id === 'new' ? 'Listing-date feed is not connected yet' : undefined} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="apex-mkt2-filter-row">
        <div className="apex-mkt2-segmented" role="tablist" aria-label="Contract type">
          {CONTRACT_FILTERS.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={contractFilter === item.id} className={contractFilter === item.id ? 'active' : ''} disabled={item.id === 'spot' || item.id === 'futures'} title={item.id === 'spot' || item.id === 'futures' ? 'Current provider exposes perpetual contracts only' : undefined} onClick={() => setContractFilter(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" className="apex-mkt2-dropdown-btn" disabled title="Chain metadata is not provided by the derivatives feed">All Chains <ChevronDown size={13} /></button>
        <button type="button" className="apex-mkt2-dropdown-btn" disabled title="Sector metadata is not provided by the derivatives feed">All Sectors <ChevronDown size={13} /></button>
        <div className="apex-mkt2-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search markets, symbols or contracts…" aria-label="Search markets" /></div>
        <div className="apex-mkt2-view-toggle">
          <button type="button" className={viewMode === 'table' ? 'active' : ''} aria-label="Table view" aria-pressed={viewMode === 'table'} onClick={() => setViewMode('table')}><List size={14} /></button>
          <button type="button" className={viewMode === 'grid' ? 'active' : ''} aria-label="Grid view" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')}><LayoutGrid size={14} /></button>
          <button type="button" className={settingsOpen ? 'active' : ''} aria-label="Table settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((value) => !value)}><SlidersHorizontal size={14} /></button>
        </div>
      </div>

      {(customizeOpen || settingsOpen) && (
        <div className="apex-mkt2-customize-panel" role="region" aria-label="Market display settings">
          <div><strong>Display</strong><span>Choose the active layout and optional data columns.</span></div>
          <div className="apex-mkt2-customize-options">
            {(['funding', 'openInterest', 'range', 'status'] as OptionalColumn[]).map((column) => (
              <label key={column}><input type="checkbox" checked={visibleColumns.has(column)} onChange={() => setVisibleColumns((current) => { const next = new Set(current); if (next.has(column)) next.delete(column); else next.add(column); return next; })} />{column === 'openInterest' ? 'Open interest' : column[0].toUpperCase() + column.slice(1)}</label>
            ))}
          </div>
        </div>
      )}

      {viewMode === 'table' ? <div className="apex-table-wrap apex-mkt2-table-scroll">
        <table className="apex-table apex-mkt2-table">
          <thead>
            <tr>
              <th /><th className="apex-mkt2-idx">#</th><th>Pair</th><th className="apex-mkt2-num">Last Price</th><th className="apex-mkt2-num">24h Change</th><th className="apex-mkt2-num">24h Volume</th>{visibleColumns.has('funding') && <th className="apex-mkt2-num">Funding (8h)</th>}{visibleColumns.has('openInterest') && <th className="apex-mkt2-num">Open Interest</th>}{visibleColumns.has('range') && <th>24h Range</th>}{visibleColumns.has('status') && <th className="apex-mkt2-mid">Status</th>}<th />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((ticker, index) => (
              <tr key={ticker.symbol} className={ticker.symbol === selectedSymbol ? 'selected' : ''} tabIndex={0} aria-selected={ticker.symbol === selectedSymbol} onClick={() => onSelectSymbol(ticker.symbol)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectSymbol(ticker.symbol); } }}>
                <td className="apex-mkt2-fav-cell"><button type="button" aria-label={`${favorites.has(ticker.symbol) ? 'Remove' : 'Add'} ${ticker.symbol} ${favorites.has(ticker.symbol) ? 'from' : 'to'} watchlist`} onClick={(event) => { event.stopPropagation(); onToggleFavorite(ticker.symbol); }}><Star size={14} fill={favorites.has(ticker.symbol) ? 'currentColor' : 'none'} className={favorites.has(ticker.symbol) ? 'apex-mkt2-fav-star active' : 'apex-mkt2-fav-star'} /></button></td>
                <td className="apex-mkt2-idx">{pageStart + index + 1}</td>
                <td className="symbol-cell"><CoinIcon symbol={ticker.symbol} size={24} /><span className="apex-mkt2-symbol-col"><strong>{ticker.symbol}</strong><small className="apex-mkt2-contract-pill">Perpetual</small></span></td>
                <td className="apex-number-cell apex-mkt2-num">{formatPrice(ticker.lastPrice)}</td>
                <td className={`${signed(ticker.priceChange24hPct)} apex-mkt2-num`}>{formatPercent(ticker.priceChange24hPct)}</td>
                <td className="apex-mkt2-num">{formatCompactNumber(ticker.turnover24h)}</td>
                {visibleColumns.has('funding') && <td className={`${signed(ticker.fundingRate)} apex-mkt2-num`}>{(ticker.fundingRate * 100).toFixed(4)}%</td>}
                {visibleColumns.has('openInterest') && <td className="apex-mkt2-num">{formatCompactNumber(ticker.openInterest)}</td>}
                {visibleColumns.has('range') && <td><RangeBarCell low={ticker.low24h} high={ticker.high24h} last={ticker.lastPrice} /></td>}
                {visibleColumns.has('status') && <td className="apex-mkt2-mid"><span className={`apex-status-pill ${ticker.dataState === 'live' ? 'success' : ''}`}>{ticker.dataState}</span></td>}
                <td className="apex-mkt2-kebab-cell" onClick={(event) => event.stopPropagation()}><button type="button" aria-label={`More actions for ${ticker.symbol}`} aria-expanded={rowMenuSymbol === ticker.symbol} onClick={() => setRowMenuSymbol((current) => current === ticker.symbol ? null : ticker.symbol)}><MoreHorizontal size={15} /></button>{rowMenuSymbol === ticker.symbol && <div className="apex-mkt2-row-menu" role="menu"><button type="button" role="menuitem" onClick={() => { onSelectSymbol(ticker.symbol); onOpenTrading?.(ticker.symbol); setRowMenuSymbol(null); }}>Open in Trading</button><button type="button" role="menuitem" onClick={() => { onToggleFavorite(ticker.symbol); setRowMenuSymbol(null); }}>{favorites.has(ticker.symbol) ? 'Remove favorite' : 'Add favorite'}</button><button type="button" role="menuitem" onClick={() => { onOpenWatchlist?.(); setRowMenuSymbol(null); }}>Open Watchlist</button></div>}</td>
              </tr>
            ))}
            {!pageRows.length && (
              <tr className="apex-mkt2-empty-row">
                <td colSpan={7 + visibleColumns.size}>
                  {tab === 'new'
                    ? 'New-listing detection isn’t wired to a data feed yet.'
                    : contractFilter === 'spot' || contractFilter === 'futures'
                      ? 'APEX currently streams KuCoin Futures Perpetual contracts only.'
                      : tab === 'favorites'
                        ? 'No favorites yet — use the star to pin a market.'
                        : 'No markets match this filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div> : <div className="apex-mkt2-market-grid">
        {pageRows.map((ticker) => (
          <article key={ticker.symbol} className={ticker.symbol === selectedSymbol ? 'selected' : ''}>
            <button type="button" className="apex-mkt2-grid-main" onClick={() => onSelectSymbol(ticker.symbol)}>
              <CoinIcon symbol={ticker.symbol} size={30} /><span><strong>{ticker.symbol}</strong><small>Perpetual</small></span><em className={signed(ticker.priceChange24hPct)}>{formatPercent(ticker.priceChange24hPct)}</em>
              <b>{formatPrice(ticker.lastPrice)}</b><small>Vol {formatCompactNumber(ticker.turnover24h)} · OI {formatCompactNumber(ticker.openInterest)}</small>
            </button>
            <div><button type="button" onClick={() => onToggleFavorite(ticker.symbol)} aria-label={`${favorites.has(ticker.symbol) ? 'Remove' : 'Add'} favorite`}><Star size={14} fill={favorites.has(ticker.symbol) ? 'currentColor' : 'none'} /></button><button type="button" onClick={() => onOpenTrading?.(ticker.symbol)}>Trade</button></div>
          </article>
        ))}
        {!pageRows.length && <div className="apex-honest-empty">No markets match this filter.</div>}
      </div>}

      <div className="apex-mkt2-pagination">
        <span>{filtered.length ? `Showing ${pageStart + 1} to ${Math.min(pageStart + pageSize, filtered.length)} of ${filtered.length} markets` : 'Showing 0 markets'}</span>
        <div className="apex-mkt2-pagination-pages">
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous page"><ChevronLeft size={14} /></button>
          {pageButtons.map((item, index) => item === 'ellipsis'
            ? <span key={`ellipsis-${index}`} className="apex-mkt2-page-ellipsis">…</span>
            : <button key={item} type="button" className={item === safePage ? 'active' : ''} onClick={() => setPage(item)}>{item}</button>)}
          <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} aria-label="Next page"><ChevronRight size={14} /></button>
        </div>
        <label className="apex-mkt2-page-size">
          <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} aria-label="Rows per page">
            {PAGE_SIZES.map((size) => <option key={size} value={size}>{size} / page</option>)}
          </select>
        </label>
      </div>
    </section>
  );
}

/* --------------------------------- Sidebar --------------------------------- */

function SemiGauge({ value, size = 168 }: { value: number | null; size?: number }) {
  const id = useId().replace(/:/g, '');
  const clamped = value == null ? 50 : Math.max(0, Math.min(100, value));
  const angleDeg = 180 - (clamped / 100) * 180;
  const angleRad = (angleDeg * Math.PI) / 180;
  const needleLength = 60;
  const tipX = 100 + needleLength * Math.cos(angleRad);
  const tipY = 100 - needleLength * Math.sin(angleRad);
  return (
    <svg viewBox="0 0 200 112" width={size} className="apex-mkt2-gauge-svg" role="img" aria-label={value == null ? 'Sentiment unavailable' : `Sentiment ${Math.round(clamped)} of 100`}>
      <defs>
        <linearGradient id={`mkt2-gauge-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f0525d" />
          <stop offset="28%" stopColor="#f59f45" />
          <stop offset="52%" stopColor="#edce4c" />
          <stop offset="76%" stopColor="#78cb53" />
          <stop offset="100%" stopColor="#28b94a" />
        </linearGradient>
      </defs>
      <path d="M 18 100 A 82 82 0 0 1 182 100" fill="none" stroke={`url(#mkt2-gauge-${id})`} strokeWidth="13" strokeLinecap="round" />
      {value != null && (
        <>
          <line x1="100" y1="100" x2={tipX} y2={tipY} className="apex-mkt2-gauge-needle" />
          <circle cx="100" cy="100" r="6" className="apex-mkt2-gauge-pivot" />
        </>
      )}
    </svg>
  );
}

function SentimentCard({ sentiment, breadth }: { sentiment: SentimentComposite | null; breadth: ReturnType<typeof useBreadth> }) {
  const score = sentiment?.score ?? null;
  const label = sentiment?.zone ? sentiment.zone[0].toUpperCase() + sentiment.zone.slice(1).toLowerCase() : 'Unavailable';
  return (
    <section className="apex-panel apex-mkt2-sentiment-card">
      <div className="apex-panel-head"><span>Market Sentiment</span><ChevronRight size={14} /></div>
      <div className="apex-mkt2-gauge-wrap">
        <SemiGauge value={score} />
        <div className="apex-mkt2-gauge-center">
          <strong>{score == null ? '—' : Math.round(score)}</strong>
          <span>{label}</span>
        </div>
      </div>
      <div className="apex-mkt2-sentiment-legend">
        <div className="bearish"><strong>{breadth.bearish}</strong><span>Bearish</span></div>
        <div className="neutral"><strong>{breadth.neutral}</strong><span>Neutral</span></div>
        <div className="bullish"><strong>{breadth.bullish}</strong><span>Bullish</span></div>
      </div>
    </section>
  );
}

function BreadthCard({ breadth }: { breadth: ReturnType<typeof useBreadth> }) {
  return (
    <section className="apex-panel apex-mkt2-breadth-card">
      <div className="apex-panel-head"><span>Market Breadth</span><ChevronRight size={14} /></div>
      <div className="apex-mkt2-breadth-bar">
        <span className="seg bearish" style={{ width: `${breadth.bearishPct}%` }} />
        <span className="seg neutral" style={{ width: `${breadth.neutralPct}%` }} />
        <span className="seg bullish" style={{ width: `${breadth.bullishPct}%` }} />
      </div>
      <div className="apex-mkt2-breadth-legend">
        <div><strong className="negative">{breadth.bearishPct}%</strong><span>Bearish</span></div>
        <div><strong>{breadth.neutralPct}%</strong><span>Neutral</span></div>
        <div><strong className="positive">{breadth.bullishPct}%</strong><span>Bullish</span></div>
      </div>
    </section>
  );
}

function WatchlistCard({
  tickers,
  selectedSymbol,
  onSelectSymbol,
  favorites,
  onToggleFavorite,
}: {
  tickers: SymbolTicker[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  favorites: Set<string>;
  onToggleFavorite: (symbol: string) => void;
}) {
  // A real, user-managed watchlist: this is the same favorites set as the
  // per-row star in the table and the main Watchlist page (same storage
  // key), not just "the first N live tickers" like the placeholder before.
  const watched = tickers.filter((ticker) => favorites.has(ticker.symbol));
  return (
    <section className="apex-panel apex-mkt2-watchlist-card">
      <div className="apex-panel-head"><span>Watchlist</span><span className="apex-mkt2-watchlist-count">{watched.length}</span></div>
      {watched.length ? (
        <div className="apex-mkt2-watchlist-rows">
          {watched.map((ticker) => (
            <button type="button" key={ticker.symbol} className={ticker.symbol === selectedSymbol ? 'active' : ''} onClick={() => onSelectSymbol(ticker.symbol)}>
              <CoinIcon symbol={ticker.symbol} size={22} />
              <strong>{ticker.symbol}</strong>
              <span>{formatPrice(ticker.lastPrice)}</span>
              <em className={signed(ticker.priceChange24hPct)}>{formatPercent(ticker.priceChange24hPct)}</em>
              <Star
                size={13}
                fill="currentColor"
                className="apex-mkt2-watchlist-star"
                onClick={(event) => { event.stopPropagation(); onToggleFavorite(ticker.symbol); }}
              />
            </button>
          ))}
        </div>
      ) : (
        <div className="apex-honest-empty compact">No favorites yet — use the star in the table to pin a market here.</div>
      )}
    </section>
  );
}

/* ------------------------------ Live Setups (collapsible) ------------------------------ */

function tierPillTone(tier: string) {
  return tier === 'CONFIRMED' ? 'success' : tier === 'BLOCKED' || tier === 'CAUTION' ? 'danger' : '';
}

function LiveSetupsCard({ longCandidates, shortCandidates }: { longCandidates: CandidateScore[]; shortCandidates: CandidateScore[] }) {
  // Collapsed by default per user preference — the ranking itself is
  // computed eagerly below so it's ready the instant the panel is opened,
  // rather than being fetched or derived on first expand.
  const [expanded, setExpanded] = useState(false);
  const top = useMemo(
    () => [...longCandidates, ...shortCandidates].sort((a, b) => b.score - a.score).slice(0, 3),
    [longCandidates, shortCandidates],
  );
  return (
    <section className="apex-panel apex-mkt2-live-setups-card">
      <button
        type="button"
        className="apex-panel-head apex-mkt2-collapse-trigger"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>Live Setups <span className="apex-mkt2-watchlist-count">{top.length}</span></span>
        <ChevronRight size={14} className={expanded ? 'apex-mkt2-chevron open' : 'apex-mkt2-chevron'} />
      </button>
      {expanded && (
        top.length ? (
          <div className="apex-mkt2-live-setups-rows">
            {top.map((row) => (
              <div className="apex-candidate-row" key={`${row.symbol}-${row.direction}`}>
                <CoinIcon symbol={row.symbol} size={26} />
                <div>
                  <strong>{row.symbol}</strong>
                  <span className={`apex-status-pill ${tierPillTone(row.readinessTier)}`}>{row.readinessTier}</span>
                </div>
                <span>{formatPrice(row.lastPrice)}</span>
                <em className={row.direction === 'LONG' ? 'positive' : 'negative'}>{row.score}</em>
              </div>
            ))}
          </div>
        ) : (
          <div className="apex-honest-empty compact">No qualified setups right now.</div>
        )
      )}
    </section>
  );
}

function MarketsSidebar({ tickers, sentiment, breadth, selectedSymbol, onSelectSymbol, favorites, onToggleFavorite, longCandidates, shortCandidates }: {
  tickers: SymbolTicker[];
  sentiment: SentimentComposite | null;
  breadth: ReturnType<typeof useBreadth>;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  favorites: Set<string>;
  onToggleFavorite: (symbol: string) => void;
  longCandidates: CandidateScore[];
  shortCandidates: CandidateScore[];
}) {
  return (
    <aside className="apex-mkt2-sidebar">
      <WatchlistCard tickers={tickers} selectedSymbol={selectedSymbol} onSelectSymbol={onSelectSymbol} favorites={favorites} onToggleFavorite={onToggleFavorite} />
      <SentimentCard sentiment={sentiment} breadth={breadth} />
      <LiveSetupsCard longCandidates={longCandidates} shortCandidates={shortCandidates} />
    </aside>
  );
}

/* ---------------------------------- Page ---------------------------------- */

export function MarketsPage(props: MarketsPageProps) {
  const selected = props.tickers.find((ticker) => ticker.symbol === props.selectedSymbol) || props.tickers[0];
  const breadth = useBreadth(props.tickers);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // Lifted up so the table's per-row star and the sidebar Watchlist card
  // read/write the exact same favorites set (and the same localStorage key
  // used by the main Watchlist page) — one favorite list, three places it's shown.
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
  const toggleFavorite = (symbol: string) => setFavorites((previous) => toggleWatchlistFavorite(previous, symbol));

  return (
    <div className="apex-page-stack apex-unified-page apex-mkt2">
      <MarketsHeader loading={props.loading} onRefresh={props.onRefresh} customizeOpen={customizeOpen} onToggleCustomize={() => setCustomizeOpen((value) => !value)} />
      <MarketsStatBar selected={selected} breadth={breadth} />
      <div className="apex-mkt2-shell">
        <MarketsTablePanel
          tickers={props.tickers}
          selectedSymbol={props.selectedSymbol}
          onSelectSymbol={props.onSelectSymbol}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          customizeOpen={customizeOpen}
          onOpenTrading={props.onOpenTrading}
          onOpenWatchlist={props.onOpenWatchlist}
        />
        <MarketsSidebar
          tickers={props.tickers}
          sentiment={props.sentiment}
          breadth={breadth}
          selectedSymbol={props.selectedSymbol}
          onSelectSymbol={props.onSelectSymbol}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          longCandidates={props.longCandidates}
          shortCandidates={props.shortCandidates}
        />
      </div>
    </div>
  );
}
