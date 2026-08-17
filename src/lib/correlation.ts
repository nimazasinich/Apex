/**
 * APEX-NEXT Correlation Mathematics Library
 * Pure functions to compute Pearson correlation coefficients between symbol price series
 * and construct institutional correlation matrices.
 */

import { CorrelationMatrixResult, CorrelationPair, DataState } from '../types';

/**
 * Converts a raw price series into log/percentage returns:
 * r_i = (P_i - P_{i-1}) / P_{i-1}
 */
export function computePercentageReturns(prices: number[]): number[] {
  if (!prices || prices.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    const cur = prices[i];
    if (prev === 0) {
      returns.push(0);
    } else {
      returns.push((cur - prev) / prev);
    }
  }
  return returns;
}

/**
 * Computes Pearson correlation coefficient r between two numeric return series.
 * Range: -1.0 (perfect inverse) to +1.0 (perfect positive co-movement).
 */
export function calculatePearsonCorrelation(seriesX: number[], seriesY: number[]): number {
  if (!seriesX || !seriesY) return 0;
  const n = Math.min(seriesX.length, seriesY.length);
  if (n < 2) return 0;

  // Use only overlapping tail segment of length n
  const x = seriesX.slice(-n);
  const y = seriesY.slice(-n);

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  if (denX === 0 && denY === 0) return 1.0;
  if (denX === 0 || denY === 0) return 0;

  const r = num / Math.sqrt(denX * denY);
  // Clamp to [-1.0, +1.0] and round to 4 decimal places
  const clamped = Math.max(-1.0, Math.min(1.0, r));
  return Number(clamped.toFixed(4));
}

/**
 * Builds an N x N Pearson correlation matrix and pair list from symbol price series.
 */
export function buildCorrelationMatrix(
  symbols: string[],
  pricesMap: Record<string, number[]>,
  dataState: DataState = 'live'
): CorrelationMatrixResult {
  const returnsMap: Record<string, number[]> = {};
  for (const sym of symbols) {
    returnsMap[sym] = computePercentageReturns(pricesMap[sym] || []);
  }

  const n = symbols.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const pairs: CorrelationPair[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1.0;
      } else {
        const r = calculatePearsonCorrelation(
          returnsMap[symbols[i]] || [],
          returnsMap[symbols[j]] || []
        );
        matrix[i][j] = r;

        if (i < j) {
          pairs.push({
            symbolX: symbols[i],
            symbolY: symbols[j],
            r,
            returnsX: returnsMap[symbols[i]] || [],
            returnsY: returnsMap[symbols[j]] || [],
          });
        }
      }
    }
  }

  // Sort pairs by absolute correlation strength descending
  pairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  return {
    symbols,
    matrix,
    pairs,
    timestamp: Date.now(),
    dataState,
  };
}
