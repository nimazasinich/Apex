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

export interface ExecutionTelemetry {
  version: 'execution_telemetry_v1';
  source: 'KUCOIN_OPERATOR_CONTROLLED_LIVE';
  decisionAt: number | null;
  orderSubmittedAt: number | null;
  ackAt: number | null;
  firstFillAt: number | null;
  completedAt: number | null;
  midAtDecision: number | null;
  expectedEntry: number | null;
  actualVWAP: number | null;
  slippageBps: number | null;
  spreadAtDecisionBps: number | null;
  depthAtDecisionUsd: number | null;
  partialFillObserved: boolean;
  venue: 'KUCOIN';
  instrument: string;
  dataQuality: 'PARTIAL' | 'COMPLETE';
  provenance: string[];
}

export interface ExecutionCalibrationSnapshot {
  version: 'execution_calibration_v1';
  source: 'KUCOIN_OPERATOR_CONTROLLED_LIVE';
  status: 'INSUFFICIENT_EVIDENCE' | 'CALIBRATED';
  minimumSamples: number;
  completeSamples: number;
  slippageBps: { median: number; p90: number; mean: number } | null;
  submitToAckMs: { median: number; p90: number; mean: number } | null;
  decisionToFirstFillMs: { median: number; p90: number; mean: number } | null;
  calibrationVersion: string | null;
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
  executionTelemetry: ExecutionTelemetry;
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

function finiteOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function baseExecutionTelemetry(order: KuCoinLiveOrderInput): ExecutionTelemetry {
  return {
    version: 'execution_telemetry_v1',
    source: 'KUCOIN_OPERATOR_CONTROLLED_LIVE',
    decisionAt: null, orderSubmittedAt: null, ackAt: null, firstFillAt: null, completedAt: null,
    midAtDecision: null, expectedEntry: null, actualVWAP: null, slippageBps: null,
    spreadAtDecisionBps: null, depthAtDecisionUsd: null, partialFillObserved: false,
    venue: 'KUCOIN', instrument: order.symbol, dataQuality: 'PARTIAL', provenance: [],
  };
}

function deriveExecutionTelemetry(record: Pick<LiveExecutionIntentRecord, 'order' | 'status' | 'fills' | 'averageFillPrice'>, current?: Partial<ExecutionTelemetry> | null): ExecutionTelemetry {
  const base = { ...baseExecutionTelemetry(record.order), ...(current ?? {}) };
  const fills = Array.isArray(record.fills) ? record.fills : [];
  const timestamped = fills.map((fill) => finiteOrNull(fill.timestamp)).filter((value): value is number => value != null && value > 0);
  const fillQuantity = fills.reduce((sum, fill) => sum + (Number.isFinite(fill.quantity) ? fill.quantity : 0), 0);
  const fillNotional = fills.reduce((sum, fill) => sum + (Number.isFinite(fill.quantity) && Number.isFinite(fill.price) ? fill.quantity * fill.price : 0), 0);
  const actualVWAP = fillQuantity > 0 ? fillNotional / fillQuantity : finiteOrNull(record.averageFillPrice);
  const expectedEntry = finiteOrNull(base.expectedEntry);
  const slippageBps = expectedEntry != null && expectedEntry > 0 && actualVWAP != null
    ? ((actualVWAP - expectedEntry) / expectedEntry) * 10_000 * (record.order.side === 'buy' ? 1 : -1)
    : null;
  const firstFillAt = timestamped.length ? Math.min(...timestamped) : finiteOrNull(base.firstFillAt);
  const completedAt = record.status === 'FILLED' && timestamped.length ? Math.max(...timestamped) : finiteOrNull(base.completedAt);
  const next: ExecutionTelemetry = {
    ...base,
    decisionAt: finiteOrNull(base.decisionAt),
    orderSubmittedAt: finiteOrNull(base.orderSubmittedAt),
    ackAt: finiteOrNull(base.ackAt),
    firstFillAt,
    completedAt,
    midAtDecision: finiteOrNull(base.midAtDecision),
    expectedEntry,
    actualVWAP,
    slippageBps: Number.isFinite(slippageBps) ? slippageBps : null,
    spreadAtDecisionBps: finiteOrNull(base.spreadAtDecisionBps),
    depthAtDecisionUsd: finiteOrNull(base.depthAtDecisionUsd),
    partialFillObserved: Boolean(base.partialFillObserved || record.status === 'PARTIALLY_FILLED'),
    venue: 'KUCOIN',
    instrument: record.order.symbol,
    provenance: [...new Set(Array.isArray(base.provenance) ? base.provenance.filter((item): item is string => typeof item === 'string' && item.length > 0) : [])],
    dataQuality: 'PARTIAL',
  };
  next.dataQuality = next.decisionAt != null && next.orderSubmittedAt != null && next.ackAt != null
    && next.firstFillAt != null && next.completedAt != null && next.expectedEntry != null && next.actualVWAP != null
    ? 'COMPLETE' : 'PARTIAL';
  return next;
}

function metricSummary(values: number[]): { median: number; p90: number; mean: number } | null {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const pick = (q: number) => clean[Math.min(clean.length - 1, Math.max(0, Math.ceil(clean.length * q) - 1))];
  return { median: pick(0.5), p90: pick(0.9), mean: clean.reduce((sum, value) => sum + value, 0) / clean.length };
}

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
      return rows.map((record) => {
        const fills = Array.isArray(record.fills) ? record.fills : [];
        const normalized = {
          ...record,
          fills,
          // Legacy ACTIVE had no independently verified protection lifecycle. Never trust it on reload.
          protectiveOrderStatus: (record as { protectiveOrderStatus?: string }).protectiveOrderStatus === 'ACTIVE'
            ? 'ATTACHED_UNVERIFIED'
            : record.protectiveOrderStatus ?? (record.order.takeProfitPrice || record.order.stopLossPrice ? 'ATTACHED_UNVERIFIED' : 'NOT_REQUESTED'),
        } as LiveExecutionIntentRecord;
        normalized.executionTelemetry = deriveExecutionTelemetry(normalized, (record as { executionTelemetry?: Partial<ExecutionTelemetry> }).executionTelemetry ?? {
          provenance: ['legacy_execution_record_no_timing_claims'],
        });
        return normalized;
      });
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
    telemetrySeed?: Partial<ExecutionTelemetry>;
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
      executionTelemetry: deriveExecutionTelemetry({ order: args.order, status: 'SUBMITTING', fills: [], averageFillPrice: null }, args.telemetrySeed),
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

