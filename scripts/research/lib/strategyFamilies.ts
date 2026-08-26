/**
 * Candidate strategy families for the walk-forward baseline.
 *
 * WHAT A "FAMILY" IS HERE
 * -----------------------
 * A family is a rule shape plus a small parameter grid. The grid is deliberately
 * small (six to twelve combinations) because the walk-forward runner picks one
 * combination per split from in-sample data: the wider the grid, the more the
 * in-sample winner is just the luckiest draw, and the less the out-of-sample number
 * means. Ten families times a small grid each is a genuine search; ten families
 * times a thousand combinations each would be a way of guaranteeing a good-looking
 * result that does not survive contact with new data.
 *
 * ONE BAR SIZE FOR EVERY FAMILY
 * -----------------------------
 * All families run on four-hour bars, resampled from the verified hourly archive.
 * Holding bar size fixed is what makes the cross-family comparison mean something:
 * a family on hourly bars would pay roughly four times the round-trip cost per unit
 * of calendar time, so a bar-size difference would dominate any difference in the
 * actual idea being tested. Bar size is therefore a constraint of this baseline, not
 * a free parameter.
 *
 * SHAPES
 * ------
 * Every family returns one position series per symbol plus the gross-exposure weight
 * carried by each leg, so a single-symbol rule spread over ten symbols, a
 * cross-sectional long/short book, and a set of ratio pairs are all scored the same
 * way and are all normalised to about one unit of gross exposure. Without that
 * normalisation a ten-symbol book would look ten times better than a one-symbol book
 * purely from leverage.
 *
 * MISSING DATA MEANS FLAT
 * -----------------------
 * Funding and open-interest series contain genuine holes, and open interest does not
 * begin until 2022-01-01. Families that need those inputs return 0 (no position)
 * wherever the input is unavailable. Nothing is interpolated or forward-filled to
 * keep a position alive.
 */

import {
  atr,
  closes,
  highs,
  lows,
  pctChange,
  rollingMax,
  rollingMin,
  rollingZScore,
  sma,
  trailingPercentileRank,
  volumes,
  type MaybeNumber,
} from './indicators';
import type { Candle } from './researchDataset';
import type { Direction } from './tradeMetrics';

/** Bar size shared by every family in this baseline. */
export const FAMILY_HOURS_PER_BAR = 4;

/**
 * Trailing window used to judge whether current volatility is unusually compressed.
 *
 * Exported so that `liquidationSqueeze.ts` ranks its open-interest buildup over the
 * identical window rather than a copied literal. A drifted copy would silently make the
 * refinement's zero-effect configuration stop reproducing this family, which is the one
 * invariant the control arm depends on.
 */
export const COMPRESSION_RANK_WINDOW = 180;

export interface SymbolSeries {
  symbol: string;
  /** Four-hour candles, development window only. */
  candles: Candle[];
  /** Funding rate aligned as-of each bar; `undefined` on a genuine hole. */
  fundingRate: MaybeNumber[];
  /** Open interest aligned as-of each bar; `undefined` before 2022 and on holes. */
  openInterest: MaybeNumber[];
}

export type ParamValues = Readonly<Record<string, number>>;

export interface FamilyPositions {
  /** Symbol -> position series, index-aligned with that symbol's candles. */
  bySymbol: Map<string, Direction[]>;
  /** Gross-exposure weight applied to each leg, so the book totals about 1 unit. */
  weight: number;
}

export interface StrategyFamily {
  id: string;
  label: string;
  /** Why this is expected to have an edge, in one sentence. */
  rationale: string;
  /** Inputs beyond candles that the family reads. */
  requires: readonly ('funding' | 'openInterest')[];
  grid: readonly ParamValues[];
  build(universe: readonly SymbolSeries[], params: ParamValues): FamilyPositions;
}

function zeros(length: number): Direction[] {
  return new Array<Direction>(length).fill(0);
}

