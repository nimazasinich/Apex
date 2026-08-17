import type { TradePlan } from './tradePlan';
import type { RiskGovernorResult } from './riskGovernor';
import { apiMutate } from './apiMutate';
import type { LiveReconciliationSummary } from './liveExecutionIntentStore';
export type { LiveReconciliationSummary } from './liveExecutionIntentStore';

export type ConnectionState =
  | {
      status: 'not_connected';
      mode: 'live';
      exchange: 'kucoin';
      portfolioState: 'locked';
      executionState: 'locked';
      liveAvailable: false;
    }
  | {
      status: 'demo';
      mode: 'demo';
      exchange: 'kucoin';
      environment: 'DEMO';
      profile: { id: string; name: string; accountType: 'DEMO' };
      connectedAt: string;
      expiresAt: string;
      portfolioState: 'available';
      executionState: 'unlocked';
      requiresOrderPreview: true;
      requiresExplicitConfirmation: true;
      maxOrderNotionalUsd: number;
      startingBalanceUsd: number;
      liveAvailable: boolean;
      liveApiKeyHint?: string;
      liveExpiresAt?: string;
      liveExecutionState?: 'unlocked' | 'read_only';
      liveMaxOrderNotionalUsd?: number;
    }
  | {
      status: 'connected';
      mode: 'live';
      exchange: 'kucoin';
      environment: 'LIVE';
      apiKeyHint: string;
      connectedAt: string;
      verifiedAt: string;
      expiresAt: string;
      portfolioState: 'available';
      executionState: 'unlocked' | 'read_only';
      requiresOrderPreview: true;
      requiresExplicitConfirmation: true;
      maxOrderNotionalUsd: number;
      liveAvailable: true;
    };

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

export interface ConnectExchangeInput {
  apiKey: string;
  apiSecret: string;
  apiPassphrase: string;
  keyVersion: '2' | '3';
  enableTrading: boolean;
  maxOrderNotionalUsd: number;
}

export interface LiveOrderDraft {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: number;
  price: number | null;
  leverage: number;
  marginMode: 'ISOLATED' | 'CROSS';
  timeInForce: 'GTC' | 'IOC' | 'FOK';
  reduceOnly: boolean;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
}

export interface LiveOrderPreview {
  id: string;
  environment: 'DEMO' | 'LIVE';
  mode: 'demo' | 'live';
  confirmationPhrase: 'CONFIRM DEMO ORDER' | 'CONFIRM LIVE ORDER';
  createdAt: string;
  expiresAt: string;
  order: LiveOrderDraft & { clientOid: string };
  markPrice: number;
  estimatedNotionalUsd: number;
  estimatedInitialMarginUsd: number;
  availableMarginUsd: number;
  warnings: string[];
  tradePlan?: TradePlan | null;
  riskDecision?: RiskGovernorResult | null;
}

async function jsonOrError<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T & { error?: string; message?: string };
  if (!response.ok) throw new Error(payload.error || payload.message || `request_failed_${response.status}`);
  return payload;
}

export interface AccountRequestOptions { signal?: AbortSignal; }

export async function getConnection(options: AccountRequestOptions = {}): Promise<ConnectionState> {
  const response = await fetch('/api/account/connection', { credentials: 'same-origin', signal: options.signal });
  const payload = await jsonOrError<{ connection: ConnectionState }>(response);
  return payload.connection;
}

export async function connectExchange(input: ConnectExchangeInput): Promise<{ connection: ConnectionState; snapshot: AccountSnapshot }> {
  const response = await apiMutate('/api/account/connect', {
    credentials: 'same-origin',
    body: JSON.stringify(input),
  });
  return jsonOrError(response);
}

export async function disconnectExchange(): Promise<{ connection: ConnectionState; snapshot?: AccountSnapshot }> {
  const response = await apiMutate('/api/account/connection', {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  return jsonOrError(response);
}

export async function selectAccountMode(
  mode: 'demo' | 'live',
  options: { startingBalanceUsd?: number; maxOrderNotionalUsd?: number } = {},
): Promise<{ connection: ConnectionState; snapshot: AccountSnapshot }> {
  const response = await apiMutate('/api/account/mode', {
    credentials: 'same-origin',
    body: JSON.stringify({ mode, ...options }),
  });
  return jsonOrError(response);
}

export async function resetDemoAccount(
  startingBalanceUsd: number,
  maxOrderNotionalUsd?: number,
): Promise<{ connection: ConnectionState; snapshot: AccountSnapshot }> {
  const response = await apiMutate('/api/account/demo/reset', {
    credentials: 'same-origin',
    body: JSON.stringify({ startingBalanceUsd, maxOrderNotionalUsd }),
  });
  return jsonOrError(response);
}

export type AvailableConnectionState = Exclude<ConnectionState, { status: 'not_connected' }>;

export function accountIsAvailable(connection: ConnectionState): connection is AvailableConnectionState {
  return connection.status === 'demo' || connection.status === 'connected';
}

export async function getPortfolio(): Promise<{ connection: ConnectionState; snapshot: AccountSnapshot }> {
  const response = await fetch('/api/account/portfolio', { credentials: 'same-origin' });
  return jsonOrError(response);
}

export async function previewOrder(order: LiveOrderDraft, tradePlan?: TradePlan | null): Promise<LiveOrderPreview> {
  const response = await apiMutate('/api/account/orders/preview', {
    credentials: 'same-origin',
    body: JSON.stringify({ ...order, tradePlan: tradePlan ?? undefined }),
  });
  const payload = await jsonOrError<{ preview: LiveOrderPreview }>(response);
  return payload.preview;
}

export async function submitLiveOrder(previewId: string, confirmation: string) {
  const response = await apiMutate('/api/account/orders', {
    credentials: 'same-origin',
    body: JSON.stringify({ previewId, confirmation }),
  });
  return jsonOrError<Record<string, unknown>>(response);
}

export async function cancelLiveOrder(orderId: string) {
  const response = await apiMutate(`/api/account/orders/${encodeURIComponent(orderId)}/cancel`, {
    credentials: 'same-origin',
    body: '{}',
  });
  return jsonOrError<Record<string, unknown>>(response);
}

import type { WorkspaceInsights } from './workspaceInsights';

export async function getWorkspaceData(options: AccountRequestOptions = {}): Promise<{
  connection: ConnectionState;
  snapshot: AccountSnapshot;
  insights: WorkspaceInsights;
  reconciliation: LiveReconciliationSummary | null;
}> {
  const response = await fetch('/api/account/workspace', { credentials: 'same-origin', cache: 'no-store', signal: options.signal });
  return jsonOrError(response);
}
