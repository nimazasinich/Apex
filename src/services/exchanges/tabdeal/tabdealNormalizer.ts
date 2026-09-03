/**
 * Normalizes raw Tabdeal FAPI responses into the shapes APEX already uses
 * elsewhere (see `AccountSnapshot` in `connectedExchange.ts`), so downstream
 * UI/services that already understand "an exchange account snapshot" do not
 * need Tabdeal-specific branching. This module does no I/O and makes no
 * trading decisions — pure data shaping.
 */
import type { AccountSnapshot } from '../../connectedExchange';
import type { TradeDirection } from '../../../types';
import { TABDEAL_EXCHANGE_ID } from './tabdealCapabilities';

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface NormalizedTabdealOrder {
  exchange: typeof TABDEAL_EXCHANGE_ID;
  orderId: string;
  clientOrderId: string | null;
  symbol: string;
  side: 'BUY' | 'SELL' | 'UNKNOWN';
  type: string;
  status: string;
  quantity: number | null;
  executedQuantity: number | null;
  price: number | null;
  avgPrice: number | null;
  reduceOnly: false; // always false: Tabdeal reduceOnly is unsupported and never faked
  closePosition: boolean;
  createdAtMs: number | null;
  updatedAtMs: number | null;
  raw: Record<string, unknown>;
}

export function normalizeOrder(raw: unknown): NormalizedTabdealOrder {
  const r = asRecord(raw);
  return {
    exchange: TABDEAL_EXCHANGE_ID,
    orderId: String(r.orderId ?? ''),
    clientOrderId: r.clientOrderId ? String(r.clientOrderId) : null,
    symbol: String(r.symbol ?? ''),
    side: r.side === 'SELL' ? 'SELL' : r.side === 'BUY' ? 'BUY' : 'UNKNOWN',
    type: String(r.type ?? 'UNKNOWN'),
    status: String(r.status ?? 'UNKNOWN'),
    quantity: num(r.origQty),
    executedQuantity: num(r.executedQty),
    price: num(r.price),
    avgPrice: num(r.avgPrice),
    reduceOnly: false,
    closePosition: Boolean(r.closePosition),
    createdAtMs: num(r.time) ?? num(r.transactTime),
    updatedAtMs: num(r.updateTime),
    raw: r,
  };
}

export interface NormalizedTabdealPosition {
  exchange: typeof TABDEAL_EXCHANGE_ID;
  symbol: string;
  direction: TradeDirection | 'FLAT' | 'UNKNOWN';
  quantity: number | null;
  entryPrice: number | null;
  markPrice: number | null;
  leverage: number | null;
  unrealizedPnlUsd: number | null;
  liquidationPrice: number | null;
  raw: Record<string, unknown>;
}

export function normalizePosition(raw: unknown): NormalizedTabdealPosition {
  const r = asRecord(raw);
  const positionAmt = num(r.positionAmt);
  return {
    exchange: TABDEAL_EXCHANGE_ID,
    symbol: String(r.symbol ?? ''),
    direction: positionAmt === null ? 'UNKNOWN' : positionAmt > 0 ? 'LONG' : positionAmt < 0 ? 'SHORT' : 'FLAT',
    quantity: positionAmt === null ? null : Math.abs(positionAmt),
    entryPrice: num(r.entryPrice),
    markPrice: num(r.markPrice),
    leverage: num(r.leverage),
    unrealizedPnlUsd: num(r.unRealizedProfit) ?? num(r.unrealizedProfit),
    liquidationPrice: num(r.liquidationPrice),
    raw: r,
  };
}

export interface NormalizedTabdealTrade {
  exchange: typeof TABDEAL_EXCHANGE_ID;
  id: string;
  orderId: string | null;
  symbol: string;
  price: number | null;
  quantity: number | null;
  quoteQuantity: number | null;
  isBuyerMaker: boolean;
  timestampMs: number | null;
  raw: Record<string, unknown>;
}

export function normalizeTrade(raw: unknown): NormalizedTabdealTrade {
  const r = asRecord(raw);
  return {
    exchange: TABDEAL_EXCHANGE_ID,
    id: String(r.id ?? ''),
    orderId: r.orderId != null ? String(r.orderId) : null,
    symbol: String(r.symbol ?? ''),
    price: num(r.price),
    quantity: num(r.qty),
    quoteQuantity: num(r.quoteQty),
    isBuyerMaker: Boolean(r.isBuyerMaker ?? r.isMaker),
    timestampMs: num(r.time),
    raw: r,
  };
}

/**
 * Builds the shared `AccountSnapshot` shape from raw Tabdeal payloads. Any
 * payload the caller doesn't have yet (e.g. because the underlying endpoint
 * is still unverified) should be passed as `undefined`/`[]` rather than
 * fabricated — this function never invents data.
 */
