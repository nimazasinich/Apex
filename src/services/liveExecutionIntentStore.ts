import { existsSync } from 'node:fs';
import path from 'node:path';
import type { KuCoinLiveOrderInput } from './testnetExecution';
import type { RiskGovernorResult } from './riskGovernor';
import type { TradePlan } from './tradePlan';
import { readDurableJsonFileSync, writeDurableJsonFileSync } from './durableJsonFile';
import { resolvePrivateDataDir } from './privateConfigFile';

export type LiveExecutionIntentStatus =
  | 'SUBMITTING'
  | 'ACKNOWLEDGED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'UNKNOWN'
  | 'RECONCILING';

export interface LiveExecutionFillRecord {
  id: string;
  exchangeOrderId: string | null;
  clientOid: string | null;
  quantity: number;
  price: number;
  fee: number | null;
  feeCurrency: string | null;
  timestamp: number | null;
}

export type ProtectiveOrderStatus = 'NOT_REQUESTED' | 'REQUESTED' | 'ATTACHED_UNVERIFIED' | 'ACTIVE_VERIFIED' | 'FAILED';

export interface LiveExecutionIntentRecord {
  id: string;
  apiKeyHint: string;
  clientOid: string;
  order: KuCoinLiveOrderInput;
  tradePlanId: string | null;
  riskPolicyVersion: string;
  riskDecision: RiskGovernorResult['decision'];
  status: LiveExecutionIntentStatus;
  exchangeOrderId: string | null;
  executedQuantity: number;
  averageFillPrice: number | null;
  fills: LiveExecutionFillRecord[];
  protectiveOrderStatus: ProtectiveOrderStatus;
  exchangeResponse: unknown;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Safe operator-facing projection of unresolved durable LIVE intent state. */
export interface LiveReconciliationSummary {
  unresolvedIntentCount: number;
  unresolvedStatuses: LiveExecutionIntentStatus[];
  latestError: string | null;
  latestUpdatedAt: string | null;
  reconciliationHealthy: boolean;
}

const OPEN_STATUSES = new Set<LiveExecutionIntentStatus>([
  'SUBMITTING', 'ACKNOWLEDGED', 'PARTIALLY_FILLED', 'UNKNOWN', 'RECONCILING',
]);
const TERMINAL_STATUSES = new Set<LiveExecutionIntentStatus>(['FILLED', 'CANCELLED', 'REJECTED']);
const MAX_RECORDS = 50_000;

function validRecord(value: unknown): value is LiveExecutionIntentRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<LiveExecutionIntentRecord>;
  return typeof record.id === 'string'
    && typeof record.apiKeyHint === 'string'
    && typeof record.clientOid === 'string'
    && typeof record.status === 'string'
    && Boolean(record.order && typeof record.order === 'object');
}

export class LiveExecutionIntentStore {
  private records: LiveExecutionIntentRecord[];

  constructor(private readonly storePath: string) {
    this.records = this.read();
  }

  private read(): LiveExecutionIntentRecord[] {
    try {
      if (!existsSync(this.storePath)) return [];
      const parsed = readDurableJsonFileSync(this.storePath);
      const rows = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown }).rows) ? (parsed as { rows: unknown[] }).rows : null);
      if (!rows || !rows.every(validRecord)) throw new Error('invalid_live_execution_store');
      return rows.map((record) => ({
        ...record,
        fills: Array.isArray(record.fills) ? record.fills : [],
        // Legacy ACTIVE had no independently verified protection lifecycle. Never trust it on reload.
        protectiveOrderStatus: (record as { protectiveOrderStatus?: string }).protectiveOrderStatus === 'ACTIVE'
          ? 'ATTACHED_UNVERIFIED'
          : record.protectiveOrderStatus ?? (record.order.takeProfitPrice || record.order.stopLossPrice ? 'ATTACHED_UNVERIFIED' : 'NOT_REQUESTED'),
      })) as LiveExecutionIntentRecord[];
    } catch {
      throw new Error('live_execution_store_corrupt');
    }
  }

  private save(): void {
    const open = this.records.filter((record) => OPEN_STATUSES.has(record.status));
    const terminal = this.records.filter((record) => !OPEN_STATUSES.has(record.status));
    this.records = [...open, ...terminal].slice(0, Math.max(MAX_RECORDS, open.length));
    writeDurableJsonFileSync(path.resolve(this.storePath), { schemaVersion: 1, rows: this.records });
  }

  create(args: {
    id: string;
    apiKeyHint: string;
    order: KuCoinLiveOrderInput;
    plan?: TradePlan | null;
    risk: RiskGovernorResult;
  }): LiveExecutionIntentRecord {
    if (this.findByClientOid(args.order.clientOid)) throw new Error('duplicate_client_order_id');
    const now = new Date().toISOString();
    const record: LiveExecutionIntentRecord = {
      id: args.id,
      apiKeyHint: args.apiKeyHint,
      clientOid: args.order.clientOid,
      order: args.order,
      tradePlanId: args.plan?.id ?? null,
      riskPolicyVersion: args.risk.policyVersion,
      riskDecision: args.risk.decision,
      status: 'SUBMITTING',
      exchangeOrderId: null,
      executedQuantity: 0,
      averageFillPrice: null,
      fills: [],
      protectiveOrderStatus: args.order.takeProfitPrice || args.order.stopLossPrice ? 'REQUESTED' : 'NOT_REQUESTED',
      exchangeResponse: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.records.unshift(record);
    this.save();
    return record;
  }

  findByClientOid(clientOid: string): LiveExecutionIntentRecord | null {
    return this.records.find((record) => record.clientOid === clientOid) ?? null;
  }

  findByExchangeOrderId(exchangeOrderId: string): LiveExecutionIntentRecord | null {
    const normalized = exchangeOrderId.trim();
    if (!normalized) return null;
    return this.records.find((record) => record.exchangeOrderId === normalized) ?? null;
  }

  unresolvedForApiKey(apiKeyHint: string): LiveExecutionIntentRecord[] {
    return this.records.filter((record) => record.apiKeyHint === apiKeyHint && OPEN_STATUSES.has(record.status));
  }

  reconciliationSummaryForApiKey(apiKeyHint: string): LiveReconciliationSummary {
    const unresolved = this.unresolvedForApiKey(apiKeyHint);
    const latest = [...unresolved].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
    return {
      unresolvedIntentCount: unresolved.length,
      unresolvedStatuses: [...new Set(unresolved.map((record) => record.status))].sort(),
      latestError: latest?.lastError ?? null,
      latestUpdatedAt: latest?.updatedAt ?? null,
      reconciliationHealthy: unresolved.length === 0,
    };
  }

  update(id: string, patch: Partial<LiveExecutionIntentRecord>): LiveExecutionIntentRecord | null {
    const record = this.records.find((candidate) => candidate.id === id);
    if (!record) return null;
    if (TERMINAL_STATUSES.has(record.status) && patch.status && patch.status !== record.status) {
      throw new Error('invalid_terminal_live_execution_transition');
    }
    if (patch.executedQuantity != null && (patch.executedQuantity < 0 || patch.executedQuantity > record.order.quantity)) {
      throw new Error('invalid_live_executed_quantity');
    }
    Object.assign(record, patch, { updatedAt: new Date().toISOString() });
    this.save();
    return record;
  }

  all(): LiveExecutionIntentRecord[] {
    return this.records.map((record) => ({ ...record }));
  }
}

export function defaultLiveExecutionStorePath(env = process.env): string {
  return env.APEX_LIVE_EXECUTION_STORE_PATH || path.join(resolvePrivateDataDir(), 'execution', 'live-execution-intents.json');
}
