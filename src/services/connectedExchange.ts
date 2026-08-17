import crypto from 'node:crypto';
import {
  KuCoinFuturesTestnetAdapter,
  KUCOIN_FUTURES_PRODUCTION_BASE,
  type KuCoinLiveOrderInput,
  type KuCoinMarginMode,
  type KuCoinTimeInForce,
  type TestnetCredentials,
  type TestnetOrderType,
} from './testnetExecution';
import { toKuCoinFuturesSymbol } from './providers/publicExchangeClient';
import { assertTradePlanSubmittable, type TradePlan } from './tradePlan';
import { evaluateRiskGovernor, loadRiskGovernorPolicy, type RiskGovernorResult } from './riskGovernor';
import { deriveLiveRiskTelemetry } from './liveRiskTelemetry';
import {
  defaultLiveExecutionStorePath,
  LiveExecutionIntentStore,
  type LiveExecutionFillRecord,
  type LiveExecutionIntentRecord,
} from './liveExecutionIntentStore';
import {
  KuCoinPrivateOrderStream,
  type KuCoinPrivateOrderEvent,
  type PrivateOrderStreamState,
} from './kucoinPrivateOrderStream';

export const EXCHANGE_SESSION_COOKIE = 'apex_exchange_session';
export const LIVE_ORDER_CONFIRMATION = 'CONFIRM LIVE ORDER';

const positive = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export interface ConnectExchangeInput {
  apiKey: string;
  apiSecret: string;
  apiPassphrase: string;
  keyVersion?: string;
  enableTrading?: boolean;
  maxOrderNotionalUsd?: number;
}

export interface LiveOrderDraft {
  symbol: string;
  side: 'buy' | 'sell';
  type: TestnetOrderType;
  quantity: number;
  price?: number | null;
  leverage: number;
  marginMode: KuCoinMarginMode;
  timeInForce: KuCoinTimeInForce;
  reduceOnly: boolean;
  takeProfitPrice?: number | null;
  stopLossPrice?: number | null;
}

export interface LiveOrderPreview {
  id: string;
  environment: 'LIVE';
  mode: 'live';
  confirmationPhrase: typeof LIVE_ORDER_CONFIRMATION;
  createdAt: string;
  expiresAt: string;
  order: KuCoinLiveOrderInput;
  markPrice: number;
  estimatedNotionalUsd: number;
  estimatedInitialMarginUsd: number;
  availableMarginUsd: number;
  warnings: string[];
  tradePlan: TradePlan | null;
  riskDecision: RiskGovernorResult;
  contract: { lotSize: number; tickSize: number; multiplier: number; maxLeverage: number };
  used: boolean;
}

export interface ExchangeSession {
  id: string;
  credentials: TestnetCredentials;
  adapter: KuCoinFuturesTestnetAdapter;
  apiKeyHint: string;
  createdAt: number;
  verifiedAt: number;
  lastUsedAt: number;
  expiresAt: number;
  executionArmed: boolean;
  maxOrderNotionalUsd: number;
  previews: Map<string, LiveOrderPreview>;
  intentStore: LiveExecutionIntentStore;
  privateOrderStream: KuCoinPrivateOrderStream | null;
  privateOrderStreamState: PrivateOrderStreamState;
}

export interface AccountSnapshot {
  account: Record<string, unknown>;
  positions: Array<Record<string, unknown>>;
  openOrders: Array<Record<string, unknown>>;
  recentOrders: Array<Record<string, unknown>>;
  recentTrades: Array<Record<string, unknown>>;
  positionHistory: Array<Record<string, unknown>>;
  serverTime: unknown;
  syncedAt: string;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
}

function itemsFrom(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return asRecordArray(payload);
  if (!payload || typeof payload !== 'object') return [];
  const candidate = payload as Record<string, unknown>;
  if (Array.isArray(candidate.items)) return asRecordArray(candidate.items);
  if (Array.isArray(candidate.data)) return asRecordArray(candidate.data);
  return [];
}

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

