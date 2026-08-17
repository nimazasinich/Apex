import React, { useEffect, useMemo, useState } from 'react';
import './WatchlistPage.css';
import { Activity, ArrowUpRight, Gauge, Layers3, RefreshCw, Search, ShieldCheck, Star, TrendingUp, X } from 'lucide-react';
import { CoinIcon } from '../../components/CoinIcon';
import {
  DataState,
  Donut,
  KeyValueList,
  Panel,
  PanelHeader,
  StatusBadge,
  TinySparkline,
  WorkspacePageFrame,
} from '../../components/ui/WorkspacePrimitives';
import { formatCompactNumber, formatPercent, formatPrice } from '../../lib/marketPresentation';
import { getTickerSparkline } from '../../lib/sparkline';
import { WATCHLIST_CHANGE_EVENT, readWatchlistFavorites, toggleWatchlistFavorite } from '../../lib/watchlistFavorites';
import type { MarketWorkspaceProps } from '../pageTypes';
import type { SymbolTicker } from '../../types';
import { notifyWorkspace } from '../../lib/workspaceFeedback';

type WatchlistPageProps = MarketWorkspaceProps & { onOpenTrading: () => void; onOpenMarkets: () => void };
type CategoryFilter = 'all' | 'favorites' | 'major' | 'defi' | 'layer1' | 'ai';
type AssetScope = 'all' | 'gainers' | 'losers' | 'setups';
type SortMode = 'marketCap' | 'volume' | 'change' | 'price';
type WatchlistVisualTicker = SymbolTicker & {
  displayName?: string;
  marketCapUsd?: number;
  sparkline24h?: number[];
  sparkline7d?: number[];
  tags?: string[];
};

const toneFor = (value: number) => value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
const visualTicker = (ticker: SymbolTicker): WatchlistVisualTicker => ticker as WatchlistVisualTicker;
const assetName = (ticker: SymbolTicker) => visualTicker(ticker).displayName || ticker.symbol.replace('-USDT', '');
const marketCap = (ticker: SymbolTicker) => Number.isFinite(visualTicker(ticker).marketCapUsd) ? Number(visualTicker(ticker).marketCapUsd) : null;
const series24h = (ticker: SymbolTicker) => (visualTicker(ticker).sparkline24h || []).filter(Number.isFinite);
const series7d = (ticker: SymbolTicker) => (visualTicker(ticker).sparkline7d || []).filter(Number.isFinite);
const tagsFor = (ticker: SymbolTicker) => Array.isArray(visualTicker(ticker).tags) ? visualTicker(ticker).tags! : [];
const usdCompact = (value: number | null) => value == null ? '—' : `$${formatCompactNumber(value)}`;

function normalizeSeries(values: number[], points = 16): number[] {
  if (values.length < 2) return [];
  const sampled = Array.from({ length: points }, (_, index) => values[Math.round(index * (values.length - 1) / (points - 1))]);
  const first = sampled[0] || 1;
  return sampled.map((value) => value / first);
}

function aggregateSeries(tickers: SymbolTicker[]): number[] {
  const rows = tickers.map((ticker) => normalizeSeries(series24h(ticker).length >= 2 ? series24h(ticker) : getTickerSparkline(ticker))).filter((row) => row.length >= 2);
  if (!rows.length) return [];
  return Array.from({ length: rows[0].length }, (_, index) => rows.reduce((sum, row) => sum + row[index], 0) / rows.length);
}

