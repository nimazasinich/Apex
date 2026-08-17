import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';

export interface DurableJsonWriteOptions {
  /** Refuse unexpectedly large state rather than exhausting memory/disk. */
  maxBytes?: number;
  /** Keep one operator-restorable copy of the last committed file. */
  backup?: boolean;
  /** A lock older than this is treated as an abandoned crash artifact. */
  staleLockMs?: number;
}

const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;
const DEFAULT_STALE_LOCK_MS = 5 * 60 * 1000;

function ensurePrivateDirectory(target: string): void {
  const directory = dirname(target);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { chmodSync(directory, 0o700); } catch { /* POSIX modes are best-effort on Windows. */ }
}

function removeStaleLock(lockPath: string, staleLockMs: number): void {
  if (!existsSync(lockPath)) return;
  try {
    const ageMs = Date.now() - statSync(lockPath).mtimeMs;
    if (ageMs > staleLockMs) rmSync(lockPath, { force: true });
  } catch { /* The exclusive open below remains the source of truth. */ }
}

/**
 * Synchronous, process-safe JSON commit used by execution/governance stores.
 * It never weakens a caller's validation contract and never auto-recovers from
 * a corrupt primary file. Backups are for explicit operator rollback only.
 */
export function writeDurableJsonFileSync(
  filePath: string,
  value: unknown,
  options: DurableJsonWriteOptions = {},
): void {
  const target = resolve(filePath);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const staleLockMs = options.staleLockMs ?? DEFAULT_STALE_LOCK_MS;
  const backup = options.backup !== false;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024) throw new Error('durable_json_max_bytes_invalid');
  if (bytes > maxBytes) throw new Error('durable_json_capacity_exceeded');

  ensurePrivateDirectory(target);
  const lockPath = `${target}.lock`;
  removeStaleLock(lockPath, staleLockMs);
  let lockFd: number | null = null;
  let dataFd: number | null = null;
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    try {
      lockFd = openSync(lockPath, 'wx', 0o600);
      writeFileSync(lockFd, `${process.pid}\n${new Date().toISOString()}\n`, 'utf8');
      fsyncSync(lockFd);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code === 'EEXIST') throw new Error('durable_json_lock_busy');
      throw error;
    }

    dataFd = openSync(temporary, 'wx', 0o600);
    writeFileSync(dataFd, serialized, 'utf8');
    fsyncSync(dataFd);
    closeSync(dataFd);
    dataFd = null;

    if (backup && existsSync(target)) {
      const backupPath = `${target}.bak`;
      copyFileSync(target, backupPath);
      try { chmodSync(backupPath, 0o600); } catch { /* best effort */ }
    }

    renameSync(temporary, target);
    try { chmodSync(target, 0o600); } catch { /* best effort */ }

    // Flush directory metadata where the platform permits it.
    try {
      const dirFd = openSync(dirname(target), 'r');
      try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
    } catch { /* Unsupported on some Windows/filesystem combinations. */ }
  } finally {
    if (dataFd !== null) try { closeSync(dataFd); } catch { /* no-op */ }
    try { rmSync(temporary, { force: true }); } catch { /* no-op */ }
    if (lockFd !== null) try { closeSync(lockFd); } catch { /* no-op */ }
    try { rmSync(lockPath, { force: true }); } catch { /* no-op */ }
  }
}

export function readDurableJsonFileSync(filePath: string, maxBytes = DEFAULT_MAX_BYTES): unknown {
  const target = resolve(filePath);
  if (!existsSync(target)) return null;
  const size = statSync(target).size;
  if (size > maxBytes) throw new Error('durable_json_capacity_exceeded');
  try {
    return JSON.parse(readFileSync(target, 'utf8')) as unknown;
  } catch {
    throw new Error('durable_json_corrupt');
  }
}

/** Explicit rollback only; callers must validate the restored payload after use. */
export function restoreDurableJsonBackupSync(filePath: string): void {
  const target = resolve(filePath);
  const backupPath = `${target}.bak`;
  if (!existsSync(backupPath)) throw new Error('durable_json_backup_missing');
  const parsed = readDurableJsonFileSync(backupPath);
  writeDurableJsonFileSync(target, parsed, { backup: false });
}