/** Wrap a per-symbol rule as a family that equal-weights the whole universe. */
function perSymbol(
  spec: Omit<StrategyFamily, 'build'> & {
    positions(series: SymbolSeries, params: ParamValues): Direction[];
  },
): StrategyFamily {
  const { positions, ...meta } = spec;
  return {
    ...meta,
    build(universe, params) {
      const bySymbol = new Map<string, Direction[]>();
      for (const series of universe) {
        bySymbol.set(series.symbol, positions(series, params));
      }
      return { bySymbol, weight: universe.length > 0 ? 1 / universe.length : 1 };
    },
  };
}

function grid(spec: Record<string, readonly number[]>): ParamValues[] {
  const names = Object.keys(spec);
  let combinations: ParamValues[] = [{}];
  for (const name of names) {
    const next: ParamValues[] = [];
    for (const partial of combinations) {
      for (const value of spec[name]) {
        next.push({ ...partial, [name]: value });
      }
    }
    combinations = next;
  }
  return combinations;
}

/* ------------------------------------------------------------------ *
 * 1. Time-series momentum
 * ------------------------------------------------------------------ */

const timeSeriesMomentum = perSymbol({
  id: 'tsm',
  label: 'Time-series momentum',
  rationale:
    'Trends in perpetual futures have historically persisted over multi-day horizons, so the sign ' +
    'of a multi-day return is taken as the expected sign of the next move.',
  requires: [],
  grid: grid({ lookbackBars: [30, 60, 120, 180], bandPct: [0, 1] }),
  positions(series, params) {
    const change = pctChange(closes(series.candles), params.lookbackBars);
    const out = zeros(series.candles.length);
    for (let i = 0; i < out.length; i += 1) {
      const value = change[i];
      if (value === undefined) {
        continue;
      }
      out[i] = value > params.bandPct ? 1 : value < -params.bandPct ? -1 : 0;
    }
    return out;
  },
});

/* ------------------------------------------------------------------ *
 * 2. Donchian channel breakout
 * ------------------------------------------------------------------ */

const donchianBreakout = perSymbol({
  id: 'donchian',
  label: 'Donchian channel breakout',
  rationale:
    'A close beyond the extreme of the prior N bars marks the point where the previous range has ' +
    'failed to contain price; the position is held until a shorter opposite channel breaks.',
  requires: [],
  grid: [
    { channelBars: 30, exitBars: 10 },
    { channelBars: 30, exitBars: 20 },
    { channelBars: 60, exitBars: 20 },
    { channelBars: 60, exitBars: 40 },
    { channelBars: 120, exitBars: 20 },
    { channelBars: 120, exitBars: 40 },
  ],
  positions(series, params) {
    const { candles } = series;
    const upper = rollingMax(highs(candles), params.channelBars);
    const lower = rollingMin(lows(candles), params.channelBars);
    const exitUpper = rollingMax(highs(candles), params.exitBars);
    const exitLower = rollingMin(lows(candles), params.exitBars);
    const out = zeros(candles.length);

    let state: Direction = 0;
    for (let i = 1; i < candles.length; i += 1) {
      const close = candles[i].c;
      // Channels are read at i-1 so the breakout level never includes the bar that
      // is being tested against it.
      if (state === 1) {
        const stop = exitLower[i - 1];
        if (stop !== undefined && close < stop) {
          state = 0;
        }
      } else if (state === -1) {
        const stop = exitUpper[i - 1];
        if (stop !== undefined && close > stop) {
          state = 0;
        }
      }
      if (state === 0) {
        const breakoutUp = upper[i - 1];
        const breakoutDown = lower[i - 1];
        if (breakoutUp !== undefined && close > breakoutUp) {
          state = 1;
        } else if (breakoutDown !== undefined && close < breakoutDown) {
          state = -1;
        }
      }
      out[i] = state;
    }
    return out;
  },
});

/* ------------------------------------------------------------------ *
 * 3. Volume-shock continuation
 * ------------------------------------------------------------------ */

