import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TabdealCapabilityMatrix } from '../components/account/TabdealAccountSurface';
import { MoversDrawer, WatchlistDrawer } from '../components/workspace/ToolboxDrawers';
import { isVerifiedLiveEligibility } from '../lib/capabilityStatus';
import { toggleWatchlistFavorite } from '../lib/watchlistFavorites';
import { buildAcademyIntelligence, formatAcademyMetric } from '../pages/academy/academyIntelligence';
import { strategyDefinitions } from '../services/strategyRegistry';
import { saveTelegramPrefs } from '../services/telegram';
import type { SymbolTicker } from '../types';

afterEach(() => vi.unstubAllGlobals());

function ticker(overrides: Partial<SymbolTicker> = {}): SymbolTicker {
  return {
    symbol: 'BTC-USDT', lastPrice: 100, turnover24h: 1_000, priceChange24hPct: 1,
    volume24h: 10, high24h: 105, low24h: 95, fundingRate: 0, openInterest: 1_000,
    dataState: 'live', timestamp: Date.now(), ...overrides,
  };
}

describe('remediation truthfulness contracts', () => {
  it('grants LIVE only with authority, live state, and a current observation', () => {
    const now = 10_000;
    expect(isVerifiedLiveEligibility({ dataState: 'live', observedAt: 9_500, authorityVerified: true, now, maxAgeMs: 1_000 })).toBe(true);
    expect(isVerifiedLiveEligibility({ dataState: 'live', observedAt: 9_500, authorityVerified: false, now, maxAgeMs: 1_000 })).toBe(false);
    expect(isVerifiedLiveEligibility({ dataState: 'degraded', observedAt: 9_500, authorityVerified: true, now, maxAgeMs: 1_000 })).toBe(false);
    expect(isVerifiedLiveEligibility({ dataState: 'live', observedAt: 8_000, authorityVerified: true, now, maxAgeMs: 1_000 })).toBe(false);
    expect(isVerifiedLiveEligibility({ dataState: 'live', observedAt: null, authorityVerified: true, now, maxAgeMs: 1_000 })).toBe(false);
  });

  it('renders unavailable sentiment without inventing a neutral score', () => {
    const markup = renderToStaticMarkup(<MoversDrawer tickers={[ticker()]} sentiment={null} onClose={() => undefined} />);
    expect(markup).toContain('Sentiment unavailable — no neutral score is synthesized.');
    expect(markup).not.toContain('Market Mood</span><small>Real-time market intelligence</small></div><svg');
    expect(markup).not.toContain('>50<');
  });

  it('does not label a stale watchlist LIVE', () => {
    const stale = ticker({ timestamp: Date.now() - 600_000 });
    const markup = renderToStaticMarkup(<WatchlistDrawer tickers={[stale]} selectedSymbol={stale.symbol} onSelectSymbol={() => undefined} onClose={() => undefined} />);
    expect(markup).toContain('UNAVAILABLE');
    expect(markup).not.toContain('apex-live-badge">LIVE');
  });

  it('keeps Academy metrics and gates unavailable when no evidence snapshot exists', () => {
    const intelligence = buildAcademyIntelligence({ ...strategyDefinitions[0], latestSnapshot: undefined });
    expect(intelligence.metrics.every((metric) => metric.value === null && formatAcademyMetric(metric) === 'Unavailable')).toBe(true);
    expect(intelligence.gates.every((gate) => gate.state === 'unmeasured')).toBe(true);
    expect(intelligence.outOfSample.state).toBe('unmeasured');
    expect(intelligence.cost.state).toBe('unmeasured');
    expect(intelligence.regime.state).toBe('unmeasured');
    expect(intelligence.statistical.state).toBe('unmeasured');
    expect(intelligence.rankScore).toBeNull();
  });

  it('surfaces browser persistence failure to watchlist and Telegram callers', () => {
    vi.stubGlobal('window', {
      localStorage: { setItem: () => { throw new Error('quota'); } },
      dispatchEvent: () => true,
    });
    expect(toggleWatchlistFavorite(new Set(), 'BTC-USDT')).toMatchObject({ persisted: false });
    expect(saveTelegramPrefs({ candidate: false, confirmed: true, expired: true, tpHit: true, slHit: true, dataDegraded: false })).toBe(false);
  });

  it('uses one Tabdeal capability matrix for every account surface', () => {
    const markup = renderToStaticMarkup(<TabdealCapabilityMatrix />);
    expect(markup.match(/NOT_SUPPORTED_BY_VENUE/g)).toHaveLength(2);
    expect(markup).toContain('READ_ONLY');
  });
});
