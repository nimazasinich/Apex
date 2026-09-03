import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BacktestResult } from '../types';
import { BacktestMetricStrip } from '../pages/backtesting/BacktestMetricStrip';
import { BacktestRunBuilder } from '../pages/backtesting/BacktestRunBuilder';
import { BacktestRuntimePanel } from '../pages/backtesting/BacktestRuntimePanel';
import type { BacktestStrategyPreset } from '../pages/backtesting/backtestingTypes';

const strategy: BacktestStrategyPreset = {
  id: 'baseline',
  name: 'Baseline',
  tags: [],
  description: 'Fixture',
  supportedIntervals: ['1h'],
  dataTier: 'Standard',
  allowedDirections: ['LONG', 'SHORT'],
  parameters: [],
};

const result = {
  symbol: 'BTC-USDT', direction: 'LONG', interval: '1h', candlesUsed: 500,
  simulatedScans: 10, flaggedSignals: 3, acceptedCandidates: 2, rejectedCandidates: 1,
  rejectionCounts: {}, historicalWinRatePct: 50, avgRMultipleRealized: 0.25,
  totalPnlPct: 4.2, maxDrawdownPct: 1.5, profitFactor: 1.4,
  timeline: [], dataState: 'live',
} as BacktestResult;

describe('active Backtesting route regression', () => {
  it('shows an explicit cancel action while the server request is owned by the page', () => {
    const html = renderToStaticMarkup(React.createElement(BacktestRunBuilder, {
      studioMode: 'smart',
      smartCheckpoint: null, smartRunning: false, smartStopping: false, smartResumable: false,
      smartPhaseLabel: 'Idle', onSmartStart: () => undefined, onSmartStop: () => undefined, onSmartResume: () => undefined,
      strategies: [strategy], strategy, strategyId: strategy.id, onStrategyChange: () => undefined,
      marketOptions: [], symbol: 'BTC-USDT', onSymbolChange: () => undefined,
      direction: 'LONG', onDirectionChange: () => undefined,
      interval: '1h', supportedIntervals: ['1h'], intervalOptions: ['1h'], onIntervalChange: () => undefined,
      bars: 500, barOptions: [500], onBarsChange: () => undefined,
      maxHoldBars: 24, holdOptions: [24], onMaxHoldBarsChange: () => undefined,
      dateRangeLabel: '500 closed candles', onCycleDateRange: () => undefined,
      capital: 10_000, onCapitalChange: () => undefined,
      riskProfile: 'balanced', riskProfiles: [{ id: 'balanced', label: 'Balanced', riskPct: 1 }], onRiskProfileChange: () => undefined,
      commissionPct: 0.04, slippagePct: 0.05, fundingPct: 0.01,
      parameters: {}, onParameterChange: () => undefined,
      onCommissionChange: () => undefined, onSlippageChange: () => undefined, onFundingChange: () => undefined,
      loading: true, stale: false, result: null, error: null, cancelled: false, elapsedMs: 1200,
      routeDataState: 'live', onRun: () => undefined, onCancel: () => undefined,
      presets: [], suggestedPresetName: 'Preset 1',
      onSavePreset: () => undefined, onApplyPreset: () => undefined,
      onDeletePreset: () => undefined, onReset: () => undefined,
    }));
    expect(html).toContain('Cancel Run');
    expect(html).toContain('server does not provide progress counts');
  });

  it('renders canonical and local metric provenance as separate surfaces', () => {
    const html = renderToStaticMarkup(React.createElement(BacktestMetricStrip, {
      result, localFinalBalance: 10_098, startingCapital: 10_000, localRiskPct: 1,
    }));
    expect(html).toContain('Canonical server metrics');
    expect(html).toContain('Local display calculation');
    expect(html).toContain('not a canonical engine metric');
  });

  it('surfaces replay cache evidence without presenting it as engine progress', () => {
    const withRuntime = {
      ...result,
      runtime: { totalMs: 120, historyFetchMs: 40, replayMs: 70, tickerLookupMs: 1, tickerLookupState: 'skipped' as const, replayCache: 'HIT' as const },
    };
    const html = renderToStaticMarkup(React.createElement(BacktestRuntimePanel, { result: withRuntime, observedTotalMs: 125 }));
    expect(html).toContain('Replay cache');
    expect(html).toContain('HIT');
  });

});
