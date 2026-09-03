/** Real server round-trip/restart check. Uses a temporary private store; no provider probes. */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const privateDir = mkdtempSync(join(tmpdir(), 'apex-proxy-qa-'));
const port = Number(process.env.APEX_PROXY_QA_PORT || 3199);
const base = `http://127.0.0.1:${port}`;
let server: ChildProcess | null = null;
const stop = async () => {
  if (!server || server.exitCode != null) return;
  const child = server;
  await new Promise<void>(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGTERM');
  }); server = null;
};
const start = async () => {
  server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(), env: { ...process.env, PORT: String(port), APEX_PRIVATE_DATA_DIR: privateDir, APEX_OI_INITIAL_DELAY_MS: '300000' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const child = server;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 15000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}`)); });
    child.stdout!.on('data', data => { if (String(data).includes('[Proxy Server] Live')) { clearTimeout(timer); resolve(); } });
    child.stderr!.on('data', () => {});
  });
};
const status = async () => {
  const response = await fetch(`${base}/api/supplemental/config/status`, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200); return response.json();
};
const save = (proxy: unknown, authorized = true) => fetch(`${base}/api/supplemental/config`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...(authorized ? { 'X-APEX-CSRF': '1' } : {}) },
  body: JSON.stringify({ proxy }), signal: AbortSignal.timeout(5000),
});
try {
  await start();
  const denied = await save({ mode: 'off', type: 'http', address: '' }, false);
  assert.equal(denied.status, 403);
  console.log('PASS existing mutation guard protects proxy writes');
  for (const mode of ['manual', 'off', 'auto'] as const) {
    const proxy = { mode, type: 'socks5', address: 'socks5://127.0.0.1:10808' };
    assert.equal((await save(proxy)).status, 200);
    assert.deepEqual((await status()).proxy, proxy);
    await stop(); await start();
    assert.deepEqual((await status()).proxy, proxy);
    console.log(`PASS ${mode}: saved, applied and restored after server restart`);
  }
  const before = (await status()).proxy;
  assert.equal((await save({ mode: 'manual', type: 'http', address: 'http://user:password@host:80' })).status, 400);
  assert.deepEqual((await status()).proxy, before);
  console.log('PASS invalid configuration rejected without changing active settings');
} finally { await stop(); rmSync(privateDir, { recursive: true, force: true }); }
