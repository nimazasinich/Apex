import { describe, expect, it } from 'vitest';
import type { BacktestCandle } from '../services/backtesting';
import { runAdaptiveTrendPortfolio } from '../services/strategyEngine/adaptiveTrendPortfolio';
import { finalizeReplay } from '../services/strategyEngine/replayHarness';
import { runOrbVwapBreakout } from '../services/strategyEngine/orbVwapBreakout';
import { runVolatilitySqueezeExpansion } from '../services/strategyEngine/volatilitySqueezeExpansion';
import { runVwapPullbackReacceleration } from '../services/strategyEngine/vwapPullbackReacceleration';
import { baselineStrategyDefinition, getStrategyDefinition, strategyExecutionCapability, strategyValidationCapability } from '../services/strategyRegistry';
import { buildStrategyParameterValues, validateStrategyParameterValues } from '../services/strategyParameters';

const costModel = { feePct: 0.08, spreadPct: 0.05, fundingRate: 0, fundingIntervalBars: 8 };

function candles(args: { count?: number; start?: number; stepPct?: number; shiftMs?: number }): BacktestCandle[] {
  const count = args.count ?? 280;
  const start = args.start ?? 100;
  const stepPct = args.stepPct ?? 0.002;
  const shiftMs = args.shiftMs ?? 0;
  let close = start;
  return Array.from({ length: count }, (_, index) => {
    const open = close;
    close = open * (1 + stepPct);
    const pad = Math.max(0.25, close * 0.003);
    return {
      time: new Date(Date.UTC(2026, 0, 1) + index * 3_600_000 + shiftMs).toISOString(),
      open,
      high: Math.max(open, close) + pad,
      low: Math.min(open, close) - pad,
      close,
      volume: 1_000 + index * 3,
    };
  });
}

function orbFixture(direction: 'LONG' | 'SHORT' | 'NONE'): BacktestCandle[] {
  const rows: BacktestCandle[] = [];
  const start = Date.UTC(2026, 0, 1);
  const push = (index: number, open: number, close: number, volume = 1_000, highPad = 0.45, lowPad = 0.45) => {
    rows.push({
      time: new Date(start + index * 3_600_000).toISOString(),
      open,
      high: Math.max(open, close) + highPad,
      low: Math.min(open, close) - lowPad,
      close,
      volume,
    });
  };

  for (let index = 0; index < 6; index += 1) {
    push(index, 100 + index * 0.04, 100.1 + index * 0.04, 1_000, 1.05, 1.05);
  }
  for (let index = 6; index < 30; index += 1) {
    const close = direction === 'SHORT' ? 99.85 - index * 0.025 : 100.15 + index * 0.025;
    push(index, close - (direction === 'SHORT' ? -0.08 : 0.08), close, 1_000);
  }

  if (direction === 'LONG') {
    push(30, 100.6, 101.1, 1_000);
    push(31, 101.15, 102.9, 6_000);
    push(32, 103.4, 106.8, 4_000);
  } else if (direction === 'SHORT') {
    push(30, 99.4, 98.95, 1_000);
    push(31, 98.9, 97.2, 6_000);
    push(32, 96.6, 93.3, 4_000);
  } else {
    push(30, 100.4, 100.7, 1_000);
    push(31, 100.7, 100.85, 6_000);
    push(32, 100.85, 100.9, 4_000);
  }

  for (let index = 33; index < 48; index += 1) {
    const previous = rows.at(-1)!.close;
    const close = direction === 'NONE' ? 100.75 + ((index % 2) * 0.03) : direction === 'SHORT' ? previous - 0.45 : previous + 0.45;
    push(index, previous, close, 2_000);
  }
  return rows;
}

