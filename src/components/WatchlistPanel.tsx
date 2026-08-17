import React, { useMemo, useState } from 'react';
import type { SymbolTicker } from '../types';
import { formatPercent, formatPrice } from '../lib/marketPresentation';
import { CoinIcon } from './CoinIcon';

const MAJOR_PREFIXES = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];

function signedClass(value: number | null | undefined) {
  if (value == null || value === 0) return '';
  return value > 0 ? 'positive' : 'negative';
}

function isMajor(symbol: string) {
  return MAJOR_PREFIXES.some((prefix) => symbol.toUpperCase().startsWith(prefix));
}

export interface WatchlistPanelProps {
  tickers: SymbolTicker[];
  selected: string;
  onSelect: (symbol: string) => void;
}

export function WatchlistPanel({ tickers, selected, onSelect }: WatchlistPanelProps) {
  const [tab, setTab] = useState<'ALL' | 'MAJORS'>('ALL');

  const rows = useMemo(() => {
    const filtered = tab === 'MAJORS' ? tickers.filter((ticker) => isMajor(ticker.symbol)) : tickers;
    const visible = filtered.slice(0, 20);
    const selectedTicker = filtered.find((ticker) => ticker.symbol === selected);
    if (selectedTicker && !visible.some((ticker) => ticker.symbol === selectedTicker.symbol)) {
      return [...visible.slice(0, 19), selectedTicker];
    }
    return visible;
  }, [tickers, tab, selected]);

  return (
    <section className="apex-panel apex-watchlist-panel">
      <div className="apex-panel-head">
        <span>Watchlist</span><small>Live futures pairs</small>
      </div>
      <div className="apex-tf-tabs watchlist-tabs">
        <button type="button" className={tab === 'ALL' ? 'active' : ''} onClick={() => setTab('ALL')}>ALL</button>
        <button type="button" className={tab === 'MAJORS' ? 'active' : ''} onClick={() => setTab('MAJORS')}>MAJORS</button>
      </div>
      <div className="apex-watchlist-rows">
        {rows.length ? rows.map((ticker) => (
          <button
            key={ticker.symbol}
            type="button"
            className={`apex-watchlist-row ${ticker.symbol === selected ? 'active' : ''}`}
            onClick={() => onSelect(ticker.symbol)}
          >
            <CoinIcon symbol={ticker.symbol} size={18} className="tiny" />
            <span className="apex-watchlist-symbol-wrap"><span className="apex-watchlist-symbol">{ticker.symbol}</span><small>PERP</small></span>
            <span className="apex-watchlist-price">{formatPrice(ticker.lastPrice)}</span>
            <em className={signedClass(ticker.priceChange24hPct)}>{formatPercent(ticker.priceChange24hPct)}</em>
          </button>
        )) : (
          <div className="apex-honest-empty compact">No markets to show.</div>
        )}
      </div>
    </section>
  );
}
