import { execFile } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface WindowsProcessInfo {
  ProcessId: number;
  ParentProcessId?: number;
  Name?: string;
  CommandLine?: string;
}

export interface EnsurePortOptions {
  port: number;
  host?: string;
  workspaceRoot: string;
  force?: boolean;
}

export function parseWindowsListeningPids(output: string, port: number): number[] {
  const pids = new Set<number>();
  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 5 || columns[0].toUpperCase() !== 'TCP') continue;
    const localAddress = columns[1] || '';
    const state = columns[3]?.toUpperCase();
    const pid = Number(columns[4]);
    const localPort = Number(localAddress.match(/:(\d+)$/)?.[1]);
    if (state === 'LISTENING' && localPort === port && Number.isInteger(pid) && pid > 0) {
      pids.add(pid);
    }
  }
  return [...pids];
}

const WINDOWS_DRIVE_ABSOLUTE = /^[a-zA-Z]:[\\/]/;

/**
 * Resolve a workspace root without corrupting a Windows-style absolute path
 * (e.g. "C:\project\apex") when this code runs on a non-Windows host. Node's
 * path.resolve() on POSIX does not recognise "C:\..." as absolute, so it
 * silently prepends process.cwd(), which breaks the later `includes()` check
 * against a command line that never had cwd prepended. Only fall back to
 * path.resolve() for genuinely relative paths.
 */
function resolveWorkspaceRoot(workspaceRoot: string): string {
  if (path.isAbsolute(workspaceRoot) || WINDOWS_DRIVE_ABSOLUTE.test(workspaceRoot)) {
    return workspaceRoot;
  }
  return path.resolve(workspaceRoot);
}

export function commandBelongsToApex(commandLine: string | undefined, workspaceRoot: string): boolean {
  if (!commandLine) return false;
  const normalizedCommand = commandLine.replace(/\\/g, '/').toLowerCase();
  const normalizedRoot = resolveWorkspaceRoot(workspaceRoot).replace(/\\/g, '/').toLowerCase();
  const runsApexServer = /(?:^|[/\s"'])server\.ts(?:[\s"']|$)/.test(normalizedCommand)
    || normalizedCommand.includes('dist/server.cjs');
  return runsApexServer && normalizedCommand.includes(normalizedRoot);
}

async function canBind(host: string, port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') resolve(false);
      else reject(error);
    });
    probe.listen({ host, port, exclusive: true }, () => {
      probe.close((error) => error ? reject(error) : resolve(true));
    });
  });
}

async function inspectWindowsProcess(pid: number): Promise<WindowsProcessInfo | null> {
  const command = [
    `$p = Get-CimInstance Win32_Process -Filter \"ProcessId=${pid}\" -ErrorAction SilentlyContinue`,
    'if ($null -ne $p) {',
    '  $p | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress',
    '}',
  ].join('; ');
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    command,
  ], { windowsHide: true });
  const text = stdout.trim();
  return text ? JSON.parse(text) as WindowsProcessInfo : null;
}

async function findWindowsListeningPids(port: number): Promise<number[]> {
  const { stdout } = await execFileAsync('netstat.exe', ['-ano', '-p', 'tcp'], {
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  return parseWindowsListeningPids(stdout, port);
}

async function respondsAsApex(host: string, port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://${host}:${port}/api/health`, {
      signal: AbortSignal.timeout(2500),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return false;
    const body: any = await response.json();
    return body?.health?.server?.status === 'READY'
      && typeof body?.kucoinCoreStatus === 'string'
      && typeof body?.binanceSentimentStatus === 'string';
  } catch {
    return false;
  }
}

async function waitUntilFree(host: string, port: number, timeoutMs = 6000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canBind(host, port)) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Port ${host}:${port} did not become free after stopping the stale APEX process.`);
}

export async function ensureApexPortAvailable(options: EnsurePortOptions): Promise<void> {
  const host = options.host || '127.0.0.1';
  const port = Number.isInteger(options.port) && options.port > 0 ? options.port : 3000;
  if (await canBind(host, port)) return;

  if (process.platform !== 'win32') {
    throw new Error(`Port ${host}:${port} is already in use. Automatic APEX takeover is currently Windows-only.`);
  }

  const pids = await findWindowsListeningPids(port);
  if (pids.length === 0) {
    throw new Error(`Port ${host}:${port} is busy, but Windows did not report its owning PID.`);
  }

  const healthConfirmed = await respondsAsApex(host, port);
  const processes = await Promise.all(pids.map((pid) => inspectWindowsProcess(pid)));
  const force = options.force === true;
  const safeTargets = processes.filter((item): item is WindowsProcessInfo => {
    if (!item || item.ProcessId <= 4) return false;
    return force || healthConfirmed || commandBelongsToApex(item.CommandLine, options.workspaceRoot);
  });

  if (safeTargets.length !== pids.length) {
    const summary = processes.map((item, index) => `${item?.Name || 'unknown'} PID ${item?.ProcessId || pids[index]}`).join(', ');
    throw new Error(
      `Port ${host}:${port} is occupied by an application not confirmed as APEX (${summary}). `
      + 'It was not terminated. Stop it manually or set APEX_FORCE_PORT_TAKEOVER=true explicitly.',
    );
  }

  for (const target of safeTargets) {
    console.log(`[dev] Port ${port} is owned by stale APEX process ${target.Name || 'process'} PID ${target.ProcessId}; stopping it…`);
    await execFileAsync('taskkill.exe', ['/PID', String(target.ProcessId), '/T', '/F'], {
      windowsHide: true,
    });
  }

  await waitUntilFree(host, port);
  console.log(`[dev] Port ${host}:${port} is free; continuing startup.`);
}
