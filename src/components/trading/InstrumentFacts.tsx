import React from 'react';
import type { ChartFeedStatus, OrderBook, SymbolTicker, UiDataState } from '../../types';
import { formatCompactNumber, formatPercent, formatPrice } from '../../lib/marketPresentation';
import { CoinIcon } from '../CoinIcon';
import { StatusBadge } from '../ui/WorkspacePrimitives';
import { instrumentMarketLabel } from './instrumentPresentation';

type InstrumentFactsProps = {
  ticker: SymbolTicker | null;
  symbol: string;
  feed: ChartFeedStatus;
  orderBook: OrderBook | null | undefined;
  tradingMode?: string;
  strategySummary?: string | null;
};

function relativeAge(timestamp: number | null | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) return 'Age unavailable';
  const ageMs = Math.max(0, Date.now() - timestamp);
  if (ageMs < 1_000) return 'Updated now';
  if (ageMs < 60_000) return `Updated ${Math.floor(ageMs / 1_000)}s ago`;
  if (ageMs < 3_600_000) return `Updated ${Math.floor(ageMs / 60_000)}m ago`;
  return `Updated ${Math.floor(ageMs / 3_600_000)}h ago`;
}

function fundingLabel(ticker: SymbolTicker | null): string {
  if (!ticker || !Number.isFinite(ticker.fundingRate)) return 'Not reported';
  if (ticker.fundingQuality === 'MISSING' || ticker.fundingQuality === 'UNAVAILABLE' || ticker.fundingQuality === 'INSUFFICIENT_HISTORY') {
    return 'Not reported';
  }
  const suffix = ticker.fundingQuality === 'ESTIMATED' ? ' est.' : ticker.fundingQuality === 'STALE' ? ' stale' : '';
  return `${formatPercent(ticker.fundingRate * 100, 4)}${suffix}`;
}

function changeLabel(ticker: SymbolTicker | null): string {
  if (!ticker) return '—';
  const pct = ticker.priceChange24hPct ?? 0;
  const delta = ticker.lastPrice * (pct / 100);
  const sign = delta > 0 ? '+' : '';
  return `${sign}${formatPrice(delta)} (${formatPercent(pct)})`;
}

function openInterestLabel(ticker: SymbolTicker | null): string {
  if (!ticker || !Number.isFinite(ticker.openInterest)) return '—';
  return formatCompactNumber(ticker.openInterest, 'USDT');
}

function dataState(feed: ChartFeedStatus, ticker: SymbolTicker | null): UiDataState {
  if (feed.loading) return 'loading';
  if (feed.error) return 'error';
  if (feed.stale) return 'stale';
  if (ticker?.dataState === 'live') return 'live';
  if (ticker?.dataState === 'degraded') return 'partial';
  return 'unavailable';
}

export function InstrumentFacts({ ticker, symbol, feed, orderBook, tradingMode = 'Read only', strategySummary = null }: InstrumentFactsProps) {
  const sourceLabel = feed.source ? feed.source.replace(/[_-]/g, ' ') : 'Source unreported';
  const state = dataState(feed, ticker);
  const instrumentSymbol = ticker?.symbol || symbol || 'No symbol selected';
  const [baseAsset = instrumentSymbol, quoteAsset = 'USDT'] = instrumentSymbol.split('-');
  const connectionLabel = feed.error ? 'Issue' : feed.stale ? 'Stale' : feed.loading ? 'Loading' : 'Stable';
  const quoteLabel = instrumentMarketLabel(feed);
  const sourceIsLabPreview = /lab preview/i.test(sourceLabel);

  return (
    <section className="apex-panel apex-instrument-facts" aria-label="Selected instrument facts">
      <div className="apex-instrument-identity">
        <CoinIcon symbol={instrumentSymbol} size={40} />
        <div>
          <strong>{baseAsset}{quoteAsset ? quoteAsset.replace(/^USDT$/, 'USDT') : ''}</strong>
          <span>Perpetual · {quoteAsset}</span>
          <small>{sourceIsLabPreview ? 'LAB PREVIEW' : `${quoteLabel} · ${sourceLabel}`}</small>
        </div>
      </div>

      <div className="apex-instrument-price-cluster">
        <strong>{ticker ? formatPrice(ticker.lastPrice) : '—'}</strong>
        <small>{ticker ? `≈ ${formatPrice(ticker.lastPrice)} · ${relativeAge(ticker.timestamp)}` : 'Waiting for a market update'}</small>
      </div>

      <dl className="apex-instrument-metrics">
        <div><dt>24h change</dt><dd className={(ticker?.priceChange24hPct ?? 0) >= 0 ? 'positive' : 'negative'}>{changeLabel(ticker)}</dd></div>
        <div><dt>24h high</dt><dd>{ticker ? formatPrice(ticker.high24h) : '—'}</dd></div>
        <div><dt>24h low</dt><dd>{ticker ? formatPrice(ticker.low24h) : '—'}</dd></div>
        <div><dt>24h volume</dt><dd>{ticker ? formatCompactNumber(ticker.turnover24h, 'USDT') : '—'}</dd></div>
        <div><dt>Funding / update</dt><dd>{fundingLabel(ticker)} · {relativeAge(ticker?.timestamp).replace('Updated ', '')}</dd></div>
        <div><dt>Feed</dt><dd title={`Open interest ${openInterestLabel(ticker)}`}>{Number.isFinite(feed.ageMs) ? `${Math.max(0, Math.round(feed.ageMs))} ms` : '—'}</dd></div>
        <div><dt>Connection</dt><dd className={feed.error || feed.stale ? 'negative' : feed.loading ? 'neutral' : 'positive'}>{connectionLabel}</dd></div>
        <div><dt>Mode</dt><dd>{tradingMode}</dd></div>
      </dl>

      <div className="apex-active-strategy-summary" aria-label="Active strategy context">
        <div className="apex-active-strategy-head">
          <span>Active Strategy</span>
          <StatusBadge state={state} label={strategySummary ? 'RUNNING' : state.toUpperCase()} detail={feed.error || undefined} />
        </div>
        <strong title={strategySummary || 'No strategy context selected'}>{strategySummary || 'No active strategy'}</strong>
        <small>{strategySummary ? 'Trading context attached' : 'Select a strategy to attach context'}</small>
      </div>
    </section>
  );
}
