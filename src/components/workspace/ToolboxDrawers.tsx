import React, { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Activity, BarChart3, Pin, PinOff, RefreshCw, ScanSearch, Star, X } from 'lucide-react';
import type { CandidateScore, SentimentComposite, SymbolTicker } from '../../types';
import { formatCompactNumber, formatPercent, formatPrice } from '../../lib/marketPresentation';
import { getTickerSparkline } from '../../lib/sparkline';
import { CoinIcon } from '../CoinIcon';
import { ColoredGauge } from '../ColoredGauge';
import { MiniSparkline } from '../MiniSparkline';

export type ToolboxKey = 'watchlist' | 'scanner' | 'movers' | 'signals';

interface ToolboxProps {
  tickers: SymbolTicker[];
  sentiment: SentimentComposite | null;
  longCandidates: CandidateScore[];
  shortCandidates: CandidateScore[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onActiveToolChange?: (tool: ToolboxKey | null) => void;
  onNavigate?: (page: 'markets' | 'analytics') => void;
}

const TOOLS: Array<{ key: ToolboxKey; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { key: 'watchlist', label: 'Watchlist', icon: Star },
  { key: 'scanner', label: 'Scanner', icon: ScanSearch },
  { key: 'movers', label: 'Movers', icon: BarChart3 },
  { key: 'signals', label: 'Signals', icon: Activity },
];

function tierClass(tier: string) {
  if (tier === 'CONFIRMED') return 'success';
  if (tier === 'CAUTION') return 'warn';
  return 'watch';
}

export function OverviewToolbox({ tickers, sentiment, longCandidates, shortCandidates, selectedSymbol, onSelectSymbol, onActiveToolChange, onNavigate }: ToolboxProps) {
  const [open, setOpen] = useState<ToolboxKey | null>(null);

  const close = () => { setOpen(null); onActiveToolChange?.(null); };
  const navigate = (page: 'markets' | 'analytics') => { close(); onNavigate?.(page); };

  const toggle = (key: ToolboxKey) =>
    setOpen((current) => {
      const next = current === key ? null : key;
      onActiveToolChange?.(next);
      return next;
    });

  return (
    <div className={`apex-toolbox${open ? ' open' : ''}`}>
      <aside className="apex-toolbox-rail" aria-label="Toolbox">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.key}
              type="button"
              className={`apex-rail-button ${open === tool.key ? 'active' : ''}`}
              onClick={() => toggle(tool.key)}
              title={tool.label}
            >
              <Icon size={19} />
            </button>
          );
        })}
      </aside>
      {open === 'watchlist' && <WatchlistDrawer tickers={tickers} selectedSymbol={selectedSymbol} onSelectSymbol={onSelectSymbol} onClose={close} />}
      {open === 'scanner' && <ScannerDrawer longCandidates={longCandidates} shortCandidates={shortCandidates} onClose={close} onOpenMarkets={() => navigate('markets')} />}
      {open === 'movers' && <MoversDrawer tickers={tickers} sentiment={sentiment} onClose={close} />}
      {open === 'signals' && <SignalsDrawer longCandidates={longCandidates} shortCandidates={shortCandidates} tickers={tickers} onClose={close} onOpenAnalytics={() => navigate('analytics')} />}
    </div>
  );
}

export function DrawerShell({
  title,
  subtitle,
  badge,
  onClose,
  children,
  docked,
  onToggleDock,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  onClose: () => void;
  children: React.ReactNode;
  docked?: boolean;
  onToggleDock?: () => void;
}) {
  return (
    <section className={`apex-drawer${docked ? ' is-docked' : ' is-floating'}`} role="complementary" aria-label={title}>
      <div className="apex-drawer-head">
        <div className="apex-drawer-head-copy">
          <span>{title}</span>
          {subtitle && <small>{subtitle}</small>}
        </div>
        {badge && <em className="apex-live-badge">{badge}</em>}
        <div className="apex-drawer-head-actions">
          {onToggleDock && (
            <button
              type="button"
              className="apex-drawer-dock"
              onClick={onToggleDock}
              aria-pressed={Boolean(docked)}
              aria-label={docked ? 'Unpin panel' : 'Pin panel open'}
              title={docked ? 'Unpin panel' : 'Pin panel open'}
            >
              {docked ? <PinOff size={15} /> : <Pin size={15} />}
            </button>
          )}
          <button type="button" className="apex-drawer-close" onClick={onClose} aria-label={`Close ${title}`}><X size={16} /></button>
        </div>
      </div>
      <div className="apex-drawer-body">{children}</div>
    </section>
  );
}


