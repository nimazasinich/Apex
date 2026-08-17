/**
 * Shared capture-server lifecycle — one process, HMR disabled, deterministic port.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function freePort(port: number) {
  try {
    const out = spawnSync('netstat', ['-ano'], { shell: true, encoding: 'utf8' });
    const lines = String(out.stdout ?? '').split('\n');
    const pids = new Set<number>();
    for (const line of lines) {
      if (!line.includes(`:${port}`)) continue;
      if (!/LISTENING/i.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/).pop());
      if (Number.isFinite(pid) && pid > 0) pids.add(pid);
    }
    for (const pid of pids) {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
    }
  } catch {
    /* ignore */
  }
}

export type CaptureServerHandle = {
  server: ChildProcess;
  port: number;
  baseUrl: string;
  stop: () => void;
};

export async function startCaptureServer(port: number, qaQuery = 'qa=visual'): Promise<CaptureServerHandle> {
  freePort(port);
  freePort(24678);

  const server = spawn('npx', ['tsx', 'server.ts'], {
    cwd: root,
    shell: true,
    env: {
      ...process.env,
      PORT: String(port),
      APEX_PORT: String(port),
      DISABLE_HMR: 'true',
      APEX_ENABLE_HMR: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const baseUrl = `http://127.0.0.1:${port}?${qaQuery}`;
  let ready = false;
  server.stdout?.on('data', (d) => {
    const s = String(d);
    if (/listening|Live at|ready/i.test(s)) ready = true;
    process.stdout.write(`[capture-server] ${s}`);
  });
  server.stderr?.on('data', (d) => process.stderr.write(`[capture-server:err] ${d}`));

  for (let i = 0; i < 60 && !ready; i++) {
    try {
      const res = await fetch(baseUrl);
      if (res.ok || res.status === 404) {
        ready = true;
        break;
      }
    } catch {
      /* wait */
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const stop = () => {
    try {
      if (server.pid) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { shell: true });
      else server.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  };

  return { server, port, baseUrl, stop };
}

/** Classify console noise for capture reports. */
export function classifyConsoleError(text: string): 'hmr_expected' | 'qa_fixture' | 'application' {
  if (/WebSocket|vite\/client|24678|HMR|hmr/i.test(text)) return 'hmr_expected';
  if (/SUPERLONGTICKERSYMBOL|502 \(Bad Gateway\)|EXCHANGE_BAD_RESPONSE|EXCHANGE_UNREACHABLE/i.test(text)) {
    return 'qa_fixture';
  }
  return 'application';
}
