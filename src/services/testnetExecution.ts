import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readDurableJsonFileSync, writeDurableJsonFileSync } from './durableJsonFile';

export type TestnetOrderStatus = 'VALIDATING' | 'RISK_REJECTED' | 'SUBMITTING' | 'ACKNOWLEDGED' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCEL_PENDING' | 'CANCELLED' | 'REJECTED' | 'UNKNOWN' | 'RECONCILING';
export type TestnetOrderType = 'market' | 'limit';

export type KuCoinTimeInForce = 'GTC' | 'IOC' | 'FOK';
export type KuCoinMarginMode = 'ISOLATED' | 'CROSS';

export interface KuCoinLiveOrderInput {
  clientOid: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: TestnetOrderType;
  quantity: number;
  price: number | null;
  leverage: number;
  marginMode: KuCoinMarginMode;
  timeInForce: KuCoinTimeInForce;
  reduceOnly: boolean;
  takeProfitPrice?: number | null;
  stopLossPrice?: number | null;
}

export interface TestnetCredentials {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  apiPassphrase: string;
  keyVersion: string;
}

export interface TestnetRiskConfig {
  allowedSymbols: string[];
  maxOrderNotional: number;
  maxOpenOrders: number;
  minimumAvailableMargin: number;
}

export interface TestnetFillRecord {
  id: string;
  exchangeOrderId: string | null;
  clientOid: string | null;
  quantity: number;
  price: number;
  fee: number | null;
  feeCurrency: string | null;
  timestamp: number | null;
}

export interface TestnetOrderRecord {
  id: string;
  environment: 'TESTNET';
  symbol: string;
  side: 'buy' | 'sell';
  intent: 'LONG' | 'SHORT';
  type: TestnetOrderType;
  quantity: number;
  price: number | null;
  clientOid: string;
  exchangeOrderId: string | null;
  status: TestnetOrderStatus;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastReconciledAt: string | null;
  lastSuccessfulReconciliationAt?: string | null;
  reconciliationError?: string | null;
  reconciliationAttempts?: number;
  executedQuantity?: number;
  remainingQuantity?: number;
  averageFillPrice?: number | null;
  fills?: TestnetFillRecord[];
  protectiveOrderStatus?: 'NOT_REQUESTED' | 'REQUESTED' | 'ATTACHED_UNVERIFIED' | 'ACTIVE_VERIFIED' | 'FAILED';
  exchangeStateMatches?: boolean | null;
  riskDecision: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason: string | null;
  exchangeResponse: Record<string, unknown> | null;
}

export interface ManualTestnetOrderRequest {
  environment: 'TESTNET';
  symbol: string;
  intent: 'LONG' | 'SHORT';
  type: TestnetOrderType;
  quantity: number;
  price?: number;
  clientOid?: string;
}

export interface ContractRules {
  symbol: string;
  status: string;
  lotSize: number;
  tickSize: number;
  multiplier: number;
  minQuantity?: number;
  minNotional?: number;
}

export interface TestnetReadiness {
  state: 'READY' | 'BLOCKED' | 'DEGRADED';
  missing: string[];
  activeEnvironment: 'PAPER' | 'TESTNET';
  manualTestnetEnabled: boolean;
  liveEnabled: false;
}

export type ValidationStatus = 'VALIDATING_LOCALLY' | 'RISK_REJECTED' | 'SUBMITTING_VALIDATION' | 'VALIDATED' | 'EXCHANGE_REJECTED' | 'VALIDATION_FAILED' | 'VALIDATION_UNKNOWN';
export interface ValidationRecord {
  id: string; environment: 'VALIDATION'; clientOid: string; createdAt: string; updatedAt: string;
  symbol: string; side: 'buy' | 'sell'; intent: 'LONG' | 'SHORT'; type: TestnetOrderType; quantity: number; price: number | null;
  estimatedNotional: number | null; status: ValidationStatus; riskDecision: 'PENDING' | 'APPROVED' | 'REJECTED';
  kucoinCode: string | null; response: Record<string, unknown> | null; errorCode: string | null; reason: string | null;
}
export const KUCOIN_FUTURES_PRODUCTION_BASE = 'https://api-futures.kucoin.com';

