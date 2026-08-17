import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SignalDecisionLog } from '../types';
import { DecisionMemoryDB } from '../services/decisionMemory';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const row: SignalDecisionLog = {
  id: 'decision-1', cycleId: 'cycle-1', timestamp: 1_000, isoTime: new Date(1_000).toISOString(),
  ticker: 'BTC-USDT', direction: 'LONG', decision: 'ACCEPTED', reasonCode: 'ACCEPTED_BEST_CANDIDATE', reasonText: 'All gates passed', rawScore: 78,
};

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
});
afterEach(() => { Reflect.deleteProperty(globalThis, 'localStorage'); });

describe('DecisionMemoryDB fallback patching', () => {
  it('preserves untouched fields and stores laterPnl as R-multiple', async () => {
    await DecisionMemoryDB.put(row);
    await DecisionMemoryDB.patch(row.id, { laterOutcome: 'WIN', laterPnl: 1.75 });
    const updated = await DecisionMemoryDB.get(row.id);
    expect(updated).toMatchObject({ id: row.id, cycleId: row.cycleId, reasonText: row.reasonText, laterOutcome: 'WIN', laterPnl: 1.75 });
  });

  it('deletes fallback rows', async () => {
    await DecisionMemoryDB.put(row);
    await DecisionMemoryDB.delete(row.id);
    expect(await DecisionMemoryDB.get(row.id)).toBeNull();
  });
});
