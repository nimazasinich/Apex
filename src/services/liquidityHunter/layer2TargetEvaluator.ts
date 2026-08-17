import type { EdgeEvidence } from '../../contracts/realtime/edgeEvidence';
import type { LayerDecision, LiquidityHunterTarget, MacroRegimeDecision } from '../../contracts/realtime/liquidityHunterState';

function edge(evidence: EdgeEvidence[], id: EdgeEvidence['edgeId']): EdgeEvidence | null {
  return evidence.find((row) => row.edgeId === id) ?? null;
}

function missing(row: EdgeEvidence | null): boolean {
  return !row || ['UNKNOWN', 'STALE', 'NOT_CONFIGURED'].includes(row.status);
}

export function evaluateLayer2Target(evidence: EdgeEvidence[], macro: MacroRegimeDecision, now = Date.now()): { layer: LayerDecision; target: LiquidityHunterTarget | null } {
  const liquidation = edge(evidence, 'LIQUIDATION_TOPOLOGY');
  const session = edge(evidence, 'SESSION_LIQUIDITY');
  const missingEvidence = [liquidation, session].filter((row): row is EdgeEvidence => Boolean(row && missing(row)));
  const supporting: EdgeEvidence[] = [];
  const conflicting: EdgeEvidence[] = [];

  const sweepAligned = liquidation?.status === 'PASS' && (
    (macro.expectedSweepDirection === 'DOWN' && liquidation.direction === 'SHORT') ||
    (macro.expectedSweepDirection === 'UP' && liquidation.direction === 'LONG')
  );
  if (sweepAligned && liquidation) supporting.push(liquidation);
  else if (liquidation && !missing(liquidation)) conflicting.push(liquidation);

  const sessionAligned = session?.status === 'PASS' && (
    session.direction === 'NEUTRAL' ||
    session.direction === macro.postSweepTradeBias ||
    // Before the sweep, SMC may still reflect the sweep direction; do not let
    // this alone reverse the target, but record it as weaker support.
    (macro.expectedSweepDirection === 'DOWN' && session.direction === 'SHORT') ||
    (macro.expectedSweepDirection === 'UP' && session.direction === 'LONG')
  );
  if (sessionAligned && session) supporting.push(session);
  else if (session && !missing(session)) conflicting.push(session);

  const rawTarget = liquidation?.metadata?.target as Record<string, unknown> | undefined;
  let target: LiquidityHunterTarget | null = null;
  if (sweepAligned && rawTarget) {
    const lowerPrice = Number(rawTarget.lowerPrice);
    const upperPrice = Number(rawTarget.upperPrice);
    const midpoint = Number(rawTarget.midpoint);
    const side = String(rawTarget.side || '');
    if (Number.isFinite(lowerPrice) && Number.isFinite(upperPrice) && Number.isFinite(midpoint) && lowerPrice > 0 && upperPrice >= lowerPrice) {
      target = {
        sourceEdge: 'LIQUIDATION_TOPOLOGY',
        liquidityType: side === 'LONG' ? 'LONG_LIQUIDATIONS' : 'SHORT_LIQUIDATIONS',
        lowerPrice,
        upperPrice,
        midpoint,
        invalidationPrice: null,
        validUntil: liquidation!.expiresAt,
      };
    }
  }
  const passed = Boolean(target && sessionAligned && target.validUntil > now);
  const expiresAt = target?.validUntil ?? now;
  return {
    target,
    layer: {
      layer: 2,
      status: passed ? 'PASSED' : 'BLOCKED',
      supporting,
      conflicting,
      missing: missingEvidence,
      decidedAt: now,
      expiresAt,
    },
  };
}
