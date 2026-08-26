/**
 * Trade construction and performance metrics for the walk-forward baseline.
 *
 * EXECUTION CONVENTION (chosen so that no rule can peek at the future)
 * -------------------------------------------------------------------
 * A position series holds one value per bar. `positions[i]` is the exposure held
 * *from the close of bar i to the close of bar i+1*, and it may only be computed
 * from bars `<= i`. Entries and exits therefore transact at closes that had already
 * printed when the decision was made. Nothing fills at a high, a low, or at the
 * open of the bar that generated the signal -- each of those is a well-known way to
 * manufacture returns that do not exist.
 *
 * COSTS
 * -----
 * Costs come from `src/services/transactionCosts`, the same module and the same
 * per-side assumptions the sealed structural study used (0.04% commission and 0.02%
 * slippage per side, 0.01% funding estimate), so numbers here are directly
 * comparable to it. `fundingIntervalBars` is derived from the bar size instead of
 * being left at the module default of 8, which is only correct for hourly bars:
 * on 4-hour bars, 8 bars is 32 hours and would under-charge funding by 4x.
 *
 * P&L CONVENTION
 * --------------
 * Per-trade percentages are summed, not compounded -- the same additive convention
 * the existing study uses when it reduces trades to a net return. Compounding a
 * cross-sectional book of ten symbols would additionally require a capital model
 * this study does not claim to have.
 *
 * DRAWDOWN IS COMPUTED IN TIME ORDER
 * ----------------------------------
 * Trades from different symbols overlap in time, so concatenating them per symbol
 * and then walking the array would report a drawdown that never happened. The
 * equity curve is therefore built after sorting by exit time.
 */

import {
  computeTransactionCostPct,
  transactionCostInputsFromModel,
  type TransactionCostModel,
} from '../../../src/services/transactionCosts';
import type { Candle } from './researchDataset';

export type Direction = -1 | 0 | 1;

export interface Trade {
  symbol: string;
  familyId: string;
  /** Index of the bar whose close we entered on. */
  entryIndex: number;
  /** Index of the bar whose close we exited on. */
  exitIndex: number;
  /** Entry bar open time, epoch ms. */
  entryTime: number;
  /** Exit bar open time, epoch ms. Used to order the equity curve. */
  exitTime: number;
  direction: -1 | 1;
  entryPrice: number;
  exitPrice: number;
  holdingBars: number;
  /**
   * Fraction of one unit of gross exposure allocated to this trade. A single-symbol
   * family uses 1; a cross-sectional book that holds k longs and k shorts uses
   * 1/(2k) per leg so that total gross exposure stays at one unit and the book is
   * not silently levered by the number of symbols.
   */
  weight: number;
  /**
   * Exposure multiplier read from the sizing series at the entry bar, or 1 when the
   * family is run unsized. `weight` already includes it; this is kept so a sized run
   * can be audited against its unsized twin.
   */
  exposureScale: number;
  /** Price move in percent, signed by direction, before costs and before weight. */
  unweightedGrossPnlPct: number;
  /** Round-trip transaction cost in percent, before weight. */
  unweightedCostPct: number;
  /** `(unweightedGrossPnlPct - unweightedCostPct) * weight`. The number that is summed. */
  netPnlPct: number;
  /** Which walk-forward split scored this trade. */
  splitIndex: number;
}

export interface TradeSummary {
  trades: number;
  longTrades: number;
  shortTrades: number;
  /** Sum of `netPnlPct`, in percentage points. */
  netReturnPct: number;
  grossReturnPct: number;
  totalCostPct: number;
  winRatePct: number;
  /**
   * Gross win / gross loss. `null` when there were no trades. `Infinity` when there
   * were winners and no losers at all -- reported as such rather than coerced to 0,
   * which would perversely fail a strategy for never losing.
   */
  profitFactor: number | null;
  /** Peak-to-trough decline of the time-ordered cumulative equity curve, in points. */
  maxDrawdownPct: number;
  avgHoldingBars: number;
  avgNetPnlPct: number;
}

export interface PositionRange {
  /** Inclusive first bar at which a position may be held. */
  start: number;
  /** Exclusive last bar. Any position still open is closed at bar `end - 1`. */
  end: number;
}

export interface BuildTradesArgs {
  symbol: string;
  familyId: string;
  splitIndex: number;
  candles: readonly Candle[];
  /** One entry per candle; only `[range.start, range.end)` is honored. */
  positions: readonly Direction[];
  range: PositionRange;
  costModel: TransactionCostModel;
  /** Bar size in hours, used to scale the funding interval. */
  hoursPerBar: number;
  /** Gross-exposure weight applied to every trade produced here. Defaults to 1. */
  weight?: number;
  /**
   * Optional per-bar exposure multiplier. The value at a trade's **entry** bar is
   * applied to that whole trade and never re-read afterwards, so a position is sized
   * once when it is opened and not silently re-levered mid-trade -- re-marking
   * exposure every bar would imply rebalancing turnover that this cost model does not
   * charge for. `undefined` at the entry bar means the sizing input was unavailable
   * there, and the trade is dropped rather than taken at an assumed size.
   */
  exposureScale?: readonly (number | undefined)[];
}

