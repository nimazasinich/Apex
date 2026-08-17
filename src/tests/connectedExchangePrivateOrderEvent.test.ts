import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyKuCoinPrivateOrderEventToIntent } from '../services/connectedExchange';
import { LiveExecutionIntentStore } from '../services/liveExecutionIntentStore';
import type { RiskGovernorResult } from '../services/riskGovernor';

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

function storeWithIntent(quantity = 2) {
  const root = mkdtempSync(join(tmpdir(), 'apex-private-event-'));
  roots.push(root);
  const store = new LiveExecutionIntentStore(join(root, 'intents.json'));
  const risk: RiskGovernorResult = {
    policyVersion: 'risk_governor_v1',
    decision: 'APPROVED',
    approvedQuantity: quantity,
    sizeScale: 1,
    reasons: [],
    checks: [],
    evaluatedAt: Date.now(),
  };
  const intent = store.create({
    id: 'live-1',
    apiKeyHint: 'hint',
    order: {
      clientOid: 'client-1', symbol: 'XBTUSDTM', side: 'buy', type: 'limit', quantity, price: 100,
      leverage: 1, marginMode: 'ISOLATED', timeInForce: 'GTC', reduceOnly: false,
      takeProfitPrice: null, stopLossPrice: null,
    },
    risk,
  });
  return { store, intent };
}

function event(data: Record<string, unknown>) {
  return { topic: '/contractMarket/tradeOrders', subject: 'orderChange', receivedAt: Date.now(), data };
}

describe('private order stream -> durable intent reconciliation', () => {
  it('cannot create an execution intent from an unsolicited private event', () => {
    const root = mkdtempSync(join(tmpdir(), 'apex-private-event-empty-'));
    roots.push(root);
    const store = new LiveExecutionIntentStore(join(root, 'intents.json'));
    expect(applyKuCoinPrivateOrderEventToIntent(store, event({ type: 'open', clientOid: 'unknown', orderId: 'x' }))).toBeNull();
    expect(store.all()).toHaveLength(0);
  });

  it('deduplicates match events by trade id and advances filled quantity monotonically', () => {
    const { store } = storeWithIntent(2);
    const match = event({
      type: 'match', clientOid: 'client-1', orderId: 'order-1', tradeId: 'trade-1', matchSize: '0.5', matchPrice: '101', ts: '1720000000000000000',
    });
    const first = applyKuCoinPrivateOrderEventToIntent(store, match)!;
    const duplicate = applyKuCoinPrivateOrderEventToIntent(store, match)!;
    expect(first.status).toBe('PARTIALLY_FILLED');
    expect(duplicate.executedQuantity).toBe(0.5);
    expect(duplicate.fills).toHaveLength(1);
    expect(duplicate.fills[0]).toMatchObject({ id: 'trade-1', quantity: 0.5, price: 101, exchangeOrderId: 'order-1' });
  });

  it('marks full completion only from exchange fill/done evidence and refuses terminal reopening', () => {
    const { store } = storeWithIntent(1);
    const filled = applyKuCoinPrivateOrderEventToIntent(store, event({
      type: 'filled', clientOid: 'client-1', orderId: 'order-1', filledSize: 1, status: 'done',
    }))!;
    expect(filled.status).toBe('FILLED');
    expect(filled.executedQuantity).toBe(1);
    expect(() => applyKuCoinPrivateOrderEventToIntent(store, event({
      type: 'open', clientOid: 'client-1', orderId: 'order-1', filledSize: 0,
    }))).toThrow('invalid_terminal_live_execution_transition');
  });
});
