import { describe, expect, it } from 'vitest';
import { buildDirectionDivergence, classifyDirectionDivergence, computeTimeframeDirection } from '../services/directionDivergence';
import type { Candlestick } from '../types';

function candles(direction: 'up' | 'down', count = 40): Candlestick[] {
  return Array.from({ length: count }, (_, index) => {
    const base = direction === 'up' ? 100 + index * 0.5 : 200 - index * 0.5;
    return {
      time: String(index),
      open: base,
      high: base + 1,
      low: base - 0.2,
      close: base + (direction === 'up' ? 0.8 : -0.8),
      volume: 1000,
    };
  });
}

describe('directionDivergence', () => {
  it('detects a real directional trend from candles', () => {
    expect(computeTimeframeDirection(candles('up')).direction).toBe('BULLISH');
    expect(computeTimeframeDirection(candles('down')).direction).toBe('BEARISH');
  });

  it('returns unavailable instead of fabricating a neutral trend', () => {
    const result = computeTimeframeDirection(candles('up', 5));
    expect(result.direction).toBe('UNAVAILABLE');
    expect(result.strength).toBe(0);
  });

  it('classifies with-trend and counter-trend symmetrically', () => {
    const context = {
      perTimeframe: {
        '15m': { direction: 'BEARISH' as const, strength: 0.8, candleCount: 40 },
        '4h': { direction: 'BEARISH' as const, strength: 0.6, candleCount: 40 },
      },
    };
    expect(classifyDirectionDivergence('SHORT', context).category).toBe('WITH_TREND');
    expect(classifyDirectionDivergence('LONG', context).category).toBe('COUNTER_TREND');
  });

  it('keeps missing timeframe data visible in completeness', () => {
    const result = buildDirectionDivergence('SHORT', {
      '15m': candles('down'),
      '4h': candles('down', 5),
    });
    expect(result.dataCompleteness).toBe(0.5);
    expect(result.perTimeframe['4h'].direction).toBe('UNAVAILABLE');
  });
});