const volumeShockContinuation = perSymbol({
  id: 'volshock',
  label: 'Volume-shock continuation',
  rationale:
    'A bar trading several times its recent average volume usually reflects forced or informed ' +
    'flow rather than noise, and the direction of that bar is taken to continue for a fixed hold.',
  requires: [],
  grid: grid({ volumeWindowBars: [30, 60], volumeMultiple: [2, 3], holdBars: [6, 12] }),
  positions(series, params) {
    const { candles } = series;
    const averageVolume = sma(volumes(candles), params.volumeWindowBars);
    const out = zeros(candles.length);

    let remaining = 0;
    let direction: Direction = 0;
    for (let i = 1; i < candles.length; i += 1) {
      if (remaining > 0) {
        out[i] = direction;
        remaining -= 1;
        continue;
      }
      const baseline = averageVolume[i - 1];
      if (baseline === undefined || !(baseline > 0)) {
        continue;
      }
      if (candles[i].v <= params.volumeMultiple * baseline) {
        continue;
      }
      const move = candles[i].c - candles[i - 1].c;
      direction = move > 0 ? 1 : move < 0 ? -1 : 0;
      if (direction !== 0) {
        out[i] = direction;
        remaining = params.holdBars - 1;
      }
    }
    return out;
  },
});

/* ------------------------------------------------------------------ *
 * 4. Compression breakout
 * ------------------------------------------------------------------ */

const compressionBreakout = perSymbol({
  id: 'squeeze',
  label: 'Volatility-compression breakout',
  rationale:
    'Ranges tighten before they expand; a breakout that begins from unusually low volatility has ' +
    'more room to run than the same breakout from an already-extended range.',
  requires: [],
  grid: grid({ atrBars: [20, 40], compressionPercentile: [0.2, 0.35], holdBars: [12, 24] }),
  positions(series, params) {
    const { candles } = series;
    const averageTrueRange = atr(candles, params.atrBars);
    const normalised: MaybeNumber[] = averageTrueRange.map((value, index) =>
      value === undefined || !(candles[index].c > 0) ? undefined : value / candles[index].c,
    );
    const rank = trailingPercentileRank(normalised, COMPRESSION_RANK_WINDOW);
    const upper = rollingMax(highs(candles), params.atrBars);
    const lower = rollingMin(lows(candles), params.atrBars);
    const out = zeros(candles.length);

    let remaining = 0;
    let direction: Direction = 0;
    for (let i = 1; i < candles.length; i += 1) {
      if (remaining > 0) {
        out[i] = direction;
        remaining -= 1;
        continue;
      }
      const compression = rank[i - 1];
      if (compression === undefined || compression > params.compressionPercentile) {
        continue;
      }
      const close = candles[i].c;
      const breakoutUp = upper[i - 1];
      const breakoutDown = lower[i - 1];
      if (breakoutUp !== undefined && close > breakoutUp) {
        direction = 1;
      } else if (breakoutDown !== undefined && close < breakoutDown) {
        direction = -1;
      } else {
        continue;
      }
      out[i] = direction;
      remaining = params.holdBars - 1;
    }
    return out;
  },
});

/* ------------------------------------------------------------------ *
 * 5. Mean reversion
 * ------------------------------------------------------------------ */

const meanReversion = perSymbol({
  id: 'meanrev',
  label: 'Z-score mean reversion',
  rationale:
    'A price several standard deviations from its own recent mean is usually there because of a ' +
    'liquidity event rather than a change in fair value, and tends to revert toward the mean.',
  requires: [],
  grid: grid({ windowBars: [30, 60, 120], entryZ: [1.5, 2.5] }),
  positions(series, params) {
    const exitZ = 0.5;
    const z = rollingZScore(closes(series.candles), params.windowBars);
    const out = zeros(series.candles.length);

    let state: Direction = 0;
    for (let i = 0; i < out.length; i += 1) {
      const value = z[i];
      if (value === undefined) {
        state = 0;
        continue;
      }
      if (state !== 0 && Math.abs(value) <= exitZ) {
        state = 0;
      }
      if (state === 0) {
        if (value <= -params.entryZ) {
          state = 1;
        } else if (value >= params.entryZ) {
          state = -1;
        }
      }
      out[i] = state;
    }
    return out;
  },
});

/* ------------------------------------------------------------------ *
 * 6. Funding carry
 * ------------------------------------------------------------------ */

