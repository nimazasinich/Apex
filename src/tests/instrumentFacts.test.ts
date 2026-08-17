import { describe, expect, it } from 'vitest';
import { instrumentMarketLabel } from '../components/trading/instrumentPresentation';

describe('truthful instrument identity', () => {
  it('identifies known futures venues from the feed source', () => {
    expect(instrumentMarketLabel({ loading: false, dataState: 'live', source: 'KuCoin Futures', stale: false, ageMs: 0, error: null })).toBe('KuCoin futures');
    expect(instrumentMarketLabel({ loading: false, dataState: 'live', source: 'Binance USD-M', stale: false, ageMs: 0, error: null })).toBe('Binance USD-M futures');
  });

  it('does not invent a venue when the source is unreported', () => {
    expect(instrumentMarketLabel(undefined)).toBe('Market venue · unreported');
  });
});
