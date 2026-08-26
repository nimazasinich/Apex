/**
 * Loads the ten-symbol development universe once, in the shape every study needs.
 *
 * Extracted so the baseline study and the sizing study cannot drift apart: if one of
 * them resampled to a different bar size, or skipped the timeline cross-check, their
 * numbers would stop being comparable while still looking like they were.
 *
 * The timeline cross-check is not a formality. Cross-sectional and pair families index
 * symbols positionally, so a single missing bar in one symbol would silently compare
 * one symbol's Tuesday against another's Monday for the rest of the run.
 */

import {
  RESEARCH_SYMBOLS,
  alignFundingToCandles,
  alignOpenInterestToCandles,
  loadDevelopmentCandles,
  loadDevelopmentFunding,
  loadDevelopmentOpenInterest,
  resampleCandles,
} from './researchDataset';
import { FAMILY_HOURS_PER_BAR, type SymbolSeries } from './strategyFamilies';

export interface SymbolCoverage {
  symbol: string;
  hourlyRows: number;
  barRows: number;
  firstBar: string;
  lastBar: string;
  fundingEvents: number;
  fundingBarsAvailable: number;
  openInterestPoints: number;
  openInterestBarsAvailable: number;
}

export interface LoadedUniverse {
  universe: SymbolSeries[];
  barCount: number;
  coverage: SymbolCoverage[];
}

export function loadDevelopmentUniverse(): LoadedUniverse {
  const universe: SymbolSeries[] = [];
  const coverage: SymbolCoverage[] = [];

  for (const symbol of RESEARCH_SYMBOLS) {
    const hourly = loadDevelopmentCandles(symbol);
    const candles = resampleCandles(hourly.rows, FAMILY_HOURS_PER_BAR);
    const funding = loadDevelopmentFunding(symbol);
    const openInterest = loadDevelopmentOpenInterest(symbol);

    const fundingRate = alignFundingToCandles(candles, funding.rows);
    const openInterestSeries = alignOpenInterestToCandles(candles, openInterest.rows);

    universe.push({ symbol, candles, fundingRate, openInterest: openInterestSeries });
    coverage.push({
      symbol,
      hourlyRows: hourly.rows.length,
      barRows: candles.length,
      firstBar: new Date(candles[0].t).toISOString(),
      lastBar: new Date(candles[candles.length - 1].t).toISOString(),
      fundingEvents: funding.rows.length,
      fundingBarsAvailable: fundingRate.filter((value) => value !== undefined).length,
      openInterestPoints: openInterest.rows.length,
      openInterestBarsAvailable: openInterestSeries.filter((value) => value !== undefined).length,
    });
  }

  const reference = universe[0];
  for (const series of universe) {
    if (series.candles.length !== reference.candles.length) {
      throw new Error(
        `${series.symbol} has ${series.candles.length} bars but ${reference.symbol} has ` +
          `${reference.candles.length}; the universe timelines must match exactly`,
      );
    }
    for (let i = 0; i < series.candles.length; i += 1) {
      if (series.candles[i].t !== reference.candles[i].t) {
        throw new Error(
          `${series.symbol} bar ${i} is stamped ${series.candles[i].t} but ${reference.symbol} ` +
            `bar ${i} is stamped ${reference.candles[i].t}`,
        );
      }
    }
  }

  return { universe, barCount: reference.candles.length, coverage };
}
