/* Copied from apex-trading-engine/src/services/decisionMemoryMirror.ts */

import { existsSync } from 'node:fs';
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

const MAX_ROWS = 50_000;

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

  constructor(filePath?: string) {
    this.filePath = filePath ? resolve(filePath) : join(resolvePrivateDataDir(), 'decision-memory', 'decision-memory-v1.json');
    this.load();
  }

  private readonly filePath: string;

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      for (const row of cleanRows(readDurableJsonFileSync(this.filePath))) this.index(row);
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

  private persist(): void {
    const path = this.filePath;
    const rows = [...this.rows.values()]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_ROWS);
    writeDurableJsonFileSync(path, { version: 1, updatedAt: new Date().toISOString(), rows });
  }

  putMany(rows: SignalDecisionLog[]): { accepted: number; total: number } {
    let accepted = 0;
    for (const row of rows) {
      if (!row || typeof row.id !== 'string' || typeof row.timestamp !== 'number') continue;
      this.index(row);
      accepted += 1;
    }
    if (this.rows.size > MAX_ROWS) {
      const stale = [...this.rows.values()]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(MAX_ROWS);
      for (const row of stale) {
        this.unindex(row);
        this.rows.delete(row.id);
      }
    }
    this.persist();
    return { accepted, total: this.rows.size };
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
    };
  }

  exportAll(): SignalDecisionLog[] {
    return [...this.rows.values()].sort((a, b) => b.timestamp - a.timestamp);
  }
}
