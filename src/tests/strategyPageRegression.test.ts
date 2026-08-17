import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { StrategyDefinition } from '../types';
import { StrategyPage } from '../pages/strategies/StrategyPage';
import { evidenceComparable, strategyDisplayStatus } from '../pages/strategies/strategyPresentation';

function strategy(overrides: Partial<StrategyDefinition> = {}): StrategyDefinition {
  return {
    strategyId: 'strategy-a',
    version: 1,
    name: 'Strategy A',
    summary: 'Fixture strategy',
    evidenceTier: ['C'],
    wave: 'wave1-mvp',
    status: 'candidate',
    longShort: 'BOTH',
    supportedIntervals: ['1h'],
    dataRequirements: ['OHLCV'],
    engine: 'bespoke',
    regimeRules: [],
    setupRules: [],
    triggerRules: [],
    riskRules: [],
    exitRules: [],
    noTradeRules: [],
    parameters: [],
    sourceReferences: [],
    knownFailureModes: [],
    categories: [],
    componentCount: 1,
    ...overrides,
  } as StrategyDefinition;
}

describe('active Strategy Studio route regression', () => {
  it('renders the routed page and preserves the Backtesting handoff contract', () => {
    const html = renderToStaticMarkup(React.createElement(StrategyPage));
    expect(html).toContain('View Details');
    expect(html).toContain('Send to Backtesting');
    expect(html).not.toMatch(/>\s*Run(?: [^<]*)? Backtest(?:ing)?\s*</);
  });

  it('renders the live futures symbol universe when supplied by the application shell', () => {
    const props: NonNullable<Parameters<typeof StrategyPage>[0]> = {
      tickers: [{
        symbol: 'DOGE-USDT',
        lastPrice: 0.2,
        turnover24h: 10_000_000,
        priceChange24hPct: 1,
        volume24h: 50_000_000,
        high24h: 0.21,
        low24h: 0.19,
        fundingRate: 0.0001,
        openInterest: 5_000_000,
        dataState: 'live',
        timestamp: 1,
      }],
      selectedSymbol: 'DOGE-USDT',
    };
    const html = renderToStaticMarkup(React.createElement<NonNullable<Parameters<typeof StrategyPage>[0]>>(StrategyPage, props));
    expect(html).toContain('DOGE-USDT');
  });

  it('maps evidence state to truthful visible labels', () => {
    expect(strategyDisplayStatus(strategy())).toBe('Candidate');
    expect(strategyDisplayStatus(strategy({ status: 'validated' }))).toBe('Evidence Pending');
    expect(strategyDisplayStatus(strategy({ status: 'blocked' }))).toBe('Blocked');
  });

  it('returns an explicit not-comparable state when evidence is missing', () => {
    const comparison = evidenceComparable([strategy(), strategy({ strategyId: 'strategy-b' })]);
    expect(comparison.comparable).toBe(false);
    expect(comparison.reason).toContain('bound evidence');
  });
});