  update(id: string, patch: Partial<Omit<LiveExecutionIntentRecord, 'executionTelemetry'>> & { executionTelemetry?: Partial<ExecutionTelemetry> }): LiveExecutionIntentRecord | null {
    const record = this.records.find((candidate) => candidate.id === id);
    if (!record) return null;
    if (TERMINAL_STATUSES.has(record.status) && patch.status && patch.status !== record.status) {
      throw new Error('invalid_terminal_live_execution_transition');
    }
    if (patch.executedQuantity != null && (patch.executedQuantity < 0 || patch.executedQuantity > record.order.quantity)) {
      throw new Error('invalid_live_executed_quantity');
    }
    const telemetryPatch = patch.executionTelemetry;
    const { executionTelemetry: _ignored, ...recordPatch } = patch;
    Object.assign(record, recordPatch, { updatedAt: new Date().toISOString() });
    record.executionTelemetry = deriveExecutionTelemetry(record, { ...record.executionTelemetry, ...(telemetryPatch ?? {}) });
    this.save();
    return record;
  }

  executionCalibrationSnapshotForApiKey(apiKeyHint: string, minimumSamples = 30): ExecutionCalibrationSnapshot {
    const complete = this.records
      .filter((record) => record.apiKeyHint === apiKeyHint && record.executionTelemetry?.dataQuality === 'COMPLETE')
      .map((record) => record.executionTelemetry);
    const slippage = complete.map((row) => row.slippageBps).filter((value): value is number => value != null && Number.isFinite(value));
    const ackLatency = complete
      .map((row) => row.orderSubmittedAt != null && row.ackAt != null ? row.ackAt - row.orderSubmittedAt : null)
      .filter((value): value is number => value != null && value >= 0);
    const firstFillLatency = complete
      .map((row) => row.decisionAt != null && row.firstFillAt != null ? row.firstFillAt - row.decisionAt : null)
      .filter((value): value is number => value != null && value >= 0);
    const calibrated = complete.length >= minimumSamples;
    return {
      version: 'execution_calibration_v1',
      source: 'KUCOIN_OPERATOR_CONTROLLED_LIVE',
      status: calibrated ? 'CALIBRATED' : 'INSUFFICIENT_EVIDENCE',
      minimumSamples,
      completeSamples: complete.length,
      slippageBps: metricSummary(slippage),
      submitToAckMs: metricSummary(ackLatency),
      decisionToFirstFillMs: metricSummary(firstFillLatency),
      calibrationVersion: calibrated ? `kucoin_execution_calibration_v1_n${complete.length}` : null,
    };
  }

  all(): LiveExecutionIntentRecord[] {
    return this.records.map((record) => ({ ...record }));
  }
}

export function defaultLiveExecutionStorePath(env = process.env): string {
  return env.APEX_LIVE_EXECUTION_STORE_PATH || path.join(resolvePrivateDataDir(), 'execution', 'live-execution-intents.json');
}