function WatchlistSummaryCard({ label, ticker, value, detail, tone = 'neutral', values, icon }: {
  label: string;
  ticker?: SymbolTicker | null;
  value: string;
  detail: string;
  tone?: 'positive' | 'negative' | 'neutral' | 'violet';
  values?: number[];
  icon: React.ReactNode;
}) {
  const trendTone = tone === 'negative' ? 'negative' : tone === 'violet' ? 'violet' : 'positive';
  return <article className={`apex-watch-summary-card tone-${tone}`}>
    <header><span className="apex-watch-summary-icon">{icon}</span><strong>{label}</strong></header>
    <div className="apex-watch-summary-body">
      <div className="apex-watch-summary-copy">
        {ticker && <span className="apex-watch-summary-asset"><CoinIcon symbol={ticker.symbol} size={20} /><b>{assetName(ticker)}</b>{assetName(ticker) !== ticker.symbol.replace('-USDT', '') && <small>{ticker.symbol}</small>}</span>}
        <em>{value}</em>
        <small>{detail}</small>
      </div>
      <TinySparkline values={values || (ticker ? (series24h(ticker).length >= 2 ? series24h(ticker) : getTickerSparkline(ticker)) : [])} tone={trendTone} width={92} height={42} />
    </div>
  </article>;
}