const positive = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function loadTestnetCredentials(env = process.env): TestnetCredentials | null {
  const baseUrl = (env.KUCOIN_FUTURES_TESTNET_BASE || '').trim().replace(/\/$/, '');
  const apiKey = (env.KUCOIN_TESTNET_API_KEY || '').trim();
  const apiSecret = (env.KUCOIN_TESTNET_API_SECRET || '').trim();
  const apiPassphrase = (env.KUCOIN_TESTNET_API_PASSPHRASE || '').trim();
  if (!baseUrl || !apiKey || !apiSecret || !apiPassphrase) return null;
  // KuCoin's current public Futures API documentation does not publish an
  // independently verifiable Futures Testnet REST hostname. A URL supplied by
  // an operator is therefore never enough to arm execution. Keep this list
  // intentionally empty until KuCoin publishes and we verify such an endpoint.
  if (!isApprovedKuCoinFuturesTestnetBase(baseUrl)) return null;
  return { baseUrl, apiKey, apiSecret, apiPassphrase, keyVersion: (env.KUCOIN_TESTNET_API_KEY_VERSION || '2').trim() || '2' };
}

/** Dedicated credentials for the non-executing KuCoin Futures order-test route. */
export function loadValidationCredentials(env = process.env): TestnetCredentials | null {
  const apiKey = (env.KUCOIN_VALIDATION_API_KEY || '').trim();
  const apiSecret = (env.KUCOIN_VALIDATION_API_SECRET || '').trim();
  const apiPassphrase = (env.KUCOIN_VALIDATION_API_PASSPHRASE || '').trim();
  if (!apiKey || !apiSecret || !apiPassphrase) return null;
  return { baseUrl: KUCOIN_FUTURES_PRODUCTION_BASE, apiKey, apiSecret, apiPassphrase, keyVersion: (env.KUCOIN_VALIDATION_API_KEY_VERSION || '2').trim() || '2' };
}

/** Deliberately deny-by-default: this is not a user-configurable allowlist. */
export function isApprovedKuCoinFuturesTestnetBase(baseUrl: string): boolean {
  const normalized = baseUrl.trim().replace(/\/$/, '');
  return false && normalized.length > 0;
}

export function loadTestnetRiskConfig(env = process.env): TestnetRiskConfig {
  return {
    allowedSymbols: (env.APEX_TESTNET_ALLOWED_SYMBOLS || 'XBTUSDTM').split(',').map((item) => item.trim().toUpperCase()).filter(Boolean),
    maxOrderNotional: positive(env.APEX_TESTNET_MAX_ORDER_NOTIONAL, 25),
    maxOpenOrders: Math.max(1, Math.floor(positive(env.APEX_TESTNET_MAX_OPEN_ORDERS, 3))),
    minimumAvailableMargin: positive(env.APEX_TESTNET_MIN_AVAILABLE_MARGIN, 5),
  };
}

export function getTestnetReadiness(env = process.env): TestnetReadiness {
  const missing: string[] = [];
  if (env.APEX_TESTNET_ENABLED !== 'true') missing.push('APEX_TESTNET_ENABLED=true');
  if (!loadTestnetCredentials(env)) missing.push('officially verified KuCoin Futures Testnet endpoint and server-side Testnet credentials');
  if (!env.APEX_TESTNET_ORDER_STORE_PATH) missing.push('durable Testnet order store path');
  return { state: missing.length ? 'BLOCKED' : 'READY', missing, activeEnvironment: missing.length ? 'PAPER' : 'TESTNET', manualTestnetEnabled: !missing.length, liveEnabled: false };
}

