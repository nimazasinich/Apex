import type { BacktestResult } from '../../types';
import type { BacktestLocalSummary, CostAdjustedTrade } from './backtestingTypes';

export function emptyLocalSummary(capital: number): BacktestLocalSummary {
  return {
    wins: 0,
    losses: 0,
    timed: 0,
    trades: 0,
    netReturnPct: 0,
    finalBalance: capital,
    winRatePct: 0,
    maxDrawdownPct: 0,
    avgTradePct: 0,
    profitFactor: null,
    expectancyR: 0,
    bestTradePct: 0,
    worstTradePct: 0,
    bestTradeLabel: '—',
    worstTradeLabel: '—',
    avgBarsHeld: 0,
  };
}

/**
 * Derives display-only scenario metrics from engine-returned R-multiples after
 * applying the selected UI risk profile. These values never overwrite the
 * canonical metrics returned by the server.
 */
export function deriveLocalBacktestSummary(
  result: BacktestResult | null,
  trades: CostAdjustedTrade[],
  capital: number,
): BacktestLocalSummary {
  if (!result || !trades.length) return emptyLocalSummary(capital);

  const wins = trades.filter((trade) => trade.outcome === 'WIN').length;
  const losses = trades.filter((trade) => trade.outcome === 'LOSS').length;
  const timed = trades.filter((trade) => trade.outcome === 'OPEN').length;
  const finalEquity = trades.at(-1)?.equity ?? 100;
  const grossWins = trades.reduce((sum, trade) => sum + Math.max(0, trade.adjustedReturnPct), 0);
  const grossLosses = Math.abs(trades.reduce((sum, trade) => sum + Math.min(0, trade.adjustedReturnPct), 0));
  const returns = trades.map((trade) => trade.adjustedReturnPct);
  const best = trades.reduce((left, right) => right.adjustedReturnPct > left.adjustedReturnPct ? right : left, trades[0]);
  const worst = trades.reduce((left, right) => right.adjustedReturnPct < left.adjustedReturnPct ? right : left, trades[0]);

  return {
    wins,
    losses,
    timed,
    trades: trades.length,
    netReturnPct: finalEquity - 100,
    finalBalance: capital * finalEquity / 100,
    winRatePct: (wins / trades.length) * 100,
    maxDrawdownPct: Math.abs(Math.min(0, ...trades.map((trade) => trade.drawdownPct))),
    avgTradePct: returns.reduce((sum, value) => sum + value, 0) / returns.length,
    profitFactor: grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? null : 0,
    expectancyR: trades.reduce((sum, trade) => sum + trade.rMultiple, 0) / trades.length,
    bestTradePct: best.adjustedReturnPct,
    worstTradePct: worst.adjustedReturnPct,
    bestTradeLabel: best.dateLabel,
    worstTradeLabel: worst.dateLabel,
    avgBarsHeld: trades.reduce((sum, trade) => sum + Number(trade.barsHeld || 0), 0) / trades.length,
  };
}
