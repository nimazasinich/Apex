/* Copied from apex-trading-engine/src/services/decisionMemoryMirror.ts */

import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { SignalDecisionLog } from '../types';
import { readDurableJsonFileSync, writeDurableJsonFileSync } from './durableJsonFile';
import { resolvePrivateDataDir } from './privateConfigFile';

export interface DecisionMemoryQuery {
  limit?: number;
  ticker?: string;
  decision?: SignalDecisionLog['decision'];
  reasonCode?: SignalDecisionLog['reasonCode'];
  laterOutcome?: SignalDecisionLog['laterOutcome'];
  since?: number;
  until?: number;
}

const DEFAULT_MAX_ROWS = 50_000;
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;

export interface DecisionMemoryMirrorOptions {
  maxRows?: number;
  maxBytes?: number;
}

export interface DecisionMemoryPersistenceStatus {
  writable: boolean;
  lastError: string | null;
  lastPersistedAt: string | null;
  persistedBytes: number;
  maxBytes: number;
  headroomBytes: number;
  lastPrunedRows: number;
}

function cleanRows(value: unknown): SignalDecisionLog[] {
  const rows = Array.isArray(value)
    ? value
    : (value && typeof value === 'object' && Array.isArray((value as { rows?: unknown }).rows)
      ? (value as { rows: unknown[] }).rows
      : []);
  return rows.filter((row): row is SignalDecisionLog => Boolean(
    row && typeof row === 'object' &&
    typeof (row as SignalDecisionLog).id === 'string' &&
    typeof (row as SignalDecisionLog).timestamp === 'number'
  ));
}

export class DecisionMemoryMirror {
  private readonly rows = new Map<string, SignalDecisionLog>();
  private readonly byTicker = new Map<string, Set<string>>();
  private readonly byDecision = new Map<string, Set<string>>();
  private readonly byReasonCode = new Map<string, Set<string>>();
  private readonly byOutcome = new Map<string, Set<string>>();
  private readonly byTimestamp = new Map<string, Set<string>>();

  constructor(filePath?: string, options: DecisionMemoryMirrorOptions = {}) {
    this.filePath = filePath ? resolve(filePath) : join(resolvePrivateDataDir(), 'decision-memory', 'decision-memory-v1.json');
    this.maxRows = Math.max(1, Math.floor(options.maxRows ?? DEFAULT_MAX_ROWS));
    this.maxBytes = Math.max(1024, Math.floor(options.maxBytes ?? DEFAULT_MAX_BYTES));
    this.load();
  }

