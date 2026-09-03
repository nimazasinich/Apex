/**
 * APEX Research Agent — shared, read-only data loaders.
 *
 * Nothing in this file writes anything, decides pass/fail, or touches the
 * sealed holdout. It exists purely so summarizeRuns.mts and flagRunRisks.mts
 * don't each re-implement the same "read run-records/ledger/holdout-history
 * off disk" logic slightly differently.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export interface RunRecord {
  id: string;
  script: string;
  studySha256?: string;
  hypothesis?: string | null;
  attempt?: number;
  maxAttempts?: number;
  ranAt: string;
  durationMs?: number;
  timedOut?: boolean;
  exitCode: number | null;
  logPath: string;
  jsonExcerpt?: Record<string, unknown> | null;
}

export interface LedgerEntry {
  id: string;
  ready: boolean;
  approvedStudySha256?: string;
  reason?: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface HoldoutOpenRecord {
  attemptId?: string;
  id: string;
  study: string;
  studySha256?: string;
  status?: 'OPENING' | 'COMPLETED';
  openedAt?: string;
  completedAt?: string;
  exitCode?: number | null;
}

export function loadAllRunRecords(recordsDir: string): RunRecord[] {
  if (!existsSync(recordsDir)) return [];
  const files = readdirSync(recordsDir).filter((f) => f.endsWith('.json'));
  const records: RunRecord[] = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(readFileSync(path.join(recordsDir, f), 'utf8'));
      if (raw && typeof raw.id === 'string') records.push(raw as RunRecord);
    } catch {
      // Skip unparseable/corrupt record files rather than crashing callers.
    }
  }
  return records;
}

export function loadLedger(ledgerPath: string): LedgerEntry[] {
  if (!existsSync(ledgerPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    return Array.isArray(raw.candidates) ? raw.candidates : [];
  } catch {
    return [];
  }
}

export function loadHoldoutHistory(holdoutHistoryPath: string): HoldoutOpenRecord[] {
  if (!existsSync(holdoutHistoryPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(holdoutHistoryPath, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/** Group run records by candidate id, sorted chronologically within each group. */
export function groupById(records: RunRecord[]): Map<string, RunRecord[]> {
  const byId = new Map<string, RunRecord[]>();
  for (const r of records) {
    const list = byId.get(r.id) ?? [];
    list.push(r);
    byId.set(r.id, list);
  }
  for (const list of byId.values()) {
    list.sort((a, b) => a.ranAt.localeCompare(b.ranAt));
  }
  return byId;
}

/** Pull a numeric field out of a run's jsonExcerpt if present and actually numeric. */
export function numericField(excerpt: Record<string, unknown> | null | undefined, ...keys: string[]): number | null {
  if (!excerpt) return null;
  for (const k of keys) {
    const v = excerpt[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}
