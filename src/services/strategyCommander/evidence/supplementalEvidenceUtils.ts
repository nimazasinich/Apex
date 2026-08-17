import type { SupplementalDataSource } from '../../providers/supplementalTypes';
import type { CommanderEvidenceQuality } from '../../../contracts/commander/commanderEvidence';

export const SUPPLEMENTAL_EVIDENCE_TTL_MS = 5 * 60_000;

export function supplementalQuality(source: SupplementalDataSource, updatedAt: string, receivedAt: string): CommanderEvidenceQuality {
  if (source === 'not_configured') return 'NOT_CONFIGURED';
  if (source === 'unavailable') return 'MISSING';
  const observed = Date.parse(updatedAt);
  const received = Date.parse(receivedAt);
  if (!Number.isFinite(observed) || !Number.isFinite(received) || observed > received + 5 * 60_000) return 'INVALID';
  if (received - observed > SUPPLEMENTAL_EVIDENCE_TTL_MS) return 'STALE';
  return source === 'live' ? 'VALID' : 'ESTIMATED';
}

export function supplementalExpiry(updatedAt: string): string | undefined {
  const observed = Date.parse(updatedAt);
  return Number.isFinite(observed) ? new Date(observed + SUPPLEMENTAL_EVIDENCE_TTL_MS).toISOString() : undefined;
}

export function exactSupplementalSymbol(expected: string, actual: string): boolean {
  return expected.trim() === actual.trim();
}
