import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OverviewProviderHealthPanel } from '../components/overview/OverviewProviderHealthPanel';
import type { OperationsProviderRow } from '../services/operationsStatus';
import type { SystemHealthReport } from '../types';

const provider = (name: string, changes: Partial<OperationsProviderRow> = {}): OperationsProviderRow => ({
  name, category: 'onchain', status: 'HEALTHY', isConfigured: true, isHealthy: true,
  failureCount: 0, lastCheckTime: null, lastSuccessTime: null, rateLimitedUntil: null, reason: null, reasonCode: 'HEALTHY', ...changes,
});
describe('Overview provider presentation', () => {
  it('renders distinct semantic status classes and five aligned column roles', () => {
    const markup = renderToStaticMarkup(React.createElement(OverviewProviderHealthPanel, { loading: false, health: null, providers: [
      provider('Healthy explorer'),
      provider('Rate limited', { status: 'RATE_LIMITED', isHealthy: false }),
      provider('Schema failure', { status: 'UNHEALTHY', isHealthy: false, reasonCode: 'SCHEMA_INVALID' }),
      provider('Missing key', { isConfigured: false, isHealthy: false }),
    ] }));
    for (const state of ['ok', 'degraded', 'schema', 'not-set']) expect(markup).toContain(`class="status-${state}"`);
    expect(markup.match(/role="columnheader"/g)).toHaveLength(5);
    expect(markup).toContain('>SCHEMA</b>');
  });
  it('does not silently discard configured providers beyond the first six', () => {
    const providers = Array.from({ length: 9 }, (_, index) => provider(`Explorer ${index}`));
    const markup = renderToStaticMarkup(React.createElement(OverviewProviderHealthPanel, { loading: false, health: null, providers }));
    providers.forEach(row => expect(markup).toContain(row.name));
    expect(markup).toContain('tabindex="0"');
  });
  it('renders every runtime capability state with observation provenance', () => {
    const health: SystemHealthReport = {
      kucoinStatus: 'live', binanceStatus: 'degraded', sentimentStatus: 'not_configured',
      cacheHitRatePct: null, cacheTotalQueries: null, cacheHits: null, uptimeSeconds: 1,
      lastErrorLog: [], activeCandidateCount: null, lastScanTimestamp: null,
      providerCapabilities: [{
        provider: 'tabdeal',
        capabilities: {
          connectivity: { state: 'OK', observedAt: Date.now(), reason: null },
          orders: { state: 'DEGRADED', observedAt: Date.now(), reason: 'partial' },
          positions: { state: 'FAIL', observedAt: Date.now(), reason: 'upstream' },
          accountSnapshot: { state: 'NOT_CONFIGURED', observedAt: null, reason: 'missing key' },
          funding: { state: 'NEVER_PROBED', observedAt: null, reason: 'not probed' },
          historicalKlines: { state: 'NOT_SUPPORTED', observedAt: null, reason: 'venue limitation' },
        },
      }],
    };
    const markup = renderToStaticMarkup(React.createElement(OverviewProviderHealthPanel, { loading: false, health, providers: [] }));
    for (const state of ['OK', 'DEGRADED', 'FAIL', 'NOT_CONFIGURED', 'NEVER_PROBED', 'NOT_SUPPORTED']) expect(markup).toContain(`>${state}</b>`);
    expect(markup).toContain('Tabdeal · Historical Klines');
    expect(markup).toContain('venue limitation');
  });

  it('shows the provider actually selected for the dashboard and retained-probe errors truthfully', () => {
    const observedAt = Date.now() - 2_000;
    const health: SystemHealthReport = {
      checkedAt: observedAt,
      kucoinStatus: 'live', binanceStatus: 'live', sentimentStatus: 'not_configured',
      cacheHitRatePct: null, cacheTotalQueries: null, cacheHits: null, uptimeSeconds: 1,
      lastErrorLog: [], activeCandidateCount: null, lastScanTimestamp: null,
    };
    const markup = renderToStaticMarkup(React.createElement(OverviewProviderHealthPanel, {
      loading: false,
      health,
      providers: [],
      activeMarketSource: 'binance',
      marketDataState: 'live',
      marketObservedAt: observedAt,
      healthError: 'probe timeout',
    }));
    expect(markup).toContain('Active universe · Binance');
    expect(markup).toContain('Actual dashboard feed');
    expect(markup).toContain('Independent live probe');
    expect(markup).toContain('Latest provider refresh failed');
    expect(markup).toContain('probe timeout');
    expect(markup).not.toContain('checkAge:now');
  });
});