function keyHint(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}••••${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

function finite(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function validateConnectInput(input: Partial<ConnectExchangeInput>): ConnectExchangeInput {
  const apiKey = String(input.apiKey || '').trim();
  const apiSecret = String(input.apiSecret || '').trim();
  const apiPassphrase = String(input.apiPassphrase || '').trim();
  const keyVersion = String(input.keyVersion || '2').trim();
  if (apiKey.length < 8 || apiKey.length > 256) throw new Error('invalid_api_key');
  if (apiSecret.length < 8 || apiSecret.length > 256) throw new Error('invalid_api_secret');
  if (apiPassphrase.length < 6 || apiPassphrase.length > 256) throw new Error('invalid_api_passphrase');
  if (!['2', '3'].includes(keyVersion)) throw new Error('unsupported_api_key_version');
  const requestedMax = finite(input.maxOrderNotionalUsd);
  return {
    apiKey,
    apiSecret,
    apiPassphrase,
    keyVersion,
    enableTrading: input.enableTrading === true,
    maxOrderNotionalUsd: requestedMax > 0 ? requestedMax : 2_500,
  };
}

export class ExchangeSessionManager {
  private readonly sessions = new Map<string, ExchangeSession>();
  private readonly ttlMs: number;
  private readonly serverNotionalCeiling: number;
  private readonly intentStore: LiveExecutionIntentStore;
  private readonly privateOrderStreamEnabled: boolean;

  constructor(
    private readonly adapterFactory: (credentials: TestnetCredentials) => KuCoinFuturesTestnetAdapter =
      (credentials) => new KuCoinFuturesTestnetAdapter(credentials),
    env = process.env,
  ) {
    this.ttlMs = Math.min(24 * 60 * 60 * 1000, positive(env.APEX_EXCHANGE_SESSION_TTL_MS, 8 * 60 * 60 * 1000));
    this.serverNotionalCeiling = positive(env.APEX_LIVE_MAX_ORDER_NOTIONAL_USD, 25_000);
    this.intentStore = new LiveExecutionIntentStore(defaultLiveExecutionStorePath(env));
    this.privateOrderStreamEnabled = env.APEX_KUCOIN_PRIVATE_ORDER_WS !== 'false';
  }

  async connect(rawInput: Partial<ConnectExchangeInput>): Promise<{ session: ExchangeSession; snapshot: AccountSnapshot }> {
    const input = validateConnectInput(rawInput);
    const credentials: TestnetCredentials = {
      baseUrl: KUCOIN_FUTURES_PRODUCTION_BASE,
      apiKey: input.apiKey,
      apiSecret: input.apiSecret,
      apiPassphrase: input.apiPassphrase,
      keyVersion: input.keyVersion || '2',
    };
    const adapter = this.adapterFactory(credentials);
    const snapshot = await fetchAccountSnapshot(adapter, false);
    const now = Date.now();
    const id = crypto.randomBytes(32).toString('base64url');
    const session: ExchangeSession = {
      id,
      credentials,
      adapter,
      apiKeyHint: keyHint(input.apiKey),
      createdAt: now,
      verifiedAt: now,
      lastUsedAt: now,
      expiresAt: now + this.ttlMs,
      executionArmed: input.enableTrading === true,
      maxOrderNotionalUsd: Math.min(input.maxOrderNotionalUsd || 2_500, this.serverNotionalCeiling),
      previews: new Map(),
      intentStore: this.intentStore,
      privateOrderStream: null,
      privateOrderStreamState: this.privateOrderStreamEnabled ? 'DISCONNECTED' : 'DISABLED',
    };
    this.sessions.set(id, session);
    await reconcileUnresolvedLiveIntents(session);
    this.startPrivateOrderStream(session);
    return { session, snapshot };
  }

  get(id: string | null | undefined): ExchangeSession | null {
    this.prune();
    if (!id) return null;
    const session = this.sessions.get(id);
    if (!session || session.expiresAt <= Date.now()) return null;
    session.lastUsedAt = Date.now();
    return session;
  }

  disconnect(id: string | null | undefined): boolean {
    if (!id) return false;
    const session = this.sessions.get(id);
    session?.privateOrderStream?.close();
    return this.sessions.delete(id);
  }

  diagnostics(now = Date.now()) {
    this.prune();
    const sessions = [...this.sessions.values()];
    const newestVerifiedAt = sessions.length ? Math.max(...sessions.map((session) => session.verifiedAt)) : null;
    const streamStates = sessions.reduce<Record<string, number>>((acc, session) => {
      acc[session.privateOrderStreamState] = (acc[session.privateOrderStreamState] || 0) + 1;
      return acc;
    }, {});
    return {
      activeSessions: sessions.length,
      executionArmedSessions: sessions.filter((session) => session.executionArmed).length,
      newestVerifiedAt,
      newestVerifiedAgeMs: newestVerifiedAt === null ? null : Math.max(0, now - newestVerifiedAt),
      privateOrderStreams: streamStates,
      serverSessionTtlMs: this.ttlMs,
      serverNotionalCeilingUsd: this.serverNotionalCeiling,
    };
  }

  publicState(session: ExchangeSession | null) {
    if (!session) {
      return {
        status: 'not_connected' as const,
        mode: 'live' as const,
        exchange: 'kucoin' as const,
        portfolioState: 'locked' as const,
        executionState: 'locked' as const,
        liveAvailable: false,
      };
    }
    return {
      status: 'connected' as const,
      mode: 'live' as const,
      exchange: 'kucoin' as const,
      environment: 'LIVE' as const,
      apiKeyHint: session.apiKeyHint,
      connectedAt: new Date(session.createdAt).toISOString(),
      verifiedAt: new Date(session.verifiedAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      portfolioState: 'available' as const,
      executionState: session.executionArmed ? 'unlocked' as const : 'read_only' as const,
      requiresOrderPreview: true,
      requiresExplicitConfirmation: true,
      maxOrderNotionalUsd: session.maxOrderNotionalUsd,
      privateOrderStream: {
        state: session.privateOrderStreamState,
        role: 'READ_RECONCILIATION_ONLY' as const,
        restReconciliationAuthority: true as const,
      },
      liveAvailable: true,
    };
  }

  private startPrivateOrderStream(session: ExchangeSession): void {
    if (!this.privateOrderStreamEnabled) {
      session.privateOrderStreamState = 'DISABLED';
      return;
    }
    const adapter = session.adapter as KuCoinFuturesTestnetAdapter & { privateWebSocketToken?: () => Promise<unknown> };
    if (typeof adapter.privateWebSocketToken !== 'function') {
      session.privateOrderStreamState = 'DISABLED';
      return;
    }
    const stream = new KuCoinPrivateOrderStream({
      fetchBullet: () => adapter.privateWebSocketToken!(),
      onEvent: (event) => { applyKuCoinPrivateOrderEventToIntent(session.intentStore, event); },
      onReconnectNeeded: () => reconcileUnresolvedLiveIntents(session),
    });
    stream.onStateChange((state) => { session.privateOrderStreamState = state; });
    session.privateOrderStream = stream;
    stream.start();
  }

  private prune() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) {
        session.privateOrderStream?.close();
        this.sessions.delete(id);
        continue;
      }
      for (const [previewId, preview] of session.previews) {
        if (Date.parse(preview.expiresAt) <= now || preview.used) session.previews.delete(previewId);
      }
    }
  }
}

