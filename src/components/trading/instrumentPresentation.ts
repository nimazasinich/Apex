import type { ChartFeedStatus } from '../../types';

/** The candle feed is backed by USD-M/KuCoin Futures endpoints in this app. */
export function instrumentMarketLabel(feed: ChartFeedStatus | null | undefined): string {
  const source = (feed?.source || '').toLowerCase();
  if (source.includes('kucoin')) return 'KuCoin futures';
  if (source.includes('binance')) return 'Binance USD-M futures';
  return 'Market venue · unreported';
}
