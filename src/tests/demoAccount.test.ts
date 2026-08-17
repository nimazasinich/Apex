import { describe, expect, it } from 'vitest';
import {
  DEMO_ORDER_CONFIRMATION,
  DemoAccountManager,
  type DemoMarketGateway,
} from '../services/demoAccount';
import type { LiveOrderDraft } from '../services/connectedExchange';

function fixture() {
  let price = 50_000;
  const market: DemoMarketGateway = {
    async quote(symbol) {
      return { symbol, price, multiplier: 0.001, lotSize: 1, tickSize: 0.1, maxLeverage: 100, status: 'Open' };
    },
  };
  const manager = new DemoAccountManager(market, {} as NodeJS.ProcessEnv);
  const session = manager.create(100_000, 100_000);
  const draft: LiveOrderDraft = {
    symbol: 'BTC-USDT', side: 'buy', type: 'market', quantity: 10, price: null,
    leverage: 10, marginMode: 'ISOLATED', timeInForce: 'GTC', reduceOnly: false,
    takeProfitPrice: null, stopLossPrice: null,
  };
  return { manager, session, draft, setPrice: (next: number) => { price = next; } };
}

describe('DemoAccountManager', () => {
  it('starts with a virtual wallet while exposing no fabricated activity', async () => {
    const { manager, session } = fixture();
    const snapshot = await manager.snapshot(session);
    expect(snapshot.account.environment).toBe('DEMO');
    expect(snapshot.account.dataSource).toBe('REAL_MARKET_VIRTUAL_EXECUTION');
    expect(snapshot.account.accountEquity).toBe(100_000);
    expect(snapshot.positions).toEqual([]);
    expect(snapshot.openOrders).toEqual([]);
  });

  it('previews and fills a market order entirely in the virtual ledger', async () => {
    const { manager, session, draft, setPrice } = fixture();
    const preview = await manager.preview(session, draft);
    expect(preview.environment).toBe('DEMO');
    expect(preview.estimatedNotionalUsd).toBe(500);
    await expect(manager.submit(session, preview.id, 'CONFIRM LIVE ORDER')).rejects.toThrow('explicit_demo_confirmation_required');

    const second = await manager.preview(session, draft);
    const result = await manager.submit(session, second.id, DEMO_ORDER_CONFIRMATION);
    expect(result.environment).toBe('DEMO');
    let snapshot = await manager.snapshot(session);
    expect(snapshot.positions).toHaveLength(1);
    expect(snapshot.positions[0]).toMatchObject({ symbol: 'XBTUSDTM', currentQty: 10, avgEntryPrice: 50_000 });

    setPrice(51_000);
    snapshot = await manager.snapshot(session);
    expect(snapshot.account.unrealisedPNL).toBe(10);
    expect(snapshot.account.accountEquity).toBe(100_010);
  });

  it('keeps limit orders open, fills them on a real-price crossing, and supports cancellation', async () => {
    const { manager, session, draft, setPrice } = fixture();
    const limit = { ...draft, type: 'limit' as const, price: 49_000 };
    const preview = await manager.preview(session, limit);
    await manager.submit(session, preview.id, DEMO_ORDER_CONFIRMATION);
    let snapshot = await manager.snapshot(session);
    expect(snapshot.openOrders).toHaveLength(1);

    setPrice(48_900);
    snapshot = await manager.snapshot(session);
    expect(snapshot.openOrders).toHaveLength(0);
    expect(snapshot.positions).toHaveLength(1);

    const sellLimit = { ...draft, side: 'sell' as const, type: 'limit' as const, price: 55_000 };
    const sellPreview = await manager.preview(session, sellLimit);
    await manager.submit(session, sellPreview.id, DEMO_ORDER_CONFIRMATION);
    snapshot = await manager.snapshot(session);
    const orderId = String((snapshot.openOrders[0] as Record<string, unknown>).id);
    expect(manager.cancel(session, orderId).environment).toBe('DEMO');
    expect((await manager.snapshot(session)).openOrders).toHaveLength(0);
  });
});
