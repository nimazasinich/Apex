import { describe, expect, it } from 'vitest';
import { getTickerSparkline } from '../lib/sparkline';

describe('ticker sparkline truthfulness', () => {
  it('returns only finite provider-supplied observations', () => {
    expect(getTickerSparkline({ sparkline1h: [100, Number.NaN, 101, Infinity, 102] }))
      .toEqual([100, 101, 102]);
  });

  it('does not manufacture a trend when fewer than two observations exist', () => {
    expect(getTickerSparkline({})).toEqual([]);
    expect(getTickerSparkline({ sparkline1h: [100] })).toEqual([]);
  });
});
