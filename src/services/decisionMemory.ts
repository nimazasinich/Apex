/* Copied from apex-trading-engine/src/services/decisionMemory.ts */

import type { SignalDecisionLog } from '../types';
import { apiMutate } from './apiMutate';

const DB_NAME = 'apex_decision_memory_v1';
const STORE = 'decision_logs';
const LOCAL_FALLBACK_KEY = 'apex.decisionMemory.fallback.v1';
const MAX_FALLBACK_ROWS = 1200;
const MIRROR_BATCH_SIZE = 50;
/** Keep mirror requests comfortably below the server's 256 KiB global JSON limit. */
export const MIRROR_MAX_PAYLOAD_BYTES = 128 * 1024;
let mirrorQueue: SignalDecisionLog[] = [];
let mirrorTimer: ReturnType<typeof setTimeout> | undefined;
let mirrorFlushInFlight: Promise<void> | null = null;

export type DecisionMemoryPersistenceState = 'synced' | 'browser_only' | 'mirror_degraded';

let persistenceState: DecisionMemoryPersistenceState = 'browser_only';
const persistenceListeners = new Set<() => void>();

function setPersistenceState(next: DecisionMemoryPersistenceState): void {
  if (persistenceState === next) return;
  persistenceState = next;
  for (const listener of persistenceListeners) listener();
}

export function getDecisionMemoryPersistenceState(): DecisionMemoryPersistenceState {
  return persistenceState;
}

export function subscribeDecisionMemoryPersistence(listener: () => void): () => void {
  persistenceListeners.add(listener);
  return () => persistenceListeners.delete(listener);
}

const VALID_OUTCOMES = new Set<NonNullable<SignalDecisionLog['laterOutcome']>>([
  'WIN', 'LOSS', 'BREAKEVEN', 'EXPIRED', 'UNKNOWN',
]);

function validateOutcome(value: SignalDecisionLog['laterOutcome'] | undefined): void {
  if (value !== undefined && !VALID_OUTCOMES.has(value)) {
    throw new Error(`Invalid decision outcome: ${String(value)}`);
  }
}

function queueMirror(log: SignalDecisionLog): void {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;
  mirrorQueue = [...mirrorQueue.filter(row => row.id !== log.id), log];
  if (mirrorQueue.length >= MIRROR_BATCH_SIZE) {
    void flushMirror();
    return;
  }
  if (!mirrorTimer) {
    mirrorTimer = setTimeout(() => {
      mirrorTimer = undefined;
      void flushMirror();
    }, 750);
  }
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export interface DecisionMemoryMirrorBatchPlan {
  batches: SignalDecisionLog[][];
  oversizedRowIds: string[];
}

export function decisionMemoryMirrorPayloadBytes(rows: readonly SignalDecisionLog[]): number {
  return utf8Bytes(JSON.stringify({ rows }));
}

/** Greedy, order-preserving row and byte bounded batching for the mirror API. */
export function buildDecisionMemoryMirrorBatchPlan(
  rows: readonly SignalDecisionLog[],
  maxRows = MIRROR_BATCH_SIZE,
  maxPayloadBytes = MIRROR_MAX_PAYLOAD_BYTES,
): DecisionMemoryMirrorBatchPlan {
  const batches: SignalDecisionLog[][] = [];
  const oversizedRowIds: string[] = [];
  let current: SignalDecisionLog[] = [];

  for (const row of rows) {
    if (decisionMemoryMirrorPayloadBytes([row]) > maxPayloadBytes) {
      if (current.length) batches.push(current);
      current = [];
      oversizedRowIds.push(row.id);
      continue;
    }
    const candidate = [...current, row];
    if (current.length && (candidate.length > maxRows || decisionMemoryMirrorPayloadBytes(candidate) > maxPayloadBytes)) {
      batches.push(current);
      current = [row];
    } else {
      current = candidate;
    }
  }
  if (current.length) batches.push(current);
  return { batches, oversizedRowIds };
}

async function postMirrorBatch(batch: SignalDecisionLog[]): Promise<boolean> {
  const response = await apiMutate('/api/decision-memory/batch', {
    method: 'POST',
    body: JSON.stringify({ rows: batch }),
  });
  if (response.ok) return true;
  // Defensive compatibility with a more restrictive reverse proxy: split a
  // bounded batch again instead of repeatedly replaying the same 413 payload.
  if (response.status === 413 && batch.length > 1) {
    const middle = Math.ceil(batch.length / 2);
    return (await postMirrorBatch(batch.slice(0, middle))) && (await postMirrorBatch(batch.slice(middle)));
  }
  return false;
}

async function drainMirrorQueue(): Promise<void> {
  let allSynced = true;
  while (mirrorQueue.length) {
    const queued = mirrorQueue.splice(0, mirrorQueue.length);
    const plan = buildDecisionMemoryMirrorBatchPlan(queued);
    if (plan.oversizedRowIds.length) allSynced = false;
    for (const batch of plan.batches) {
      try {
        if (!(await postMirrorBatch(batch))) allSynced = false;
      } catch {
        allSynced = false;
      }
    }
  }
  setPersistenceState(allSynced ? 'synced' : hasIndexedDB() ? 'mirror_degraded' : 'browser_only');
}

function flushMirror(): Promise<void> {
  if (mirrorTimer) {
    clearTimeout(mirrorTimer);
    mirrorTimer = undefined;
  }
  if (!mirrorQueue.length && !mirrorFlushInFlight) return Promise.resolve();
  if (!mirrorFlushInFlight) {
    mirrorFlushInFlight = drainMirrorQueue().finally(() => {
      mirrorFlushInFlight = null;
      if (mirrorQueue.length) void flushMirror();
    });
  }
  return mirrorFlushInFlight;
}

function hasIndexedDB(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDB()) {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('decision', 'decision', { unique: false });
        store.createIndex('ticker', 'ticker', { unique: false });
        store.createIndex('reasonCode', 'reasonCode', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open decision database'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Decision DB request failed'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Decision DB transaction failed'));
    };
  });
}