  private readonly filePath: string;
  private readonly maxRows: number;
  private readonly maxBytes: number;
  private lastPersistError: string | null = null;
  private lastPersistedAt: string | null = null;
  private persistedBytes = 0;
  private lastPrunedRows = 0;

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      for (const row of cleanRows(readDurableJsonFileSync(this.filePath))) this.index(row);
      this.persistedBytes = statSync(this.filePath).size;
    } catch {
      throw new Error('decision_memory_mirror_corrupt');
    }
  }

  private addIndex(index: Map<string, Set<string>>, key: string | undefined, id: string): void {
    if (!key) return;
    const ids = index.get(key) ?? new Set<string>();
    ids.add(id);
    index.set(key, ids);
  }

  private removeIndex(index: Map<string, Set<string>>, key: string | undefined, id: string): void {
    if (!key) return;
    const ids = index.get(key);
    if (!ids) return;
    ids.delete(id);
    if (!ids.size) index.delete(key);
  }

  private index(row: SignalDecisionLog): void {
    const previous = this.rows.get(row.id);
    if (previous) this.unindex(previous);
    this.rows.set(row.id, row);
    this.addIndex(this.byTicker, row.ticker, row.id);
    this.addIndex(this.byDecision, row.decision, row.id);
    this.addIndex(this.byReasonCode, row.reasonCode, row.id);
    this.addIndex(this.byOutcome, row.laterOutcome, row.id);
    this.addIndex(this.byTimestamp, String(row.timestamp), row.id);
  }

  private unindex(row: SignalDecisionLog): void {
    this.removeIndex(this.byTicker, row.ticker, row.id);
    this.removeIndex(this.byDecision, row.decision, row.id);
    this.removeIndex(this.byReasonCode, row.reasonCode, row.id);
    this.removeIndex(this.byOutcome, row.laterOutcome, row.id);
    this.removeIndex(this.byTimestamp, String(row.timestamp), row.id);
  }

  private persistedEnvelope(rows: SignalDecisionLog[], updatedAt: string) {
    return { version: 1, updatedAt, rows };
  }

  private serializedBytes(rows: SignalDecisionLog[], updatedAt: string): number {
    return Buffer.byteLength(`${JSON.stringify(this.persistedEnvelope(rows, updatedAt), null, 2)}\n`, 'utf8');
  }

  private rowsWithinCapacity(rows: SignalDecisionLog[], updatedAt: string): SignalDecisionLog[] {
    const candidates = rows.slice(0, this.maxRows);
    let low = 0;
    let high = candidates.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (this.serializedBytes(candidates.slice(0, middle), updatedAt) <= this.maxBytes) low = middle;
      else high = middle - 1;
    }
    if (candidates.length && low === 0) throw new Error('decision_memory_row_capacity_exceeded');
    return candidates.slice(0, low);
  }

  private persist(): number {
    const updatedAt = new Date().toISOString();
    try {
      const sorted = [...this.rows.values()].sort((a, b) => b.timestamp - a.timestamp);
      const retained = this.rowsWithinCapacity(sorted, updatedAt);
      const retainedIds = new Set(retained.map((row) => row.id));
      const pruned = sorted.filter((row) => !retainedIds.has(row.id));
      const envelope = this.persistedEnvelope(retained, updatedAt);
      const bytes = this.serializedBytes(retained, updatedAt);
      writeDurableJsonFileSync(this.filePath, envelope, { maxBytes: this.maxBytes });
      for (const row of pruned) {
        this.unindex(row);
        this.rows.delete(row.id);
      }
      this.lastPersistError = null;
      this.lastPersistedAt = updatedAt;
      this.persistedBytes = bytes;
      this.lastPrunedRows = pruned.length;
      return pruned.length;
    } catch (error) {
      this.lastPersistError = error instanceof Error ? error.message : 'decision_memory_persist_failed';
      throw error;
    }
  }

  putMany(rows: SignalDecisionLog[]): { accepted: number; total: number; pruned: number } {
    const before = [...this.rows.values()];
    let accepted = 0;
    try {
      for (const row of rows) {
        if (!row || typeof row.id !== 'string' || typeof row.timestamp !== 'number') continue;
        this.index(row);
        accepted += 1;
      }
      const pruned = this.persist();
      return { accepted, total: this.rows.size, pruned };
    } catch (error) {
      this.rows.clear();
      this.byTicker.clear();
      this.byDecision.clear();
      this.byReasonCode.clear();
      this.byOutcome.clear();
      this.byTimestamp.clear();
      for (const row of before) this.index(row);
      throw error;
    }
  }

  query(query: DecisionMemoryQuery = {}): SignalDecisionLog[] {
    const candidateIds = [
      query.ticker ? this.byTicker.get(query.ticker) : undefined,
      query.decision ? this.byDecision.get(query.decision) : undefined,
      query.reasonCode ? this.byReasonCode.get(query.reasonCode) : undefined,
      query.laterOutcome ? this.byOutcome.get(query.laterOutcome) : undefined,
    ].filter((value): value is Set<string> => Boolean(value));

    let rows = [...this.rows.values()];
    if (candidateIds.length) {
      const ids = [...candidateIds].sort((a, b) => a.size - b.size)[0];
      rows = rows.filter(row => ids.has(row.id));
    }
    rows = rows.filter(row =>
      (!query.ticker || row.ticker === query.ticker) &&
      (!query.decision || row.decision === query.decision) &&
      (!query.reasonCode || row.reasonCode === query.reasonCode) &&
      (!query.laterOutcome || row.laterOutcome === query.laterOutcome) &&
      (query.since === undefined || row.timestamp >= query.since) &&
      (query.until === undefined || row.timestamp <= query.until)
    );
    return rows.sort((a, b) => b.timestamp - a.timestamp).slice(0, Math.max(1, Math.min(query.limit ?? 500, 5000)));
  }

  stats() {
    let accepted = 0;
    let rejected = 0;
    let resolved = 0;
    for (const row of this.rows.values()) {
      if (row.decision === 'ACCEPTED') accepted += 1;
      if (row.decision === 'REJECTED') rejected += 1;
      if (row.laterOutcome === 'WIN' || row.laterOutcome === 'LOSS' || row.laterOutcome === 'BREAKEVEN') {
        resolved += 1;
      }
    }
    return {
      total: this.rows.size,
      accepted,
      rejected,
      resolved,
      indexed: {
        ticker: this.byTicker.size,
        decision: this.byDecision.size,
        reasonCode: this.byReasonCode.size,
        outcome: this.byOutcome.size,
        timestamp: this.byTimestamp.size,
      },
      persistence: this.persistenceStatus(),
    };
  }

  persistenceStatus(): DecisionMemoryPersistenceStatus {
    return {
      writable: this.lastPersistError === null,
      lastError: this.lastPersistError,
      lastPersistedAt: this.lastPersistedAt,
      persistedBytes: this.persistedBytes,
      maxBytes: this.maxBytes,
      headroomBytes: Math.max(0, this.maxBytes - this.persistedBytes),
      lastPrunedRows: this.lastPrunedRows,
    };
  }

  exportAll(): SignalDecisionLog[] {
    return [...this.rows.values()].sort((a, b) => b.timestamp - a.timestamp);
  }
}