const decimalParts = (value: number) => {
  const text = String(value);
  if (!Number.isFinite(value) || /e/i.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return { whole, fraction };
};

/** Integer-safe filter alignment for ordinary decimal exchange increments. */
export function isDecimalStepAligned(value: number, step: number): boolean {
  const a = decimalParts(value); const b = decimalParts(step);
  if (!a || !b || step <= 0) return false;
  const scale = Math.max(a.fraction.length, b.fraction.length);
  const factor = 10n ** BigInt(scale);
  const toInt = (parts: { whole: string; fraction: string }) => BigInt(`${parts.whole}${parts.fraction.padEnd(scale, '0')}`);
  const stepInt = toInt(b);
  return stepInt > 0n && toInt(a) % stepInt === 0n;
}

/** Rounds a Risk Governor-approved quantity down to the nearest valid lot step, never up. */
export function alignQuantityDownToLot(value: number, lotSize: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(lotSize) || lotSize <= 0) return 0;
  return Number((Math.floor((value + 1e-12) / lotSize) * lotSize).toPrecision(12));
}

export function evaluateManualTestnetOrder(input: ManualTestnetOrderRequest, rules: ContractRules, availableMargin: number, openOrders: number, risk: TestnetRiskConfig, marketPrice: number) {
  if (input.environment !== 'TESTNET') return { ok: false as const, reason: 'testnet_environment_required' };
  if (!risk.allowedSymbols.includes(input.symbol)) return { ok: false as const, reason: 'symbol_not_allowed' };
  if (rules.status !== 'Open') return { ok: false as const, reason: 'contract_not_open' };
  if (!Number.isFinite(input.quantity) || input.quantity <= 0 || !isDecimalStepAligned(input.quantity, rules.lotSize)) return { ok: false as const, reason: 'invalid_quantity_step' };
  if (rules.minQuantity && input.quantity < rules.minQuantity) return { ok: false as const, reason: 'minimum_quantity_not_met' };
  if (input.type === 'limit' && (!Number.isFinite(input.price) || !input.price || input.price <= 0 || !isDecimalStepAligned(input.price, rules.tickSize))) return { ok: false as const, reason: 'invalid_limit_price_tick' };
  if (input.type !== 'market' && input.type !== 'limit') return { ok: false as const, reason: 'unsupported_order_type' };
  if (openOrders >= risk.maxOpenOrders) return { ok: false as const, reason: 'max_open_orders_reached' };
  if (availableMargin < risk.minimumAvailableMargin) return { ok: false as const, reason: 'minimum_available_margin_not_met' };
  const reference = input.type === 'limit' ? input.price! : marketPrice;
  const notional = input.quantity * rules.multiplier * reference;
  if (!Number.isFinite(reference) || reference <= 0) return { ok: false as const, reason: 'stale_or_invalid_market_data' };
  if (rules.minNotional && notional < rules.minNotional) return { ok: false as const, reason: 'minimum_notional_not_met', notional };
  if (!Number.isFinite(notional) || notional > risk.maxOrderNotional) return { ok: false as const, reason: 'max_order_notional_exceeded', notional };
  return { ok: true as const, notional };
}

const MAX_TESTNET_ORDER_RECORDS = 50_000;

