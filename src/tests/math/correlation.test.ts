import { describe, it, expect } from 'vitest';
import {
  computePercentageReturns,
  calculatePearsonCorrelation,
  buildCorrelationMatrix,
} from '../../lib/correlation';

describe('Correlation Mathematics Library', () => {
  it('computes percentage returns correctly', () => {
    const prices = [100, 105, 102.9];
    const returns = computePercentageReturns(prices);
    expect(returns.length).toBe(2);
    expect(returns[0]).toBeCloseTo(0.05, 4); // (105-100)/100
    expect(returns[1]).toBeCloseTo(-0.02, 4); // (102.9-105)/105 = -2.1/105 = -0.02
  });

  it('computes Pearson correlation = 1.0 for identical return series', () => {
    const returnsX = [0.01, -0.02, 0.03, 0.05, -0.01];
    const r = calculatePearsonCorrelation(returnsX, returnsX);
    expect(r).toBe(1.0);
  });

  it('computes Pearson correlation = -1.0 for perfectly inverse series', () => {
    const returnsX = [0.01, -0.02, 0.03, 0.05, -0.01];
    const returnsY = [-0.01, 0.02, -0.03, -0.05, 0.01];
    const r = calculatePearsonCorrelation(returnsX, returnsY);
    expect(r).toBe(-1.0);
  });

  it('builds a symmetric correlation matrix with 1.0 diagonal', () => {
    const symbols = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'];
    const pricesMap = {
      'BTC-USDT': [90000, 91000, 92000, 91500, 93000],
      'ETH-USDT': [3000, 3030, 3060, 3045, 3090], // Highly correlated with BTC
      'SOL-USDT': [150, 148, 145, 149, 144],     // Inverse or different
    };

    const res = buildCorrelationMatrix(symbols, pricesMap);
    expect(res.symbols).toEqual(symbols);
    expect(res.matrix.length).toBe(3);
    expect(res.matrix[0][0]).toBe(1.0);
    expect(res.matrix[1][1]).toBe(1.0);
    expect(res.matrix[2][2]).toBe(1.0);
    // Symmetry check
    expect(res.matrix[0][1]).toBe(res.matrix[1][0]);
    // High correlation between BTC and ETH
    expect(res.matrix[0][1]).toBeGreaterThan(0.9);
  });
});
