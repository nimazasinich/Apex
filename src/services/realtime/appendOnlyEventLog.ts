import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import { assertValidMarketEvent, validateMarketEvent } from '../../contracts/realtime/marketEvent';
import type { LiquidityHunterSetupTransition } from '../../contracts/realtime/liquidityHunterState';

export interface AppendOnlyEventLogOptions {
  filePath: string;
  maxSegmentBytes?: number;
  maxSegments?: number;
  fsync?: boolean;
}

export interface EventLogReadResult {
  events: MarketEvent[];
  corruptLines: number;
  files: string[];
}

interface PendingWrite {
  resolve: () => void;
  reject: (error: Error) => void;
}

export interface DurableSetupTransitionRecord {
  recordType: 'LIQUIDITY_HUNTER_SETUP_TRANSITION';
  schemaVersion: 1;
  symbol: string;
  transition: LiquidityHunterSetupTransition;
}

const WRITER_SOURCE = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const filePath = workerData.filePath;
const maxSegmentBytes = workerData.maxSegmentBytes;
const maxSegments = workerData.maxSegments;
const fsyncEnabled = workerData.fsyncEnabled;
let rotationCounter = 0;

function restrictToOwner(target) {
  if (process.platform !== 'win32') {
    fs.chmodSync(target, 0o600);
    return;
  }
  const username = String(process.env.USERNAME || '').trim();
  const domain = String(process.env.USERDOMAIN || '').trim();
  const identity = domain && username ? domain + '\\\\' + username : username;
  if (!identity) throw new Error('event_log_windows_identity_unavailable');
  execFileSync('icacls.exe', [target, '/inheritance:r', '/grant:r', identity + ':(F)', '/grant:r', '*S-1-5-18:(F)'], { windowsHide: true, stdio: 'ignore' });
  execFileSync('icacls.exe', [target, '/remove:g', '*S-1-1-0', '*S-1-5-11', '*S-1-5-32-545'], { windowsHide: true, stdio: 'ignore' });
}

fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });

function pruneSegments() {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const segments = fs.readdirSync(dir)
    .filter((name) => name.startsWith(base + '.') && name.endsWith('.jsonl'))
    .sort((a, b) => b.localeCompare(a))
    .map((name) => path.join(dir, name));
  for (const stale of segments.slice(maxSegments)) fs.unlinkSync(stale);
}

