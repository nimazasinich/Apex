import { describe, expect, it } from 'vitest';
import { runRegimeRoutedComposite } from '../services/strategyEngine/regimeRoutedComposite';
import type { BacktestCandle } from '../services/backtesting';

function market(count = 720): BacktestCandle[] {
  let price = 100;
  return Array.from({ length: count }, (_, index) => {
    const regime = Math.floor(index / 120) % 4;
    const drift = regime === 0 ? 0.0015 : regime === 1 ? 0.00005 : regime === 2 ? -0.0012 : 0.0007;
    const pulse = regime === 2 && index % 24 === 0 ? -0.018 : Math.sin(index / 8) * 0.0012;
    const open = price;
    price = Math.max(1, price * (1 + drift + pulse));
    return {
      time: new Date(1_700_000_000_000 + index * 900_000).toISOString(),
      open,
      high: Math.max(open, price) * (1.002 + Math.abs(pulse)),
      low: Math.min(open, price) * (0.998 - Math.min(0.001, Math.abs(pulse) / 4)),
      close: price,
      volume: 1_000 * (regime === 2 ? 2.1 : regime === 1 ? 0.65 : 1.15) + index,
    };
  });
}

describe('causal regime-routed core strategy', () => {
  it('is deterministic and records the routing contract', () => {
    const input = {
      symbol: 'BTC-USDT', interval: '15m' as const, direction: 'BOTH' as const, maxBars: 48, candles: market(), parameters: {},
      transactionCostModel: { feePct: 0.08, spreadPct: 0.05, fundingRate: 0.0001, fundingIntervalBars: 8 },
    };
    const first = runRegimeRoutedComposite(input);
    const second = runRegimeRoutedComposite(input);
    expect(first).toEqual(second);
    expect(first.summary.strategy).toBe('regime-routed-ai-ensemble-v1');
    expect(first.summary.replayMode).toBe('CAUSAL_BLOCK_REGIME_ROUTER');
    expect(first.summary.configOverrides?.some((row) => row.field === 'router.routes')).toBe(true);
  });
});
