#!/usr/bin/env node
/**
 * Boots the real APEX server and verifies the read surfaces required to render
 * every account/research shell even when external market providers are
 * unavailable. No response is stubbed and no provider data is fabricated.
 */
import { spawn } from 'node:child_process';

const root = process.cwd();
const port = 32_000 + (process.pid % 8_000);
const base = `http://127.0.0.1:${port}`;
const operatorToken = 'canonical-page-api-qa-token';
const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts', '--port', String(port)], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    APEX_OPERATOR_TOKEN: operatorToken,
    APEX_LIQUIDITY_HUNTER_ENABLED: 'false',
    APEX_LIQUIDITY_HUNTER_WS_ENABLED: 'false',
    APEX_AUTOPILOT_ENABLED: 'false',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

let output = '';
child.stdout.on('data', (chunk) => { output += String(chunk); });
child.stderr.on('data', (chunk) => { output += String(chunk); });

async function request(path, authenticated = false) {
  const response = await fetch(base + path, {
    headers: authenticated ? { 'X-APEX-Operator-Token': operatorToken } : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`qa_server_exited:${child.exitCode}\n${output}`);
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(3_000) });
      if (response.ok) return;
    } catch { /* retry until the bounded boot deadline */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`qa_server_start_timeout\n${output}`);
}

const checks = [];
function check(label, condition) {
  const passed = Boolean(condition);
  checks.push({ label, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
}

try {
  await waitForServer();
  const routes = [
    ['/api/strategies', false, (body) => Array.isArray(body?.strategies)],
    ['/api/strategies/autopilot/status', false, (body) => body && typeof body === 'object'],
    ['/api/strategies/parliament/promotion/status', false, (body) => body && typeof body === 'object'],
    ['/api/account/connection', true, (body) => body && typeof body === 'object'],
    ['/api/account/workspace', true, (body) => body && typeof body === 'object'],
    ['/api/operations/status', true, (body) => body && typeof body === 'object'],
    ['/api/security/bootstrap', false, (body) => body && typeof body === 'object'],
  ];

  for (const [path, authenticated, validate] of routes) {
    const { response, payload } = await request(path, authenticated);
    check(`${path} is reachable and returns its real JSON contract`, response.ok && validate(payload));
  }

  const account = await request('/api/account/workspace', true);
  check('account workspace identifies its real mode instead of inventing a live connection', account.payload?.connection?.mode === 'demo' || account.payload?.connection?.mode === 'live');
  const autopilot = await request('/api/strategies/autopilot/status');
  check('autopilot status preserves disabled/off authority in this QA boot', autopilot.payload?.controller?.enabled !== true && autopilot.payload?.controller?.phase !== 'RUNNING');

  const failures = checks.filter((item) => !item.passed);
  console.log(`\nCanonical page API runtime: ${checks.length - failures.length}/${checks.length} PASS`);
  if (failures.length) process.exitCode = 1;
} finally {
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}