function readFallback(): SignalDecisionLog[] {
  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFallback(rows: SignalDecisionLog[]): void {
  try {
    const trimmed = [...rows].sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_FALLBACK_ROWS);
    localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage may be full or unavailable; decision logging must never break scans.
  }
}

export const DecisionMemoryDB = {
  async put(log: SignalDecisionLog): Promise<void> {
    queueMirror(log);
    try {
      await withStore('readwrite', store => store.put(log));
    } catch {
      const rows = readFallback().filter(r => r.id !== log.id);
      rows.unshift(log);
      writeFallback(rows);
    }
  },

  async bulkPut(logs: SignalDecisionLog[]): Promise<void> {
    for (const log of logs) await this.put(log);
  },

  async get(id: string): Promise<SignalDecisionLog | null> {
    try {
      const row = await withStore<SignalDecisionLog | undefined>('readonly', store => store.get(id));
      return row ?? null;
    } catch {
      return readFallback().find(row => row.id === id) ?? null;
    }
  },

  async patch(
    id: string,
    changes: Partial<Pick<SignalDecisionLog, 'laterOutcome' | 'laterPnl' | 'outcomeResolution'>>,
  ): Promise<void> {
    validateOutcome(changes.laterOutcome);
    if (changes.laterPnl !== undefined && !Number.isFinite(changes.laterPnl)) {
      throw new Error('laterPnl must be a finite R-multiple.');
    }
    if (changes.outcomeResolution) {
      const resolution = changes.outcomeResolution;
      if (resolution.schemaVersion !== 1) throw new Error('unsupported_outcome_resolution_schema');
      if (resolution.outcomeTimestamp !== null && !Number.isFinite(resolution.outcomeTimestamp)) throw new Error('invalid_outcome_timestamp');
      if (resolution.horizonMs !== null && (!Number.isFinite(resolution.horizonMs) || resolution.horizonMs < 0)) throw new Error('invalid_outcome_horizon');
      if (resolution.returnValue !== null && !Number.isFinite(resolution.returnValue)) throw new Error('invalid_outcome_return_value');
    }
    const existing = await this.get(id);
    if (!existing) throw new Error(`Decision row not found: ${id}`);
    const updated: SignalDecisionLog = { ...existing, ...changes };
    queueMirror(updated);
    try {
      await withStore('readwrite', store => store.put(updated));
    } catch {
      const rows = readFallback().filter(row => row.id !== id);
      rows.unshift(updated);
      writeFallback(rows);
    }
  },

  async delete(id: string): Promise<void> {
    try {
      await withStore('readwrite', store => store.delete(id));
    } catch {
      writeFallback(readFallback().filter(row => row.id !== id));
    }
  },

  mirror(logs: SignalDecisionLog[]): void {
    for (const log of logs) queueMirror(log);
  },

  /** Flush queued rows now; useful for explicit lifecycle boundaries and tests. */
  async flushMirror(): Promise<void> {
    await flushMirror();
  },

  async list(limit = 500): Promise<SignalDecisionLog[]> {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const rows: SignalDecisionLog[] = [];
        const tx = db.transaction(STORE, 'readonly');
        const store = tx.objectStore(STORE);
        const idx = store.index('timestamp');
        const req = idx.openCursor(null, 'prev');
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor && rows.length < limit) {
            rows.push(cursor.value as SignalDecisionLog);
            cursor.continue();
          }
        };
        req.onerror = () => reject(req.error ?? new Error('Decision DB cursor failed'));
        tx.oncomplete = () => {
          db.close();
          resolve(rows);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('Decision DB transaction failed'));
        };
      });
    } catch {
      return readFallback().sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    }
  },

  async clear(): Promise<void> {
    try {
      await withStore('readwrite', store => store.clear());
    } catch {
      try { localStorage.removeItem(LOCAL_FALLBACK_KEY); } catch { /* ignore */ }
    }
  },
};

export function decisionStats(logs: SignalDecisionLog[], windowMs = 60 * 60 * 1000) {
  const cutoff = Date.now() - windowMs;
  const recent = logs.filter(l => l.timestamp >= cutoff);
  const accepted = recent.filter(l => l.decision === 'ACCEPTED').length;
  const rejected = recent.filter(l => l.decision === 'REJECTED').length;
  return {
    total: recent.length,
    accepted,
    rejected,
    acceptanceRate: recent.length ? accepted / recent.length : 0,
  };
}