const MAJOR_PREFIXES = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX'];

function WatchlistDrawer({ tickers, selectedSymbol, onSelectSymbol, onClose }: { tickers: SymbolTicker[]; selectedSymbol: string; onSelectSymbol: (symbol: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'all' | 'majors'>('all');
  const visible = useMemo(() => {
    const source = tab === 'majors'
      ? tickers.filter((ticker) => MAJOR_PREFIXES.some((prefix) => ticker.symbol.toUpperCase().startsWith(prefix)))
      : tickers;
    const selected = tickers.find((ticker) => ticker.symbol === selectedSymbol);
    return [selected, ...source]
      .filter((ticker): ticker is SymbolTicker => Boolean(ticker))
      .filter((ticker, index, rows) => rows.findIndex((candidate) => candidate.symbol === ticker.symbol) === index)
      .slice(0, 20);
  }, [selectedSymbol, tab, tickers]);

  return (
    <DrawerShell title="Watchlist" badge="LIVE" onClose={onClose}>
      <div className="apex-toolbox-watchlist">
        <div className="apex-tf-tabs drawer-tabs watchlist-drawer-tabs">
          <button type="button" className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>ALL</button>
          <button type="button" className={tab === 'majors' ? 'active' : ''} onClick={() => setTab('majors')}>MAJORS</button>
        </div>
        <div className="apex-toolbox-watchlist-head"><span>Symbol</span><span>Last Price</span><span>24h</span></div>
        <div className="apex-toolbox-watchlist-rows">
          {visible.map((ticker) => (
            <button
              type="button"
              key={ticker.symbol}
              className={ticker.symbol === selectedSymbol ? 'active' : ''}
              onClick={() => onSelectSymbol(ticker.symbol)}
            >
              <CoinIcon symbol={ticker.symbol} size={23} />
              <span className="apex-toolbox-watchlist-symbol"><strong>{ticker.symbol}</strong><small>PERP</small></span>
              <span className="apex-toolbox-watchlist-price">{formatPrice(ticker.lastPrice)}</span>
              <em className={ticker.priceChange24hPct >= 0 ? 'positive' : 'negative'}>{formatPercent(ticker.priceChange24hPct)}</em>
            </button>
          ))}
        </div>
      </div>
    </DrawerShell>
  );
}

function ScannerDrawer({ longCandidates, shortCandidates, onClose, onOpenMarkets }: { longCandidates: CandidateScore[]; shortCandidates: CandidateScore[]; onClose: () => void; onOpenMarkets: () => void }) {
  const [tab, setTab] = useState<'long' | 'short'>('long');
  const rowsData = tab === 'long' ? longCandidates : shortCandidates;

  return (
    <DrawerShell title="Two-Directional Scanner" badge="LIVE" onClose={onClose}>
      <div className="apex-tf-tabs drawer-tabs">
        <button type="button" className={tab === 'long' ? 'active' : ''} onClick={() => setTab('long')}>Long setups</button>
        <button type="button" className={tab === 'short' ? 'active' : ''} onClick={() => setTab('short')}>Short setups</button>
      </div>
      <div className="apex-scanner-rows">
        {rowsData.length ? rowsData.slice(0, 10).map((row) => (
          <div className="apex-scanner-row" key={`${row.symbol}-${row.direction}`}>
            <CoinIcon symbol={row.symbol} size={24} />
            <strong>{row.symbol}</strong>
            <span className="apex-scanner-score">{row.score}</span>
            <span className={`apex-tier-pill ${tierClass(row.readinessTier)}`}>{row.readinessTier}</span>
          </div>
        )) : <div className="apex-honest-empty compact">No qualified {tab} setups right now.</div>}
      </div>
      <div className="apex-drawer-footer">
        <span>Last updated: {new Date().toISOString().slice(11, 19)} UTC</span>
        <button type="button" className="apex-drawer-link" onClick={onOpenMarkets}>View full scanner <ArrowUpRight size={14} /></button>
      </div>
    </DrawerShell>
  );
}

function MoversDrawer({ tickers, sentiment, onClose }: { tickers: SymbolTicker[]; sentiment: SentimentComposite | null; onClose: () => void }) {
  const [tab, setTab] = useState<'gainers' | 'losers'>('gainers');
  const sorted = useMemo(() => [...tickers].sort((a, b) => (tab === 'gainers' ? b.priceChange24hPct - a.priceChange24hPct : a.priceChange24hPct - b.priceChange24hPct)).slice(0, 6), [tickers, tab]);
  const turnoverLeaders = useMemo(() => [...tickers].sort((a, b) => (b.turnover24h || 0) - (a.turnover24h || 0)).slice(0, 6), [tickers]);
  const mood = sentiment?.score ?? 50;
  const moodLabel = mood >= 70 ? 'Greed' : mood >= 55 ? 'Greed' : mood >= 45 ? 'Neutral' : mood >= 30 ? 'Fear' : 'Fear';

  return (
    <DrawerShell title="Market Movers" onClose={onClose}>
      <div className="apex-mood-card">
        <div className="apex-mood-head"><span>Market Mood</span><small>Real-time market intelligence</small></div>
        <ColoredGauge value={mood} size={126} displayValue={String(Math.round(mood))} label={moodLabel} className="apex-mood-colored-gauge" />
        <div className="apex-mood-scale"><span>Fear</span><span>Greed</span></div>
      </div>
      <div className="apex-tf-tabs drawer-tabs">
        <button type="button" className={tab === 'gainers' ? 'active' : ''} onClick={() => setTab('gainers')}>Gainers</button>
        <button type="button" className={tab === 'losers' ? 'active' : ''} onClick={() => setTab('losers')}>Losers</button>
      </div>
      <div className="apex-drawer-table">
        <div className="apex-drawer-table-head movers"><span>Symbol</span><span>Price</span><span>Trend</span><span>24h</span></div>
        {sorted.map((ticker) => (
          <div className="apex-drawer-table-row" key={ticker.symbol}>
            <span className="apex-drawer-symbol"><CoinIcon symbol={ticker.symbol} size={21} /><strong>{ticker.symbol}</strong></span>
            <span>{formatPrice(ticker.lastPrice)}</span>
            <MiniSparkline values={getTickerSparkline(ticker)} tone={ticker.priceChange24hPct >= 0 ? 'positive' : 'negative'} />
            <em className={ticker.priceChange24hPct >= 0 ? 'positive' : 'negative'}>{formatPercent(ticker.priceChange24hPct)}</em>
          </div>
        ))}
      </div>
      <div className="apex-drawer-subhead">Turnover Leaders</div>
      <div className="apex-drawer-table">
        {turnoverLeaders.map((ticker) => (
          <div className="apex-drawer-table-row two" key={`turnover-${ticker.symbol}`}>
            <span className="apex-drawer-symbol"><CoinIcon symbol={ticker.symbol} size={21} /><strong>{ticker.symbol}</strong></span>
            <span>{formatCompactNumber(ticker.turnover24h, 'USDT')}</span>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

function SignalsDrawer({ longCandidates, shortCandidates, tickers, onClose, onOpenAnalytics }: { longCandidates: CandidateScore[]; shortCandidates: CandidateScore[]; tickers: SymbolTicker[]; onClose: () => void; onOpenAnalytics: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const active = longCandidates.length + shortCandidates.length;
  const longPct = active ? Math.round((longCandidates.length / active) * 100) : 50;
  const rankedSignals = [...longCandidates.map((c) => ({ ...c, type: 'Long' })), ...shortCandidates.map((c) => ({ ...c, type: 'Short' }))]
    .sort((a, b) => b.score - a.score);
  const recent = rankedSignals.slice(0, showAll ? 20 : 6);
  const allCandidates = [...longCandidates, ...shortCandidates];
  const guardPassRate = active ? Math.round((allCandidates.filter((candidate) => candidate.guardPass).length / active) * 100) : 0;
  const averageScore = active ? allCandidates.reduce((sum, candidate) => sum + candidate.score, 0) / active : 0;
  const confirmed = allCandidates.filter((candidate) => candidate.readinessTier === 'CONFIRMED').length;
  const bestSignal = recent[0];

  return (
    <DrawerShell title="Signal Pulse" badge="LIVE" onClose={onClose}>
      <div className="apex-signal-snapshot">
        <div><strong>{active}</strong><span>Active Signals</span></div>
        <div><strong className="positive">{longCandidates.length}</strong><span>Long Signals</span></div>
        <div><strong className="negative">{shortCandidates.length}</strong><span>Short Signals</span></div>
      </div>
      <div className="apex-split-bar"><i style={{ width: `${longPct}%` }} /></div>
      <div className="apex-drawer-meta"><span>Markets Scanned <strong>{tickers.length}</strong></span><span>Last Update <strong>{new Date().toISOString().slice(11, 19)} UTC</strong></span></div>

      <div className="apex-drawer-subhead">Live quality <em>current scan</em></div>
      <div className="apex-perf-grid">
        <div><span>Guard Pass</span><strong className="positive">{guardPassRate}%</strong><MiniSparkline values={allCandidates.slice(0, 12).map((candidate) => candidate.score)} tone="positive" /></div>
        <div><span>Average Score</span><strong>{active ? averageScore.toFixed(1) : '—'}</strong><MiniSparkline values={allCandidates.slice(0, 12).map((candidate) => candidate.score)} tone="violet" /></div>
        <div><span>Confirmed</span><strong>{confirmed}</strong><MiniSparkline values={allCandidates.slice(0, 12).map((candidate) => candidate.readinessTier === 'CONFIRMED' ? candidate.score : 0)} tone="positive" bars /></div>
        <div><span>Best Signal</span><strong className="positive">{bestSignal ? `${bestSignal.symbol} ${bestSignal.type}` : '—'}</strong><MiniSparkline values={allCandidates.slice(0, 12).map((candidate) => Math.abs(candidate.priceChange24hPct))} tone="positive" /></div>
      </div>

      <div className="apex-drawer-subhead">Recent Signals <button type="button" className="apex-drawer-link small" onClick={() => setShowAll((current) => !current)} aria-expanded={showAll}>{showAll ? 'Show top 6' : 'View all'}</button></div>
      <div className="apex-drawer-table signals">
        <div className="apex-drawer-table-head"><span>Symbol</span><span>Type</span><span>Status</span></div>
        {recent.length ? recent.map((row) => (
          <div className="apex-drawer-table-row three" key={`${row.symbol}-${row.type}`}>
            <span className="apex-drawer-symbol"><CoinIcon symbol={row.symbol} size={21} /><strong>{row.symbol}</strong></span>
            <span className={row.type === 'Long' ? 'positive' : 'negative'}>{row.type}</span>
            <span className={`apex-tier-pill ${tierClass(row.readinessTier)}`}>{row.readinessTier === 'CONFIRMED' ? 'Confirmed' : 'Active'}</span>
          </div>
        )) : <div className="apex-honest-empty compact">No recent signals.</div>}
      </div>
      <div className="apex-drawer-footer">
        <button type="button" className="apex-drawer-link" onClick={onOpenAnalytics}><RefreshCw size={13} /> View full signals dashboard <ArrowDownRight size={14} /></button>
      </div>
    </DrawerShell>
  );
}
