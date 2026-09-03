#!/usr/bin/env node
// Permanent guard for CP28 Task 0B (fork (b)): the proxyFetch test seam.
//
// WHY THIS EXISTS. `fetchImplFor()` in src/services/proxyFetch.ts deliberately
// dispatches through `undici.fetch` — not the ambient `globalThis.fetch` — for
// every route backed by a real Undici Dispatcher: the `direct` route
// (`undici.Agent`) and every HTTP/HTTPS proxy-pool route (`undici.ProxyAgent`).
// That is load-bearing for production correctness (two independently-versioned
// undici copies cannot share a Dispatcher), but it silently defeats any test or
// QA script that stubs `globalThis.fetch` to simulate provider failure, latency
// or timeout on those routes: the stub is never invoked, a real network call is
// attempted instead, and the result is green for the wrong reason.
//
// This script fails loudly (non-zero exit) if the seam that closes that hole
// stops intercepting either of the two dispatcher-routed paths, or if the seam
// ever becomes settable outside a test runtime.
//
// Network: local loopback only. No external hosts are contacted.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const requireFromHere = createRequire(import.meta.url);

function resolveTypeScript() {
  const local = path.join(root, 'node_modules', 'typescript', 'lib', 'typescript.js');
  if (fs.existsSync(local)) return local;
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const globalTs = path.join(globalRoot, 'typescript', 'lib', 'typescript.js');
    if (fs.existsSync(globalTs)) return globalTs;
  } catch { /* fall through */ }
  throw new Error('typescript_runtime_unavailable');
}

const ts = requireFromHere(resolveTypeScript());
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-proxy-fetch-mockability-'));

const COMPILER_OPTIONS = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  esModuleInterop: true,
};

function transpile(relativeSource) {
  const absolute = path.join(root, relativeSource);
  const result = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    fileName: relativeSource,
    reportDiagnostics: true,
    compilerOptions: COMPILER_OPTIONS,
  });
  const errors = (result.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    throw new Error(`transpile_failed:${relativeSource}:${errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, ' ')).join('|')}`);
  }
  return result.outputText;
}

const proxyFetchJs = transpile('src/services/proxyFetch.ts');
const proxyConfigJs = transpile('src/services/proxyConfig.ts');

fs.mkdirSync(path.join(temp, 'src/services'), { recursive: true });
// proxyFetch imports the real routing validator; keep the isolated runtime
// hermetic without substituting a permissive fixture for it.
fs.writeFileSync(path.join(temp, 'src/services/proxyConfig.js'), proxyConfigJs);

/** Each copy is a distinct module instance with its own captured native fetch. */
function loadProxyFetchCopy(tag) {
  const file = path.join(temp, `src/services/proxyFetch.${tag}.js`);
  fs.writeFileSync(file, proxyFetchJs);
  return requireFromHere(file);
}

