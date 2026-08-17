/* Copied from apex-trading-engine/src/services/decisionMemoryDatasetSync.ts */

import { downloadFile, uploadFile } from '@huggingface/hub';
import { join } from 'node:path';
import type { SignalDecisionLog } from '../types';
import { buildDecisionMemoryExportPayload, validateDecisionMemoryExportPayload } from '../utils/decisionMemoryExport';
import { readDurableJsonFileSync, writeDurableJsonFileSync } from './durableJsonFile';
import { resolvePrivateDataDir } from './privateConfigFile';
import type { DecisionMemoryMirror } from './decisionMemoryMirror';

const DATASET_FILE_PATH = 'decision-memory-latest.json';
const DEFAULT_SYNC_INTERVAL_MS = 600_000;
const MIN_SYNC_INTERVAL_MS = 60_000;
const EXPORT_SOURCE = 'APEX DecisionMemoryMirror HF Dataset backup';

interface DatasetSyncConfig {
  token: string;
  repo: string;
}

export interface DatasetHubClient {
  uploadFile: (args: any) => Promise<unknown>;
  downloadFile: (args: any) => Promise<Blob | null>;
}

interface DatasetSyncState {
  version: 1;
  repo: string;
  lastSyncedChecksum: string;
  lastSyncedAt: string;
}

const defaultHubClient: DatasetHubClient = { uploadFile: (args) => uploadFile(args), downloadFile: (args) => downloadFile(args) as Promise<Blob | null> };

function defaultSyncStatePath(): string {
  return join(resolvePrivateDataDir(), 'state', 'decision-memory-dataset-sync.json');
}

function readSyncState(filePath: string): DatasetSyncState | null {
  try {
    const raw = readDurableJsonFileSync(filePath);
    if (!raw || typeof raw !== 'object') return null;
    const state = raw as Partial<DatasetSyncState>;
    if (state.version !== 1 || typeof state.repo !== 'string' || typeof state.lastSyncedChecksum !== 'string' || !/^[a-f0-9]{64}$/.test(state.lastSyncedChecksum)) return null;
    return state as DatasetSyncState;
  } catch {
    return null;
  }
}

function writeSyncState(filePath: string, state: DatasetSyncState): void {
  writeDurableJsonFileSync(filePath, state, { maxBytes: 64 * 1024, backup: true });
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 250): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
    try { return await fn(); } catch (error) {
      last = error;
      if (attempt >= attempts) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(5_000, baseDelayMs * (2 ** (attempt - 1)))));
    }
  }
  throw last;
}

interface ResultBase {
  rowCount: number;
  timestamp: string;
}

export type SyncResult =
  | (ResultBase & { status: 'SYNCED' })
  | (ResultBase & { status: 'SKIPPED'; reason: string })
  | (ResultBase & { status: 'ERROR'; message: string });

export type RestoreResult =
  | (ResultBase & { status: 'RESTORED' })
  | (ResultBase & { status: 'EMPTY' })
  | (ResultBase & { status: 'SKIPPED'; reason: string })
  | (ResultBase & { status: 'ERROR'; message: string });

/** Ops-facing backup status (restore RESTORED maps to SYNCED for display simplicity). */
export type DatasetBackupOpsStatus = 'SKIPPED' | 'SYNCED' | 'ERROR' | 'EMPTY' | 'UNAVAILABLE';

export interface DecisionMemoryDatasetDurabilityStatus {
  status: DatasetBackupOpsStatus;
  reason: string | null;
  lastSyncAt: string | null;
  lastRestoreStatus: RestoreResult['status'] | null;
  lastRestoreAt: string | null;
  rowCount: number | null;
}

let durabilityStatus: DecisionMemoryDatasetDurabilityStatus = {
  status: 'UNAVAILABLE',
  reason: 'not_initialized',
  lastSyncAt: null,
  lastRestoreStatus: null,
  lastRestoreAt: null,
  rowCount: null,
};

export function getDecisionMemoryDatasetDurabilityStatus(): DecisionMemoryDatasetDurabilityStatus {
  return { ...durabilityStatus };
}