export function WatchlistPage(props: WatchlistPageProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [scope, setScope] = useState<AssetScope>('all');
  const [sortMode, setSortMode] = useState<SortMode>('marketCap');
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

  const candidates = useMemo(() => [...props.longCandidates, ...props.shortCandidates], [props.longCandidates, props.shortCandidates]);
  const watchlist = useMemo(() => props.tickers.filter((ticker) => favorites.has(ticker.symbol)), [favorites, props.tickers]);
  const majorSymbols = useMemo(() => new Set([...props.tickers].sort((a, b) => b.turnover24h - a.turnover24h).slice(0, 8).map((ticker) => ticker.symbol)), [props.tickers]);

  const toggleFavorite = (symbol: string) => {
    const existed = favorites.has(symbol);
    const next = toggleWatchlistFavorite(favorites, symbol);
    setFavorites(next);
    notifyWorkspace({ title: existed ? 'Removed from watchlist' : 'Added to watchlist', detail: symbol, tone: 'success' });
  };

  const visible = useMemo(() => {
    const normalized = query.trim().toUpperCase();
    const source = category === 'favorites' ? watchlist : props.tickers;
    const filtered = source.filter((ticker) => {
      if (normalized && !ticker.symbol.includes(normalized) && !assetName(ticker).toUpperCase().includes(normalized)) return false;
      const tags = tagsFor(ticker).map((tag) => tag.toLowerCase());
      if (category === 'major' && !majorSymbols.has(ticker.symbol)) return false;
      if (category === 'defi' && !tags.includes('defi')) return false;
      if (category === 'layer1' && !tags.some((tag) => tag === 'layer 1' || tag === 'layer1')) return false;
      if (category === 'ai' && !tags.includes('ai')) return false;
      if (scope === 'gainers' && ticker.priceChange24hPct <= 0) return false;
      if (scope === 'losers' && ticker.priceChange24hPct >= 0) return false;
      if (scope === 'setups' && !candidates.some((candidate) => candidate.symbol === ticker.symbol)) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (sortMode === 'volume') return b.turnover24h - a.turnover24h;
      if (sortMode === 'change') return b.priceChange24hPct - a.priceChange24hPct;
      if (sortMode === 'price') return b.lastPrice - a.lastPrice;
      return (marketCap(b) ?? b.turnover24h) - (marketCap(a) ?? a.turnover24h);
    });
  }, [candidates, category, majorSymbols, props.tickers, query, scope, sortMode, watchlist]);

  const selected = visible.find((ticker) => ticker.symbol === props.selectedSymbol) || visible[0] || null;
  const selectedCandidate = candidates.filter((item) => item.symbol === selected?.symbol).sort((left, right) => right.score - left.score)[0] || null;
  const topGainer = props.tickers.length ? [...props.tickers].sort((a, b) => b.priceChange24hPct - a.priceChange24hPct)[0] : null;
  const topLoser = props.tickers.length ? [...props.tickers].sort((a, b) => a.priceChange24hPct - b.priceChange24hPct)[0] : null;
  const mostActive = props.tickers.length ? [...props.tickers].sort((a, b) => b.turnover24h - a.turnover24h)[0] : null;
  const performanceSource = watchlist.length ? watchlist : props.tickers;
  const avgChange = performanceSource.length ? performanceSource.reduce((sum, ticker) => sum + ticker.priceChange24hPct, 0) / performanceSource.length : null;
  const performanceSeries = useMemo(() => aggregateSeries(performanceSource), [performanceSource]);

  const refreshWatchlist = () => {
    props.onRefresh();
    notifyWorkspace({ title: 'Market refresh requested', detail: 'Watchlist prices and scanner context are synchronizing.', tone: 'info' });
  };

  const main = <div className="apex-v3-watchlist-main">
    <h1 className="sr-only">Watchlist</h1>
    <div className="watchlist-summary">
      <WatchlistSummaryCard label="Watchlist Performance" value={avgChange == null ? '—' : formatPercent(avgChange)} detail={watchlist.length ? 'Saved markets today' : 'Market universe today'} values={performanceSeries} tone={avgChange == null ? 'neutral' : toneFor(avgChange)} icon={<Activity size={15} />} />
      <WatchlistSummaryCard label="Top Gainer" ticker={topGainer} value={topGainer ? formatPercent(topGainer.priceChange24hPct) : '—'} detail={topGainer ? formatPrice(topGainer.lastPrice) : 'No market data'} tone="positive" icon={<ArrowUpRight size={15} />} />
      <WatchlistSummaryCard label="Top Loser" ticker={topLoser} value={topLoser ? formatPercent(topLoser.priceChange24hPct) : '—'} detail={topLoser ? formatPrice(topLoser.lastPrice) : 'No market data'} tone="negative" icon={<Activity size={15} />} />
      <WatchlistSummaryCard label="Most Active" ticker={mostActive} value={mostActive ? usdCompact(mostActive.turnover24h) : '—'} detail="24h turnover" tone="violet" icon={<Gauge size={15} />} />
    </div>

    <div className="apex-v3-chip-row" role="tablist" aria-label="Watchlist categories">
      {([
        ['all', 'All'], ['favorites', 'Favorites'], ['major', 'Major Coins'], ['defi', 'DeFi'], ['layer1', 'Layer 1'], ['ai', 'AI'],
      ] as Array<[CategoryFilter, string]>).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={category === id} className={category === id ? 'active' : ''} onClick={() => setCategory(id)}>{label}</button>)}
    </div>

    <div className="apex-v3-toolbar watchlist-toolbar">
      <div className="apex-v3-search-with-clear"><label className="apex-v3-search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search watchlist..." aria-label="Search watchlist" /></label>{query && <button type="button" className="apex-v3-icon-button" aria-label="Clear watchlist search" onClick={() => setQuery('')}><X size={13} /></button>}</div>
      <select value={scope} onChange={(event) => setScope(event.target.value as AssetScope)} aria-label="Filter watchlist assets"><option value="all">All Assets</option><option value="gainers">Gainers</option><option value="losers">Losers</option><option value="setups">Scanner Setups</option></select>
      <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} aria-label="Sort watchlist"><option value="marketCap">Sort by: Market Cap</option><option value="volume">Sort by: 24h Volume</option><option value="change">Sort by: 24h Change</option><option value="price">Sort by: Price</option></select>
      <button type="button" className="apex-v3-icon-button watchlist-refresh" onClick={refreshWatchlist} disabled={props.loading} aria-label="Refresh watchlist"><RefreshCw size={14} className={props.loading ? 'spin' : ''} /></button>
    </div>

    <Panel className="apex-v3-table-panel watchlist-table">
      {props.loading && !props.tickers.length ? <DataState availability="loading" title="Loading market data" detail="The table keeps its final dimensions while the market universe loads." />
        : !props.tickers.length ? <DataState availability={props.dataState === 'unavailable' ? 'error' : 'empty'} title="No market rows available" detail="The market provider did not return a usable universe." onRetry={props.onRefresh} />
          : category === 'favorites' && !watchlist.length ? <div className="apex-v3-watchlist-empty"><Star size={24} /><strong>Your watchlist is empty</strong><span>Open Markets and use the star beside any contract. The same favorites appear here immediately.</span><button type="button" className="apex-v3-button primary" onClick={props.onOpenMarkets}>Open Markets</button></div>
            : !visible.length ? <DataState availability="empty" title="No markets match this view" detail="Change the category, asset filter, or search query." />
              : <div className="apex-v3-table-scroll"><table className="apex-v3-table"><thead><tr><th aria-label="Favorite" /><th>Asset</th><th>Price</th><th>24h Change</th><th>24h Chart</th><th>24h Volume</th><th>Market Cap</th><th>Last 7 Days</th></tr></thead><tbody>
                {visible.map((ticker) => {
                  const meta = visualTicker(ticker);
                  const chart24 = series24h(ticker);
                  const chart7d = series7d(ticker);
                  const base = ticker.symbol.replace('-USDT', '');
                  const label = meta.displayName && meta.displayName !== base ? meta.displayName : '';
                  return <tr key={ticker.symbol} className={ticker.symbol === selected?.symbol ? 'selected' : ''} onClick={() => props.onSelectSymbol(ticker.symbol)} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.onSelectSymbol(ticker.symbol); } }}>
                    <td className="apex-v3-watchlist-star-cell"><button type="button" aria-label={`${favorites.has(ticker.symbol) ? 'Remove' : 'Add'} ${ticker.symbol} ${favorites.has(ticker.symbol) ? 'from' : 'to'} watchlist`} onClick={(event) => { event.stopPropagation(); toggleFavorite(ticker.symbol); }}><Star size={14} fill={favorites.has(ticker.symbol) ? 'currentColor' : 'none'} /></button></td>
                    <td className="apex-v3-symbol"><CoinIcon symbol={ticker.symbol} size={24} /><span><strong>{base}</strong>{label && <small>{label}</small>}</span></td>
                    <td className="number">{formatPrice(ticker.lastPrice)}</td>
                    <td className={toneFor(ticker.priceChange24hPct)}>{formatPercent(ticker.priceChange24hPct)}</td>
                    <td><TinySparkline values={chart24} tone={ticker.priceChange24hPct >= 0 ? 'positive' : 'negative'} width={86} height={26} /></td>
                    <td>{usdCompact(ticker.turnover24h)}</td>
                    <td>{usdCompact(marketCap(ticker))}</td>
                    <td><TinySparkline values={chart7d} tone={ticker.priceChange24hPct >= 0 ? 'positive' : 'negative'} width={86} height={26} /></td>
                  </tr>;
                })}
              </tbody></table></div>}
      <footer className="apex-watchlist-table-footer"><span>Showing {visible.length} of {props.tickers.length} assets</span><button type="button" onClick={props.onOpenMarkets}>View Full Market <ArrowUpRight size={13} /></button></footer>
    </Panel>
  </div>;

  const context = <div className="apex-v3-context-stack watchlist-context">
    <Panel className="context-asset-card">
      <PanelHeader title="Asset Assistant" subtitle="Selected market context" action={selected ? <button type="button" className={`apex-v3-icon-button ${favorites.has(selected.symbol) ? 'active' : ''}`} aria-label={`${favorites.has(selected.symbol) ? 'Remove' : 'Add'} ${selected.symbol} ${favorites.has(selected.symbol) ? 'from' : 'to'} watchlist`} onClick={() => toggleFavorite(selected.symbol)}><Star size={16} fill={favorites.has(selected.symbol) ? 'currentColor' : 'none'} /></button> : <Star size={16} />} />
      {selected ? <>
        <div className="apex-v3-asset-identity"><CoinIcon symbol={selected.symbol} size={34} /><div><strong>{selected.symbol.replace('-USDT', '')}</strong><span>{assetName(selected) === selected.symbol.replace('-USDT', '') ? 'Perpetual' : `${assetName(selected)} · Perpetual`}</span></div><em className={toneFor(selected.priceChange24hPct)}>{formatPercent(selected.priceChange24hPct)}</em></div>
        <div className="apex-v3-selected-price"><strong>{formatPrice(selected.lastPrice)}</strong><span>USDT</span></div>
        <div className="apex-watch-assistant-range"><span className="active">1D</span><span>1W</span><span>1M</span><span>1Y</span></div>
        <TinySparkline values={series24h(selected).length >= 2 ? series24h(selected) : getTickerSparkline(selected)} tone={selected.priceChange24hPct >= 0 ? 'positive' : 'negative'} width={268} height={94} />
      </> : <DataState availability="empty" title="Select an asset" detail="Choose a row to inspect its market context." />}
    </Panel>

    <Panel className="context-sentiment-card">
      <PanelHeader title="Market Sentiment" subtitle={props.sentiment?.zone || 'Unavailable'} />
      <Donut value={props.sentiment?.score ?? null} label={props.sentiment?.zone || 'No score'} detail={props.sentiment?.dataState || 'No sentiment source'} tone="positive" />
    </Panel>

    <Panel className="context-facts-card">
      <PanelHeader title="Key Facts" subtitle="Verified fields only" />
      <KeyValueList rows={[
        { label: 'Market Cap', value: selected ? usdCompact(marketCap(selected)) : '—' },
        { label: '24h Volume', value: selected ? usdCompact(selected.turnover24h) : '—' },
        { label: 'Open Interest', value: selected ? usdCompact(selected.openInterest) : '—' },
        { label: '24h High', value: selected ? formatPrice(selected.high24h) : '—' },
        { label: '24h Low', value: selected ? formatPrice(selected.low24h) : '—' },
      ]} />
      {selected && tagsFor(selected).length > 0 && <div className="apex-watch-tags" aria-label="Asset tags">{tagsFor(selected).slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}</div>}
    </Panel>

    {selectedCandidate && <details className="context-signal-intelligence apex-watch-signal-details">
      <summary><Layers3 size={15} /><span><strong>Signal intelligence</strong><small>Shadow research context</small></span><StatusBadge tone="info">Optional</StatusBadge></summary>
      <div className="apex-v3-signal-intelligence-head"><span className="apex-v3-signal-intelligence-icon"><ShieldCheck size={17} /></span><span><strong>{selectedCandidate.signalLifecycle?.state || 'Awaiting lifecycle context'}</strong><small>{selectedCandidate.signalId || 'No lifecycle identity assigned.'}</small></span></div>
      <p className="apex-v3-shadow-note">Research context only; it never authorizes an order.</p>
    </details>}

    <Panel className="context-actions-card">
      <div className="apex-v3-tag-row"><StatusBadge tone={selected?.dataState === 'live' ? 'positive' : 'warning'}>{selected?.dataState || 'unavailable'}</StatusBadge>{selectedCandidate && <StatusBadge tone="violet">{selectedCandidate.direction}</StatusBadge>}</div>
      <button type="button" className="apex-v3-button primary full" disabled={!selected} onClick={() => { if (!selected) return; props.onSelectSymbol(selected.symbol); notifyWorkspace({ title: `${selected.symbol} opened in Trading`, detail: 'Review market data and the risk plan before execution.', tone: 'info' }); props.onOpenTrading(); }}><TrendingUp size={15} /> Trade {selected?.symbol.replace('-USDT', '') || 'Asset'}</button>
      <button type="button" className="apex-v3-button secondary full" disabled={!selected || props.loading} onClick={refreshWatchlist}><RefreshCw size={15} /> Refresh Asset Data</button>
    </Panel>
  </div>;

  return <WorkspacePageFrame className="apex-v3-watchlist-page" main={main} context={context} />;
}