const checks = [];
function check(label, condition, detail) {
  const passed = Boolean(condition);
  checks.push({ label, passed, detail: detail ?? null });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`);
}

/** Neutralise every ambient proxy source parseProxyPool() reads, so the DIRECT
 *  route is genuinely direct even on a developer machine with HTTP_PROXY set. */
function clearAmbientProxyEnv() {
  for (const key of [
    'PROXY_POOL_URLS', 'APEX_LOCAL_PROXY', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY',
    'SOCKS5_PROXY', 'SOCKS_PROXY_URL', 'SOCKS_PROXY', 'APEX_LOCAL_PROXY_PORT',
    'LOCAL_PROXY_PORT', 'APEX_AUTO_LOCAL_PROXY_PORT', 'APEX_AUTO_LOCAL_PROXY_SCHEME',
    'PROXY_MODE',
  ]) delete process.env[key];
  process.env.APEX_AUTO_LOCAL_PROXY = 'false';
}

const SEAM_ENV = 'APEX_TEST_FETCH_SEAM';
const FETCH_OPTIONS = { timeoutMs: 3_000, cacheMode: 'none', deduplicate: false };

function seamResponse(marker) {
  return new Response(JSON.stringify({ ok: true, seam: marker }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

let server;
let realServerHits = 0;
const originalFetch = globalThis.fetch;

try {
  clearAmbientProxyEnv();

  server = http.createServer((_req, res) => {
    realServerHits += 1;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, source: 'local-fixture' }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('unexpected_server_address');
  const url = `http://127.0.0.1:${address.port}/fixture`;

  // Load every module copy that must see an unstubbed global before any stub is
  // installed: each copy captures the native fetch binding at module load.
  delete process.env[SEAM_ENV];
  const escapeModule = loadProxyFetchCopy('escape-control');
  const overrideModule = loadProxyFetchCopy('override');
  const ambientModule = loadProxyFetchCopy('ambient');
  const productionModule = loadProxyFetchCopy('production-safety');

  // ---------------------------------------------------------------------
  // Check 1 — NEGATIVE CONTROL. With the seam disabled, a `globalThis.fetch`
  // stub must be bypassed on the dispatcher-routed direct path. This proves the
  // escape the seam exists to close is real; if this check ever flips, the
  // remaining checks are no longer evidence of anything.
  // ---------------------------------------------------------------------
  let escapeStubCalls = 0;
  const hitsBeforeEscape = realServerHits;
  globalThis.fetch = (...args) => { escapeStubCalls += 1; return originalFetch(...args); };
  const escapeResult = await escapeModule.smartFetchJson(url, FETCH_OPTIONS);
  globalThis.fetch = originalFetch;
  check(
    'negative control: globalThis.fetch stub IS bypassed on the direct route when the seam is off',
    escapeStubCalls === 0 && escapeResult.ok === true && escapeResult.route === 'direct' && realServerHits > hitsBeforeEscape,
    `stubCalls=${escapeStubCalls} route=${escapeResult.route} realServerHits=+${realServerHits - hitsBeforeEscape}`,
  );

  // ---------------------------------------------------------------------
  // Check 2 — DIRECT route (undici.Agent dispatcher) is interceptable.
  // ---------------------------------------------------------------------
  process.env[SEAM_ENV] = '1';
  let directOverrideCalls = 0;
  overrideModule.__setProxyFetchImpl(async () => { directOverrideCalls += 1; return seamResponse('direct'); });
  const hitsBeforeDirect = realServerHits;
  const directResult = await overrideModule.smartFetchJson(url, FETCH_OPTIONS);
  overrideModule.__resetProxyFetchImpl();
  check(
    'seam intercepts the DIRECT route (undici.Agent dispatcher)',
    directOverrideCalls >= 1 && directResult.ok === true && directResult.route === 'direct'
      && directResult.json?.seam === 'direct' && realServerHits === hitsBeforeDirect,
    `overrideCalls=${directOverrideCalls} route=${directResult.route} realNetworkEscapes=${realServerHits - hitsBeforeDirect}`,
  );

  // ---------------------------------------------------------------------
  // Check 3 — ambient globalThis.fetch stubbing works project-wide on a
  // dispatcher-routed path once the seam is enabled (fork (b)'s stated goal:
  // no test should need to know which internal branch it hits).
  // ---------------------------------------------------------------------
  let ambientStubCalls = 0;
  const hitsBeforeAmbient = realServerHits;
  globalThis.fetch = async () => { ambientStubCalls += 1; return seamResponse('ambient'); };
  const ambientResult = await ambientModule.smartFetchJson(url, FETCH_OPTIONS);
  globalThis.fetch = originalFetch;
  check(
    'seam honours an ambient globalThis.fetch stub on a dispatcher-routed path',
    ambientStubCalls >= 1 && ambientResult.ok === true && ambientResult.json?.seam === 'ambient'
      && realServerHits === hitsBeforeAmbient,
    `stubCalls=${ambientStubCalls} realNetworkEscapes=${realServerHits - hitsBeforeAmbient}`,
  );

  // ---------------------------------------------------------------------
  // Check 4 — PRODUCTION SAFETY. Outside a test runtime the seam must refuse to
  // install, so shipped code can never redirect real outbound traffic.
  // ---------------------------------------------------------------------
  delete process.env[SEAM_ENV];
  let refused = false;
  let refusalMessage = '';
  try {
    productionModule.__setProxyFetchImpl(async () => seamResponse('should-never-install'));
  } catch (err) {
    refused = true;
    refusalMessage = String(err?.message ?? err);
  }
  check(
    'seam refuses to install outside a test runtime',
    refused && refusalMessage.includes('proxy_fetch_seam_forbidden'),
    refused ? refusalMessage : 'setter did NOT throw',
  );
  const productionStatus = productionModule.__proxyFetchSeamStatus();
  check(
    'seam reports itself inert when no test runtime flag is set',
    productionStatus.enabled === false && productionStatus.overrideInstalled === false,
    JSON.stringify(productionStatus),
  );

  // ---------------------------------------------------------------------
  // Check 5 — PROXY-POOL route backed by a real Undici ProxyAgent dispatcher.
  // Loaded last, because the pool is read from the environment. The proxy
  // address is an unroutable loopback port: if the seam failed to intercept,
  // the call would fail to connect rather than silently succeed.
  // ---------------------------------------------------------------------
  process.env[SEAM_ENV] = '1';
  process.env.PROXY_POOL_URLS = 'http://127.0.0.1:1';
  process.env.PROXY_MODE = 'proxy_first';
  const proxyModule = loadProxyFetchCopy('proxy-pool');
  let proxyOverrideCalls = 0;
  const proxyRoutesSeen = [];
  proxyModule.__setProxyFetchImpl(async () => { proxyOverrideCalls += 1; return seamResponse('proxy'); });
  const hitsBeforeProxy = realServerHits;
  const proxyResult = await proxyModule.smartFetchJson(url, FETCH_OPTIONS);
  proxyRoutesSeen.push(proxyResult.route);
  proxyModule.__resetProxyFetchImpl();
  const poolInfo = proxyModule.getProxyPoolInfo();
  check(
    'seam intercepts an Undici-dispatcher PROXY-POOL route',
    proxyOverrideCalls >= 1 && proxyResult.ok === true && proxyResult.json?.seam === 'proxy'
      && proxyResult.route !== 'direct' && realServerHits === hitsBeforeProxy,
    `overrideCalls=${proxyOverrideCalls} route=${proxyResult.route} poolSize=${poolInfo.poolSize} mode=${poolInfo.mode} realNetworkEscapes=${realServerHits - hitsBeforeProxy}`,
  );

  const failures = checks.filter((row) => !row.passed);
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const artifact = {
    generatedAt: new Date().toISOString(),
    task: 'CP28-0B proxyFetch mock-escape seam',
    fork: 'b:injectable-fetch-seam',
    checks,
    passed: checks.length - failures.length,
    total: checks.length,
    routesProven: ['direct(undici.Agent)', ...proxyRoutesSeen.map((route) => `${route}(undici.ProxyAgent)`)],
    network: 'local-loopback-only',
  };
  fs.writeFileSync(
    path.join(root, 'QA', `proxy-fetch-mockability-v${packageJson.version}.json`),
    `${JSON.stringify(artifact, null, 2)}\n`,
  );

  console.log(`\nProxy fetch mockability guard: ${checks.length - failures.length}/${checks.length} PASS`);
  if (failures.length) {
    console.error(`\nFAILED CHECKS:\n${failures.map((row) => `  - ${row.label} [${row.detail}]`).join('\n')}`);
  }
  process.exitCode = failures.length ? 1 : 0;
} finally {
  globalThis.fetch = originalFetch;
  delete process.env[SEAM_ENV];
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temp, { recursive: true, force: true });
}