export function normalizeAccountSnapshot(input: {
  account?: unknown;
  positions?: unknown[];
  openOrders?: unknown[];
  allOrders?: unknown[];
  userTrades?: unknown[];
  positionHistory?: unknown[];
  serverTime?: unknown;
}): AccountSnapshot {
  const providerReadAt = Date.now();
  const rawAccount = asRecord(input.account);
  const serverRecord = asRecord(input.serverTime);
  const sourceObservedAt = num(serverRecord.serverTime) ?? num(serverRecord.time) ?? num(input.serverTime);
  const equity = num(rawAccount.totalMarginBalance) ?? num(rawAccount.totalWalletBalance) ?? num(rawAccount.equity) ?? num(rawAccount.marginBalance);
  const availableBalance = num(rawAccount.availableBalance) ?? num(rawAccount.availableMargin);
  const positionMargin = num(rawAccount.totalPositionInitialMargin) ?? num(rawAccount.positionMargin);
  const unrealizedPnl = num(rawAccount.totalUnrealizedProfit) ?? num(rawAccount.unRealizedProfit) ?? num(rawAccount.unrealizedPnl);
  const account: Record<string, unknown> = {
    ...rawAccount,
    exchange: TABDEAL_EXCHANGE_ID,
    ...(equity === null ? {} : { accountEquity: equity, equity }),
    ...(availableBalance === null ? {} : { availableBalance, availableMargin: availableBalance }),
    ...(positionMargin === null ? {} : { positionMargin }),
    ...(unrealizedPnl === null ? {} : { unrealisedPNL: unrealizedPnl }),
  };
  const positions = (input.positions ?? []).map(normalizePosition).map((row) => ({
    ...row.raw,
    exchange: row.exchange,
    id: row.symbol ? `tabdeal:${row.symbol}` : '',
    symbol: row.symbol,
    direction: row.direction,
    currentQty: row.quantity === null ? null : row.direction === 'SHORT' ? -row.quantity : row.direction === 'LONG' ? row.quantity : row.direction === 'FLAT' ? 0 : null,
    avgEntryPrice: row.entryPrice,
    markPrice: row.markPrice,
    realLeverage: row.leverage,
    unrealisedPnl: row.unrealizedPnlUsd,
    liquidationPrice: row.liquidationPrice,
  }));
  const orders = (input.openOrders ?? []).map(normalizeOrder).map((row) => ({
    ...row.raw,
    exchange: row.exchange,
    id: row.orderId,
    orderId: row.orderId,
    clientOid: row.clientOrderId,
    symbol: row.symbol,
    side: row.side === 'BUY' ? 'buy' : row.side === 'SELL' ? 'sell' : 'unknown',
    type: row.type,
    status: row.status,
    size: row.quantity,
    filledSize: row.executedQuantity,
    price: row.price,
    avgFillPrice: row.avgPrice,
    createdAt: row.createdAtMs,
    updatedAt: row.updatedAtMs,
  }));
  const recentOrders = (input.allOrders ?? []).map(normalizeOrder).map((row) => ({
    ...row.raw,
    exchange: row.exchange,
    id: row.orderId,
    orderId: row.orderId,
    clientOid: row.clientOrderId,
    symbol: row.symbol,
    side: row.side === 'BUY' ? 'buy' : row.side === 'SELL' ? 'sell' : 'unknown',
    type: row.type,
    status: row.status,
    size: row.quantity,
    filledSize: row.executedQuantity,
    price: row.price,
    avgFillPrice: row.avgPrice,
    createdAt: row.createdAtMs,
    updatedAt: row.updatedAtMs,
  }));
  const recentTrades = (input.userTrades ?? []).map(normalizeTrade).map((row) => ({
    ...row.raw,
    exchange: row.exchange,
    id: row.id,
    tradeId: row.id,
    orderId: row.orderId,
    symbol: row.symbol,
    price: row.price,
    quantity: row.quantity,
    quoteQuantity: row.quoteQuantity,
    tradeTime: row.timestampMs,
  }));
  const positionHistory = asRecordArray(input.positionHistory ?? []).map((row) => ({ ...row, exchange: TABDEAL_EXCHANGE_ID }));
  return {
    account,
    positions,
    openOrders: orders,
    recentOrders,
    recentTrades,
    positionHistory,
    serverTime: input.serverTime ?? null,
    syncedAt: new Date(providerReadAt).toISOString(),
    venue: TABDEAL_EXCHANGE_ID,
    observationMetadata: {
      sourceObservedAt,
      providerReadAt,
      provenance: 'tabdeal_fapi_authenticated_rest',
    },
  };
}