const fundingCarry = perSymbol({
  id: 'fundingcarry',
  label: 'Funding-rate carry',
  rationale:
    'Persistently positive funding means crowded longs paying shorts, which is both a direct cash ' +
    'flow to the short side and a common precursor to long liquidation cascades.',
  requires: ['funding'],
  grid: grid({ thresholdRate: [0.0001, 0.0003, 0.0005], smoothBars: [6, 30] }),
  positions(series, params) {
    const smoothed = sma(series.fundingRate, params.smoothBars);
    const out = zeros(series.candles.length);
    for (let i = 0; i < out.length; i += 1) {
      const rate = smoothed[i];
      if (rate === undefined) {
        // A funding hole means flat, not a carried-forward position.
        continue;
      }
      out[i] = rate >= params.thresholdRate ? -1 : rate <= -params.thresholdRate ? 1 : 0;
    }
    return out;
  },
});

/* ------------------------------------------------------------------ *
 * 7. Open-interest trend confirmation
 * ------------------------------------------------------------------ */

const openInterestTrend = perSymbol({
  id: 'oitrend',
  label: 'Open-interest trend confirmation',
  rationale:
    'Rising open interest alongside a directional move means new positions are funding the move ' +
    'rather than old ones closing, which distinguishes continuation from a short squeeze.',
  requires: ['openInterest'],
  grid: grid({ windowBars: [12, 30, 60], oiThresholdPct: [2, 5] }),
  positions(series, params) {
    const oiChange = pctChange(series.openInterest, params.windowBars);
    const priceChange = pctChange(closes(series.candles), params.windowBars);
    const out = zeros(series.candles.length);
    for (let i = 0; i < out.length; i += 1) {
      const oi = oiChange[i];
      const price = priceChange[i];
      if (oi === undefined || price === undefined || oi <= params.oiThresholdPct) {
        continue;
      }
      out[i] = price > 0 ? 1 : price < 0 ? -1 : 0;
    }
    return out;
  },
});

/* ------------------------------------------------------------------ *
 * 8 & 9. Cross-sectional books
 * ------------------------------------------------------------------ */

type RankMode = 'momentum' | 'residualReversal';

function crossSectional(
  meta: Omit<StrategyFamily, 'build'>,
  mode: RankMode,
): StrategyFamily {
  return {
    ...meta,
    build(universe, params) {
      const legs = Math.round(params.legs);
      const rebalanceBars = Math.round(params.rebalanceBars);
      const barCount = universe.length > 0 ? universe[0].candles.length : 0;
      const changes = universe.map((series) =>
        pctChange(closes(series.candles), params.lookbackBars),
      );
      const series = universe.map(() => zeros(barCount));

      let held: Direction[] = new Array<Direction>(universe.length).fill(0);
      for (let i = 0; i < barCount; i += 1) {
        // The rebalance calendar keys off the absolute bar index, so every split
        // inherits the same schedule and no split gets a luckier phase than another.
        if (i % rebalanceBars === 0) {
          held = new Array<Direction>(universe.length).fill(0);
          const available: { index: number; value: number }[] = [];
          for (let s = 0; s < universe.length; s += 1) {
            const value = changes[s][i];
            if (value !== undefined) {
              available.push({ index: s, value });
            }
          }
          if (available.length >= 2 * legs) {
            let scored = available;
            if (mode === 'residualReversal') {
              const mean =
                available.reduce((total, entry) => total + entry.value, 0) / available.length;
              // Reverting the *residual* rather than the raw return removes the
              // common market move, so the book is not just a disguised beta bet.
              scored = available.map((entry) => ({ index: entry.index, value: entry.value - mean }));
            }
            scored = [...scored].sort((left, right) => right.value - left.value);
            const longSide: Direction = mode === 'momentum' ? 1 : -1;
            for (let j = 0; j < legs; j += 1) {
              held[scored[j].index] = longSide;
              held[scored[scored.length - 1 - j].index] = (longSide * -1) as Direction;
            }
          }
        }
        for (let s = 0; s < universe.length; s += 1) {
          series[s][i] = held[s];
        }
      }

      const bySymbol = new Map<string, Direction[]>();
      universe.forEach((entry, index) => bySymbol.set(entry.symbol, series[index]));
      return { bySymbol, weight: 1 / (2 * legs) };
    },
  };
}

