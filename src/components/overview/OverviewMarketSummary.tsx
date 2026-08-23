import React, { useMemo } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import type { Candle, ChartFeedStatus, SentimentComposite, SymbolTicker } from '../../types';
import { formatPercent, formatPrice } from '../../lib/marketPresentation';
import { getTickerSparkline } from '../../lib/sparkline';
import { CoinIcon } from '../CoinIcon';
import { MiniSparkline } from '../MiniSparkline';
import { StatusBadge } from '../ui/WorkspacePrimitives';
import { buildMarketBreadth, fundingBiasLabel, liquidityLabel, sentimentBreadthOverlay } from './overviewModel';

export function OverviewMarketSummary({
  ticker,
  tickers,
  selectedSymbol,
  candles,
  feed,
  sentiment,
  onRetry,
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
  const closes = useMemo(() => candles.map((candle) => candle.close).filter(Number.isFinite).slice(-80), [candles]);
  const first = closes[0] ?? ticker?.lastPrice ?? 0;
  const last = closes.at(-1) ?? ticker?.lastPrice ?? 0;
  const periodChange = first > 0 ? ((last - first) / first) * 100 : null;
  const state = feed.loading ? 'loading' : feed.error ? 'error' : feed.stale ? 'stale' : feed.dataState === 'live' ? 'live' : feed.dataState === 'degraded' ? 'partial' : 'unavailable';
  const positive = (periodChange ?? ticker?.priceChange24hPct ?? 0) >= 0;
  const breadth = sentimentBreadthOverlay(sentiment, buildMarketBreadth(tickers));
  const volatility = ticker && ticker.lastPrice > 0 && Number.isFinite(ticker.high24h) && Number.isFinite(ticker.low24h)
    ? `${(((ticker.high24h - ticker.low24h) / ticker.lastPrice) * 100).toFixed(1)}%`
    : '—';

  return (
    <section className="apex-overview-summary apex-panel" aria-labelledby="overview-market-summary-title">
      <header className="apex-overview-section-head">
        <span className="apex-overview-section-num">2</span>
        <div>
          <h2 id="overview-market-summary-title">Market Intelligence Snapshot</h2>
          {ticker ? <small>{ticker.symbol} · {formatPrice(ticker.lastPrice)} · <span className={ticker.priceChange24hPct >= 0 ? 'positive' : 'negative'}>{formatPercent(ticker.priceChange24hPct)}</span></small> : null}
        </div>
        <StatusBadge state={state} detail={feed.error ?? undefined} />
      </header>

      {tickers.length ? (
        <div className="apex-overview-market-tiles" role="list" aria-label="Market universe">
          {tickers.slice(0, 4).map((row) => (
            <button key={row.symbol} type="button" role="listitem" className={row.symbol === selectedSymbol ? 'active' : ''} onClick={() => onSelectSymbol(row.symbol)}>
              <CoinIcon symbol={row.symbol} size={16} />
              <span><strong>{row.symbol.replace('-USDT', '')}</strong><small>{formatPrice(row.lastPrice)}</small></span>
              <em className={row.priceChange24hPct >= 0 ? 'positive' : 'negative'}>{formatPercent(row.priceChange24hPct)}</em>
              <MiniSparkline values={getTickerSparkline(row)} tone={row.priceChange24hPct >= 0 ? 'positive' : 'negative'} />
            </button>
          ))}
        </div>
      ) : null}

      {ticker ? (
        <>
          <div className="apex-overview-summary-chart-wide" role="img" aria-label={`${ticker.symbol} summary trend`}>
            {closes.length >= 2 ? <MiniSparkline values={closes} tone={positive ? 'positive' : 'negative'} /> : <div className="apex-overview-summary-empty">No verified summary series yet.</div>}
          </div>
          <dl className="apex-overview-summary-stats apex-overview-summary-stats-4">
            <div><dt>24h High / Low</dt><dd>{formatPrice(ticker.high24h)} / {formatPrice(ticker.low24h)}</dd></div>
            <div><dt>Volatility</dt><dd>{volatility}</dd></div>
            <div><dt>Liquidity Score</dt><dd>{liquidityLabel(ticker.turnover24h)}</dd></div>
            <div><dt>Funding Bias</dt><dd>{fundingBiasLabel(ticker.fundingRate)}</dd></div>
          </dl>
          <div className="apex-overview-breadth" aria-label="Market breadth">
            <span className="bullish">Bullish {breadth.bullishPct}%</span>
            <div className="apex-overview-breadth-bar">
              <i className="bullish" style={{ width: `${breadth.bullishPct}%` }} />
              <i className="neutral" style={{ width: `${breadth.neutralPct}%` }} />
              <i className="bearish" style={{ width: `${breadth.bearishPct}%` }} />
            </div>
            <span className="bearish">Bearish {breadth.bearishPct}%</span>
          </div>
        </>
      ) : (
        <div className="apex-overview-summary-empty">No verified market is available.</div>
      )}

      <footer>
        {feed.error && <button type="button" className="apex-secondary-button" onClick={onRetry}><RefreshCw size={14} /> Retry</button>}
        <button type="button" className="apex-primary-button" onClick={onOpenTrading} disabled={!ticker}>Open Trading <ArrowRight size={14} /></button>
      </footer>
    </section>
  );
}
