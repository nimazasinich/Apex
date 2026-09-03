import type { TerminalSettings } from '../types';
import type { LiveOrderDraft } from '../services/accountClient';
import type { WorkspaceOrder } from '../services/workspaceInsights';

export const ORDER_DRAFT_STORAGE_KEY = 'apex_order_draft_v1';
export const WATCHLIST_FAVORITES_KEY = 'apex_watchlist_favorites_v1';

export type OrderDraftIntent = 'duplicate' | 'replace';

export interface OrderDraftTransfer {
  version: 2;
  intent: OrderDraftIntent;
  sourceOrderId: string;
  createdAt: number;
  draft: LiveOrderDraft;
}

export interface PageSlice<T> {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
  start: number;
  end: number;
}

export function paginate<T>(items: readonly T[], requestedPage: number, pageSize: number): PageSlice<T> {
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 1;
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage || 1)));
  const startIndex = (page - 1) * safePageSize;
  const pageItems = items.slice(startIndex, startIndex + safePageSize);
  return {
    items: pageItems,
    page,
    pageCount,
    total: items.length,
    start: items.length ? startIndex + 1 : 0,
    end: items.length ? startIndex + pageItems.length : 0,
  };
}

function normalizeOrderType(type: string): LiveOrderDraft['type'] {
  return type.toLowerCase().includes('market') ? 'market' : 'limit';
}

export function orderDraftBlocker(order: WorkspaceOrder, intent: OrderDraftIntent): string | null {
  if (!order.symbol?.trim()) return 'The exchange did not report a market symbol.';
  if (order.side !== 'buy' && order.side !== 'sell') return 'The exchange did not report a valid order side.';
  if (order.size == null || !Number.isFinite(order.size) || order.size <= 0) return 'The exchange did not report a positive order size.';
  if (intent === 'replace') {
    if (order.filled == null || !Number.isFinite(order.filled)) return 'The exchange did not report fill progress, so the remaining size is unknown.';
    if (order.filled >= order.size) return 'This order has no remaining quantity to replace.';
  }
  return null;
}

/**
 * Converts an observed order into a review-only Trading draft. Required
 * exchange fields fail closed: an unknown side must never become BUY, a
 * missing quantity must never become 1, and a replacement cannot guess how
 * much remains when the exchange omitted fill progress.
 */
export function buildOrderDraftTransfer(order: WorkspaceOrder, intent: OrderDraftIntent): OrderDraftTransfer | null {
  const type = normalizeOrderType(order.type);
  if (orderDraftBlocker(order, intent)) return null;
  const symbol = order.symbol?.trim().toUpperCase() || null;
  const side = order.side === 'buy' || order.side === 'sell' ? order.side : null;
  const size = order.size;
  const filled = order.filled;
  if (!symbol || !side || size == null) return null;
  const quantity = intent === 'replace' ? Math.max(0, size - Number(filled)) : size;
  if (!(quantity > 0)) return null;
  return {
    version: 2,
    intent,
    sourceOrderId: order.id,
    createdAt: Date.now(),
    draft: {
      symbol,
      side,
      type,
      quantity,
      price: type === 'limit' ? (order.price ?? order.averageFillPrice) : null,
      leverage: 1,
      marginMode: 'ISOLATED',
      timeInForce: 'GTC',
      reduceOnly: false,
      takeProfitPrice: null,
      stopLossPrice: null,
    },
  };
}

function finitePositive(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

/** Parses both the current transfer envelope and the legacy flat draft shape. */
export function parseOrderDraftTransfer(raw: string | null): OrderDraftTransfer | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const envelopeDraft = parsed.version === 2 && parsed.draft && typeof parsed.draft === 'object'
      ? parsed.draft as Record<string, unknown>
      : parsed;
    const symbol = String(envelopeDraft.symbol || '').trim().toUpperCase();
    if (!symbol) return null;
    if (envelopeDraft.side !== 'buy' && envelopeDraft.side !== 'sell') return null;
    if (envelopeDraft.type !== 'market' && envelopeDraft.type !== 'limit') return null;
    const side: LiveOrderDraft['side'] = envelopeDraft.side;
    const type: LiveOrderDraft['type'] = envelopeDraft.type;
    const quantityValue = Number(envelopeDraft.quantity ?? envelopeDraft.size);
    if (!Number.isFinite(quantityValue) || quantityValue <= 0) return null;
    const priceValue = Number(envelopeDraft.price);
    const draft: LiveOrderDraft = {
      symbol,
      side,
      type,
      quantity: quantityValue,
      price: type === 'limit' && Number.isFinite(priceValue) && priceValue > 0 ? priceValue : null,
      leverage: Math.min(100, Math.max(1, Math.round(finitePositive(envelopeDraft.leverage, 1)))),
      marginMode: envelopeDraft.marginMode === 'CROSS' ? 'CROSS' : 'ISOLATED',
      timeInForce: envelopeDraft.timeInForce === 'IOC' || envelopeDraft.timeInForce === 'FOK' ? envelopeDraft.timeInForce : 'GTC',
      reduceOnly: envelopeDraft.reduceOnly === true,
      takeProfitPrice: Number.isFinite(Number(envelopeDraft.takeProfitPrice)) && Number(envelopeDraft.takeProfitPrice) > 0 ? Number(envelopeDraft.takeProfitPrice) : null,
      stopLossPrice: Number.isFinite(Number(envelopeDraft.stopLossPrice)) && Number(envelopeDraft.stopLossPrice) > 0 ? Number(envelopeDraft.stopLossPrice) : null,
    };
    return {
      version: 2,
      intent: parsed.intent === 'replace' ? 'replace' : 'duplicate',
      sourceOrderId: String(parsed.sourceOrderId || ''),
      createdAt: Number.isFinite(Number(parsed.createdAt)) ? Number(parsed.createdAt) : Date.now(),
      draft,
    };
  } catch {
    return null;
  }
}

export interface SettingsValidationResult {
  valid: boolean;
  errors: string[];
  settings: TerminalSettings;
}

export function validateTerminalSettings(settings: TerminalSettings): SettingsValidationResult {
  const errors: string[] = [];
  const numericRules: Array<[keyof TerminalSettings, string, number, number]> = [
    ['minLiquidityUsd', 'Minimum liquidity', 1, 1_000_000_000_000],
    ['defaultAccountBalanceUsd', 'Demo starting balance', 100, 1_000_000_000],
    ['defaultRiskPct', 'Default risk', 0.01, 100],
    ['defaultLeverage', 'Default leverage', 1, 100],
    ['maxLiveOrderNotionalUsd', 'Maximum order notional', 1, 1_000_000_000],
  ];
  for (const [key, label, min, max] of numericRules) {
    const value = Number(settings[key]);
    if (!Number.isFinite(value) || value < min || value > max) {
      errors.push(`${label} must be between ${min.toLocaleString()} and ${max.toLocaleString()}.`);
    }
  }
  return { valid: errors.length === 0, errors, settings: { ...settings } };
}

export function csvString(rows: Array<Record<string, string | number | null | undefined>>): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number | null | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return `\uFEFF${[headers.map(escape).join(','), ...rows.map((row) => headers.map((key) => escape(row[key])).join(','))].join('\r\n')}`;
}