export async function fetchAccountSnapshot(adapter: KuCoinFuturesTestnetAdapter, includeHistory = true): Promise<AccountSnapshot> {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const requests: Promise<unknown>[] = [
    adapter.serverTime(),
    adapter.accountOverview(),
    adapter.positions(),
    adapter.openOrders(),
  ];
  if (includeHistory) {
    requests.push(
      adapter.recentClosedOrders().catch(() => null),
      adapter.recentTrades().catch(() => null),
      adapter.positionHistory(weekAgo, now).catch(() => null),
    );
  }
  const [serverTime, account, positions, openOrders, recentOrders, recentTrades, positionHistory] = await Promise.all(requests);
  return {
    account: asRecord(account),
    positions: itemsFrom(positions),
    openOrders: itemsFrom(openOrders),
    recentOrders: itemsFrom(recentOrders),
    recentTrades: itemsFrom(recentTrades),
    positionHistory: itemsFrom(positionHistory),
    serverTime,
    syncedAt: new Date().toISOString(),
  };
}

function aligned(value: number, step: number): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return false;
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-8;
}

function normalizeDraft(raw: Partial<LiveOrderDraft>): LiveOrderDraft {
  const side = raw.side === 'sell' ? 'sell' : raw.side === 'buy' ? 'buy' : null;
  const type = raw.type === 'market' ? 'market' : raw.type === 'limit' ? 'limit' : null;
  const marginMode = raw.marginMode === 'CROSS' ? 'CROSS' : raw.marginMode === 'ISOLATED' ? 'ISOLATED' : null;
  const timeInForce = ['GTC', 'IOC', 'FOK'].includes(String(raw.timeInForce)) ? raw.timeInForce as KuCoinTimeInForce : null;
  if (!raw.symbol || !side || !type || !marginMode || !timeInForce) throw new Error('invalid_order_request');
  const quantity = finite(raw.quantity);
  const leverage = finite(raw.leverage);
  const price = raw.price == null ? null : finite(raw.price);
  const takeProfitPrice = raw.takeProfitPrice == null ? null : finite(raw.takeProfitPrice);
  const stopLossPrice = raw.stopLossPrice == null ? null : finite(raw.stopLossPrice);
  if (quantity <= 0 || leverage < 1 || leverage > 100) throw new Error('invalid_order_quantity_or_leverage');
  if (type === 'limit' && (!price || price <= 0)) throw new Error('limit_price_required');
  return {
    symbol: toKuCoinFuturesSymbol(String(raw.symbol)),
    side,
    type,
    quantity,
    price,
    leverage: Math.floor(leverage),
    marginMode,
    timeInForce,
    reduceOnly: raw.reduceOnly === true,
    takeProfitPrice,
    stopLossPrice,
  };
}