function recordSyncResult(result: SyncResult): void {
  durabilityStatus = {
    ...durabilityStatus,
    status: result.status === 'ERROR' ? 'ERROR' : result.status,
    reason: result.status === 'SKIPPED' ? result.reason : result.status === 'ERROR' ? result.message : null,
    lastSyncAt: result.timestamp,
    rowCount: result.rowCount,
  };
}

function recordRestoreResult(result: RestoreResult): void {
  durabilityStatus = {
    ...durabilityStatus,
    lastRestoreStatus: result.status,
    lastRestoreAt: result.timestamp,
    rowCount: result.rowCount > 0 ? result.rowCount : durabilityStatus.rowCount,
    // Prefer restore EMPTY/ERROR visibility until a backup sync runs.
    status:
      result.status === 'EMPTY'
        ? 'EMPTY'
        : result.status === 'ERROR'
          ? 'ERROR'
          : result.status === 'SKIPPED'
            ? 'SKIPPED'
            : durabilityStatus.status === 'UNAVAILABLE'
              ? 'SKIPPED'
              : durabilityStatus.status,
    reason:
      result.status === 'SKIPPED'
        ? result.reason
        : result.status === 'ERROR'
          ? result.message
          : result.status === 'EMPTY'
            ? 'Dataset backup file missing or empty'
            : durabilityStatus.reason,
  };
}

function timestamp(): string {
  return new Date().toISOString();
}

function readConfig(): DatasetSyncConfig | null {
  const token = (process.env.HF_TOKEN ?? process.env.HUGGING_FACE_TOKEN ?? '').trim();
  const repo = (process.env.HF_DECISION_MEMORY_REPO ?? '').trim();
  return token && repo ? { token, repo } : null;
}

function unconfiguredReason(): string {
  const missing: string[] = [];
  if (!(process.env.HF_TOKEN ?? process.env.HUGGING_FACE_TOKEN ?? '').trim()) missing.push('HF_TOKEN/HUGGING_FACE_TOKEN');
  if (!(process.env.HF_DECISION_MEMORY_REPO ?? '').trim()) missing.push('HF_DECISION_MEMORY_REPO');
  return `Missing ${missing.join(' and ')}`;
}

function safeErrorMessage(error: unknown, token: string): string {
  const raw = error instanceof Error ? error.message : 'Unknown Hugging Face Hub error';
  const redacted = token ? raw.split(token).join('[REDACTED]') : raw;
  return redacted.slice(0, 500);
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
    message?: unknown;
  };
  if (candidate.status === 404 || candidate.statusCode === 404 || candidate.response?.status === 404) return true;
  return typeof candidate.message === 'string' && /\b404\b|not found/i.test(candidate.message);
}

function isDecisionRow(value: unknown): value is SignalDecisionLog {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<SignalDecisionLog>;
  return (
    typeof row.id === 'string' &&
    row.id.length > 0 &&
    typeof row.cycleId === 'string' &&
    typeof row.timestamp === 'number' &&
    Number.isFinite(row.timestamp) &&
    typeof row.isoTime === 'string' &&
    typeof row.ticker === 'string' &&
    typeof row.direction === 'string' &&
    typeof row.decision === 'string' &&
    typeof row.reasonCode === 'string' &&
    typeof row.reasonText === 'string'
  );
}

function parseExportRows(value: unknown): SignalDecisionLog[] {
  const validation = validateDecisionMemoryExportPayload(value);
  if (!validation.valid) throw new Error(validation.reason || 'Dataset backup payload is invalid');
  if (!validation.rows.every(isDecisionRow)) throw new Error('Dataset backup payload contains malformed rows');
  return validation.rows;
}

export function isDecisionMemoryDatasetSyncConfigured(): boolean {
  return readConfig() !== null;
}

export function getDecisionMemoryDatasetSyncIntervalMs(): number {
  const configured = Number(process.env.HF_DECISION_MEMORY_SYNC_INTERVAL_MS ?? DEFAULT_SYNC_INTERVAL_MS);
  if (!Number.isFinite(configured)) return DEFAULT_SYNC_INTERVAL_MS;
  return Math.max(MIN_SYNC_INTERVAL_MS, Math.floor(configured));
}

