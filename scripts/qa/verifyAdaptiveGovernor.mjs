import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let ts;
try {
  ts = require('typescript');
} catch {
  ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
}

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-governor-'));
const nodeModules = path.join(temp, 'node_modules');
fs.mkdirSync(path.join(nodeModules, 'undici'), { recursive: true });
fs.mkdirSync(path.join(nodeModules, 'socks-proxy-agent'), { recursive: true });
fs.writeFileSync(path.join(nodeModules, 'undici', 'index.js'), `
class Agent { compose(){ return this; } }
class ProxyAgent {}
const interceptors = { dns(){ return {}; } };
module.exports = { Agent, ProxyAgent, interceptors };
`);
fs.writeFileSync(path.join(nodeModules, 'socks-proxy-agent', 'index.js'), `
class SocksProxyAgent {}
module.exports = { SocksProxyAgent };
`);

const source = fs.readFileSync(path.join(root, 'src/services/proxyFetch.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
  fileName: 'proxyFetch.ts',
  reportDiagnostics: true,
});
const syntaxErrors = (compiled.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
assert.equal(syntaxErrors.length, 0, syntaxErrors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'));
const modulePath = path.join(temp, 'proxyFetch.cjs');
fs.writeFileSync(modulePath, compiled.outputText);

Object.assign(process.env, {
  PROXY_MODE: 'direct_first',
  APEX_AUTO_LOCAL_PROXY: 'false',
  PROXY_MAX_CONCURRENCY: '4',
  PROXY_RESERVED_INTERACTIVE: '2',
  PROXY_BACKGROUND_CONCURRENCY: '2',
  PROXY_BACKGROUND_MAX_QUEUE: '2',
  PROXY_MAX_QUEUE: '8',
  PROXY_QUEUE_TIMEOUT_BACKGROUND_MS: '80',
  PROXY_QUEUE_TIMEOUT_INTERACTIVE_MS: '500',
  PROXY_QUEUE_TIMEOUT_CRITICAL_MS: '500',
  UPSTREAM_CIRCUIT_FAILURE_THRESHOLD: '2',
  UPSTREAM_CIRCUIT_BASE_MS: '10000',
  CACHE_STALE_GRACE_MS: '1000',
});

let fetchCount = 0;
let mode = 'success';
globalThis.fetch = async (url, options = {}) => {
  fetchCount += 1;
  if (mode === 'fail') throw new Error('The operation was aborted due to timeout');
  await new Promise((resolve) => setTimeout(resolve, 80));
  return { ok: true, status: 200, json: async () => ({ url, fetchCount, method: options.method || 'GET', authorization: options.headers?.Authorization || options.headers?.authorization || null }) };
};

const governor = require(modulePath);

const background = [];
for (let index = 0; index < 8; index += 1) {
  background.push(governor.smartFetchJson(`https://bg.example/${index}`, {
    logKey: `scanner:${index}`,
    priority: 'background',
    timeoutMs: 500,
    cacheTtlMs: 0,
  }));
}
await new Promise((resolve) => setTimeout(resolve, 5));
const criticalStartedAt = Date.now();
const critical = await governor.smartFetchJson('https://critical.example/backtest', {
  logKey: 'hf_space2:GET:/api/trading/backtest/historical/BTCUSDT',
  priority: 'critical',
  timeoutMs: 500,
  cacheTtlMs: 0,
});
const criticalMs = Date.now() - criticalStartedAt;
const backgroundResults = await Promise.all(background);
assert.equal(critical.ok, true);
assert.ok(criticalMs < 180, `critical request starved for ${criticalMs}ms`);
const backgroundShed = backgroundResults.filter((result) => result.error === 'backpressure').length;
assert.ok(backgroundShed >= 2);
assert.equal(governor.getGovernorStats().queued, 0);
assert.equal(governor.getGovernorStats().active, 0);

mode = 'fail';
fetchCount = 0;
const firstFailure = await governor.smartFetchJson('https://circuit.example/a', { logKey: 'binance:klines', priority: 'interactive', timeoutMs: 150 });
const secondFailure = await governor.smartFetchJson('https://circuit.example/b', { logKey: 'binance:depth', priority: 'interactive', timeoutMs: 150 });
const fetchesBeforeOpenCircuit = fetchCount;
const circuitOpen = await governor.smartFetchJson('https://circuit.example/c', { logKey: 'binance:klines', priority: 'interactive', timeoutMs: 150 });
assert.equal(firstFailure.ok, false);
assert.equal(secondFailure.ok, false);
assert.equal(circuitOpen.error, 'circuit_open');
assert.equal(fetchCount, fetchesBeforeOpenCircuit);

mode = 'success';
const warm = await governor.smartFetchJson('https://stale.example/data', {
  logKey: 'stale:data', priority: 'interactive', timeoutMs: 300, cacheTtlMs: 10, staleGraceMs: 1000, circuitKey: 'stale-provider',
});
assert.equal(warm.ok, true);
await new Promise((resolve) => setTimeout(resolve, 20));
mode = 'fail';
const stale = await governor.smartFetchJson('https://stale.example/data', {
  logKey: 'stale:data', priority: 'interactive', timeoutMs: 150, cacheTtlMs: 10, staleGraceMs: 1000, circuitKey: 'stale-provider',
});
assert.equal(stale.ok, true);
assert.equal(stale.stale, true);

// Authorization headers participate in the derived identity, so two users or
// provider keys cannot share an in-flight or cached response.
mode = 'success';
fetchCount = 0;
const authA = await governor.smartFetchJson('https://auth.example/profile', {
  headers: { Authorization: 'Bearer account-a' }, timeoutMs: 300, cacheTtlMs: 1000, circuitKey: 'auth-provider-a',
});
const authB = await governor.smartFetchJson('https://auth.example/profile', {
  headers: { Authorization: 'Bearer account-b' }, timeoutMs: 300, cacheTtlMs: 1000, circuitKey: 'auth-provider-b',
});
const authARepeat = await governor.smartFetchJson('https://auth.example/profile', {
  headers: { Authorization: 'Bearer account-a' }, timeoutMs: 300, cacheTtlMs: 1000, circuitKey: 'auth-provider-a',
});
assert.equal(authA.ok, true);
assert.equal(authB.ok, true);
assert.equal(authARepeat.ok, true);
assert.equal(fetchCount, 2, 'authorization scopes must not share a cache entry');
assert.equal(authA.json.authorization, 'Bearer account-a');
assert.equal(authB.json.authorization, 'Bearer account-b');

// POST/PUT/PATCH/DELETE are non-cacheable and non-deduplicated unless a caller
// explicitly opts into a safe idempotent policy.
fetchCount = 0;
const postOptions = { method: 'POST', body: '{"value":1}', timeoutMs: 300, circuitKey: 'mutation-provider' };
const postOne = await governor.smartFetchJson('https://mutation.example/action', postOptions);
const postTwo = await governor.smartFetchJson('https://mutation.example/action', postOptions);
assert.equal(postOne.ok, true);
assert.equal(postTwo.ok, true);
assert.equal(fetchCount, 2, 'POST responses must not be cached by default');

const result = {
  passed: true,
  priorityReservation: true,
  backgroundBackpressure: true,
  circuitBreaker: true,
  staleFallback: true,
  authorizationIsolation: true,
  mutationsNotCached: true,
  criticalMs,
  backgroundShed,
};
const outDir = path.join(root, 'QA', 'adaptive-governor');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'VALIDATION_RESULT.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
fs.rmSync(temp, { recursive: true, force: true });
