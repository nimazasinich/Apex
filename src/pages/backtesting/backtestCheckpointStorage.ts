import type { BacktestResult } from '../../types';
import type { BacktestRunConfig, BacktestRiskProfile, SmartBacktestCheckpoint, SmartBacktestPhase } from './backtestingTypes';

export const SMART_CHECKPOINT_KEY = 'apex:backtesting-smart-checkpoint:v1';
export const SMART_MAX_ITERATIONS = 250;
export const SMART_MAX_RUNTIME_MS = 2 * 60 * 60 * 1_000;
export const SMART_NO_IMPROVEMENT_LIMIT = 20;
export const SMART_ITERATION_PAUSE_MS = 250;

export const BAR_OPTIONS = [500, 1_000, 2_000, 3_000, 5_000] as const;
export const HOLD_OPTIONS = [12, 24, 48, 72, 120, 240] as const;
export const RISK_PROFILES: ReadonlyArray<{ id: BacktestRiskProfile; label: string; riskPct: number }> = [
  { id: 'aggressive', label: 'Aggressive', riskPct: 2 },
  { id: 'balanced', label: 'Balanced', riskPct: 1 },
  { id: 'conservative', label: 'Conservative', riskPct: 0.5 },
];

export function readSmartCheckpoint(): SmartBacktestCheckpoint | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SMART_CHECKPOINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SmartBacktestCheckpoint;
    return parsed && typeof parsed.id === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function persistSmartCheckpoint(checkpoint: SmartBacktestCheckpoint | null): void {
  if (typeof window === 'undefined') return;
  if (!checkpoint) window.localStorage.removeItem(SMART_CHECKPOINT_KEY);
  else window.localStorage.setItem(SMART_CHECKPOINT_KEY, JSON.stringify(checkpoint));
}

export function scoreSmartBacktest(result: BacktestResult): number {
  const profitFactor = result.profitFactor == null || !Number.isFinite(result.profitFactor) ? 1 : Math.min(result.profitFactor, 5);
  const tradePenalty = result.timeline.length === 0 ? 25 : result.timeline.length < 5 ? 8 : 0;
  const dataPenalty = result.dataState === 'live' ? 0 : result.dataState === 'degraded' ? 8 : 18;
  return result.totalPnlPct - Math.abs(result.maxDrawdownPct) * 0.55 + profitFactor * 3 + result.historicalWinRatePct * 0.08 - tradePenalty - dataPenalty;
}

export function phaseLabel(phase: SmartBacktestPhase): string {
  return phase.replaceAll('_', ' ');
}

export interface ExportResultOptions {
  result: BacktestResult;
  completedConfig: BacktestRunConfig | null;
  riskProfile: BacktestRiskProfile;
  riskPct: number;
  capital: number;
  finalBalance: number;
  netReturnPct: number;
}

export function exportBacktestResult({
  result,
  completedConfig,
  riskProfile,
  riskPct,
  capital,
  finalBalance,
  netReturnPct,
}: ExportResultOptions): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    provenance: {
      source: result.source,
      runId: result.audit?.runId,
      engine: result.audit?.engine,
      generatedAt: result.audit?.generatedAt,
      dataState: result.dataState,
    },
    runConfiguration: completedConfig,
    canonicalResult: result,
    localDisplayCalculation: {
      riskProfile,
      riskPct,
      startingCapital: capital,
      finalBalance,
      netReturnPct,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `apex-backtest-${result.symbol}-${result.direction.toLowerCase()}-${result.interval}-${result.requestedBars ?? result.candlesUsed}bars.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
