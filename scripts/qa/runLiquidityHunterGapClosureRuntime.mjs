#!/usr/bin/env node
import { spawn } from 'node:child_process';

const root = process.cwd();
const port = 31_000 + (process.pid % 10_000);
const base = `http://127.0.0.1:${port}`;
const token = 'liquidity-hunter-gap-closure-operator-token';
const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts', '--port', String(port)], {
  cwd: root,
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', APEX_OPERATOR_TOKEN: token, APEX_LIQUIDITY_HUNTER_ENABLED: 'false', APEX_LIQUIDITY_HUNTER_WS_ENABLED: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let output = '';
child.stdout.on('data', (chunk) => { output += String(chunk); });
child.stderr.on('data', (chunk) => { output += String(chunk); });

async function fetchLocal(url, init, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`qa_server_exited:${child.exitCode}\n${output}`);
    }
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { const response = await fetchLocal(`${base}/api/system/health`, undefined, 1); if (response.ok) return; } catch { /* retry until deadline */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server_start_timeout\n${output}`);
}

function check(label, passed) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  if (!passed) process.exitCode = 1;
}

try {
  await waitForServer();
  for (const route of [
    '/api/liquidity-hunter/world-state/BTC-USDT',
    '/api/liquidity-hunter/evidence/BTC-USDT',
    '/api/liquidity-hunter/setups',
    '/api/liquidity-hunter/replay-datasets',
    '/api/liquidity-hunter/replay-runs',
    '/api/liquidity-hunter/edge-thresholds',
    '/api/liquidity-hunter/manual-testnet/plans',
  ]) {
    const response = await fetchLocal(base + route);
    const payload = await response.json().catch(() => null);
    check(`production GET ${route}`, response.ok && payload?.ok === true);
  }
  const rejected = await fetchLocal(`${base}/api/liquidity-hunter/edge-thresholds/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check('threshold mutation rejects missing operator authentication', rejected.status === 401);
  const authenticated = await fetchLocal(`${base}/api/liquidity-hunter/edge-thresholds/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-APEX-Operator-Token': token }, body: '{}' });
  check('authenticated threshold mutation reaches governance validation', authenticated.status === 422);
  const canary = await fetchLocal(`${base}/api/liquidity-hunter/manual-testnet/missing/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-APEX-Operator-Token': token }, body: JSON.stringify({ confirmation: 'CONFIRM_LIQUIDITY_HUNTER_TESTNET' }) });
  check('manual canary fails closed while feature flag is disabled', canary.status === 409);
} finally {
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 5_000))]);
}
