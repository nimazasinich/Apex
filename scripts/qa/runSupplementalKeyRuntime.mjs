#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const requireHere = createRequire(import.meta.url);

function resolveTypeScript() {
  const local = path.join(root, 'node_modules', 'typescript', 'lib', 'typescript.js');
  if (fs.existsSync(local)) return local;
  const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  const globalTs = path.join(globalRoot, 'typescript', 'lib', 'typescript.js');
  if (fs.existsSync(globalTs)) return globalTs;
  throw new Error('typescript_runtime_unavailable');
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute, out);
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(absolute);
  }
  return out;
}

const ts = requireHere(resolveTypeScript());
const build = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-supplemental-keys-'));
try {
  for (const absolute of walk(path.join(root, 'src'))) {
    const rel = path.relative(root, absolute);
    const source = fs.readFileSync(absolute, 'utf8');
    const result = ts.transpileModule(source, {
      fileName: rel,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
    const errors = (result.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
    if (errors.length) throw new Error(`transpile_failed:${rel}`);
    const target = path.join(build, rel.replace(/\.tsx?$/, '.js'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, result.outputText);
  }

  // Import-only shims. This runtime test never performs network I/O.
  const undiciDir = path.join(build, 'node_modules', 'undici');
  const socksDir = path.join(build, 'node_modules', 'socks-proxy-agent');
  fs.mkdirSync(undiciDir, { recursive: true });
  fs.mkdirSync(socksDir, { recursive: true });
  fs.writeFileSync(path.join(undiciDir, 'index.js'), "class Agent{constructor(o={}){this.options=o}};class ProxyAgent extends Agent{};module.exports={Agent,ProxyAgent,interceptors:{dns:()=>x=>x},fetch:globalThis.fetch,Headers:globalThis.Headers,Request:globalThis.Request,Response:globalThis.Response};\n");
  fs.writeFileSync(path.join(socksDir, 'index.js'), "class SocksProxyAgent{constructor(url){this.url=url}};module.exports={SocksProxyAgent};\n");

  const requireBuild = createRequire(path.join(build, 'entry.cjs'));
  const { SupplementalOrchestrator } = requireBuild(path.join(build, 'src/services/supplementalOrchestrator.js'));

  const inspectBscKey = (orchestrator) => {
    const provider = orchestrator.onchainProviders.find((item) => item.name === 'BscScan');
    assert.ok(provider, 'BscScan provider missing');
    return provider.apiKey;
  };

  const dedicated = new SupplementalOrchestrator({ etherscanKey: 'eth-fallback-key', bscScanKey: 'bsc-dedicated-key' });
  assert.equal(inspectBscKey(dedicated), 'bsc-dedicated-key');

  const fallback = new SupplementalOrchestrator({ etherscanKey: 'eth-fallback-key' });
  assert.equal(inspectBscKey(fallback), 'eth-fallback-key');

  const unconfigured = new SupplementalOrchestrator();
  assert.equal(unconfigured.getProvidersStatus().onchain.some((item) => item.name === 'BscScan'), false);

  console.log(JSON.stringify({
    schemaVersion: 1,
    checks: 3,
    passed: 3,
    dedicatedKeyPrecedence: true,
    etherscanFallback: true,
    noPhantomProviderWithoutKey: true,
    networkIoPerformed: false,
  }, null, 2));
} finally {
  fs.rmSync(build, { recursive: true, force: true });
}
