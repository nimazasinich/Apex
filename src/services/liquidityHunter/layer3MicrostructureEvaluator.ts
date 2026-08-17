import type { EdgeEvidence } from '../../contracts/realtime/edgeEvidence';
import type { LayerDecision, LiquidityHunterTarget, MacroRegimeDecision, MicroTriggerDecision } from '../../contracts/realtime/liquidityHunterState';
import { clamp01 } from './edgeRuntime';

function edge(evidence: EdgeEvidence[], id: EdgeEvidence['edgeId']): EdgeEvidence | null {
  return evidence.find((row) => row.edgeId === id) ?? null;
}

function unavailable(row: EdgeEvidence | null): boolean {
  return !row || ['UNKNOWN', 'STALE', 'NOT_CONFIGURED'].includes(row.status);
}

export function evaluateLayer3Microstructure(
  evidence: EdgeEvidence[],
  macro: MacroRegimeDecision,
  target: LiquidityHunterTarget | null,
  now = Date.now(),
): { layer: LayerDecision; trigger: MicroTriggerDecision } {
  const cvd = edge(evidence, 'MULTI_EXCHANGE_CVD');
  const iceberg = edge(evidence, 'ICEBERG_ABSORPTION');
  const missing = [cvd, iceberg].filter((row): row is EdgeEvidence => Boolean(row && unavailable(row)));
  const supporting: EdgeEvidence[] = [];
  const conflicting: EdgeEvidence[] = [];
  const desiredDirection = macro.postSweepTradeBias === 'LONG' || macro.postSweepTradeBias === 'SHORT' ? macro.postSweepTradeBias : null;
  const cvdClassification = String(cvd?.metadata?.classification || 'NONE');
  const cvdAbsorption = desiredDirection === 'LONG' ? cvdClassification === 'ABSORPTION_LONG' : desiredDirection === 'SHORT' ? cvdClassification === 'ABSORPTION_SHORT' : false;
  const cvdAligned = cvd?.status === 'PASS' && cvdAbsorption && cvd.direction === desiredDirection && cvd.dataQuality >= 0.85;
  const icebergAligned = iceberg?.status === 'PASS' && iceberg.direction === desiredDirection && iceberg.dataQuality >= 0.9;
  if (cvdAligned && cvd) supporting.push(cvd); else if (cvd && !unavailable(cvd)) conflicting.push(cvd);
  if (icebergAligned && iceberg) supporting.push(iceberg); else if (iceberg && !unavailable(iceberg)) conflicting.push(iceberg);

  const passed = Boolean(target && target.validUntil > now && desiredDirection && cvdAligned && icebergAligned);
  let invalidationPrice: number | null = null;
  if (passed && target) {
    invalidationPrice = desiredDirection === 'LONG' ? target.lowerPrice * 0.999 : target.upperPrice * 1.001;
  }
  const score = clamp01(((cvd?.score ?? 0) * 0.55) + ((iceberg?.score ?? 0) * 0.45));
  const trigger: MicroTriggerDecision = passed ? {
    kind: 'ABSORPTION_REVERSAL_TRIGGER',
    direction: desiredDirection,
    score,
    invalidationPrice,
    reasons: ['cvd_absorption_aligned', 'iceberg_replenishment_aligned', 'target_unexpired'],
  } : {
    kind: target?.validUntil && target.validUntil <= now ? 'INVALIDATED' : unavailable(cvd) || unavailable(iceberg) ? 'DEFERRED' : 'NO_TRIGGER',
    direction: null,
    score,
    invalidationPrice: null,
    reasons: [
      ...(!target ? ['target_missing'] : []),
      ...(target && target.validUntil <= now ? ['target_expired'] : []),
      ...(!cvdAligned ? ['cvd_absorption_not_aligned'] : []),
      ...(!icebergAligned ? ['iceberg_absorption_not_aligned'] : []),
    ],
  };

  return {
    trigger,
    layer: {
      layer: 3,
      status: passed ? 'PASSED' : target && target.validUntil <= now ? 'EXPIRED' : 'BLOCKED',
      supporting,
      conflicting,
      missing,
      decidedAt: now,
      expiresAt: passed ? Math.min(cvd!.expiresAt, iceberg!.expiresAt, target!.validUntil) : now,
    },
  };
}
