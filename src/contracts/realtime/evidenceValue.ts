export const EVIDENCE_QUALITIES = [
  'VALID',
  'ESTIMATED',
  'STALE',
  'MISSING',
  'INVALID',
  'NOT_CONFIGURED',
] as const;

export type EvidenceQuality = (typeof EVIDENCE_QUALITIES)[number];

export interface EvidenceValue<T> {
  value: T | null;
  observedAt: number;
  receivedAt: number;
  expiresAt: number;
  source: string;
  sourceVersion: string;
  quality: EvidenceQuality;
  sequence?: number;
  reasons: string[];
}

export interface EvidenceValueValidation {
  ok: boolean;
  reasons: string[];
}

export function isEvidenceQuality(value: unknown): value is EvidenceQuality {
  return typeof value === 'string' && (EVIDENCE_QUALITIES as readonly string[]).includes(value);
}

export function containsNonFiniteNumber(value: unknown, depth = 0): boolean {
  if (depth > 32) return true;
  if (typeof value === 'number') return !Number.isFinite(value);
  if (value === null || value === undefined || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((entry) => containsNonFiniteNumber(entry, depth + 1));
  return Object.values(value as Record<string, unknown>)
    .some((entry) => containsNonFiniteNumber(entry, depth + 1));
}

export function validateEvidenceValue<T>(candidate: EvidenceValue<T>): EvidenceValueValidation {
  const reasons: string[] = [];
  if (!isEvidenceQuality(candidate.quality)) reasons.push('invalid_quality');
  if (!Number.isFinite(candidate.observedAt) || candidate.observedAt < 0) reasons.push('invalid_observed_at');
  if (!Number.isFinite(candidate.receivedAt) || candidate.receivedAt < 0) reasons.push('invalid_received_at');
  if (!Number.isFinite(candidate.expiresAt) || candidate.expiresAt < candidate.observedAt) reasons.push('invalid_expires_at');
  if (!candidate.source.trim()) reasons.push('source_required');
  if (!candidate.sourceVersion.trim()) reasons.push('source_version_required');
  if (candidate.sequence !== undefined && (!Number.isSafeInteger(candidate.sequence) || candidate.sequence < 0)) {
    reasons.push('invalid_sequence');
  }
  if (!Array.isArray(candidate.reasons) || candidate.reasons.some((reason) => typeof reason !== 'string')) {
    reasons.push('invalid_reasons');
  }
  if (candidate.value !== null && containsNonFiniteNumber(candidate.value)) reasons.push('non_finite_value');
  if ((candidate.quality === 'MISSING' || candidate.quality === 'NOT_CONFIGURED' || candidate.quality === 'INVALID')
      && candidate.value !== null) {
    reasons.push('unavailable_quality_requires_null');
  }
  return { ok: reasons.length === 0, reasons };
}

export function assertValidEvidenceValue<T>(candidate: EvidenceValue<T>): void {
  const validation = validateEvidenceValue(candidate);
  if (!validation.ok) throw new Error(`invalid_evidence_value:${validation.reasons.join(',')}`);
}
