import { describe, expect, it } from 'vitest';
import { calculatePriceChartGeometry, DEFAULT_CHART_WIDTH } from '../components/priceChartGeometry';

describe('responsive PriceChart geometry', () => {
  it('uses the observed container width rather than a fixed 960px coordinate system', () => {
    expect(calculatePriceChartGeometry(1180, 440).chartWidth).toBe(1180);
    expect(calculatePriceChartGeometry(640, 320).chartWidth).toBe(640);
    expect(calculatePriceChartGeometry(320, 260).chartWidth).toBe(320);
  });

  it('uses a safe fallback and bounded vertical geometry', () => {
    const geometry = calculatePriceChartGeometry(Number.NaN, Number.NaN);
    expect(geometry.chartWidth).toBe(DEFAULT_CHART_WIDTH);
    expect(geometry.chartHeight + geometry.volumeHeight).toBe(376);
    const compact = calculatePriceChartGeometry(640, 300);
    expect(compact.chartHeight + compact.volumeHeight).toBe(300);
  });
});
