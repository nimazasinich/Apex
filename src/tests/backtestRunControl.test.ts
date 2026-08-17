import { describe, expect, it } from 'vitest';
import { buildBacktestConfigKey, buildBacktestQuery, LatestRequestGate } from '../pages/backtesting/backtestRunControl';

describe('Backtesting request ownership', () => {
  it('invalidates an older request when a newer request starts', () => {
    const gate = new LatestRequestGate();
    const first = gate.begin('first');
    const second = gate.begin('second');
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
    expect(gate.isCurrent(second, 'first')).toBe(false);
    expect(gate.isCurrent(second, 'second')).toBe(true);
    gate.invalidate();
    expect(gate.isCurrent(second)).toBe(false);
  });

  it('serializes the exact Strategy Studio handoff parameters', () => {
    const query = buildBacktestQuery({
      configKey: 'fixture',
      strategyId: 'momentum-v1',
      symbol: 'BTC-USDT',
      direction: 'SHORT',
      interval: '1h',
      bars: 1200,
      maxHoldBars: 30,
      commissionPct: 0.04,
      slippagePct: 0.02,
      fundingPct: 0.01,
      parameters: { lookback: 24, mode: 'strict' },
    });
    expect(query.get('strategy')).toBe('momentum-v1');
    expect(query.get('direction')).toBe('SHORT');
    expect(query.get('parameters')).toBe(JSON.stringify({ lookback: 24, mode: 'strict' }));
  });

  it('treats costs and handoff parameters as part of stale-result identity', () => {
    const base = {
      strategyId: 'momentum-v1',
      symbol: 'BTC-USDT',
      direction: 'LONG' as const,
      interval: '1h',
      bars: 1200,
      maxHoldBars: 30,
      commissionPct: 0.04,
      slippagePct: 0.02,
      fundingPct: 0.01,
      parameters: { mode: 'strict', lookback: 24 },
    };
    const first = buildBacktestConfigKey(base);
    expect(buildBacktestConfigKey({ ...base, parameters: { lookback: 24, mode: 'strict' } })).toBe(first);
    expect(buildBacktestConfigKey({ ...base, commissionPct: 0.05 })).not.toBe(first);
    expect(buildBacktestConfigKey({ ...base, parameters: { lookback: 30, mode: 'strict' } })).not.toBe(first);
  });
});
