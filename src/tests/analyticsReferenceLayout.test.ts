import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const analytics = readFileSync(new URL('../pages/analytics/AnalyticsCommandPage.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../pages/analytics/AnalyticsPage.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

describe('Analytics attached-reference layout lock', () => {
  it('keeps the regime artwork inline and large at canonical desktop density', () => {
    expect(analytics).toContain("'/analytics/trend-bullish.png'");
    expect(analytics).toContain("'/analytics/trend-bearish.png'");
    expect(css).toContain('.analytics-trend-icon.is-bullish img');
  });

  it('locks the canonical command-centre geometry to the supplied reference proportions', () => {
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 330px !important');
    expect(css).toContain('grid-template-rows: 190px 155px 65px 156px !important');
    expect(css).toContain('grid-template-rows: 211px 268px !important');
    expect(css).toContain('grid-template-columns: .94fr 1.22fr !important');
  });

  it('feeds verified selected-symbol candles into Analytics rather than requiring ticker sparklines', () => {
    expect(app).toContain('candles: chartCandles');
    expect(app).toContain('chartFeed,');
    expect(analytics).toContain("const candleSpark = (market.candles || []).slice(-90)");
  });

  it('uses real runtime diagnostics and strategy evidence for the dense right rail and strategy table', () => {
    expect(analytics).toContain('useOverviewDiagnostics(true)');
    expect(analytics).toContain("read('/api/strategies')");
    expect(analytics).toContain("read('/api/strategies/autopilot/status')");
    expect(analytics).toContain("name: 'Binance'");
    expect(analytics).toContain("providerFromOps('On-chain / Whale'");
  });
});
