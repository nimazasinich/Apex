export type WalletGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F' | 'UNRATED';

export interface WalletGradeInput {
  closedTrades: number | null;
  netPnlPct: number | null;
  maxDrawdownPct: number | null;
}

export function deriveWalletGrade(input: WalletGradeInput): WalletGrade {
  const trades = input.closedTrades ?? 0;
  const pnl = input.netPnlPct;
  const drawdown = input.maxDrawdownPct;
  if (trades < 30 || pnl === null || drawdown === null) return 'UNRATED';
  if (trades >= 100 && pnl >= 20 && drawdown <= 12) return 'S';
  if (trades >= 60 && pnl >= 10 && drawdown <= 18) return 'A';
  if (pnl >= 3 && drawdown <= 25) return 'B';
  if (pnl >= -3 && drawdown <= 35) return 'C';
  if (pnl < -10 || drawdown >= 45) return 'F';
  return 'D';
}

export const WALLET_GRADING_VERSION = 'wallet_grade_v2_fee_funding_adjusted';

export interface WalletRealizedTradeSample {
  timestamp: number;
  closedPnlUsd: number;
  feeUsd: number;
  notionalUsd: number;
}

export interface WalletFundingSample {
  timestamp: number;
  fundingUsd: number;
}

export interface WalletPerformanceMetrics {
  closedTrades: number;
  historyDays: number;
  realizedTradePnlUsd: number;
  feesUsd: number;
  fundingUsd: number;
  netPnlUsd: number;
  winRate: number | null;
  profitFactor: number | null;
  maxRealizedDrawdownUsd: number;
  drawdownToGrossProfitRatio: number | null;
  sizingCv: number | null;
  completeHistory: boolean;
}

function safeMean(values: readonly number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function coefficientOfVariation(values: readonly number[]): number | null {
  const mean = safeMean(values);
  if (mean === null || mean <= 0 || values.length < 2) return null;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const result = Math.sqrt(Math.max(0, variance)) / mean;
  return Number.isFinite(result) ? result : null;
}

export function computeWalletPerformanceMetrics(input: {
  trades: readonly WalletRealizedTradeSample[];
  funding: readonly WalletFundingSample[];
  completeHistory: boolean;
}): WalletPerformanceMetrics {
  const trades = [...input.trades]
    .filter((row) => Number.isFinite(row.timestamp) && Number.isFinite(row.closedPnlUsd) && Number.isFinite(row.feeUsd) && Number.isFinite(row.notionalUsd) && row.notionalUsd >= 0)
    .sort((a, b) => a.timestamp - b.timestamp);
  const funding = [...input.funding]
    .filter((row) => Number.isFinite(row.timestamp) && Number.isFinite(row.fundingUsd))
    .sort((a, b) => a.timestamp - b.timestamp);
  const closedTrades = trades.length;
  const realizedTradePnlUsd = trades.reduce((sum, row) => sum + row.closedPnlUsd, 0);
  const feesUsd = trades.reduce((sum, row) => sum + Math.abs(row.feeUsd), 0);
  const fundingUsd = funding.reduce((sum, row) => sum + row.fundingUsd, 0);
  const tradeNet = trades.map((row) => row.closedPnlUsd - Math.abs(row.feeUsd));
  const netPnlUsd = tradeNet.reduce((sum, value) => sum + value, 0) + fundingUsd;
  const wins = tradeNet.filter((value) => value > 0);
  const losses = tradeNet.filter((value) => value < 0);
  const grossProfit = wins.reduce((sum, value) => sum + value, 0);
  const grossLossAbs = Math.abs(losses.reduce((sum, value) => sum + value, 0));
  const winRate = closedTrades ? wins.length / closedTrades : null;
  const profitFactor = grossLossAbs > 0 ? grossProfit / grossLossAbs : grossProfit > 0 ? 10 : null;
  const timeline = [
    ...trades.map((row) => ({ timestamp: row.timestamp, delta: row.closedPnlUsd - Math.abs(row.feeUsd) })),
    ...funding.map((row) => ({ timestamp: row.timestamp, delta: row.fundingUsd })),
  ].sort((a, b) => a.timestamp - b.timestamp);
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const row of timeline) {
    equity += row.delta;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  const firstTimestamp = timeline.at(0)?.timestamp ?? null;
  const lastTimestamp = timeline.at(-1)?.timestamp ?? null;
  const historyDays = firstTimestamp !== null && lastTimestamp !== null && lastTimestamp >= firstTimestamp
    ? (lastTimestamp - firstTimestamp) / (24 * 60 * 60 * 1000)
    : 0;
  const drawdownToGrossProfitRatio = grossProfit > 0 ? maxDrawdown / grossProfit : maxDrawdown > 0 ? 10 : null;
  const sizingCv = coefficientOfVariation(trades.map((row) => row.notionalUsd).filter((value) => value > 0));
  return {
    closedTrades,
    historyDays,
    realizedTradePnlUsd,
    feesUsd,
    fundingUsd,
    netPnlUsd,
    winRate,
    profitFactor: profitFactor === null ? null : Math.min(10, Math.max(0, profitFactor)),
    maxRealizedDrawdownUsd: maxDrawdown,
    drawdownToGrossProfitRatio: drawdownToGrossProfitRatio === null ? null : Math.min(10, Math.max(0, drawdownToGrossProfitRatio)),
    sizingCv: sizingCv === null ? null : Math.min(10, Math.max(0, sizingCv)),
    completeHistory: input.completeHistory,
  };
}

/**
 * Conservative fee/funding-adjusted wallet grade that does not require a
 * fabricated account-equity percentage. It grades only from realized public
 * history and remains UNRATED when the historical fetch was truncated.
 */
export function deriveWalletGradeV2(metrics: WalletPerformanceMetrics): WalletGrade {
  if (!metrics.completeHistory) return 'UNRATED';
  if (metrics.closedTrades < 60 || metrics.historyDays < 14) return 'UNRATED';
  const pf = metrics.profitFactor;
  const wr = metrics.winRate;
  const dd = metrics.drawdownToGrossProfitRatio;
  if (pf === null || wr === null || dd === null) return 'UNRATED';
  const sizingCv = metrics.sizingCv ?? 10;
  if (metrics.closedTrades >= 120 && metrics.historyDays >= 30 && metrics.netPnlUsd > 0 && pf >= 1.5 && wr >= 0.52 && dd <= 0.35 && sizingCv <= 2.5) return 'S';
  if (metrics.closedTrades >= 80 && metrics.historyDays >= 21 && metrics.netPnlUsd > 0 && pf >= 1.25 && wr >= 0.48 && dd <= 0.60 && sizingCv <= 4) return 'A';
  if (metrics.netPnlUsd > 0 && pf >= 1.10 && dd <= 0.90) return 'B';
  if (metrics.netPnlUsd >= 0 && pf >= 0.95) return 'C';
  if (metrics.closedTrades >= 80 && metrics.historyDays >= 21 && metrics.netPnlUsd < 0 && pf <= 0.80 && (wr <= 0.45 || dd >= 1.0)) return 'F';
  return 'D';
}
