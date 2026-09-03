import type { SupplementalResult } from '../../providers/supplementalTypes';
import type { CommanderEvidenceQuality } from '../../../contracts/commander/commanderEvidence';

export const SUPPLEMENTAL_EVIDENCE_TTL_MS = 5 * 60_000;

export function supplementalObservedAt(result: SupplementalResult): string | null {
  const observed = result.metadata?.sourceObservedAt;
  return observed != null && Number.isFinite(observed) ? new Date(observed).toISOString() : null;
}

export function supplementalQuality(result: SupplementalResult, receivedAt: string): CommanderEvidenceQuality {
  if (result.source === 'not_configured') return 'NOT_CONFIGURED';
  if (result.source === 'unavailable') return 'MISSING';
  const observed = result.metadata?.sourceObservedAt ?? NaN;
  const received = Date.parse(receivedAt);
  if (!Number.isFinite(observed) || !Number.isFinite(received) || observed > received + 5 * 60_000) return 'INVALID';
  if (received - observed > SUPPLEMENTAL_EVIDENCE_TTL_MS) return 'STALE';
  return result.source === 'live' && result.metadata?.decisionEligible === true ? 'VALID' : 'ESTIMATED';
}

export function supplementalExpiry(result: SupplementalResult): string | undefined {
  const observed = result.metadata?.sourceObservedAt ?? NaN;
  return Number.isFinite(observed) ? new Date(observed + SUPPLEMENTAL_EVIDENCE_TTL_MS).toISOString() : undefined;
}

export function exactSupplementalSymbol(expected: string, actual: string): boolean {
  return expected.trim() === actual.trim();
}