export class TestnetOrderStore {
  private records: TestnetOrderRecord[];
  constructor(private readonly storePath: string) {
    this.records = this.read();
  }
  private read(): TestnetOrderRecord[] {
    try {
      if (!existsSync(this.storePath)) return [];
      const parsed = readDurableJsonFileSync(this.storePath);
      const rows = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown }).rows) ? (parsed as { rows: unknown[] }).rows : null);
      if (!rows || !rows.every((record) => record && typeof record === 'object' && typeof (record as TestnetOrderRecord).id === 'string' && typeof (record as TestnetOrderRecord).clientOid === 'string' && typeof (record as TestnetOrderRecord).status === 'string')) throw new Error('invalid_order_store');
      return rows.map((record) => ({ ...(record as TestnetOrderRecord), protectiveOrderStatus: (record as { protectiveOrderStatus?: string }).protectiveOrderStatus === 'ACTIVE' ? 'ATTACHED_UNVERIFIED' : (record as TestnetOrderRecord).protectiveOrderStatus }));
    } catch { throw new Error('testnet_order_store_corrupt'); }
  }
  private save() {
    const open = this.records.filter((record) => ['VALIDATING', 'SUBMITTING', 'ACKNOWLEDGED', 'PARTIALLY_FILLED', 'UNKNOWN', 'RECONCILING', 'CANCEL_PENDING'].includes(record.status));
    const terminal = this.records.filter((record) => !open.includes(record));
    this.records = [...open, ...terminal].slice(0, Math.max(MAX_TESTNET_ORDER_RECORDS, open.length));
    writeDurableJsonFileSync(path.resolve(this.storePath), { schemaVersion: 1, rows: this.records });
  }
  all() { return [...this.records]; }
  findByClientOid(clientOid: string) { return this.records.find((record) => record.clientOid === clientOid) ?? null; }
  openCount() { return this.records.filter((record) => ['VALIDATING', 'SUBMITTING', 'ACKNOWLEDGED', 'PARTIALLY_FILLED', 'UNKNOWN', 'RECONCILING', 'CANCEL_PENDING'].includes(record.status)).length; }
  create(record: TestnetOrderRecord) { if (this.findByClientOid(record.clientOid)) throw new Error('duplicate_client_order_id'); this.records.unshift(record); this.save(); return record; }
  update(id: string, patch: Partial<TestnetOrderRecord>) {
    const record = this.records.find((candidate) => candidate.id === id); if (!record) return null;
    const terminal = new Set<TestnetOrderStatus>(['RISK_REJECTED', 'FILLED', 'CANCELLED', 'REJECTED']);
    if (terminal.has(record.status) && patch.status && patch.status !== record.status) throw new Error('invalid_terminal_order_transition');
    if (patch.executedQuantity !== undefined && (patch.executedQuantity < 0 || patch.executedQuantity > record.quantity)) throw new Error('invalid_executed_quantity');
    Object.assign(record, patch, { updatedAt: new Date().toISOString() }); this.save(); return record;
  }
}

/** Separate durable namespace: validation results can never be reconciled as orders. */
export class ValidationRecordStore {
  private records: ValidationRecord[];
  constructor(private readonly storePath: string) { this.records = this.read(); }
  private read(): ValidationRecord[] {
    try {
      if (!existsSync(this.storePath)) return [];
      const parsed = readDurableJsonFileSync(this.storePath);
      const rows = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown }).rows) ? (parsed as { rows: unknown[] }).rows : null);
      if (!rows || !rows.every((r) => r && typeof r === 'object' && (r as ValidationRecord).environment === 'VALIDATION' && typeof (r as ValidationRecord).clientOid === 'string')) throw new Error('invalid_validation_store');
      return rows as ValidationRecord[];
    } catch { throw new Error('validation_record_store_corrupt'); }
  }
  private save() { writeDurableJsonFileSync(path.resolve(this.storePath), { schemaVersion: 1, rows: this.records.slice(0, MAX_TESTNET_ORDER_RECORDS) }); }
  all() { return [...this.records]; }
  findByClientOid(clientOid: string) { return this.records.find((record) => record.clientOid === clientOid) ?? null; }
  create(record: ValidationRecord) { if (this.findByClientOid(record.clientOid)) throw new Error('duplicate_client_order_id'); this.records.unshift(record); this.save(); return record; }
  update(id: string, patch: Partial<ValidationRecord>) { const record = this.records.find((item) => item.id === id); if (!record) return null; Object.assign(record, patch, { updatedAt: new Date().toISOString() }); this.save(); return record; }
}