function rotate() {
  if (!fs.existsSync(filePath)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rotated = filePath + '.' + stamp + '.' + (++rotationCounter) + '.jsonl';
  fs.renameSync(filePath, rotated);
  pruneSegments();
}

function appendLine(line) {
  const bytes = Buffer.byteLength(line);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size + bytes > maxSegmentBytes) rotate();
  fs.appendFileSync(filePath, line, { encoding: 'utf8', mode: 0o600, flag: 'a' });
  restrictToOwner(filePath);
  if (fsyncEnabled) {
    const fd = fs.openSync(filePath, 'r+');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
}

parentPort.on('message', (message) => {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'append') {
    try {
      appendLine(message.line);
      parentPort.postMessage({ type: 'ack', id: message.id });
    } catch (error) {
      parentPort.postMessage({ type: 'error', id: message.id, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (message.type === 'close') {
    parentPort.postMessage({ type: 'closed' });
  }
});
`;

/**
 * Durable append-only event log whose filesystem writes run on a dedicated
 * worker thread. Persistence acknowledgement is only resolved after the worker
 * has appended (and fsync'd when enabled) the event, so critical callers can
 * retain durable-before-world-state semantics without blocking Node's control
 * plane event loop.
 */
export class AppendOnlyEventLog {
  readonly filePath: string;
  private readonly maxSegmentBytes: number;
  private readonly maxSegments: number;
  private readonly fsyncEnabled: boolean;
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingWrite>();
  private readonly idleWaiters = new Set<() => void>();
  private nextId = 1;
  private closing = false;
  private closed = false;
  private closePromise: Promise<void> | null = null;
  private closeResolve: (() => void) | null = null;
  private closeReject: ((error: Error) => void) | null = null;

  constructor(options: AppendOnlyEventLogOptions) {
    this.filePath = path.resolve(options.filePath);
    this.maxSegmentBytes = options.maxSegmentBytes ?? 16 * 1024 * 1024;
    this.maxSegments = options.maxSegments ?? 8;
    this.fsyncEnabled = options.fsync ?? true;
    if (!Number.isSafeInteger(this.maxSegmentBytes) || this.maxSegmentBytes < 64 * 1024) {
      throw new Error('invalid_event_log_segment_size');
    }
    if (!Number.isSafeInteger(this.maxSegments) || this.maxSegments < 1 || this.maxSegments > 1_000) {
      throw new Error('invalid_event_log_segment_count');
    }
    mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    this.worker = new Worker(WRITER_SOURCE, {
      eval: true,
      workerData: {
        filePath: this.filePath,
        maxSegmentBytes: this.maxSegmentBytes,
        maxSegments: this.maxSegments,
        fsyncEnabled: this.fsyncEnabled,
      },
    });
    this.worker.on('message', (message: { type?: string; id?: number; error?: string }) => {
      if (message.type === 'ack' && Number.isSafeInteger(message.id)) {
        const pending = this.pending.get(message.id!);
        if (!pending) return;
        this.pending.delete(message.id!);
        pending.resolve();
        this.notifyIdle();
        return;
      }
      if (message.type === 'error' && Number.isSafeInteger(message.id)) {
        const pending = this.pending.get(message.id!);
        if (!pending) return;
        this.pending.delete(message.id!);
        pending.reject(new Error(`event_log_write_failed:${message.error || 'unknown'}`));
        this.notifyIdle();
        return;
      }
      if (message.type === 'closed') {
        this.closed = true;
        this.closeResolve?.();
      }
    });
    this.worker.on('error', (error) => {
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.notifyIdle();
      this.closed = true;
      this.closeReject?.(error);
    });
    this.worker.on('exit', (code) => {
      if (code !== 0 && !this.closed) {
        const error = new Error(`event_log_worker_exited:${code}`);
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
        this.notifyIdle();
        this.closed = true;
        this.closeReject?.(error);
      }
    });
  }

  append(event: MarketEvent): Promise<void> {
    if (this.closing || this.closed) return Promise.reject(new Error('event_log_closed'));
    assertValidMarketEvent(event);
    return this.appendValue(event);
  }

  appendSetupTransition(record: DurableSetupTransitionRecord): Promise<void> {
    if (this.closing || this.closed) return Promise.reject(new Error('event_log_closed'));
    if (record.recordType !== 'LIQUIDITY_HUNTER_SETUP_TRANSITION'
      || record.schemaVersion !== 1
      || !/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(record.symbol)
      || !record.transition?.transitionId
      || !record.transition?.setupId
      || !Number.isFinite(record.transition.occurredAt)) {
      return Promise.reject(new Error('invalid_setup_transition_record'));
    }
    return this.appendValue(record);
  }

  private appendValue(value: MarketEvent | DurableSetupTransitionRecord): Promise<void> {
    const id = this.nextId++;
    const line = `${JSON.stringify(value)}\n`;
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: 'append', id, line });
    });
  }

  private notifyIdle(): void {
    if (this.pending.size > 0) return;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }

  async flush(): Promise<void> {
    if (this.pending.size === 0) return;
    await new Promise<void>((resolve) => this.idleWaiters.add(resolve));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.closePromise = (async () => {
      await this.flush();
      await new Promise<void>((resolve, reject) => {
        this.closeResolve = resolve;
        this.closeReject = reject;
        this.worker.postMessage({ type: 'close' });
      });
      await this.worker.terminate();
      this.closed = true;
    })();
    return this.closePromise;
  }

  readAll(): EventLogReadResult {
    const dir = path.dirname(this.filePath);
    const base = path.basename(this.filePath);
    const files = existsSync(dir)
      ? readdirSync(dir)
        .filter((name) => name.startsWith(`${base}.`) && name.endsWith('.jsonl'))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => path.join(dir, name))
        .concat(existsSync(this.filePath) ? [this.filePath] : [])
      : [];
    const events: MarketEvent[] = [];
    let corruptLines = 0;
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as MarketEvent;
          if ((event as unknown as DurableSetupTransitionRecord).recordType === 'LIQUIDITY_HUNTER_SETUP_TRANSITION') continue;
          if (!validateMarketEvent(event).ok) {
            corruptLines += 1;
            continue;
          }
          events.push(event);
        } catch {
          corruptLines += 1;
        }
      }
    }
    return { events, corruptLines, files };
  }

  readSetupTransitions(): { records: DurableSetupTransitionRecord[]; corruptLines: number; files: string[] } {
    const dir = path.dirname(this.filePath);
    const base = path.basename(this.filePath);
    const files = existsSync(dir)
      ? readdirSync(dir)
        .filter((name) => name.startsWith(`${base}.`) && name.endsWith('.jsonl'))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => path.join(dir, name))
        .concat(existsSync(this.filePath) ? [this.filePath] : [])
      : [];
    const records: DurableSetupTransitionRecord[] = [];
    const seen = new Set<string>();
    let corruptLines = 0;
    for (const file of files) {
      for (const line of readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)) {
        try {
          const row = JSON.parse(line) as DurableSetupTransitionRecord;
          if (row.recordType !== 'LIQUIDITY_HUNTER_SETUP_TRANSITION') continue;
          if (row.schemaVersion !== 1 || !row.symbol || !row.transition?.transitionId || !row.transition?.setupId) {
            corruptLines += 1;
            continue;
          }
          if (!seen.has(row.transition.transitionId)) {
            seen.add(row.transition.transitionId);
            records.push(row);
          }
        } catch {
          corruptLines += 1;
        }
      }
    }
    records.sort((a, b) => a.transition.occurredAt - b.transition.occurredAt
      || a.transition.transitionId.localeCompare(b.transition.transitionId));
    return { records, corruptLines, files };
  }
}
