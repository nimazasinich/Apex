import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LiveExecutionIntentStore } from '../services/liveExecutionIntentStore';
import type { RiskGovernorResult } from '../services/riskGovernor';

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

const risk: RiskGovernorResult = {
  policyVersion: 'risk_governor_v1', decision: 'APPROVED', approvedQuantity: 1,
  sizeScale: 1, reasons: [], checks: [], evaluatedAt: Date.now(),
};

function createStore() {
  const root = mkdtempSync(join(tmpdir(), 'apex-reconciliation-summary-'));
  roots.push(root);
  return new LiveExecutionIntentStore(join(root, 'intents.json'));
}

function createIntent(store: LiveExecutionIntentStore, id: string, apiKeyHint: string) {
  return store.create({
    id, apiKeyHint, risk,
    order: {
      clientOid: `${id}-oid`, symbol: 'XBTUSDTM', side: 'buy', type: 'limit', quantity: 1, price: 100,
      leverage: 1, marginMode: 'ISOLATED', timeInForce: 'GTC', reduceOnly: false,
      takeProfitPrice: null, stopLossPrice: null,
    },
  });
}

describe('durable LIVE reconciliation summary', () => {
  it('projects only unresolved intent state and never exchange response payloads', () => {
    const store = createStore();
    const first = createIntent(store, 'intent-1', 'api-1');
    const second = createIntent(store, 'intent-2', 'api-1');
    createIntent(store, 'intent-other', 'api-2');
    store.update(first.id, { status: 'UNKNOWN', lastError: 'order_lookup_failed' });
    store.update(second.id, { status: 'FILLED', exchangeResponse: { secret: 'must-not-leak' } });

    const summary = store.reconciliationSummaryForApiKey('api-1');
    expect(summary.unresolvedIntentCount).toBe(1);
    expect(summary.unresolvedStatuses).toEqual(['UNKNOWN']);
    expect(summary.latestError).toBe('order_lookup_failed');
    expect(summary.latestUpdatedAt).toBeTruthy();
    expect(summary.reconciliationHealthy).toBe(false);
    expect(JSON.stringify(summary)).not.toContain('must-not-leak');
  });

  it('reports a healthy empty state after unresolved intents become terminal', () => {
    const store = createStore();
    const intent = createIntent(store, 'intent-1', 'api-1');
    store.update(intent.id, { status: 'CANCELLED' });
    expect(store.reconciliationSummaryForApiKey('api-1')).toEqual({
      unresolvedIntentCount: 0,
      unresolvedStatuses: [],
      latestError: null,
      latestUpdatedAt: null,
      reconciliationHealthy: true,
    });
  });
});
