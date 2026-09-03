import type { SignalDecisionLog, TradeDirection } from '../types';
import type { LiveMarketRegime } from './liveMarketRegime';

export interface EmpiricalDecisionCalibration {
  version: 'decision_calibration_v1';
  probability: number | null;
  uncertainty: number | null;
  sampleSize: number;
  wins: number;
  losses: number;
  scope: 'REGIME_DIRECTION' | 'DIRECTION' | 'GLOBAL' | 'INSUFFICIENT';
  regime: LiveMarketRegime;
  direction: TradeDirection;
}

function mapRegime(value: unknown): LiveMarketRegime | null {
  const text = String(value || '');
  if (['TREND_UP', 'TREND_DOWN', 'RANGE', 'HIGH_VOLATILITY', 'TRANSITION', 'UNKNOWN'].includes(text)) return text as LiveMarketRegime;
  if (text === 'CHOP') return 'RANGE';
  if (text === 'SQUEEZE_RISK') return 'HIGH_VOLATILITY';
  if (text === 'MIXED') return 'TRANSITION';
  return null;
}

function resolved(rows: SignalDecisionLog[]) {
  return rows.filter((row) => row.decision === 'ACCEPTED' && (row.laterOutcome === 'WIN' || row.laterOutcome === 'LOSS'));
}

function posterior(rows: SignalDecisionLog[], regime: LiveMarketRegime, direction: TradeDirection, scope: EmpiricalDecisionCalibration['scope']): EmpiricalDecisionCalibration {
  const wins = rows.filter((row) => row.laterOutcome === 'WIN').length;
  const losses = rows.filter((row) => row.laterOutcome === 'LOSS').length;
  const n = wins + losses;
  if (!n) return { version: 'decision_calibration_v1', probability: null, uncertainty: null, sampleSize: 0, wins: 0, losses: 0, scope: 'INSUFFICIENT', regime, direction };
  // Beta(2,2) weak prior prevents tiny live samples from emitting false certainty.
  const alpha = wins + 2;
  const beta = losses + 2;
  const total = alpha + beta;
  const probability = alpha / total;
  const variance = (alpha * beta) / (total * total * (total + 1));
  return {
    version: 'decision_calibration_v1', probability: Number(probability.toFixed(4)),
    uncertainty: Number(Math.sqrt(variance).toFixed(4)), sampleSize: n, wins, losses, scope, regime, direction,
  };
}

/**
 * Outcome-backed probability calibration. This never authorizes a trade and is
 * deliberately unavailable until enough resolved LIVE observations exist.
 */
export function calibrateDecisionFromMemory(
  rows: SignalDecisionLog[],
  input: { regime: LiveMarketRegime; direction: TradeDirection },
): EmpiricalDecisionCalibration {
  const all = resolved(rows);
  const byDirection = all.filter((row) => row.direction === input.direction);
  const byRegimeDirection = byDirection.filter((row) => mapRegime(row.marketRegime) === input.regime);
  if (byRegimeDirection.length >= 20) return posterior(byRegimeDirection, input.regime, input.direction, 'REGIME_DIRECTION');
  if (byDirection.length >= 35) return posterior(byDirection, input.regime, input.direction, 'DIRECTION');
  if (all.length >= 60) return posterior(all, input.regime, input.direction, 'GLOBAL');
  return { version: 'decision_calibration_v1', probability: null, uncertainty: null, sampleSize: all.length, wins: 0, losses: 0, scope: 'INSUFFICIENT', regime: input.regime, direction: input.direction };
}