export class KuCoinFuturesTestnetAdapter {
  constructor(private readonly credentials: TestnetCredentials, private readonly requestFetch: typeof fetch = fetch, private readonly now: () => number = Date.now) {}
  private async request(method: 'GET' | 'POST' | 'DELETE', endpoint: string, body?: Record<string, unknown>) {
    const timestamp = this.now().toString();
    const bodyText = body ? JSON.stringify(body) : '';
    const prehash = `${timestamp}${method}${endpoint}${bodyText}`;
    const sign = crypto.createHmac('sha256', this.credentials.apiSecret).update(prehash).digest('base64');
    const passphrase = crypto.createHmac('sha256', this.credentials.apiSecret).update(this.credentials.apiPassphrase).digest('base64');
    const response = await this.requestFetch(`${this.credentials.baseUrl}${endpoint}`, { method, headers: { 'Content-Type': 'application/json', 'KC-API-KEY': this.credentials.apiKey, 'KC-API-SIGN': sign, 'KC-API-TIMESTAMP': timestamp, 'KC-API-PASSPHRASE': passphrase, 'KC-API-KEY-VERSION': this.credentials.keyVersion }, body: bodyText || undefined, signal: AbortSignal.timeout(10_000) });
    const payload = await response.json().catch(() => null) as { code?: string; data?: unknown; msg?: string } | null;
    if (!response.ok || payload?.code !== '200000') throw new Error(payload?.msg || `exchange_http_${response.status}`);
    return payload.data;
  }
  serverTime() { return this.request('GET', '/api/v1/timestamp'); }
  /** Authenticated Classic Futures WebSocket token. Read/reconciliation use only. */
  privateWebSocketToken() { return this.request('POST', '/api/v1/bullet-private'); }
  accountOverview() { return this.request('GET', '/api/v1/account-overview?currency=USDT'); }
  positions() { return this.request('GET', '/api/v1/positions?status=0'); }
  openOrders() { return this.request('GET', '/api/v1/orders?status=active'); }
  recentClosedOrders() { return this.request('GET', '/api/v1/recentDoneOrders'); }
  recentTrades() { return this.request('GET', '/api/v1/recentFills'); }
  positionHistory(from?: number, to?: number) {
    const query = new URLSearchParams();
    if (from) query.set('from', String(from));
    if (to) query.set('to', String(to));
    query.set('limit', '100');
    return this.request('GET', `/api/v1/history-positions?${query.toString()}`);
  }
  contract(symbol: string) { return this.request('GET', `/api/v1/contracts/${encodeURIComponent(symbol)}`); }
  ticker(symbol: string) { return this.request('GET', `/api/v1/ticker?symbol=${encodeURIComponent(symbol)}`); }
  submit(input: { clientOid: string; symbol: string; side: 'buy' | 'sell'; type: TestnetOrderType; quantity: number; price: number | null }) { const body: Record<string, unknown> = { clientOid: input.clientOid, symbol: input.symbol, side: input.side, type: input.type, size: input.quantity }; if (input.type === 'limit') body.price = input.price; return this.request('POST', '/api/v1/orders', body); }
  submitLiveOrder(input: KuCoinLiveOrderInput) {
    const body: Record<string, unknown> = {
      clientOid: input.clientOid,
      symbol: input.symbol,
      side: input.side,
      type: input.type,
      size: input.quantity,
      leverage: input.leverage,
      marginMode: input.marginMode,
      positionSide: 'BOTH',
      reduceOnly: input.reduceOnly,
      remark: 'APEX',
    };
    if (input.type === 'limit') {
      body.price = String(input.price);
      body.timeInForce = input.timeInForce;
    }
    const hasProtection = Boolean(input.takeProfitPrice || input.stopLossPrice);
    if (input.takeProfitPrice) body.triggerStopUpPrice = String(input.takeProfitPrice);
    if (input.stopLossPrice) body.triggerStopDownPrice = String(input.stopLossPrice);
    if (hasProtection) body.stopPriceType = 'TP';
    return this.request('POST', hasProtection ? '/api/v1/st-orders' : '/api/v1/orders', body);
  }
  /** The only production-domain write available to Validation mode. It is non-executing by KuCoin contract. */
  validateOrder(input: { clientOid: string; symbol: string; side: 'buy' | 'sell'; type: TestnetOrderType; quantity: number; price: number | null }) {
    const body: Record<string, unknown> = { clientOid: input.clientOid, symbol: input.symbol, side: input.side, type: input.type, size: input.quantity };
    if (input.type === 'limit') body.price = input.price;
    return this.request('POST', '/api/v1/orders/test', body);
  }
  orderByClientOid(clientOid: string) { return this.request('GET', `/api/v1/orders/byClientOid?clientOid=${encodeURIComponent(clientOid)}`); }
  cancel(orderId: string) { return this.request('DELETE', `/api/v1/orders/${encodeURIComponent(orderId)}`); }
}
