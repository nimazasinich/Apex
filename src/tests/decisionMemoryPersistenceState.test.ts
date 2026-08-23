import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SignalDecisionLog } from '../types';

const apiMutateMock = vi.hoisted(() => vi.fn());

vi.mock('../services/apiMutate', () => ({ apiMutate: apiMutateMock }));

import {
  DecisionMemoryDB,
  getDecisionMemoryPersistenceState,
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
});
