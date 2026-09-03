import type { BacktestResult, StrategyParameterDefinition, TradeDirection } from '../../types';

export type BacktestInterval = '5m' | '15m' | '1h' | '4h' | '1d';
export type BacktestRiskProfile = 'aggressive' | 'balanced' | 'conservative';
export type BacktestEvidenceTab = 'summary' | 'notes' | 'trades' | 'costs' | 'assumptions' | 'data-quality' | 'runtime' | 'history';
export type BacktestChartView = 'equity' | 'drawdown' | 'distribution' | 'exposure';
export type BacktestChartAggregation = 'cumulative' | 'daily' | 'weekly';

export interface BacktestRunConfig {
  strategyId: string;
  symbol: string;
  direction: TradeDirection;
  interval: BacktestInterval;
  bars: number;
  maxHoldBars: number;
  commissionPct: number;
  slippagePct: number;
  fundingPct: number;
  parameters: Record<string, number | string>;
}

export interface BacktestStrategyPreset {
  id: string;
  name: string;
  tags: Array<{ label: string; tone: 'green' | 'blue' | 'red' | 'violet' }>;
  description: string;
  disabled?: boolean;
  blockedReason?: string;
  supportedIntervals: BacktestInterval[];
  dataTier: 'Standard' | 'Funding' | 'Level 2' | 'Cross-venue';
  allowedDirections: TradeDirection[];
  parameters: StrategyParameterDefinition[];
}

export type CostAdjustedTrade = BacktestResult['timeline'][number] & {
  adjustedReturnPct: number;
  equity: number;
  drawdownPct: number;
  tradeNumber: number;
  dateLabel: string;
  timeLabel: string;
};

export interface BacktestLocalSummary {
  wins: number;
  losses: number;
  timed: number;
  trades: number;
  netReturnPct: number;
  finalBalance: number;
  winRatePct: number;
  maxDrawdownPct: number;
  avgTradePct: number;
  profitFactor: number | null;
  expectancyR: number;
  bestTradePct: number;
  worstTradePct: number;
  bestTradeLabel: string;
  worstTradeLabel: string;
  avgBarsHeld: number;
}

export interface BacktestHistoryEntry {
  id: string;
  timestamp: number;
  symbol: string;
  direction: TradeDirection;
  interval: BacktestInterval;
  netReturnPct: number;
}

export interface BacktestEquityPoint {
  tradeNumber: number;
  equity: number;
  drawdown: number;
  dateLabel: string;
  timestamp: number;
}

export interface BacktestMarketPoint {
  step: number;
  timestamp: number;
  dateLabel: string;
  normalized: number;
  close: number;
}

export type BacktestStudioMode = 'smart' | 'manual';
export type SmartBacktestPhase = 'idle' | 'auto_configure' | 'testing' | 'evaluating' | 'improving' | 'checkpointed' | 'stopping' | 'stopped' | 'completed' | 'failed';

export interface SmartBacktestCheckpoint {
  id: string;
  status: SmartBacktestPhase;
  iteration: number;
  maxIterations: number;
  noImprovementIterations: number;
  maxRuntimeMs: number;
  startedAt: number;
  updatedAt: number;
  elapsedMs: number;
  configKey: string;
  bestScore: number | null;
  latestScore: number | null;
  bestRunId: string | null;
  latestRunId: string | null;
  bestNetReturnPct: number | null;
  latestNetReturnPct: number | null;
  latestTradeCount: number | null;
  /** Complete run identities already evaluated by this campaign. */
  experimentFingerprints?: string[];
  /** Whether the last optimizer step produced and activated a new research subject. */
  lastOptimizationAdvanced?: boolean;
  stopReason: string | null;
  lastChange: string;
  nextAction: string;
}
