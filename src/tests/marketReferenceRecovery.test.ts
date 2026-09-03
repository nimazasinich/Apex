import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routes = readFileSync(new URL('../services/apexNextMarketRoutes.ts', import.meta.url), 'utf8');
const reference = readFileSync(new URL('../services/marketReferenceService.ts', import.meta.url), 'utf8');
const systemHealthTelemetry = readFileSync(new URL('../services/systemHealthTelemetry.ts', import.meta.url), 'utf8');

// Regression contract for the outage shown in the attached screenshot:
// /api/market/symbol/BTC-USDT must not return 503 merely because the canonical
// Futures transport is temporarily unreachable while a real public reference
// price history is still available.
describe('market reference recovery boundary', () => {
  it('returns reference-only symbol detail as HTTP 200 while blocking decisions', () => {
    expect(routes).toContain("getReferenceCandles(symbol, intervalKey, limit, 'interactive')");
    expect(routes).toContain('referenceOnly: true');
    expect(routes).toContain('decisionEligible: false');
    expect(routes).toContain("decisionBlockedReason: 'futures_market_evidence_unavailable'");
    expect(routes).toContain('scoreLong: null');
    expect(routes).toContain('tradePlanLong: null');
  });

  it('keeps top-volume bootstrap inside the browser timeout using a bounded futures-first window', () => {
    expect(routes).toContain('settleWithin(futuresPromise, 6_500)');
    expect(routes).toContain("reason: sorted.length ? 'futures_unavailable_public_reference_only'");
  });

  it('uses only real public provider observations for display fallback', () => {
    expect(reference).toContain('https://api.coingecko.com/api/v3');
    expect(reference).toContain('https://api.coincap.io/v2');
    expect(reference).toContain('https://api.coinpaprika.com/v1');
    expect(reference).toContain('https://api.binance.com');
    expect(reference).not.toContain('Math.random');
  });

  it('does not mislabel public Binance as NOT SET when another market route wins', () => {
    expect(routes).toContain('marketDataService.probePrimaryProviderHealth()');
    expect(routes).toContain('buildSystemHealthPayload({ primary,');
    expect(systemHealthTelemetry).toContain('binanceStatus: primary.binance.status');
  });
});
