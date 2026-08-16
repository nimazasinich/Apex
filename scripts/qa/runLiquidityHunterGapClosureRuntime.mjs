#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const port = 31957;
const base = `http://127.0.0.1:${port}`;
const token = 'liquidity-hunter-gap-closure-operator-token';
const tsxCli = path.join(root, 'node_modules/tsx/dist/cli.mjs');
if (!fs.existsSync(tsxCli)) {
  throw new Error(`qa_dependency_missing:tsx:${tsxCli}. Run npm ci before qa:liquidity-hunter-gap-closure.`);
}
const child = spawn(process.execPath, [tsxCli, 'server.ts', '--port', String(port)], {
  cwd: root,
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', APEX_OPERATOR_TOKEN: token, APEX_LIQUIDITY_HUNTER_ENABLED: 'false', APEX_LIQUIDITY_HUNTER_WS_ENABLED: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let output = '';
child.stdout.on('data', (chunk) => { output += String(chunk); });
child.stderr.on('data', (chunk) => { output += String(chunk); });

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { const response = await fetch(`${base}/api/system/health`); if (response.ok) return; } catch { /* retry */ }
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
    const response = await fetch(base + route);
    const payload = await response.json().catch(() => null);
    check(`production GET ${route}`, response.ok && payload?.ok === true);
  }
  const rejected = await fetch(`${base}/api/liquidity-hunter/edge-thresholds/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check('threshold mutation rejects missing operator authentication', rejected.status === 401);
  const authenticated = await fetch(`${base}/api/liquidity-hunter/edge-thresholds/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-APEX-Operator-Token': token }, body: '{}' });
  check('authenticated threshold mutation reaches governance validation', authenticated.status === 422);
  const canary = await fetch(`${base}/api/liquidity-hunter/manual-testnet/missing/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-APEX-Operator-Token': token }, body: JSON.stringify({ confirmation: 'CONFIRM_LIQUIDITY_HUNTER_TESTNET' }) });
  check('manual canary fails closed while feature flag is disabled', canary.status === 409);
} finally {
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 5_000))]);
}

