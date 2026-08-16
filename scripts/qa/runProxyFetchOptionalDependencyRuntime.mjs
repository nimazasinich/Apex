#!/usr/bin/env node
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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-proxy-fetch-optional-'));
const sourceFile = path.join(root, 'src/services/proxyFetch.ts');
const output = ts.transpileModule(fs.readFileSync(sourceFile, 'utf8'), {
  fileName: 'src/services/proxyFetch.ts',
  reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10, esModuleInterop: true },
});
const diagnostics = (output.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
if (diagnostics.length) throw new Error(`transpile_failed:${diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, ' ')).join('|')}`);
const compiled = path.join(temp, 'src/services/proxyFetch.js');
fs.mkdirSync(path.dirname(compiled), { recursive: true });
fs.writeFileSync(compiled, output.outputText);

const checks = [];
function check(label, condition) {
  const passed = Boolean(condition);
  checks.push({ label, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
}

let server;
try {
  server = http.createServer((_req, res) => {
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

  // Hermetic isolation: neutralise every ambient proxy source parseProxyPool()
  // reads so this optional-dependency contract exercises the true DIRECT route
  // regardless of the host's real proxy configuration (e.g. a developer machine
  // with HTTP_PROXY/HTTPS_PROXY pointed at a local tunnel). Without this, both
  // the "direct" and "failover-to-direct" checks would silently route through
  // the ambient proxy and never reach the direct route they assert on.
  for (const key of [
    'PROXY_POOL_URLS', 'APEX_LOCAL_PROXY', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY',
    'SOCKS5_PROXY', 'SOCKS_PROXY_URL', 'SOCKS_PROXY', 'APEX_LOCAL_PROXY_PORT',
    'LOCAL_PROXY_PORT', 'APEX_AUTO_LOCAL_PROXY_PORT', 'APEX_AUTO_LOCAL_PROXY_SCHEME',
  ]) delete process.env[key];
  process.env.APEX_AUTO_LOCAL_PROXY = 'false';
  const directModule = requireFromHere(compiled);
  const direct = await directModule.smartFetchJson(url, { timeoutMs: 3_000, cacheMode: 'none', deduplicate: false });
  check('direct fetch works without installed undici/socks packages', direct.ok === true && direct.route === 'direct' && direct.json?.ok === true);

  const compiledProxyFirst = path.join(temp, 'src/services/proxyFetch.proxy-first.js');
  fs.writeFileSync(compiledProxyFirst, output.outputText);
  process.env.PROXY_POOL_URLS = 'http://127.0.0.1:1';
  process.env.PROXY_MODE = 'proxy_first';
  const proxyFirstModule = requireFromHere(compiledProxyFirst);
  const proxyFirst = await proxyFirstModule.smartFetchJson(url, { timeoutMs: 3_000, cacheMode: 'none', deduplicate: false });
  check('missing optional proxy dispatcher fails over to direct route', proxyFirst.ok === true && proxyFirst.route === 'direct' && proxyFirst.json?.source === 'local-fixture');

  const pool = proxyFirstModule.getProxyPoolInfo();
  check('proxy pool remains observable without loading optional packages', pool.poolSize >= 1 && pool.mode === 'proxy_first');

  const failures = checks.filter((row) => !row.passed);
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  fs.writeFileSync(path.join(root, 'QA', `proxy-fetch-optional-dependency-v${packageJson.version}.json`), JSON.stringify({ generatedAt: new Date().toISOString(), checks, passed: checks.length - failures.length, total: checks.length, network: 'local-loopback-only' }, null, 2) + '\n');
  console.log(`\nProxy fetch optional-dependency runtime: ${checks.length - failures.length}/${checks.length} PASS`);
  process.exitCode = failures.length ? 1 : 0;
} finally {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temp, { recursive: true, force: true });
}
