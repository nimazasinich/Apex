import { describe, expect, it } from 'vitest';
import { runApexProductionInputReplay, runApexReplayBacktestDirectional } from '../src/services/backtesting';
import { DEFAULT_SCANNER_CONFIG } from '../src/services/apexNextMarketRoutes';

function candles(count = 140) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 - index * 0.08 + Math.sin(index / 5) * 0.3;
    return {
      time: new Date(1_700_000_000_000 + index * 60 * 60_000).toISOString(),
      open: close + 0.05,
      high: close + 0.4,
      low: close - 0.4,
      close,
      volume: 1_000 + index * 4,
    };
  });
}

describe('canonical replay integration', () => {
  it('keeps proxy replay explicitly labelled and routed through canonical v2', () => {
    const result = runApexReplayBacktestDirectional(candles(), {
      symbol: 'BTC-USDT',
      interval: '1h',
      scannerConfig: DEFAULT_SCANNER_CONFIG,
      direction: 'SHORT',
    });
    expect(result.summary.replayMode).toBe('PROXY_REPLAY');
    expect(result.summary.strategy).toBe('PROXY_REPLAY');
    expect(result.summary.engineVersion).toBe('canonical_v2');
    expect(result.summary.tradePlanRejectedCandidates).toBeDefined();
    expect(result.summary.riskRejectedCandidates).toBeDefined();
  });

  it('rejects production bars with missing critical recorded inputs', () => {
    const rows = candles();
    const result = runApexProductionInputReplay({ candles: rows, inputs: [] }, {
      symbol: 'BTC-USDT',
      interval: '1h',
      scannerConfig: DEFAULT_SCANNER_CONFIG,
      direction: 'SHORT',
    });
    expect(result.summary.replayMode).toBe('PRODUCTION_INPUT');
    expect(result.summary.productionAlignedBars).toBe(0);
    expect(result.summary.downgradedBars).toBeGreaterThan(0);
    expect(result.summary.acceptedCandidates).toBe(0);
  });
});
