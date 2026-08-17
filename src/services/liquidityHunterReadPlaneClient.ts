import type { LiquidityHunterEvaluation } from '../contracts/realtime/liquidityHunterState';

export type LiquidityHunterClientAction =
  | { kind: 'EVALUATION'; evaluation: LiquidityHunterEvaluation }
  | { kind: 'RESYNC'; reason: string }
  | { kind: 'IGNORE' };

export function interpretLiquidityHunterReadPlaneMessage(value: unknown): LiquidityHunterClientAction {
  if (!value || typeof value !== 'object') return { kind: 'IGNORE' };
  const message = value as { type?: string; evaluation?: LiquidityHunterEvaluation | null; reason?: string };
  if (message.type === 'RESYNC_REQUIRED') return { kind: 'RESYNC', reason: message.reason || 'fresh_snapshot_required' };
  if ((message.type === 'SNAPSHOT' || message.type === 'PATCH') && message.evaluation) return { kind: 'EVALUATION', evaluation: message.evaluation };
  return { kind: 'IGNORE' };
}