function fundingIntervalBarsFor(hoursPerBar: number): number {
  // Perpetual funding settles every 8 hours; express that in bars of this size.
  return Math.max(1, Math.round(8 / Math.max(1, hoursPerBar)));
}

/**
 * Convert a position series into closed trades.
 *
 * Consecutive bars carrying the same non-zero exposure form one trade rather than
 * one trade per bar, so a family that simply stays long is not charged a round trip
 * every hour.
 */
export function buildTrades(args: BuildTradesArgs): Trade[] {
  const { candles, positions, range, costModel, hoursPerBar, symbol, familyId, splitIndex } = args;
  const weight = args.weight ?? 1;
  const fundingIntervalBars = fundingIntervalBarsFor(hoursPerBar);

  const start = Math.max(0, range.start);
  const end = Math.min(range.end, candles.length, positions.length);
  const trades: Trade[] = [];

  let index = start;
  while (index < end - 1) {
    const direction = positions[index];
    if (direction === 0) {
      index += 1;
      continue;
    }

    // Extend while the same exposure persists, but never past the last bar we are
    // allowed to transact on.
    let last = index;
    while (last + 1 <= end - 2 && positions[last + 1] === direction) {
      last += 1;
    }
    const exitIndex = last + 1;

    const entryCandle = candles[index];
    const exitCandle = candles[exitIndex];
    const entryPrice = entryCandle.c;
    const exitPrice = exitCandle.c;
    const holdingBars = exitIndex - index;

    if (entryPrice > 0 && Number.isFinite(entryPrice) && Number.isFinite(exitPrice)) {
      const rawScale = args.exposureScale ? args.exposureScale[index] : 1;
      const exposureScale = rawScale === undefined || !Number.isFinite(rawScale) ? 0 : rawScale;
      if (exposureScale > 0) {
        const effectiveWeight = weight * exposureScale;
        const grossPnlPct = direction * ((exitPrice / entryPrice - 1) * 100);
        const costPct = computeTransactionCostPct({
          ...transactionCostInputsFromModel(costModel, entryPrice, holdingBars),
          fundingIntervalBars,
        });
        trades.push({
          symbol,
          familyId,
          entryIndex: index,
          exitIndex,
          entryTime: entryCandle.t,
          exitTime: exitCandle.t,
          direction: direction === 1 ? 1 : -1,
          entryPrice,
          exitPrice,
          holdingBars,
          weight: effectiveWeight,
          exposureScale,
          unweightedGrossPnlPct: grossPnlPct,
          unweightedCostPct: costPct,
          netPnlPct: (grossPnlPct - costPct) * effectiveWeight,
          splitIndex,
        });
      }
    }

    index = exitIndex;
  }

  return trades;
}

/**
 * Peak-to-trough decline of the cumulative net-P&L curve, in percentage points.
 *
 * Trades are sorted by exit time first, because a book spanning several symbols
 * realizes them interleaved, and walking them in per-symbol order would describe a
 * path the account never took.
 */
export function maxDrawdownPct(trades: readonly Trade[]): number {
  if (trades.length === 0) {
    return 0;
  }
  const ordered = [...trades].sort((left, right) =>
    left.exitTime === right.exitTime ? left.entryTime - right.entryTime : left.exitTime - right.exitTime,
  );

  let equity = 0;
  let peak = 0;
  let worst = 0;
  for (const trade of ordered) {
    equity += trade.netPnlPct;
    if (equity > peak) {
      peak = equity;
    }
    const decline = peak - equity;
    if (decline > worst) {
      worst = decline;
    }
  }
  return worst;
}

export function summarizeTrades(trades: readonly Trade[]): TradeSummary {
  if (trades.length === 0) {
    return {
      trades: 0,
      longTrades: 0,
      shortTrades: 0,
      netReturnPct: 0,
      grossReturnPct: 0,
      totalCostPct: 0,
      winRatePct: 0,
      profitFactor: null,
      maxDrawdownPct: 0,
      avgHoldingBars: 0,
      avgNetPnlPct: 0,
    };
  }

  let netReturnPct = 0;
  let grossReturnPct = 0;
  let totalCostPct = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let wins = 0;
  let longTrades = 0;
  let shortTrades = 0;
  let holdingBars = 0;

  for (const trade of trades) {
    netReturnPct += trade.netPnlPct;
    grossReturnPct += trade.unweightedGrossPnlPct * trade.weight;
    totalCostPct += trade.unweightedCostPct * trade.weight;
    if (trade.netPnlPct > 0) {
      wins += 1;
      grossWin += trade.netPnlPct;
    } else {
      grossLoss += Math.abs(trade.netPnlPct);
    }
    if (trade.direction === 1) {
      longTrades += 1;
    } else {
      shortTrades += 1;
    }
    holdingBars += trade.holdingBars;
  }

  const profitFactor =
    grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Number.POSITIVE_INFINITY : null;

  return {
    trades: trades.length,
    longTrades,
    shortTrades,
    netReturnPct,
    grossReturnPct,
    totalCostPct,
    winRatePct: (wins / trades.length) * 100,
    profitFactor,
    maxDrawdownPct: maxDrawdownPct(trades),
    avgHoldingBars: holdingBars / trades.length,
    avgNetPnlPct: netReturnPct / trades.length,
  };
}
