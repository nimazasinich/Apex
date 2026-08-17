import { createHash } from 'node:crypto';
import type { SignalDecisionLog } from '../types';

export interface DecisionMemoryExportPayload {
  version: 1;
  schema: 'apex-decision-memory-v1';
  exportedAt: string;
  source: string;
  rowCount: number;
  contentSha256: string;
  rows: SignalDecisionLog[];
}

/** Stable content hash intentionally excludes exportedAt so retries/restarts are idempotent. */
export function decisionMemoryRowsSha256(rows: SignalDecisionLog[]): string {
  const canonical = [...rows]
    .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))
    .map((row) => row);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function buildDecisionMemoryExportPayload(
  rows: SignalDecisionLog[],
  source: string,
): DecisionMemoryExportPayload {
  return {
    version: 1,
    schema: 'apex-decision-memory-v1',
    exportedAt: new Date().toISOString(),
    source,
    rowCount: rows.length,
    contentSha256: decisionMemoryRowsSha256(rows),
    rows,
  };
}

export function validateDecisionMemoryExportPayload(value: unknown): { valid: boolean; reason: string | null; rows: SignalDecisionLog[] } {
  if (!value || typeof value !== 'object') return { valid: false, reason: 'payload_not_object', rows: [] };
  const payload = value as Partial<DecisionMemoryExportPayload>;
  if (payload.version !== 1 || payload.schema !== 'apex-decision-memory-v1' || !Array.isArray(payload.rows)) {
    return { valid: false, reason: 'payload_schema_unsupported', rows: [] };
  }
  if (!Number.isInteger(payload.rowCount) || payload.rowCount !== payload.rows.length) {
    return { valid: false, reason: 'payload_row_count_mismatch', rows: [] };
  }
  const rows = payload.rows as SignalDecisionLog[];
  if (typeof payload.contentSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(payload.contentSha256)) {
    return { valid: false, reason: 'payload_checksum_missing', rows: [] };
  }
  if (decisionMemoryRowsSha256(rows) !== payload.contentSha256) {
    return { valid: false, reason: 'payload_checksum_mismatch', rows: [] };
  }
  return { valid: true, reason: null, rows };
}

export function countResolvedDecisionRows(rows: SignalDecisionLog[]): number {
  return rows.filter(
    (row) => row.laterOutcome === 'WIN' || row.laterOutcome === 'LOSS' || row.laterOutcome === 'BREAKEVEN',
  ).length;
}

export function countResolvedAcceptedRows(rows: SignalDecisionLog[]): number {
  return rows.filter(
    (row) =>
      row.decision === 'ACCEPTED' &&
      (row.laterOutcome === 'WIN' || row.laterOutcome === 'LOSS' || row.laterOutcome === 'BREAKEVEN'),
  ).length;
}
