import { describe, expect, it } from 'vitest';
import type { AccountSnapshot } from '../services/accountClient';
import { buildWorkspaceInsights } from '../services/workspaceInsights';
import {
  buildOrderDraftTransfer,
  csvString,
  paginate,
  parseOrderDraftTransfer,
  validateTerminalSettings,
} from '../lib/workspaceUi';

const order = {
  id: 'order-123',
  venue: 'kucoin' as const,
  symbol: 'BTC-USDT',
  side: 'buy' as const,
  type: 'limit',
  size: 3,
  filled: 1,
  fillPct: 100 / 3,
  price: 62_500,
  averageFillPrice: 62_450,
  status: 'partially_filled' as const,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_010_000,
  dataState: {
    symbol: 'VALID' as const,
    side: 'VALID' as const,
    size: 'VALID' as const,
    filled: 'VALID' as const,
    price: 'VALID' as const,
  },
};

describe('integrated workspace helpers', () => {
  it('paginates with clamped page numbers and honest ranges', () => {
    expect(paginate([1, 2, 3, 4, 5], 99, 2)).toEqual({
      items: [5], page: 3, pageCount: 3, total: 5, start: 5, end: 5,
    });
    expect(paginate([], 1, 10)).toEqual({
      items: [], page: 1, pageCount: 1, total: 0, start: 0, end: 0,
    });
  });

  it('creates distinct duplicate and replacement transfers', () => {
    const duplicate = buildOrderDraftTransfer(order, 'duplicate');
    const replacement = buildOrderDraftTransfer(order, 'replace');
    expect(duplicate?.draft.quantity).toBe(3);
    expect(replacement?.draft.quantity).toBe(2);
    expect(replacement?.intent).toBe('replace');
    expect(parseOrderDraftTransfer(JSON.stringify(replacement))).toEqual(replacement);
  });

  it('fails closed instead of inventing an order side, symbol, size, or remaining fill', () => {
    expect(buildOrderDraftTransfer({ ...order, side: 'unknown' }, 'duplicate')).toBeNull();
    expect(buildOrderDraftTransfer({ ...order, symbol: null }, 'duplicate')).toBeNull();
    expect(buildOrderDraftTransfer({ ...order, size: null }, 'duplicate')).toBeNull();
    expect(buildOrderDraftTransfer({ ...order, filled: null }, 'replace')).toBeNull();
    expect(buildOrderDraftTransfer({ ...order, filled: 3 }, 'replace')).toBeNull();
  });

  it('migrates the legacy flat order draft without inventing unsafe values', () => {
    const parsed = parseOrderDraftTransfer(JSON.stringify({
      symbol: 'eth-usdt', side: 'sell', type: 'limit', size: 4, price: 3_000,
    }));
    expect(parsed?.version).toBe(2);
    expect(parsed?.intent).toBe('duplicate');
    expect(parsed?.draft.symbol).toBe('ETH-USDT');
    expect(parsed?.draft.quantity).toBe(4);
    expect(parsed?.draft.leverage).toBe(1);
    expect(parseOrderDraftTransfer(JSON.stringify({ symbol: 'BTC-USDT', type: 'limit', size: 1 }))).toBeNull();
    expect(parseOrderDraftTransfer(JSON.stringify({ symbol: 'BTC-USDT', side: 'buy', type: 'limit' }))).toBeNull();
  });

  it('validates terminal risk and execution limits before persistence', () => {
    const valid = validateTerminalSettings({
      minLiquidityUsd: 10_000_000,
      defaultAccountBalanceUsd: 100_000,
      defaultRiskPct: 1,
      defaultLeverage: 5,
      autopilotEnabled: false,
      soundAlertsEnabled: true,
      maxLiveOrderNotionalUsd: 2_500,
    });
    expect(valid.valid).toBe(true);
    const invalid = validateTerminalSettings({ ...valid.settings, defaultRiskPct: 0, defaultLeverage: 101 });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toHaveLength(2);
  });

  it('creates Excel-safe UTF-8 CSV with quote, comma, and newline escaping', () => {
    const csv = csvString([{ symbol: 'BTC,USDT', note: 'He said "go"\nnext line', pnl: -12.5 }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"BTC,USDT"');
    expect(csv).toContain('"He said ""go""\nnext line"');
    expect(csv).toContain('"-12.5"');
  });

  it('keeps realized PnL event-level instead of repeating the account total', () => {
    const snapshot = {
      account: { accountEquity: 10_000, availableBalance: 8_000, realizedPnl: 300 },
      positions: [],
      openOrders: [],
      recentOrders: [],
      recentTrades: [
        { id: 't1', symbol: 'BTC-USDT', side: 'buy', size: 1, price: 100, realizedPnl: 25, tradeTime: 1_700_000_000_000 },
        { id: 't2', symbol: 'ETH-USDT', side: 'sell', size: 2, price: 50, tradeTime: 1_700_000_010_000 },
      ],
      positionHistory: [
        { id: 'p1', symbol: 'SOL-USDT', size: 3, realizedPnl: -10, closeTime: 1_700_000_020_000 },
      ],
    } as unknown as AccountSnapshot;
    const insights = buildWorkspaceInsights(snapshot);
    expect(insights.activities.find((activity) => activity.id === 't1')?.realizedPnlUsd).toBe(25);
    expect(insights.activities.find((activity) => activity.id === 't2')?.realizedPnlUsd).toBeNull();
    expect(insights.activities.find((activity) => activity.reference === 'p1')?.realizedPnlUsd).toBe(-10);
  });
});

describe('workspace truthfulness normalization', () => {
  it('keeps missing account values missing instead of converting them to zero', () => {
    const snapshot = {
      account: {}, positions: [], openOrders: [], recentOrders: [], recentTrades: [], positionHistory: [], serverTime: null, syncedAt: '2026-08-30T00:00:00.000Z',
    } as AccountSnapshot;
    const insights = buildWorkspaceInsights(snapshot);
    expect(insights.account.equityUsd).toBeNull();
    expect(insights.account.availableBalanceUsd).toBeNull();
    expect(insights.account.realizedPnlUsd).toBeNull();
    expect(insights.account.marginRatioPct).toBeNull();
    expect(insights.account.riskScore).toBeNull();
    expect(insights.account.dataState.equityUsd).toBe('MISSING');
  });

  it('does not invent a symbol, direction, mark price, or timestamp', () => {
    const snapshot = {
      account: { accountEquity: 10_000 },
      positions: [{ currentQty: null, entryPrice: 100 }],
      openOrders: [{ id: 'o1' }],
      recentOrders: [],
      recentTrades: [{ id: 't1', price: 100, size: 1 }],
      positionHistory: [],
      serverTime: null,
      syncedAt: '2026-08-30T00:00:00.000Z',
    } as AccountSnapshot;
    const insights = buildWorkspaceInsights(snapshot);
    expect(insights.positions[0]).toMatchObject({ symbol: null, side: 'UNKNOWN', markPrice: null });
    expect(insights.orders[0]).toMatchObject({ symbol: null, side: 'unknown' });
    expect(insights.activities.find((activity) => activity.id === 't1')).toMatchObject({ timestamp: null, symbol: null });
  });

  it('does not fabricate an analytics timestamp when no realized history exists', () => {
    const snapshot = {
      account: { accountEquity: 10_000 }, positions: [], openOrders: [], recentOrders: [], recentTrades: [], positionHistory: [], serverTime: null, syncedAt: '2026-08-30T00:00:00.000Z',
    } as AccountSnapshot;
    expect(buildWorkspaceInsights(snapshot).analytics.cumulativePnl).toEqual([]);
  });
});