describe('strategy correctness regressions', () => {
  it('rejects unknown and out-of-range public strategy parameters instead of clamping them silently', () => {
    const adaptive = getStrategyDefinition('adaptive-long-short-trend-portfolio-v1')!;
    expect(validateStrategyParameterValues(adaptive, { rebalanceBars: 0 }, { materializeDefaults: false })).toMatchObject({
      ok: false,
      error: 'out_of_range_parameter',
      parameter: 'rebalanceBars',
    });
    expect(validateStrategyParameterValues(adaptive, { routerBlockBars: 48 }, { materializeDefaults: false })).toMatchObject({
      ok: false,
      error: 'unknown_parameter',
      parameter: 'routerBlockBars',
    });
  });

  it('canonicalizes legacy aliases without overriding unspecified optimized values with defaults', () => {
    const squeeze = getStrategyDefinition('volatility-squeeze-trend-volume-expansion-v1')!;
    const supplied = validateStrategyParameterValues(squeeze, { squeezeLookback: 120 }, { materializeDefaults: false });
    expect(supplied).toEqual({ ok: true, values: { widthLookback: 120 } });
    expect(buildStrategyParameterValues(squeeze, supplied.ok ? supplied.values : {})).toMatchObject({
      widthLookback: 120,
      volumeExpansion: 1.35,
      rewardRisk: 2.1,
    });
    expect(buildStrategyParameterValues(squeeze, { squeezeLookback: 140 }).widthLookback).toBe(140);
  });

  it('counts wins, losses and profit factor from net PnL rather than TP/SL labels', () => {
    const replay = finalizeReplay([], [
      {
        entryTime: '2026-01-01T00:00:00.000Z', exitTime: '2026-01-01T01:00:00.000Z',
        entry: 100, exit: 100.05, stop: 99, target: 100.05, outcome: 'TP' as const,
        pnlPct: -0.10, grossPnlPct: 0.05, transactionCostPct: 0.15, barsHeld: 1, entryReason: 'cost regression',
      },
      {
        entryTime: '2026-01-01T02:00:00.000Z', exitTime: '2026-01-01T03:00:00.000Z',
        entry: 100, exit: 100.5, stop: 99, target: 101, outcome: 'TIMEOUT' as const,
        pnlPct: 0.30, grossPnlPct: 0.5, transactionCostPct: 0.2, barsHeld: 1, entryReason: 'timeout profit',
      },
    ], 'fixture-v1');
    expect(replay.summary.wins).toBe(1);
    expect(replay.summary.losses).toBe(1);
    expect(replay.summary.timed).toBe(1);
    expect(replay.summary.winRate).toBe(0.5);
    expect(replay.summary.profitFactor).toBeCloseTo(3, 12);
  });

  it('uses exact synchronized timestamps for adaptive cross-asset selection and attributes the traded symbol', () => {
    const btc = candles({ stepPct: 0.001 });
    const eth = candles({ start: 50, stepPct: 0.004 });
    const replay = runAdaptiveTrendPortfolio({
      symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', maxBars: 12,
      candles: btc,
      universeCandles: { 'BTC-USDT': btc, 'ETH-USDT': eth },
      parameters: { rebalanceBars: 24, atrStopMultiplier: 1.4, rewardRisk: 2.2 },
      transactionCostModel: costModel,
    });
    expect(replay.summary.replayMode).toBe('CROSS_ASSET_SYNCHRONIZED_REPLAY');
    expect(replay.trades.length).toBeGreaterThan(0);
    expect(new Set(replay.trades.map((trade) => trade.symbol))).toEqual(new Set(['ETH-USDT']));
  });

  it('fails back to explicit single-symbol diagnostic mode when cross-asset timestamps do not align', () => {
    const btc = candles({ stepPct: 0.002 });
    const eth = candles({ start: 50, stepPct: 0.004, shiftMs: 30 * 60_000 });
    const replay = runAdaptiveTrendPortfolio({
      symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', maxBars: 12,
      candles: btc,
      universeCandles: { 'BTC-USDT': btc, 'ETH-USDT': eth },
      parameters: { rebalanceBars: 0 }, // direct-run defense: must not hang
      transactionCostModel: costModel,
    });
    expect(replay.summary.replayMode).toBe('SINGLE_SYMBOL_DIAGNOSTIC_REPLAY');
    expect(replay.trades.every((trade) => trade.symbol === 'BTC-USDT')).toBe(true);
  });

  it('keeps Volatility Squeeze defensive runner defaults identical to registry defaults', () => {
    const definition = getStrategyDefinition('volatility-squeeze-trend-volume-expansion-v1')!;
    const rows = candles({ count: 320, stepPct: 0.0015 });
    const implicit = runVolatilitySqueezeExpansion({
      symbol: 'BTC-USDT', interval: '1h', direction: 'BOTH', maxBars: 12,
      candles: rows, parameters: {}, transactionCostModel: costModel,
    });
    const explicit = runVolatilitySqueezeExpansion({
      symbol: 'BTC-USDT', interval: '1h', direction: 'BOTH', maxBars: 12,
      candles: rows, parameters: Object.fromEntries(definition.parameters.map((parameter) => [parameter.key, parameter.default])), transactionCostModel: costModel,
    });
    expect(implicit).toEqual(explicit);
  });

  it('keeps VWAP pullback risk parameters registered, consumed, and bounded', () => {
    const definition = getStrategyDefinition('multi-timeframe-vwap-pullback-reacceleration-v1')!;
    const defaults = buildStrategyParameterValues(definition, undefined);
    expect(defaults).toMatchObject({ atrStopMultiplier: 1.15, rewardRisk: 1.9 });
    expect(validateStrategyParameterValues(definition, { atrStopMultiplier: 0 }, { materializeDefaults: false })).toMatchObject({ ok: false, error: 'out_of_range_parameter', parameter: 'atrStopMultiplier' });
    expect(validateStrategyParameterValues(definition, { rewardRisk: 5 }, { materializeDefaults: false })).toMatchObject({ ok: false, error: 'out_of_range_parameter', parameter: 'rewardRisk' });

    const rows = Array.from({ length: 600 }, (_, index) => {
      const close = 100 + index * 0.05 + 3 * Math.sin(index / 7);
      const previous = 100 + Math.max(0, index - 1) * 0.05 + 3 * Math.sin(Math.max(0, index - 1) / 7);
      return {
        time: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
        open: previous,
        high: Math.max(previous, close) + 0.4,
        low: Math.min(previous, close) - 0.4,
        close,
        volume: 1000 + (index % 17) * 20,
      };
    });
    const base = { symbol: 'BTC-USDT', interval: '1h' as const, direction: 'BOTH' as const, maxBars: 12, candles: rows, transactionCostModel: costModel };
    const stopWider = runVwapPullbackReacceleration({ ...base, parameters: { ...defaults, reaccelerationVolume: 1, atrStopMultiplier: 2, rewardRisk: 1.9 } });
    const targetWider = runVwapPullbackReacceleration({ ...base, parameters: { ...defaults, reaccelerationVolume: 1, atrStopMultiplier: 1.15, rewardRisk: 3 } });
    expect(stopWider.trades.length).toBeGreaterThan(0);
    expect(targetWider.trades.length).toBeGreaterThan(0);
    expect(stopWider.trades[0].stop).not.toBe(targetWider.trades[0].stop);
    expect(targetWider.trades[0].target).not.toBe(stopWider.trades[0].target);
  });

  it('opens a causal ORB long only after range, VWAP slope and relative-volume confirmation', () => {
    const replay = runOrbVwapBreakout({
      symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', maxBars: 8,
      candles: orbFixture('LONG'),
      parameters: { openingRangeBars: 6, relativeVolumeThreshold: 1.1, atrStopMultiplier: 1.1, rewardRisk: 1.4 },
      transactionCostModel: costModel,
    });
    expect(replay.trades.length).toBeGreaterThan(0);
    expect(replay.trades[0].entryTime).toBe(orbFixture('LONG')[32].time);
    expect(replay.trades[0].target).toBeGreaterThan(replay.trades[0].entry);
    expect(replay.trades[0].stop).toBeLessThan(replay.trades[0].entry);
  });

  it('opens a causal ORB short only after range, VWAP slope and relative-volume confirmation', () => {
    const replay = runOrbVwapBreakout({
      symbol: 'BTC-USDT', interval: '1h', direction: 'SHORT', maxBars: 8,
      candles: orbFixture('SHORT'),
      parameters: { openingRangeBars: 6, relativeVolumeThreshold: 1.1, atrStopMultiplier: 1.1, rewardRisk: 1.4 },
      transactionCostModel: costModel,
    });
    expect(replay.trades.length).toBeGreaterThan(0);
    expect(replay.trades[0].entryTime).toBe(orbFixture('SHORT')[32].time);
    expect(replay.trades[0].target).toBeLessThan(replay.trades[0].entry);
    expect(replay.trades[0].stop).toBeGreaterThan(replay.trades[0].entry);
  });

  it('returns no ORB trade when price never breaks the opening range', () => {
    const replay = runOrbVwapBreakout({
      symbol: 'BTC-USDT', interval: '1h', direction: 'BOTH', maxBars: 8,
      candles: orbFixture('NONE'),
      parameters: { openingRangeBars: 6, relativeVolumeThreshold: 1.1, atrStopMultiplier: 1.1, rewardRisk: 1.4 },
      transactionCostModel: costModel,
    });
    expect(replay.trades).toHaveLength(0);
    expect(replay.summary.acceptedCandidates).toBe(0);
  });

  it('rejects invalid ORB public parameters before replay execution', () => {
    const definition = getStrategyDefinition('opening-range-vwap-rvol-breakout-v1')!;
    expect(validateStrategyParameterValues(definition, { openingRangeBars: 2 }, { materializeDefaults: false })).toMatchObject({ ok: false, error: 'out_of_range_parameter', parameter: 'openingRangeBars' });
    expect(validateStrategyParameterValues(definition, { relativeVolumeThreshold: 0.5 }, { materializeDefaults: false })).toMatchObject({ ok: false, error: 'out_of_range_parameter', parameter: 'relativeVolumeThreshold' });
  });

  it('labels historical evidence scope honestly when live-only or cross-asset semantics are not bound', () => {
    expect(strategyValidationCapability(baselineStrategyDefinition)).toEqual({ scope: 'FULL_STRATEGY', limitations: [] });
    const adaptive = strategyValidationCapability(getStrategyDefinition('adaptive-long-short-trend-portfolio-v1')!);
    expect(adaptive.scope).toBe('BASE_REPLAY');
    expect(adaptive.limitations.join(' ')).toContain('multi-symbol');
    const funding = strategyValidationCapability(getStrategyDefinition('funding-basis-carry-v1')!);
    expect(funding.scope).toBe('BASE_REPLAY');
    expect(funding.limitations.join(' ')).toContain('Funding and crowding');
    expect(strategyValidationCapability(getStrategyDefinition('whale-flow-sentiment-reversal-v1')!).scope).toBe('BASE_REPLAY');
    expect(strategyValidationCapability(getStrategyDefinition('news-sentiment-momentum-breakout-v1')!).scope).toBe('BASE_REPLAY');
  });

  it('reports strategy execution scope from actual wiring', () => {
    const baseline = strategyExecutionCapability(baselineStrategyDefinition);
    const bespoke = strategyExecutionCapability(getStrategyDefinition('volatility-squeeze-trend-volume-expansion-v1')!);
    const blocked = strategyExecutionCapability(getStrategyDefinition('l2-liquidity-state-scalper-v1')!);
    expect(baseline).toMatchObject({ roles: ['LIVE', 'REPLAY', 'PAPER'], independentlyLiveDispatched: true });
    expect(bespoke).toMatchObject({ roles: ['REPLAY', 'PAPER'], independentlyLiveDispatched: false });
    expect(blocked).toMatchObject({ roles: ['BLOCKED'], independentlyLiveDispatched: false });
  });
});