export async function syncDecisionMemoryToDataset(
  mirror: DecisionMemoryMirror,
  options: { client?: DatasetHubClient; statePath?: string; retryAttempts?: number; retryBaseDelayMs?: number } = {},
): Promise<SyncResult> {
  const config = readConfig();
  if (!config) {
    const skipped: SyncResult = { status: 'SKIPPED', reason: unconfiguredReason(), rowCount: 0, timestamp: timestamp() };
    recordSyncResult(skipped);
    return skipped;
  }

  try {
    const rows = mirror.exportAll();
    if (rows.length === 0) {
      const skipped: SyncResult = { status: 'SKIPPED', reason: 'Decision Memory mirror is empty', rowCount: 0, timestamp: timestamp() };
      recordSyncResult(skipped);
      return skipped;
    }

    const payload = buildDecisionMemoryExportPayload(rows, EXPORT_SOURCE);
    const statePath = options.statePath ?? defaultSyncStatePath();
    const previous = readSyncState(statePath);
    if (previous?.repo === config.repo && previous.lastSyncedChecksum === payload.contentSha256) {
      const skipped: SyncResult = { status: 'SKIPPED', reason: 'unchanged_content_checksum', rowCount: rows.length, timestamp: timestamp() };
      recordSyncResult(skipped);
      return skipped;
    }
    const client = options.client ?? defaultHubClient;
    await withRetry(() => client.uploadFile({
      repo: { type: 'dataset', name: config.repo },
      accessToken: config.token,
      file: {
        path: DATASET_FILE_PATH,
        content: new Blob([JSON.stringify(payload)], { type: 'application/json' }),
      },
      commitTitle: 'Back up latest APEX Decision Memory mirror',
    }), options.retryAttempts ?? 3, options.retryBaseDelayMs ?? 250);
    writeSyncState(statePath, { version: 1, repo: config.repo, lastSyncedChecksum: payload.contentSha256, lastSyncedAt: timestamp() });

    const synced: SyncResult = { status: 'SYNCED', rowCount: rows.length, timestamp: timestamp() };
    recordSyncResult(synced);
    return synced;
  } catch (error) {
    const failed: SyncResult = {
      status: 'ERROR',
      message: safeErrorMessage(error, config.token),
      rowCount: 0,
      timestamp: timestamp(),
    };
    recordSyncResult(failed);
    return failed;
  }
}

export async function restoreDecisionMemoryFromDataset(
  mirror: DecisionMemoryMirror,
  options: { client?: DatasetHubClient; retryAttempts?: number; retryBaseDelayMs?: number } = {},
): Promise<RestoreResult> {
  const config = readConfig();
  if (!config) {
    const skipped: RestoreResult = { status: 'SKIPPED', reason: unconfiguredReason(), rowCount: 0, timestamp: timestamp() };
    recordRestoreResult(skipped);
    return skipped;
  }

  try {
    const client = options.client ?? defaultHubClient;
    const file = await withRetry(() => client.downloadFile({
      repo: { type: 'dataset', name: config.repo },
      path: DATASET_FILE_PATH,
      accessToken: config.token,
    }), options.retryAttempts ?? 3, options.retryBaseDelayMs ?? 250);
    if (!file) {
      const empty: RestoreResult = { status: 'EMPTY', rowCount: 0, timestamp: timestamp() };
      recordRestoreResult(empty);
      return empty;
    }

    const rows = parseExportRows(JSON.parse(await file.text()));
    if (rows.length === 0) {
      const empty: RestoreResult = { status: 'EMPTY', rowCount: 0, timestamp: timestamp() };
      recordRestoreResult(empty);
      return empty;
    }

    const result = mirror.putMany(rows);
    const restored: RestoreResult = { status: 'RESTORED', rowCount: result.accepted, timestamp: timestamp() };
    recordRestoreResult(restored);
    return restored;
  } catch (error) {
    if (isNotFoundError(error)) {
      const empty: RestoreResult = { status: 'EMPTY', rowCount: 0, timestamp: timestamp() };
      recordRestoreResult(empty);
      return empty;
    }
    const failed: RestoreResult = {
      status: 'ERROR',
      message: safeErrorMessage(error, config.token),
      rowCount: 0,
      timestamp: timestamp(),
    };
    recordRestoreResult(failed);
    return failed;
  }
}