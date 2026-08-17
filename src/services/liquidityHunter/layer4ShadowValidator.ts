import type { EdgeEvidence } from '../../contracts/realtime/edgeEvidence';
import type { LayerDecision, MicroTriggerDecision, ShadowValidationDecision } from '../../contracts/realtime/liquidityHunterState';

function unavailable(row: EdgeEvidence): boolean {
  return ['UNKNOWN', 'STALE', 'NOT_CONFIGURED'].includes(row.status);
}

export function evaluateLayer4Shadow(evidence: EdgeEvidence[], trigger: MicroTriggerDecision, now = Date.now()): { layer: LayerDecision; decision: ShadowValidationDecision } {
  const rows = evidence.filter((row) => ['WHALE_POSITIONING', 'CONTRARIAN_WALLETS', 'META_MODEL'].includes(row.edgeId));
  const missing = rows.filter(unavailable);
  const configured = rows.filter((row) => !unavailable(row));
  const direction = trigger.direction;
  const supporting = configured.filter((row) => row.status === 'PASS' && direction !== null && row.direction === direction);
  const conflicting = configured.filter((row) => row.status === 'PASS' && direction !== null && row.direction !== 'NEUTRAL' && row.direction !== direction);

  let supportWeight = 0;
  for (const row of supporting) supportWeight += row.edgeId === 'META_MODEL' ? 0.5 : 1;
  const strongConflict = conflicting.some((row) => (row.score ?? 0) >= 0.65 && row.dataQuality >= 0.75);
  let decision: ShadowValidationDecision;
  if (!direction || trigger.kind !== 'ABSORPTION_REVERSAL_TRIGGER') decision = 'DEFER';
  else if (strongConflict) decision = 'REJECT';
  else if (supportWeight >= 2) decision = 'CONFIRM';
  else if (supportWeight >= 1) decision = 'CONFIRM_WITH_REDUCED_SIZE';
  else if (!configured.length) decision = 'UNKNOWN';
  else decision = 'DEFER';

  return {
    decision,
    layer: {
      layer: 4,
      status: decision === 'CONFIRM' || decision === 'CONFIRM_WITH_REDUCED_SIZE' ? 'PASSED' : 'BLOCKED',
      supporting,
      conflicting,
      missing,
      decidedAt: now,
      expiresAt: supporting.length ? Math.min(...supporting.map((row) => row.expiresAt)) : now,
    },
  };
}
