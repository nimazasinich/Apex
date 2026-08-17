import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ExchangeSessionManager } from '../services/connectedExchange';
import { LiveExecutionIntentStore } from '../services/liveExecutionIntentStore';
import type { RiskGovernorResult } from '../services/riskGovernor';
import type { KuCoinFuturesTestnetAdapter } from '../services/testnetExecution';

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

const credentials = { apiKey: 'api-key-123456', apiSecret: 'api-secret-123456', apiPassphrase: 'passphrase-123', keyVersion: '2' };
const risk: RiskGovernorResult = {
  policyVersion: 'risk_governor_v1', decision: 'APPROVED', approvedQuantity: 2, sizeScale: 1, reasons: [], checks: [], evaluatedAt: Date.now(),
};

function seed(storePath: string, quantity = 2) {
  const store = new LiveExecutionIntentStore(storePath);
  return store.create({
    id: 'live-crash-1', apiKeyHint: 'api-••••3456', risk,
    order: {
      clientOid: 'client-crash-1', symbol: 'XBTUSDTM', side: 'buy', type: 'limit', quantity, price: 100,
      leverage: 1, marginMode: 'ISOLATED', timeInForce: 'GTC', reduceOnly: false, takeProfitPrice: null, stopLossPrice: null,
    },
  });
}

function adapter(orderResult: unknown | Error, trades: unknown[] = []) {
  const fn = async () => {
    if (orderResult instanceof Error) throw orderResult;
    return orderResult;
  };
  return {
    serverTime: async () => Date.now(),
    accountOverview: async () => ({ accountEquity: 10_000, availableBalance: 10_000 }),
    positions: async () => ({ items: [] }),
    openOrders: async () => ({ items: [] }),
    orderByClientOid: fn,
    recentTrades: async () => ({ items: trades }),
    positionHistory: async () => ({ items: [] }),
  } as unknown as KuCoinFuturesTestnetAdapter;
}

async function reconnect(storePath: string, orderResult: unknown | Error, trades: unknown[] = []) {
  const mock = adapter(orderResult, trades);
  const manager = new ExchangeSessionManager(() => mock, {
    APEX_LIVE_EXECUTION_STORE_PATH: storePath,
    APEX_KUCOIN_PRIVATE_ORDER_WS: 'false',
  } as NodeJS.ProcessEnv);
  await manager.connect(credentials);
  return new LiveExecutionIntentStore(storePath).all()[0];
}

describe('live execution crash/restart/idempotency recovery', () => {
  it('fails closed after crash between intent persistence and exchange submit', async () => {
    const root = mkdtempSync(join(tmpdir(), 'apex-crash-before-submit-')); roots.push(root);
    const storePath = join(root, 'intents.json');
    seed(storePath);
    const recovered = await reconnect(storePath, new Error('order_not_found'));
    expect(recovered.status).toBe('UNKNOWN');
    expect(recovered.lastError).toContain('order_not_found');
  });

  it('recovers an exchange acknowledgement after crash between submit and HTTP acknowledgement', async () => {
    const root = mkdtempSync(join(tmpdir(), 'apex-crash-after-submit-')); roots.push(root);
    const storePath = join(root, 'intents.json');
    seed(storePath);
    const recovered = await reconnect(storePath, { id: 'exchange-1', clientOid: 'client-crash-1', size: 2, dealSize: 0, isActive: true });
    expect(recovered.status).toBe('ACKNOWLEDGED');
    expect(recovered.exchangeOrderId).toBe('exchange-1');
  });

  it('recovers partial fills and retains exchange fill identity', async () => {
    const root = mkdtempSync(join(tmpdir(), 'apex-crash-partial-')); roots.push(root);
    const storePath = join(root, 'intents.json');
    seed(storePath);
    const recovered = await reconnect(
      storePath,
      { id: 'exchange-1', clientOid: 'client-crash-1', size: 2, dealSize: 1, isActive: true },
      [{ tradeId: 'trade-1', orderId: 'exchange-1', clientOid: 'client-crash-1', size: 1, price: 101 }],
    );
    expect(recovered.status).toBe('PARTIALLY_FILLED');
    expect(recovered.executedQuantity).toBe(1);
    expect(recovered.fills).toHaveLength(1);
  });

  it('preserves fill quantity while resolving a cancel race', async () => {
    const root = mkdtempSync(join(tmpdir(), 'apex-crash-cancel-')); roots.push(root);
    const storePath = join(root, 'intents.json');
    seed(storePath);
    const recovered = await reconnect(storePath, { id: 'exchange-1', size: 2, dealSize: 1, cancelExist: true });
    expect(recovered.status).toBe('CANCELLED');
    expect(recovered.executedQuantity).toBe(1);
  });

  it('rejects duplicate durable client-order identity before any exchange request can occur', () => {
    const root = mkdtempSync(join(tmpdir(), 'apex-crash-duplicate-')); roots.push(root);
    const storePath = join(root, 'intents.json');
    const first = seed(storePath);
    const reopened = new LiveExecutionIntentStore(storePath);
    expect(() => reopened.create({
      id: 'live-crash-2', apiKeyHint: first.apiKeyHint, risk,
      order: { ...first.order },
    })).toThrow('duplicate_client_order_id');
  });
});