const crossSectionalMomentum = crossSectional(
  {
    id: 'xsmom',
    label: 'Cross-sectional momentum',
    rationale:
      'Relative strength within a universe persists even when the whole universe is directionless, ' +
      'and a matched long/short book removes most of the common market move.',
    requires: [],
    grid: grid({ lookbackBars: [30, 60, 120], legs: [2, 3], rebalanceBars: [6, 30] }),
  },
  'momentum',
);

const residualReversal = crossSectional(
  {
    id: 'resrev',
    label: 'Short-horizon residual reversal',
    rationale:
      'Over a day or two, a symbol that has moved far from the universe average tends to give some ' +
      'of that back as flow rebalances; the lookbacks are kept short so this is not simply the ' +
      'mirror image of cross-sectional momentum.',
    requires: [],
    grid: grid({ lookbackBars: [3, 6, 12], legs: [2, 3], rebalanceBars: [6, 12] }),
  },
  'residualReversal',
);

/* ------------------------------------------------------------------ *
 * 10. Ratio stat-arb pairs
 * ------------------------------------------------------------------ */

/**
 * Fixed pairs, each symbol used exactly once so the legs cannot pile up on one name.
 * Pairing is by rough sector/liquidity kinship, chosen before any result was seen and
 * not re-picked afterwards -- selecting pairs by what backtested well would be the
 * single easiest way to fake a stat-arb edge.
 */
export const RATIO_PAIRS: readonly (readonly [string, string])[] = [
  ['ETHUSDT', 'BTCUSDT'],
  ['SOLUSDT', 'BNBUSDT'],
  ['XRPUSDT', 'ADAUSDT'],
  ['LINKUSDT', 'AVAXUSDT'],
  ['LTCUSDT', 'DOGEUSDT'],
];

const ratioStatArb: StrategyFamily = {
  id: 'ratioarb',
  label: 'Ratio stat-arb pairs',
  rationale:
    'The log ratio of two related perpetuals is far more range-bound than either leg, so a ratio ' +
    'several standard deviations from its own mean is a reversion trade with the market move netted out.',
  requires: [],
  grid: grid({ windowBars: [30, 60, 120], entryZ: [1.5, 2.5] }),
  build(universe, params) {
    const exitZ = 0.5;
    const lookup = new Map(universe.map((series) => [series.symbol, series]));
    const bySymbol = new Map<string, Direction[]>();
    for (const series of universe) {
      bySymbol.set(series.symbol, zeros(series.candles.length));
    }

    for (const [numerator, denominator] of RATIO_PAIRS) {
      const first = lookup.get(numerator);
      const second = lookup.get(denominator);
      if (!first || !second) {
        continue;
      }
      const barCount = Math.min(first.candles.length, second.candles.length);
      const logRatio: MaybeNumber[] = new Array(barCount).fill(undefined);
      for (let i = 0; i < barCount; i += 1) {
        const a = first.candles[i].c;
        const b = second.candles[i].c;
        if (a > 0 && b > 0) {
          logRatio[i] = Math.log(a / b);
        }
      }
      const z = rollingZScore(logRatio, params.windowBars);
      const longNumerator = bySymbol.get(numerator) as Direction[];
      const longDenominator = bySymbol.get(denominator) as Direction[];

      let state: Direction = 0;
      for (let i = 0; i < barCount; i += 1) {
        const value = z[i];
        if (value === undefined) {
          state = 0;
          continue;
        }
        if (state !== 0 && Math.abs(value) <= exitZ) {
          state = 0;
        }
        if (state === 0) {
          if (value >= params.entryZ) {
            state = -1;
          } else if (value <= -params.entryZ) {
            state = 1;
          }
        }
        longNumerator[i] = state;
        longDenominator[i] = (state * -1) as Direction;
      }
    }

    return { bySymbol, weight: 1 / (2 * RATIO_PAIRS.length) };
  },
};

export const STRATEGY_FAMILIES: readonly StrategyFamily[] = [
  timeSeriesMomentum,
  donchianBreakout,
  volumeShockContinuation,
  compressionBreakout,
  meanReversion,
  fundingCarry,
  openInterestTrend,
  crossSectionalMomentum,
  residualReversal,
  ratioStatArb,
];
