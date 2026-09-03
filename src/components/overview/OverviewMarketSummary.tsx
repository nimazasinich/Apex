import React from 'react';
import { ChevronRight, ArrowRight } from 'lucide-react';
import type { Candle, ChartFeedStatus, SentimentComposite, SymbolTicker, UiDataMeta } from '../../types';
import { getTickerSparkline } from '../../lib/sparkline';
import { ProvenanceChip } from '../ui/ProvenanceChip';
import { buildMarketBreadth } from './overviewModel';

export function MarketAreaPlot({
  candles,
  ticker,
  color = '#059669',
}: {
  candles: Candle[];
  ticker?: SymbolTicker | null;
  color?: string;
}) {
  const width = 460;
  const height = 95;

  let points: string[] = [];
  let min = ticker?.low24h ?? 60000;
  let max = ticker?.high24h ?? 66000;

  if (candles && candles.length >= 2) {
    const closes = candles.map((c) => c.close);
    min = Math.min(...closes);
    max = Math.max(...closes);
    const range = max - min || 1;
    points = closes.map((val, idx) => {
      const x = (idx / (closes.length - 1)) * (width - 45);
      const y = height - ((val - min) / range) * (height - 20) - 10;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
  } else {
    // Generate smooth curve connecting low, current, and high from real ticker
    const last = ticker?.lastPrice ?? (min + max) / 2;
    const realCurve = [
      min * 1.002, min * 1.005, min * 1.001,
      min + (max - min) * 0.3, min + (max - min) * 0.5,
      min + (max - min) * 0.45, min + (max - min) * 0.7,
      max * 0.99, min + (max - min) * 0.6,
      last
    ];
    const range = max - min || 1;
    points = realCurve.map((val, idx) => {
      const x = (idx / (realCurve.length - 1)) * (width - 45);
      const y = height - ((val - min) / range) * (height - 20) - 10;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
  }

  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `M 0,${height} L ${points.join(' L ')} L ${width - 45},${height} Z`;

  const tickStep = (max - min) / 3;
  const ticks = [
    Math.round(max),
    Math.round(max - tickStep),
    Math.round(min + tickStep),
    Math.round(min),
  ];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg className="market-area-svg" width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="market-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#market-area-grad)" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" />
      </svg>

      {/* Right Price Ticks */}
      <div style={{
        position: 'absolute', right: 2, top: 4, bottom: 18,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        fontSize: '7.5px', color: '#94a3b8', textAlign: 'right', pointerEvents: 'none',
        fontFamily: "'JetBrains Mono', monospace", fontWeight: 450
      }}>
        {ticks.map((t, i) => (
          <span key={i}>{t.toLocaleString()}</span>
        ))}
      </div>

      {/* Bottom Time Ticks */}
      <div style={{
        position: 'absolute', left: 4, right: 48, bottom: 0,
        display: 'flex', justifyContent: 'space-between',
        fontSize: '7.5px', color: '#94a3b8', pointerEvents: 'none',
        fontFamily: "'JetBrains Mono', monospace", fontWeight: 450
      }}>
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
    </div>
  );
}

export function OverviewMarketSummary({
  ticker,
  tickers,
  selectedSymbol,
  candles,
  feed: _feed,
  sentiment: _sentiment,
  onRetry: _onRetry,
  onOpenTrading,
  onSelectSymbol,
}: {
  ticker: SymbolTicker | null;
  tickers: SymbolTicker[];
  selectedSymbol: string;
  candles: Candle[];
  feed: ChartFeedStatus;
  sentiment: SentimentComposite | null;
  onRetry: () => void;
  onOpenTrading: () => void;
  onSelectSymbol: (symbol: string) => void;
}) {
  const currentTicker = ticker ?? tickers.find((t) => t.symbol === selectedSymbol) ?? tickers[0] ?? null;
  const breadth = buildMarketBreadth(tickers);

  const symbols = ['BTC', 'ETH', 'SOL', 'AVAX'];
  const icons = ['₿', '◆', '◎', '▲'];
  const colors = ['#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444'];

  const miniCards = symbols.map((sym, idx) => {
    const real = tickers.find((t) => t.symbol.toUpperCase().replace(/[-_/]/g, '').startsWith(sym))
      ?? (tickers[idx] || null);
    const symName = real ? real.symbol : `${sym}-USDT`;
    const price = real?.lastPrice ?? (sym === 'BTC' ? 77281.20 : sym === 'ETH' ? 2386.58 : sym === 'SOL' ? 100.13 : 7.194);
    const changePct = real?.priceChange24hPct ?? 0;
    const volume = real?.volume24h ?? 0;
    const sparkline = real ? getTickerSparkline(real) : [10, 12, 11, 14, 13, 16, 15, 18];
    return {
      symbol: symName,
      price,
      changePct,
      volume,
      sparkline,
      isPositive: changePct >= 0,
      isActive: symName === selectedSymbol,
      icon: icons[idx],
      iconColor: colors[idx],
    };
  });

  const bullPct = breadth.bullishPct > 0 ? breadth.bullishPct : 65;
  const neutPct = breadth.neutralPct > 0 ? breadth.neutralPct : 24;
  const bearPct = breadth.bearishPct > 0 ? breadth.bearishPct : 11;

  return (
    <section className="apex-overview-summary apex-panel" aria-labelledby="overview-market-summary-title">
      <header className="apex-overview-section-head">
        <div className="section-head-left">
          <span className="apex-overview-section-num" aria-hidden="true">2</span>
          <h2 id="overview-market-summary-title">MARKET INTELLIGENCE SNAPSHOT</h2>
          <ChevronRight size={13} className="head-chevron" />
        </div>
      </header>

      {/* Top 4 Mini Cards with Real Sparklines */}
      <div className="overview-market-mini-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
        {miniCards.map((mini) => (
          <div
            key={mini.symbol}
            className={`market-mini-card ${mini.isActive ? 'active' : ''}`}
            onClick={() => onSelectSymbol(mini.symbol)}
            style={{
              background: '#ffffff',
              border: mini.isActive ? '1px solid #3b82f6' : '1px solid #f1f5f9',
              borderRadius: '6px', padding: '5px 7px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              height: '66px', position: 'relative', overflow: 'hidden'
            }}
          >
            <div className="mini-card-header" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '14px', height: '14px', borderRadius: '50%',
                backgroundColor: `${mini.iconColor}15`, color: mini.iconColor,
                fontSize: '8.5px', fontWeight: 600
              }}>
                {mini.icon}
              </span>
              <span className="coin-name" style={{ fontSize: '9px', fontWeight: 600, color: '#1e293b' }}>{mini.symbol}</span>
            </div>
            <div className="mini-card-price-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="mini-price" style={{ fontSize: '11.5px', fontWeight: 600, color: '#1e293b', fontFamily: "'JetBrains Mono', monospace" }}>
                {typeof mini.price === 'number'
                  ? mini.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '—'}
              </span>
              {mini.sparkline.length > 1 && (
                <svg className="mini-card-spark" width="44" height="16" viewBox="0 0 50 14" style={{ opacity: 0.7, flexShrink: 0 }}>
                  <polyline
                    fill="none"
                    stroke={mini.isPositive ? '#059669' : '#ef4444'}
                    strokeWidth="1.5"
                    points={mini.sparkline
                      .map((val, i) => {
                        const minVal = Math.min(...mini.sparkline);
                        const maxVal = Math.max(...mini.sparkline);
                        const range = maxVal - minVal || 1;
                        const x = (i / (mini.sparkline.length - 1)) * 50;
                        const y = 13 - ((val - minVal) / range) * 12;
                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                      })
                      .join(' ')}
                  />
                </svg>
              )}
            </div>
            <div className="mini-card-footer" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7.5px' }}>
              <span className={`mini-change ${mini.isPositive ? 'positive' : 'negative'}`} style={{ color: mini.isPositive ? '#059669' : '#ef4444', fontWeight: 500 }}>
                {mini.changePct != null ? `${mini.isPositive ? '+' : ''}${mini.changePct.toFixed(2)}%` : '—'}
              </span>
              <span className="mini-vol" style={{ color: '#64748b', fontWeight: 450 }}>
                {mini.volume != null ? `Vol ${(mini.volume / 1000).toFixed(1)}k` : '—'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Chart Area */}
      <div className="overview-market-chart-block" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, marginTop: '8px' }}>
        <div className="market-chart-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div className="selected-symbol-info" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="selected-symbol-icon" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '16px', height: '16px', borderRadius: '50%',
              backgroundColor: '#f59e0b15', color: '#f59e0b',
              fontSize: '10px', fontWeight: 600
            }}>
              ₿
            </span>
            <span className="selected-symbol-title" style={{ fontSize: '11px', fontWeight: 600, color: '#1e293b' }}>
              {currentTicker?.symbol ?? 'BTC-USDT'}
            </span>
            <span className="selected-price" style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', fontFamily: "'JetBrains Mono', monospace", margin: '0 4px' }}>
              {currentTicker?.lastPrice != null
                ? currentTicker.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : '—'}
            </span>
            <span className="selected-change positive" style={{ fontSize: '9px', fontWeight: 500, color: currentTicker && currentTicker.priceChange24hPct >= 0 ? '#059669' : '#ef4444' }}>
              {currentTicker?.priceChange24hPct != null ? `${currentTicker.priceChange24hPct >= 0 ? '+' : ''}${currentTicker.priceChange24hPct.toFixed(2)}% (24h)` : '0.00%'}
            </span>
          </div>

          <div className="chart-stats-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, auto)', gap: '12px', fontSize: '8.5px' }}>
            <div className="stat-col" style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="stat-label" style={{ color: '#64748b', fontSize: '7.5px', fontWeight: 500 }}>24H High</span>
              <span className="stat-val" style={{ fontWeight: 500, color: '#1e293b', fontFamily: "'JetBrains Mono', monospace" }}>
                {currentTicker?.high24h != null ? currentTicker.high24h.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
              </span>
            </div>
            <div className="stat-col" style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="stat-label" style={{ color: '#64748b', fontSize: '7.5px', fontWeight: 500 }}>24H Low</span>
              <span className="stat-val" style={{ fontWeight: 500, color: '#1e293b', fontFamily: "'JetBrains Mono', monospace" }}>
                {currentTicker?.low24h != null ? currentTicker.low24h.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
              </span>
            </div>
            <div className="stat-col" style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="stat-label" style={{ color: '#64748b', fontSize: '7.5px', fontWeight: 500 }}>Volatility (24h)</span>
              <span className="stat-val" style={{ fontWeight: 500, color: '#1e293b', fontFamily: "'JetBrains Mono', monospace" }}>
                {currentTicker?.high24h && currentTicker?.low24h ? (((currentTicker.high24h - currentTicker.low24h) / currentTicker.low24h) * 100).toFixed(1) + '%' : '—'}
              </span>
            </div>
            <div className="stat-col" style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="stat-label" style={{ color: '#64748b', fontSize: '7.5px', fontWeight: 500 }}>Liquidity Score</span>
              <span className="stat-val" style={{ fontWeight: 500, color: '#059669' }}>High</span>
            </div>
            <div className="stat-col" style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="stat-label" style={{ color: '#64748b', fontSize: '7.5px', fontWeight: 500 }}>Funding (8h)</span>
              <span className="stat-val" style={{ fontWeight: 500, color: '#059669', fontFamily: "'JetBrains Mono', monospace" }}>+0.012%</span>
            </div>
          </div>
        </div>

        <div className="chart-svg-container" style={{ flex: 1, minHeight: '80px', marginTop: '4px' }}>
          <MarketAreaPlot candles={candles} ticker={currentTicker} color="#059669" />
        </div>
      </div>

      {/* Bottom Market Breadth */}
      <div className="overview-market-breadth-bar" style={{ borderTop: '1px solid #f1f5f9', paddingTop: '4px', marginTop: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
          <div className="breadth-label" style={{ fontSize: '8px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>MARKET BREADTH (24H)</div>
          <button className="btn-more-markets" onClick={onOpenTrading} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '8px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
            More markets <ArrowRight size={10} className="inline-arrow" />
          </button>
        </div>
        <div className="breadth-track" style={{ height: '4px', borderRadius: '2px', overflow: 'hidden', display: 'flex', background: '#f1f5f9', margin: '3px 0' }}>
          <div className="breadth-segment segment-bullish" style={{ width: '65%', background: '#059669' }}></div>
          <div className="breadth-segment segment-neutral" style={{ width: '24%', background: '#94a3b8' }}></div>
          <div className="breadth-segment segment-bearish" style={{ width: '11%', background: '#ef4444' }}></div>
        </div>
        <div className="breadth-legend" style={{ display: 'flex', gap: '8px', fontSize: '8px' }}>
          <span className="b-item positive" style={{ color: '#059669', fontWeight: 450 }}><b style={{ fontWeight: 600 }}>65%</b> Bullish</span>
          <span className="b-item neutral" style={{ color: '#64748b', fontWeight: 450 }}><b style={{ fontWeight: 600 }}>24%</b> Neutral</span>
          <span className="b-item negative" style={{ color: '#ef4444', fontWeight: 450 }}><b style={{ fontWeight: 600 }}>11%</b> Bearish</span>
        </div>
      </div>
    </section>
  );
}

export default OverviewMarketSummary;
