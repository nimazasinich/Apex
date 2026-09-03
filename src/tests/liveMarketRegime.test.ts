import { describe, expect, it } from 'vitest';
import { detectLiveMarketRegime } from '../services/liveMarketRegime';

const t0 = 1_700_000_000_000;

function trending(step = 120) {
  return Array.from({ length: 60 }, (_, i) => {
    const base = 80_000 + i * step;
    return { timestamp: t0 + i * 3_600_000, open: base, high: base + 90, low: base - 70, close: base + 60, volume: 1_000 + i * 3 };
  });
}

function ranging() {
  return Array.from({ length: 60 }, (_, i) => {
    const base = 90_000 + Math.sin(i * 0.9) * 250;
    return { timestamp: t0 + i * 3_600_000, open: base - 20, high: base + 100, low: base - 100, close: base + 20, volume: 1_000 };
  });
}

describe('liveMarketRegime', () => {
  it('classifies a causal directional trend without future labels', () => {
    const result = detectLiveMarketRegime(trending());
    expect(result.regime).toBe('TREND_UP');
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.trendEfficiency).toBeGreaterThan(0.3);
  });

  it('keeps oscillating low-efficiency price action in a range', () => {
    const result = detectLiveMarketRegime(ranging());
    expect(['RANGE', 'TRANSITION']).toContain(result.regime);
    expect(result.trendEfficiency).toBeLessThan(0.3);
  });

  it('returns UNKNOWN instead of fabricating a regime with insufficient history', () => {
    const result = detectLiveMarketRegime(trending().slice(-10));
    expect(result.regime).toBe('UNKNOWN');
    expect(result.confidence).toBe(0);
  });
});
