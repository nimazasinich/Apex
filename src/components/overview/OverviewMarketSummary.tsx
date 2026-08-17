import React, { useMemo } from 'react';
import { ArrowRight, CandlestickChart, RefreshCw } from 'lucide-react';
import type { Candle, ChartFeedStatus, SymbolTicker } from '../../types';
import { formatPercent, formatPrice } from '../../lib/marketPresentation';
import { MiniSparkline } from '../MiniSparkline';
import { StatusBadge } from '../ui/WorkspacePrimitives';

export function OverviewMarketSummary({
  ticker,
  candles,
  feed,
  onRetry,
  onOpenTrading,
}: {
  ticker: SymbolTicker | null;
  candles: Candle[];
  feed: ChartFeedStatus;
  onRetry: () => void;
  onOpenTrading: () => void;
}) {
  const closes = useMemo(() => candles.map((candle) => candle.close).filter(Number.isFinite).slice(-80), [candles]);
  const first = closes[0] ?? ticker?.lastPrice ?? 0;
  const last = closes.at(-1) ?? ticker?.lastPrice ?? 0;
  const periodChange = first > 0 ? ((last - first) / first) * 100 : null;
  const state = feed.loading ? 'loading' : feed.error ? 'error' : feed.stale ? 'stale' : feed.dataState === 'live' ? 'live' : feed.dataState === 'degraded' ? 'partial' : 'unavailable';
  const positive = (periodChange ?? ticker?.priceChange24hPct ?? 0) >= 0;

  return (
    <section className="apex-overview-summary apex-panel" aria-labelledby="overview-market-summary-title">
      <header>
        <div>
          <span className="apex-eyebrow">Selected market</span>
          <h2 id="overview-market-summary-title"><CandlestickChart size={18} /> {ticker?.symbol ?? 'No market selected'}</h2>
          <p>{feed.source ? `${feed.source} · ${feed.ageMs >= 1000 ? `${Math.round(feed.ageMs / 1000)}s old` : 'current observation'}` : 'Waiting for a verified market feed'}</p>
        </div>
        <StatusBadge state={state} detail={feed.error ?? undefined} />
      </header>

      {ticker ? (
        <div className="apex-overview-summary-body">
          <div className="apex-overview-summary-price">
            <strong>{formatPrice(ticker.lastPrice)}</strong>
            <span className={ticker.priceChange24hPct >= 0 ? 'positive' : 'negative'}>{formatPercent(ticker.priceChange24hPct)} 24h</span>
            <small>{periodChange == null ? 'Summary window unavailable' : `${periodChange > 0 ? '+' : ''}${periodChange.toFixed(2)}% across ${closes.length} verified closes`}</small>
          </div>
          <div className="apex-overview-summary-chart" role="img" aria-label={`${ticker.symbol} summary trend using ${closes.length} candle closes. Current price ${formatPrice(ticker.lastPrice)}.`}>
            {closes.length >= 2 ? <MiniSparkline values={closes} tone={positive ? 'positive' : 'negative'} /> : <div className="apex-overview-summary-empty">No verified summary series yet.</div>}
          </div>
          <dl>
            <div><dt>24h high</dt><dd>{formatPrice(ticker.high24h)}</dd></div>
            <div><dt>24h low</dt><dd>{formatPrice(ticker.low24h)}</dd></div>
            <div><dt>Turnover</dt><dd>{new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(ticker.turnover24h)} USDT</dd></div>
          </dl>
        </div>
      ) : (
        <div className="apex-overview-summary-empty">No verified market is available.</div>
      )}

      <footer>
        {feed.error && <button type="button" className="apex-secondary-button" onClick={onRetry}><RefreshCw size={14} /> Retry market feed</button>}
        <button type="button" className="apex-primary-button" onClick={onOpenTrading} disabled={!ticker}>Open Trading <ArrowRight size={15} /></button>
      </footer>
    </section>
  );
}
