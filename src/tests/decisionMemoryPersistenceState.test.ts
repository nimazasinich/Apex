import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SignalDecisionLog } from '../types';

const apiMutateMock = vi.hoisted(() => vi.fn());

vi.mock('../services/apiMutate', () => ({ apiMutate: apiMutateMock }));

import {
  buildDecisionMemoryMirrorBatchPlan,
  decisionMemoryMirrorPayloadBytes,
  DecisionMemoryDB,
  getDecisionMemoryPersistenceState,
  MIRROR_MAX_PAYLOAD_BYTES,
} from '../services/decisionMemory';

describe('Decision Memory mirror persistence state', () => {
  const originalWindow = globalThis.window;

  beforeAll(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { indexedDB: {} },
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  });

  it('reports a degraded mirror and returns to synced after a successful flush', async () => {
    const row = {
      id: 'mirror-state-row',
      timestamp: Date.now(),
    } as SignalDecisionLog;

    apiMutateMock.mockRejectedValueOnce(new Error('backend unavailable'));
    DecisionMemoryDB.mirror([row]);
    await DecisionMemoryDB.flushMirror();
    expect(getDecisionMemoryPersistenceState()).toBe('mirror_degraded');

    apiMutateMock.mockResolvedValueOnce({ ok: true, status: 200 });
    DecisionMemoryDB.mirror([row]);
    await DecisionMemoryDB.flushMirror();
    expect(getDecisionMemoryPersistenceState()).toBe('synced');
  });

  it('preserves row order while keeping every request below the JSON parser limit', () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({
      id: `byte-bounded-${index}`,
      timestamp: index,
      reasonText: 'e'.repeat(9_000),
    })) as SignalDecisionLog[];
    const plan = buildDecisionMemoryMirrorBatchPlan(rows);

    expect(plan.oversizedRowIds).toEqual([]);
    expect(plan.batches.length).toBeGreaterThan(1);
    expect(plan.batches.flat().map((row) => row.id)).toEqual(rows.map((row) => row.id));
    plan.batches.forEach((batch) => {
      expect(batch.length).toBeLessThanOrEqual(50);
      expect(decisionMemoryMirrorPayloadBytes(batch)).toBeLessThanOrEqual(MIRROR_MAX_PAYLOAD_BYTES);
    });
  });

  it('does not send an individually oversized row that would deterministically return 413', () => {
    const row = { id: 'oversized', timestamp: 1, reasonText: 'x'.repeat(MIRROR_MAX_PAYLOAD_BYTES) } as SignalDecisionLog;
    const plan = buildDecisionMemoryMirrorBatchPlan([row]);
    expect(plan.batches).toEqual([]);
    expect(plan.oversizedRowIds).toEqual(['oversized']);
  });

  it('uses the byte-bounded plan when the real mirror queue is flushed', async () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({
      id: `flush-byte-bounded-${index}`,
      timestamp: index,
      reasonText: 'payload'.repeat(1_500),
    })) as SignalDecisionLog[];
    apiMutateMock.mockReset();
    apiMutateMock.mockResolvedValue({ ok: true, status: 200 });

    DecisionMemoryDB.mirror(rows);
    await DecisionMemoryDB.flushMirror();

    expect(apiMutateMock.mock.calls.length).toBeGreaterThan(1);
    const mirroredIds: string[] = [];
    for (const [, init] of apiMutateMock.mock.calls) {
      const body = String(init?.body || '');
      expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(MIRROR_MAX_PAYLOAD_BYTES);
      mirroredIds.push(...JSON.parse(body).rows.map((row: SignalDecisionLog) => row.id));
    }
    expect(mirroredIds).toEqual(rows.map((row) => row.id));
    expect(getDecisionMemoryPersistenceState()).toBe('synced');
  });
});
