import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

/**
 * Resolves the directory used for server-only, credential-bearing runtime
 * state (e.g. saved API keys, Telegram tokens, external-source profiles).
 *
 * This directory MUST NOT live inside the repository/source root: anything
 * under the project root risks being zipped into a source release, synced to
 * a repo, or served by a misconfigured static path. Resolution order:
 *
 *   1. `APEX_PRIVATE_DATA_DIR` env var — explicit operator override, always
 *      wins so deployments can point at a dedicated secrets volume.
 *   2. Windows: `%APPDATA%\APEX\private`.
 *   3. Other OSes: `~/.apex/private` under the current user's home directory.
 *   4. Last-resort fallback (no home dir resolvable, e.g. some containers):
 *      `<cwd>/.apex-private-data`. This is still outside the tracked source
 *      tree (see .gitignore) but is only used when nothing else is available.
 */
export function resolvePrivateDataDir(): string {
  const override = (process.env.APEX_PRIVATE_DATA_DIR || '').trim();
  if (override) return resolve(override);

  if (process.platform === 'win32') {
    const appData = (process.env.APPDATA || '').trim();
    if (appData) return join(appData, 'APEX', 'private');
  }

  const home = (homedir() || '').trim();
  if (home) return join(home, '.apex', 'private');

  return resolve(process.cwd(), '.apex-private-data');
}

/**
 * Resolves the full path for a named private config file inside the private
 * data directory, migrating a legacy copy from the repository root (or any
 * other previously-used location) on first use so existing operator
 * configuration is not silently lost.
 */
export function resolvePrivateConfigPath(fileName: string, legacyPaths: string[] = []): string {
  const target = join(resolvePrivateDataDir(), fileName);
  if (!existsSync(target)) {
    for (const legacyPath of legacyPaths) {
      try {
        if (legacyPath && existsSync(legacyPath)) {
          const contents = readFileSync(legacyPath);
          writePrivateJsonFileSync(target, JSON.parse(contents.toString('utf8')));
          try { rmSync(legacyPath, { force: true }); } catch { /* best-effort cleanup of legacy file */ }
          break;
        }
      } catch { /* corrupt/unreadable legacy file — leave it for manual inspection */ }
    }
  }
  return target;
}

/**
 * Atomically writes server-only configuration with restrictive permissions.
 * No caller should write credentials through a browser-visible or web-root path.
 */
export function writePrivateJsonFileSync(targetPath: string, value: unknown): void {
  const target = resolve(targetPath);
  const directory = dirname(target);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { chmodSync(directory, 0o700); } catch { /* Windows may not expose POSIX modes. */ }

  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8' });
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;

    try {
      renameSync(temporary, target);
    } catch (error) {
      // Windows can reject replacement of an existing destination. Preserve the
      // secure temporary write, then use a bounded replace fallback.
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code !== 'EEXIST' && code !== 'EPERM') throw error;
      rmSync(target, { force: true });
      renameSync(temporary, target);
    }
    try { chmodSync(target, 0o600); } catch { /* Best effort on Windows. */ }
  } catch (error) {
    if (descriptor != null) {
      try { closeSync(descriptor); } catch { /* Nothing else to recover. */ }
    }
    try { rmSync(temporary, { force: true }); } catch { /* Best effort cleanup. */ }
    throw error;
  }
}