type LiveOrderRequest = Partial<LiveOrderDraft> & { tradePlan?: TradePlan | null };

function extractTradePlan(raw: LiveOrderRequest): TradePlan | null {
  const plan = raw.tradePlan;
  return plan && typeof plan === 'object' ? plan as TradePlan : null;
}

function alignDown(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return 0;
  return Number((Math.floor((value + 1e-12) / step) * step).toPrecision(12));
}

function accountEquity(account: Record<string, unknown>): number {
  return finite(account.accountEquity || account.equity || account.marginBalance || account.availableBalance);
}

function optionalFiniteFrom(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (value == null || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function positionQuantity(position: Record<string, unknown>): number {
  return finite(position.currentQty || position.qty || position.size);
}

function positionNotional(position: Record<string, unknown>): number {
  const quantity = Math.abs(positionQuantity(position));
  const multiplier = finite(position.multiplier || position.contractMultiplier) || 1;
  const mark = finite(position.markPrice || position.currentPrice || position.avgEntryPrice);
  return quantity * multiplier * mark;
}

function validateProtectionGeometry(draft: LiveOrderDraft, referencePrice: number): void {
  if (draft.reduceOnly && (draft.takeProfitPrice || draft.stopLossPrice)) throw new Error('reduce_only_protection_not_allowed');
  if (draft.side === 'buy') {
    if (draft.takeProfitPrice && draft.takeProfitPrice <= referencePrice) throw new Error('long_take_profit_must_be_above_entry');
    if (draft.stopLossPrice && draft.stopLossPrice >= referencePrice) throw new Error('long_stop_loss_must_be_below_entry');
  } else {
    if (draft.takeProfitPrice && draft.takeProfitPrice >= referencePrice) throw new Error('short_take_profit_must_be_below_entry');
    if (draft.stopLossPrice && draft.stopLossPrice <= referencePrice) throw new Error('short_stop_loss_must_be_above_entry');
  }
}

function evaluateLiveRisk(args: {
  session: ExchangeSession;
  draft: LiveOrderDraft;
  plan: TradePlan | null;
  referencePrice: number;
  notionalUsd: number;
  contractMultiplier: number;
  account: Record<string, unknown>;
  positions: Array<Record<string, unknown>>;
  positionHistory?: Array<Record<string, unknown>>;
  historyAvailable?: boolean;
  historyTruncated?: boolean;
}): RiskGovernorResult {
  const symbolExposureUsd = args.positions
    .filter((position) => String(position.symbol || '').toUpperCase() === args.draft.symbol.toUpperCase())
    .reduce((sum, position) => sum + positionNotional(position), 0);
  const totalExposureUsd = args.positions.reduce((sum, position) => sum + positionNotional(position), 0);
  const telemetry = deriveLiveRiskTelemetry({
    account: args.account,
    positions: args.positions,
    positionHistory: args.positionHistory ?? [],
    historyAvailable: args.historyAvailable === true,
    historyTruncated: args.historyTruncated === true,
  });
  return evaluateRiskGovernor({
    order: {
      symbol: args.draft.symbol,
      direction: args.draft.side === 'buy' ? 'LONG' : 'SHORT',
      quantity: args.draft.quantity,
      entryPrice: args.referencePrice,
      notionalUsd: args.notionalUsd,
      contractMultiplier: args.contractMultiplier,
      leverage: args.draft.leverage,
      reduceOnly: args.draft.reduceOnly,
      exchange: 'kucoin',
      strategy: args.plan?.decisionRef?.engineVersion ?? null,
    },
    account: {
      equityUsd: accountEquity(args.account),
      availableMarginUsd: finite(args.account.availableBalance || args.account.availableMargin),
      timestamp: Date.now(),
    },
    portfolio: {
      openPositionCount: args.positions.filter((position) => Math.abs(positionQuantity(position)) > 0).length,
      totalOpenRiskUsd: telemetry.totalOpenRiskUsd,
      symbolExposureUsd,
      correlatedExposureUsd: totalExposureUsd,
      dailyPnlUsd: telemetry.dailyPnlUsd,
      weeklyPnlUsd: telemetry.weeklyPnlUsd,
      drawdownPct: telemetry.drawdownPct,
      consecutiveLosses: telemetry.consecutiveLosses,
    },
    market: {
      dataState: 'live',
      ageMs: 0,
      exchangeDegraded: false,
      reconciliationHealthy: args.session.intentStore.unresolvedForApiKey(args.session.apiKeyHint).length === 0,
    },
    executionMode: 'MANUAL',
    plan: args.plan,
    policy: loadRiskGovernorPolicy(),
  });
}

function applyRiskQuantity(draft: LiveOrderDraft, risk: RiskGovernorResult, lotSize: number): LiveOrderDraft {
  if (risk.decision === 'REJECTED') throw new Error('risk_governor_rejected');
  if (risk.decision === 'DEFERRED') throw new Error('risk_governor_deferred');
  if (risk.decision !== 'APPROVED_REDUCED') return draft;
  const quantity = alignDown(risk.approvedQuantity, lotSize);
  if (quantity <= 0) throw new Error('risk_governor_reduced_below_minimum');
  return { ...draft, quantity };
}

function exchangeOrderState(payload: unknown): {
  status: 'ACKNOWLEDGED' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED';
  exchangeOrderId: string | null;
  executedQuantity: number;
  averageFillPrice: number | null;
} {
  const order = asRecord(payload);
  const active = order.isActive === true || String(order.status || '').toLowerCase() === 'active';
  const cancelled = order.cancelExist === true || ['cancelled', 'canceled'].includes(String(order.status || '').toLowerCase());
  const executedQuantity = finite(order.dealSize || order.filledSize || order.executedQty);
  const averageFillPrice = finite(order.avgDealPrice || order.averagePrice || order.dealPrice) || null;
  const requestedQuantity = finite(order.size || order.quantity);
  const status = cancelled
    ? 'CANCELLED'
    : executedQuantity > 0 && requestedQuantity > 0 && executedQuantity >= requestedQuantity
      ? 'FILLED'
      : executedQuantity > 0
        ? 'PARTIALLY_FILLED'
        : active
          ? 'ACKNOWLEDGED'
          : 'ACKNOWLEDGED';
  return {
    status,
    exchangeOrderId: String(order.id || order.orderId || '') || null,
    executedQuantity,
    averageFillPrice,
  };
}


function normalizeLiveFills(
  payload: unknown,
  record: LiveExecutionIntentRecord,
  exchangeOrderId: string | null,
): LiveExecutionFillRecord[] {
  return itemsFrom(payload)
    .filter((item) => {
      const orderId = String(item.orderId || item.order_id || '');
      const clientOid = String(item.clientOid || item.clientOrderId || '');
      return (exchangeOrderId && orderId === exchangeOrderId) || clientOid === record.clientOid;
    })
    .map((item, index) => ({
      id: String(item.tradeId || item.id || `${record.clientOid}-${index}`),
      exchangeOrderId: String(item.orderId || item.order_id || exchangeOrderId || '') || null,
      clientOid: String(item.clientOid || item.clientOrderId || record.clientOid || '') || null,
      quantity: Math.max(0, finite(item.size || item.dealSize || item.quantity)),
      price: Math.max(0, finite(item.price || item.dealPrice)),
      fee: Number.isFinite(Number(item.fee)) ? Number(item.fee) : null,
      feeCurrency: String(item.feeCurrency || item.feeCurrencyCode || '') || null,
      timestamp: Number.isFinite(Number(item.tradeTime || item.createdAt || item.ts))
        ? Number(item.tradeTime || item.createdAt || item.ts)
        : null,
    }))
    .filter((fill) => fill.quantity > 0 && fill.price > 0);
}

function kuCoinEventTimestampMs(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  if (parsed > 1e16) return Math.floor(parsed / 1e6); // nanoseconds -> milliseconds
  if (parsed > 1e13) return Math.floor(parsed / 1e3); // microseconds -> milliseconds
  return Math.floor(parsed);
}

/** Applies a verified private order event to an already-persisted intent. No event can create an execution intent. */
export function applyKuCoinPrivateOrderEventToIntent(
  store: LiveExecutionIntentStore,
  event: KuCoinPrivateOrderEvent,
): LiveExecutionIntentRecord | null {
  const data = event.data;
  const clientOid = String(data.clientOid || data.clientOrderId || '').trim();
  const exchangeOrderId = String(data.orderId || data.id || '').trim();
  const record = (clientOid ? store.findByClientOid(clientOid) : null)
    ?? (exchangeOrderId ? store.findByExchangeOrderId(exchangeOrderId) : null);
  if (!record) return null;

  const eventType = String(data.type || '').toLowerCase();
  const exchangeStatus = String(data.status || '').toLowerCase();
  const totalFilledRaw = Number(data.filledSize ?? data.dealSize ?? data.executedQuantity);
  const totalFilled = Number.isFinite(totalFilledRaw) && totalFilledRaw >= 0 ? totalFilledRaw : record.executedQuantity;
  const nextFills = [...(record.fills ?? [])];
  if (eventType === 'match') {
    const matchSize = Number(data.matchSize);
    const matchPrice = Number(data.matchPrice);
    const tradeId = String(data.tradeId || '').trim();
    if (tradeId && Number.isFinite(matchSize) && matchSize > 0 && Number.isFinite(matchPrice) && matchPrice > 0 && !nextFills.some((fill) => fill.id === tradeId)) {
      nextFills.push({
        id: tradeId,
        exchangeOrderId: exchangeOrderId || record.exchangeOrderId,
        clientOid: clientOid || record.clientOid,
        quantity: matchSize,
        price: matchPrice,
        fee: Number.isFinite(Number(data.fee)) ? Number(data.fee) : null,
        feeCurrency: String(data.feeCurrency || data.feeCurrencyCode || '').trim() || null,
        timestamp: kuCoinEventTimestampMs(data.ts ?? data.orderTime),
      });
    }
  }
  const fillQuantity = nextFills.reduce((sum, fill) => sum + fill.quantity, 0);
  const fillNotional = nextFills.reduce((sum, fill) => sum + fill.quantity * fill.price, 0);
  const executedQuantity = Math.min(record.order.quantity, Math.max(record.executedQuantity, totalFilled, fillQuantity));
  const averageFillPrice = fillQuantity > 0 ? fillNotional / fillQuantity : record.averageFillPrice;

  let status: LiveExecutionIntentRecord['status'] = record.status;
  if (eventType === 'canceled' || eventType === 'cancelled') status = 'CANCELLED';
  else if (eventType === 'filled' || (exchangeStatus === 'done' && executedQuantity >= record.order.quantity)) status = 'FILLED';
  else if (executedQuantity > 0) status = 'PARTIALLY_FILLED';
  else if (['open', 'update', 'received'].includes(eventType)) status = 'ACKNOWLEDGED';

  return store.update(record.id, {
    status,
    exchangeOrderId: exchangeOrderId || record.exchangeOrderId,
    executedQuantity,
    averageFillPrice,
    fills: nextFills,
    lastError: null,
  });
}

async function reconcileLiveIntent(
  session: ExchangeSession,
  record: LiveExecutionIntentRecord,
): Promise<LiveExecutionIntentRecord | null> {
  session.intentStore.update(record.id, { status: 'RECONCILING', lastError: null });
  try {
    const exchangeResponse = await session.adapter.orderByClientOid(record.clientOid);
    const state = exchangeOrderState(exchangeResponse);
    let fills = record.fills ?? [];
    try { fills = normalizeLiveFills(await session.adapter.recentTrades(), record, state.exchangeOrderId); } catch { /* Keep authoritative order state when fill history is temporarily unavailable. */ }
    const fillQuantity = fills.reduce((sum, fill) => sum + fill.quantity, 0);
    const fillNotional = fills.reduce((sum, fill) => sum + fill.quantity * fill.price, 0);
    const executedQuantity = Math.min(record.order.quantity, Math.max(state.executedQuantity, fillQuantity));
    const averageFillPrice = fillQuantity > 0 ? fillNotional / fillQuantity : state.averageFillPrice;
    return session.intentStore.update(record.id, {
      ...state,
      executedQuantity,
      averageFillPrice,
      fills,
      protectiveOrderStatus: record.protectiveOrderStatus === 'REQUESTED' ? 'ATTACHED_UNVERIFIED' : record.protectiveOrderStatus,
      exchangeResponse,
      lastError: null,
    });
  } catch (error) {
    return session.intentStore.update(record.id, {
      status: 'UNKNOWN',
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
}

async function reconcileUnresolvedLiveIntents(session: ExchangeSession): Promise<void> {
  for (const record of session.intentStore.unresolvedForApiKey(session.apiKeyHint)) {
    await reconcileLiveIntent(session, record);
  }
}

export async function previewLiveOrder(session: ExchangeSession, rawDraft: LiveOrderRequest): Promise<LiveOrderPreview> {
  if (!session.executionArmed) throw new Error('execution_not_armed');
  let draft = normalizeDraft(rawDraft);
  const tradePlan = extractTradePlan(rawDraft);
  const riskNow = Date.now();
  const [contractPayload, tickerPayload, accountPayload, ordersPayload, positionsPayload, historyPayload] = await Promise.all([
    session.adapter.contract(draft.symbol),
    session.adapter.ticker(draft.symbol),
    session.adapter.accountOverview(),
    session.adapter.openOrders(),
    session.adapter.positions(),
    session.adapter.positionHistory(riskNow - 7 * 24 * 60 * 60 * 1000, riskNow).catch(() => null),
  ]);
  const contract = asRecord(contractPayload);
  const ticker = asRecord(tickerPayload);
  const account = asRecord(accountPayload);
  const positions = itemsFrom(positionsPayload);
  const positionHistory = itemsFrom(historyPayload);
  const historyEnvelope = asRecord(historyPayload);
  const historyTotal = optionalFiniteFrom(historyEnvelope, ['totalNum', 'total', 'totalCount']);
  const historyTruncated = historyTotal != null && historyTotal > positionHistory.length;
  const lotSize = finite(contract.lotSize) || 1;
  const tickSize = finite(contract.tickSize);
  const multiplier = finite(contract.multiplier);
  const maxLeverage = finite(contract.maxLeverage) || 100;
  const status = String(contract.status || '');
  if (status && status !== 'Open') throw new Error('contract_not_open');
  if (!aligned(draft.quantity, lotSize)) throw new Error('invalid_quantity_step');
  if (draft.leverage > maxLeverage) throw new Error('leverage_exceeds_contract_max');
  if (draft.type === 'limit' && tickSize > 0 && !aligned(draft.price || 0, tickSize)) throw new Error('invalid_price_tick');
  for (const protectedPrice of [draft.takeProfitPrice, draft.stopLossPrice]) {
    if (protectedPrice && tickSize > 0 && !aligned(protectedPrice, tickSize)) throw new Error('invalid_protection_price_tick');
  }
  const markPrice = finite(ticker.price || ticker.markPrice);
  let referencePrice = draft.type === 'limit' ? draft.price || 0 : markPrice;
  if (referencePrice <= 0 || multiplier <= 0) throw new Error('market_reference_unavailable');
  validateProtectionGeometry(draft, referencePrice);
  let estimatedNotionalUsd = draft.quantity * multiplier * referencePrice;
  if (estimatedNotionalUsd > session.maxOrderNotionalUsd) throw new Error('session_notional_limit_exceeded');
  const openOrderCount = itemsFrom(ordersPayload).length;
  if (openOrderCount >= 100) throw new Error('exchange_open_order_limit_reached');

  let riskDecision = evaluateLiveRisk({ session, draft, plan: tradePlan, referencePrice, notionalUsd: estimatedNotionalUsd, contractMultiplier: multiplier, account, positions, positionHistory, historyAvailable: historyPayload != null, historyTruncated });
  draft = applyRiskQuantity(draft, riskDecision, lotSize);
  if (draft.quantity !== riskDecision.approvedQuantity && riskDecision.decision === 'APPROVED_REDUCED') {
    estimatedNotionalUsd = draft.quantity * multiplier * referencePrice;
    riskDecision = evaluateLiveRisk({ session, draft, plan: tradePlan, referencePrice, notionalUsd: estimatedNotionalUsd, contractMultiplier: multiplier, account, positions, positionHistory, historyAvailable: historyPayload != null, historyTruncated });
    if (riskDecision.decision === 'REJECTED' || riskDecision.decision === 'DEFERRED') throw new Error('risk_governor_recheck_failed');
  }

  const estimatedInitialMarginUsd = estimatedNotionalUsd / draft.leverage;
  const availableMarginUsd = finite(account.availableBalance || account.availableMargin);
  if (!draft.reduceOnly && estimatedInitialMarginUsd > availableMarginUsd) throw new Error('insufficient_available_margin');
  const clientOid = crypto.randomUUID();
  const now = Date.now();
  const order: KuCoinLiveOrderInput = { ...draft, clientOid, price: draft.price ?? null };
  const warnings = [
    'This preview represents a real KuCoin Futures order.',
    draft.reduceOnly ? 'Reduce-only is enabled.' : 'This order may increase account exposure.',
    ...riskDecision.reasons,
  ];
  if (riskDecision.decision === 'APPROVED_REDUCED') warnings.unshift(`Risk Governor reduced quantity to ${draft.quantity}.`);
  const preview: LiveOrderPreview = {
    id: crypto.randomBytes(24).toString('base64url'),
    environment: 'LIVE',
    mode: 'live',
    confirmationPhrase: LIVE_ORDER_CONFIRMATION,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    order,
    markPrice,
    estimatedNotionalUsd,
    estimatedInitialMarginUsd,
    availableMarginUsd,
    warnings: [...new Set(warnings)],
    tradePlan,
    riskDecision,
    contract: { lotSize, tickSize, multiplier, maxLeverage },
    used: false,
  };
  session.previews.set(preview.id, preview);
  return preview;
}

export async function submitPreviewedLiveOrder(session: ExchangeSession, previewId: string, confirmation: string) {
  if (!session.executionArmed) throw new Error('execution_not_armed');
  if (confirmation !== LIVE_ORDER_CONFIRMATION) throw new Error('explicit_live_confirmation_required');
  const preview = session.previews.get(previewId);
  if (!preview || preview.used || Date.parse(preview.expiresAt) <= Date.now()) throw new Error('order_preview_expired');
  if (preview.tradePlan) {
    const planCheck = assertTradePlanSubmittable(preview.tradePlan);
    if (!planCheck.ok) throw new Error(`trade_plan_invalid:${planCheck.errors.join('|')}`);
  }

  const riskNow = Date.now();
  const [tickerPayload, accountPayload, positionsPayload, historyPayload] = await Promise.all([
    session.adapter.ticker(preview.order.symbol),
    session.adapter.accountOverview(),
    session.adapter.positions(),
    session.adapter.positionHistory(riskNow - 7 * 24 * 60 * 60 * 1000, riskNow).catch(() => null),
  ]);
  const markPrice = finite(asRecord(tickerPayload).price || asRecord(tickerPayload).markPrice);
  const referencePrice = preview.order.type === 'limit' ? preview.order.price || 0 : markPrice;
  if (referencePrice <= 0) throw new Error('market_reference_unavailable');
  const currentNotional = preview.order.quantity * preview.contract.multiplier * referencePrice;
  const riskDecision = evaluateLiveRisk({
    session,
    draft: preview.order,
    plan: preview.tradePlan,
    referencePrice,
    notionalUsd: currentNotional,
    contractMultiplier: preview.contract.multiplier,
    account: asRecord(accountPayload),
    positions: itemsFrom(positionsPayload),
    positionHistory: itemsFrom(historyPayload),
    historyAvailable: historyPayload != null,
    historyTruncated: (() => {
      const historyItems = itemsFrom(historyPayload);
      const historyTotal = optionalFiniteFrom(asRecord(historyPayload), ['totalNum', 'total', 'totalCount']);
      return historyTotal != null && historyTotal > historyItems.length;
    })(),
  });
  if (riskDecision.decision === 'REJECTED' || riskDecision.decision === 'DEFERRED') throw new Error('risk_changed_repreview_required');
  if (riskDecision.decision === 'APPROVED_REDUCED' && riskDecision.approvedQuantity + 1e-12 < preview.order.quantity) {
    throw new Error('risk_changed_repreview_required');
  }

  preview.used = true;
  const intent = session.intentStore.create({
    id: `live_${crypto.randomBytes(16).toString('hex')}`,
    apiKeyHint: session.apiKeyHint,
    order: preview.order,
    plan: preview.tradePlan,
    risk: riskDecision,
  });
  try {
    const exchangeResponse = await session.adapter.submitLiveOrder(preview.order);
    const state = exchangeOrderState(exchangeResponse);
    let fills: LiveExecutionFillRecord[] = [];
    try { fills = normalizeLiveFills(await session.adapter.recentTrades(), intent, state.exchangeOrderId); } catch { /* REST fill history can lag acknowledgement. */ }
    const fillQuantity = fills.reduce((sum, fill) => sum + fill.quantity, 0);
    const fillNotional = fills.reduce((sum, fill) => sum + fill.quantity * fill.price, 0);
    session.intentStore.update(intent.id, {
      ...state,
      executedQuantity: Math.min(preview.order.quantity, Math.max(state.executedQuantity, fillQuantity)),
      averageFillPrice: fillQuantity > 0 ? fillNotional / fillQuantity : state.averageFillPrice,
      fills,
      exchangeResponse,
      protectiveOrderStatus: intent.protectiveOrderStatus === 'REQUESTED' ? 'ATTACHED_UNVERIFIED' : intent.protectiveOrderStatus,
      status: state.status === 'FILLED' ? 'FILLED' : state.status,
    });
    return {
      ok: true as const,
      environment: 'LIVE' as const,
      submittedAt: new Date().toISOString(),
      clientOid: preview.order.clientOid,
      exchangeResponse,
      order: preview.order,
      riskDecision,
      executionIntentId: intent.id,
    };
  } catch (error) {
    session.intentStore.update(intent.id, {
      status: 'RECONCILING',
      lastError: error instanceof Error ? error.message : String(error),
    });
    const reconciled = await reconcileLiveIntent(session, { ...intent, status: 'RECONCILING' });
    if (reconciled && reconciled.status !== 'UNKNOWN') {
      return {
        ok: true as const,
        environment: 'LIVE' as const,
        submittedAt: new Date().toISOString(),
        clientOid: preview.order.clientOid,
        exchangeResponse: reconciled.exchangeResponse,
        order: preview.order,
        riskDecision,
        executionIntentId: intent.id,
        reconciledAfterSubmissionError: true,
      };
    }
    throw new Error('live_order_state_unknown_reconciliation_required');
  } finally {
    session.previews.delete(preview.id);
  }
}

export function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return null; }
  }
  return null;
}

export function toPublicPreview(preview: LiveOrderPreview) {
  const { used: _used, ...safe } = preview;
  return safe;
}
