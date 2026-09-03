import type { AccountSnapshot } from './accountTypes';
import type { TabdealConnectionStatus } from './exchanges/tabdeal/tabdealCapabilities';

export interface TabdealConnectionState {
  connected: boolean;
  apiKeyHint: string | null;
  createdAt: number | null;
  expiresAt: number | null;
  executionStage: 'READ_ONLY';
  status: TabdealConnectionStatus;
  signal: {
    credentialsPresent: boolean;
    lastPublicPingOk: boolean | null;
    lastAccountReadOk: boolean | null;
  };
  safety: {
    readOnly: true;
    automaticVenueFailoverEnabled: false;
    autonomousLiveExecutionEnabled: false;
  };
}

export interface TabdealConnectionResponse {
  ok: true;
  connection: TabdealConnectionState;
  snapshot?: AccountSnapshot;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('tabdeal_invalid_response');
  return value as Record<string, unknown>;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}
function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

const CONNECTION_STATUSES = new Set<TabdealConnectionStatus>(['DISCONNECTED', 'CONNECTED', 'READ_ONLY', 'PAPER_READY', 'LIVE_DISABLED', 'DEGRADED']);

function parseConnection(value: unknown): TabdealConnectionState {
  const row = record(value);
  const signal = record(row.signal);
  const safety = record(row.safety);
  const status = typeof row.status === 'string' && CONNECTION_STATUSES.has(row.status as TabdealConnectionStatus)
    ? row.status as TabdealConnectionStatus
    : 'DEGRADED';
  if (row.executionStage !== 'READ_ONLY') throw new Error('tabdeal_invalid_execution_stage');
  if (safety.readOnly !== true || safety.automaticVenueFailoverEnabled !== false || safety.autonomousLiveExecutionEnabled !== false) {
    throw new Error('tabdeal_invalid_safety_contract');
  }
  return {
    connected: row.connected === true,
    apiKeyHint: typeof row.apiKeyHint === 'string' ? row.apiKeyHint : null,
    createdAt: nullableNumber(row.createdAt),
    expiresAt: nullableNumber(row.expiresAt),
    executionStage: 'READ_ONLY',
    status,
    signal: {
      credentialsPresent: signal.credentialsPresent === true,
      lastPublicPingOk: nullableBoolean(signal.lastPublicPingOk),
      lastAccountReadOk: nullableBoolean(signal.lastAccountReadOk),
    },
    safety: { readOnly: true, automaticVenueFailoverEnabled: false, autonomousLiveExecutionEnabled: false },
  };
}

function parseSnapshot(value: unknown): AccountSnapshot {
  const row = record(value);
  if (row.venue !== 'tabdeal') throw new Error('tabdeal_snapshot_venue_missing');
  const qualityRow = row.quality && typeof row.quality === 'object' && !Array.isArray(row.quality) ? record(row.quality) : null;
  const observation = row.observationMetadata && typeof row.observationMetadata === 'object' && !Array.isArray(row.observationMetadata) ? record(row.observationMetadata) : null;
  if (typeof row.syncedAt !== 'string') throw new Error('tabdeal_snapshot_synced_at_missing');
  return {
    account: record(row.account),
    positions: recordArray(row.positions),
    openOrders: recordArray(row.openOrders),
    recentOrders: recordArray(row.recentOrders),
    recentTrades: recordArray(row.recentTrades),
    positionHistory: recordArray(row.positionHistory),
    serverTime: row.serverTime ?? null,
    syncedAt: row.syncedAt,
    venue: 'tabdeal',
    observationMetadata: observation ? {
      sourceObservedAt: nullableNumber(observation.sourceObservedAt),
      providerReadAt: nullableNumber(observation.providerReadAt) ?? Date.parse(row.syncedAt),
      provenance: typeof observation.provenance === 'string' ? observation.provenance : 'tabdeal_fapi_authenticated_rest',
    } : undefined,
    quality: qualityRow ? {
      state: qualityRow.state === 'complete' ? 'complete' : 'partial',
      failures: Array.isArray(qualityRow.failures) ? qualityRow.failures.filter((item): item is string => typeof item === 'string') : [],
    } : undefined,
  };
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json().catch(() => ({}));
  const row = record(payload);
  if (!response.ok || row.ok !== true) throw new Error(typeof row.error === 'string' ? row.error : `tabdeal_http_${response.status}`);
  return row;
}

function responseFrom(row: Record<string, unknown>): TabdealConnectionResponse {
  return {
    ok: true,
    connection: parseConnection(row.connection),
    ...(row.snapshot === undefined ? {} : { snapshot: parseSnapshot(row.snapshot) }),
  };
}

export async function getTabdealConnection(): Promise<TabdealConnectionResponse> {
  const response = await fetch('/api/exchanges/tabdeal/connection', { credentials: 'same-origin', cache: 'no-store' });
  return responseFrom(await readPayload(response));
}

export async function getTabdealSnapshot(symbol?: string): Promise<TabdealConnectionResponse> {
  const query = symbol?.trim() ? `?symbol=${encodeURIComponent(symbol.trim().toUpperCase())}` : '';
  const response = await fetch(`/api/exchanges/tabdeal/snapshot${query}`, { credentials: 'same-origin', cache: 'no-store' });
  return responseFrom(await readPayload(response));
}

export async function connectTabdeal(input: { apiKey: string; apiSecret: string }): Promise<TabdealConnectionResponse> {
  const response = await fetch('/api/exchanges/tabdeal/connect', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  return responseFrom(await readPayload(response));
}

export async function disconnectTabdeal(): Promise<TabdealConnectionResponse> {
  const response = await fetch('/api/exchanges/tabdeal/connection', { method: 'DELETE', credentials: 'same-origin' });
  return responseFrom(await readPayload(response));
}
