import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DecisionMemoryMirror } from '../services/decisionMemoryMirror';
import type { SignalDecisionLog } from '../types';

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

function file(): string {
  const root = mkdtempSync(join(tmpdir(), 'apex-decision-memory-'));
  roots.push(root);
  return join(root, 'memory.json');
}

function row(id: string, timestamp: number, padding = 0): SignalDecisionLog {
  return {
    id,
    cycleId: `cycle-${id}`,
    timestamp,
    isoTime: new Date(timestamp).toISOString(),
    ticker: 'BTC-USDT',
    direction: 'LONG',
    decision: 'ACCEPTED',
    reasonCode: 'ACCEPTED_BEST_CANDIDATE',
    reasonText: `test-${'x'.repeat(padding)}`,
  };
}

describe('DecisionMemoryMirror durable capacity', () => {
  it('prunes oldest rows by serialized bytes before the durable write exceeds capacity', () => {
    const target = file();
    const mirror = new DecisionMemoryMirror(target, { maxRows: 100, maxBytes: 2_800 });
    const result = mirror.putMany([
      row('oldest', 1, 900),
      row('middle', 2, 900),
      row('newest', 3, 900),
    ]);

    expect(result.pruned).toBeGreaterThan(0);
    expect(mirror.exportAll()[0].id).toBe('newest');
    expect(mirror.exportAll().some((item) => item.id === 'oldest')).toBe(false);
    expect(statSync(target).size).toBeLessThanOrEqual(2_800);
    expect(JSON.parse(readFileSync(target, 'utf8')).rows).toHaveLength(result.total);
    expect(mirror.persistenceStatus()).toMatchObject({ writable: true, lastError: null, persistedBytes: statSync(target).size });
  });

  it('rolls back memory state and reports not writable when even one row cannot fit', () => {
    const target = file();
    const mirror = new DecisionMemoryMirror(target, { maxRows: 100, maxBytes: 1_200 });
    mirror.putMany([row('baseline', 1, 100)]);

    expect(() => mirror.putMany([row('oversized', 2, 4_000)])).toThrow('decision_memory_row_capacity_exceeded');
    expect(mirror.exportAll().map((item) => item.id)).toEqual(['baseline']);
    expect(mirror.persistenceStatus()).toMatchObject({ writable: false, lastError: 'decision_memory_row_capacity_exceeded' });
    expect(JSON.parse(readFileSync(target, 'utf8')).rows.map((item: SignalDecisionLog) => item.id)).toEqual(['baseline']);
  });
});
