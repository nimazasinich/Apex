#!/usr/bin/env node
/**
 * APEX host runner — zero-dependency MCP server (stdio, JSON-RPC 2.0).
 *
 * Why this exists
 * ---------------
 * The agent sandbox mounts this repo but cannot execute the toolchain: node_modules
 * was installed on Windows, so vitest/vite/esbuild/rollup resolve platform binaries
 * that do not exist for linux-x64, and the sandbox has no registry access to install
 * them (npm returns 403). Result: `npm run test:unit`, `npm run build` and every
 * tsx-based script are unrunnable there, and any claim about them is a guess.
 *
 * This server runs ON THE WINDOWS HOST, where node_modules is correct, and exposes a
 * narrow, allowlisted surface so the agent can execute the real verification chain and
 * paste real output instead of guessing.
 *
 * Safety model (deliberately conservative)
 * ----------------------------------------
 *  - No arbitrary shell. Only npm scripts whose names appear in ALLOWED_SCRIPTS.
 *  - The allowlist contains verification/QA/build scripts only. Anything that deletes
 *    files, writes release archives, mutates persisted datasets, trains/promotes models,
 *    or touches an exchange is excluded and cannot be reached through this server.
 *  - Every child process gets a hard timeout and is killed on expiry.
 *  - Output is truncated head+tail so a runaway log cannot flood the context window.
 *  - Runs with APEX_TRADING_ENABLED=0 / APEX_LIVE_EXECUTION=0 forced in the child env.
 *
 * Protocol: MCP over stdio. Implements initialize, tools/list, tools/call, plus
 * ping and the notifications/* no-ops. No SDK, no dependencies — Node >= 18.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'apex-host-runner';
const SERVER_VERSION = '1.0.0';

/** Repo root: --repo <path>, else APEX_REPO_ROOT, else two levels up from tools/mcp/. */
function resolveRepoRoot() {
  const flagIndex = process.argv.indexOf('--repo');
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) return path.resolve(process.argv[flagIndex + 1]);
  if (process.env.APEX_REPO_ROOT) return path.resolve(process.env.APEX_REPO_ROOT);
  return path.resolve(new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
}
const REPO_ROOT = resolveRepoRoot();

/**
 * Allowlist. Key = npm script name, value = { timeoutMs, note }.
 * Adding a script here is a security decision — it must be read-only with respect to
 * source, must not touch an exchange, and must not delete anything.
 */
const ALLOWED_SCRIPTS = {
  // --- typecheck / tests / build -------------------------------------------------
  lint: { timeoutMs: 300_000, note: 'tsc --noEmit over the whole project' },
  'test:unit': { timeoutMs: 900_000, note: 'vitest run — the real behavioural suite' },
  test: { timeoutMs: 900_000, note: 'alias of test:unit' },
  build: { timeoutMs: 900_000, note: 'vite client build + server bundle to dist/' },
  'check:test-inventory': { timeoutMs: 120_000, note: 'test inventory gate' },
  'check:version-identity': { timeoutMs: 120_000, note: 'version identity gate' },
  'check:source-contracts': { timeoutMs: 600_000, note: 'aggregated source-contract QA chain' },
  'check:source-contracts:legacy': { timeoutMs: 600_000, note: 'legacy source-contract chain' },
  verify: { timeoutMs: 1_800_000, note: 'full 11-stage verification chain' },
  'release:gate': { timeoutMs: 180_000, note: 'version identity + no-secrets gate' },
  'release:gate:source': { timeoutMs: 180_000, note: 'no-secrets gate, source only' },

  // --- runtime / behavioural QA ---------------------------------------------------
  'test:runtime': { timeoutMs: 900_000, note: 'runtime QA chain' },
  'qa:strategy-engines': { timeoutMs: 300_000 },
  'qa:strategy-library': { timeoutMs: 300_000 },
  'qa:strategy-integration': { timeoutMs: 300_000 },
  'qa:strategy-backtest-production': { timeoutMs: 600_000 },
  'qa:backtest-runtime': { timeoutMs: 600_000 },
  'qa:backtesting-workspace': { timeoutMs: 300_000 },
  'qa:adaptive-governor': { timeoutMs: 300_000 },
  'qa:system-integration': { timeoutMs: 300_000 },
  'qa:trading-engine-utilities': { timeoutMs: 300_000 },
  'qa:consolidation': { timeoutMs: 300_000 },
  'qa:core10-fusion': { timeoutMs: 300_000 },
  'qa:feature-preservation': { timeoutMs: 300_000 },
  'qa:execution-position-state': { timeoutMs: 300_000 },
  'qa:strategy-optimization': { timeoutMs: 300_000 },
  'qa:strategy-optimizer-safety': { timeoutMs: 300_000 },
  'qa:unified-safety-runtime': { timeoutMs: 300_000 },
  'qa:maximal-merge-safety': { timeoutMs: 300_000 },
  'qa:multi-agent-multi-trading': { timeoutMs: 600_000 },
  'qa:multi-agent-multi-trading-runtime': { timeoutMs: 600_000 },
  'qa:liquidity-hunter': { timeoutMs: 900_000 },
  'qa:liquidity-hunter-runtime': { timeoutMs: 600_000 },
  'qa:liquidity-hunter-core': { timeoutMs: 600_000 },
  'qa:liquidity-hunter-read-plane': { timeoutMs: 600_000 },
  'qa:liquidity-hunter-event-replay': { timeoutMs: 600_000 },
  'qa:liquidity-hunter-two-tier-replay': { timeoutMs: 600_000 },
  'qa:liquidity-hunter-evidence-simulation': { timeoutMs: 600_000 },
  'qa:liquidity-hunter-validation-providers': { timeoutMs: 600_000 },
  'qa:liquidity-hunter-research-completion': { timeoutMs: 600_000 },
  'qa:liquidity-hunter-safe-completion': { timeoutMs: 600_000 },

  // --- UI / theme contracts --------------------------------------------------------
  'qa:light-theme': { timeoutMs: 120_000 },
  'qa:design-tokens': { timeoutMs: 120_000 },
  'qa:reference-ui': { timeoutMs: 120_000 },
  'qa:merged-stage-ui': { timeoutMs: 120_000 },
  'qa:ui-interaction-polish': { timeoutMs: 120_000 },
  'qa:ui-theme-merge': { timeoutMs: 120_000 },
  'qa:ui-completeness-r2': { timeoutMs: 120_000 },
  'qa:workspace-light-polish': { timeoutMs: 120_000 },
  'qa:attached-feature-parity': { timeoutMs: 120_000 },
  'qa:trading-drawer-docking': { timeoutMs: 120_000 },
  'qa:trading-submenu-relocation': { timeoutMs: 120_000 },
  'qa:research-workspace-layout': { timeoutMs: 120_000 },
  'qa:agent-safe-merge': { timeoutMs: 120_000 },
  'qa:v20-contract': { timeoutMs: 120_000 },
  'qa:ui-1368': { timeoutMs: 600_000, note: 'needs a browser/screenshot toolchain on the host' },
  'qa:workspace-runtime': { timeoutMs: 900_000, note: 'browser contract over every route' },

  // --- read-only inspection ---------------------------------------------------------
  'docs:check': { timeoutMs: 300_000 },
  'index:functions:check': { timeoutMs: 300_000 },
  'index:functions:query': { timeoutMs: 300_000 },
  'repo:audit': { timeoutMs: 600_000 },
  'smoke:operations-status': { timeoutMs: 300_000 },
  'qa:cleanup:dry': { timeoutMs: 120_000, note: 'dry run only — the non-dry variant is intentionally not allowlisted' },
};

/**
 * Explicitly denied, with the reason surfaced to the caller instead of a generic
 * "not allowed". These are the scripts a well-meaning agent is most likely to reach for.
 */
const DENIED_SCRIPTS = {
  clean: 'deletes build output — this repo is under a standing no-delete rule',
  'clean:artifacts': 'deletes generated artifacts — standing no-delete rule',
  'qa:cleanup': 'deletes QA artifacts — use qa:cleanup:dry instead',
  'release:package': 'writes a release archive; run it yourself when you actually intend to ship',
  'ml:train': 'mutates persisted model state',
  'sync:decision-memory': 'mutates the persisted decision-memory export',
  'import:deribit-options-history': 'writes a large external dataset into the repo',
  'manage:liquidity-hunter-thresholds': 'mutates live edge thresholds — a risk parameter',
  dev: 'long-lived server; start it yourself so you control its lifetime',
  'dev:server': 'long-lived server; start it yourself so you control its lifetime',
  start: 'long-lived server; start it yourself so you control its lifetime',
};

const MAX_OUTPUT_CHARS = 24_000;

function truncate(text) {
  if (text.length <= MAX_OUTPUT_CHARS) return { text, truncated: false };
  const head = text.slice(0, Math.floor(MAX_OUTPUT_CHARS * 0.6));
  const tail = text.slice(-Math.floor(MAX_OUTPUT_CHARS * 0.4));
  const dropped = text.length - head.length - tail.length;
  return {
    text: `${head}\n\n...[${dropped} characters omitted from the middle]...\n\n${tail}`,
    truncated: true,
  };
}

function readScripts() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

function runNpmScript(scriptName, extraTimeoutMs) {
  return new Promise((resolve) => {
    const entry = ALLOWED_SCRIPTS[scriptName];
    const timeoutMs = Math.min(extraTimeoutMs ?? entry.timeoutMs, 1_800_000);
    const started = Date.now();

    // shell:true is required on Windows for npm.cmd resolution. scriptName is
    // constrained to the allowlist keys above, so nothing caller-controlled reaches
    // the shell.
    const child = spawn('npm', ['run', scriptName], {
      cwd: REPO_ROOT,
      shell: true,
      env: {
        ...process.env,
        CI: '1',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        APEX_TRADING_ENABLED: '0',
        APEX_LIVE_EXECUTION: '0',
        APEX_AUTONOMOUS_EXECUTION: '0',
      },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, exitCode: null, spawnError: String(error), stdout, stderr, durationMs: Date.now() - started, timedOut: false });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && !timedOut, exitCode: code, signal, stdout, stderr, durationMs: Date.now() - started, timedOut });
    });
  });
}

function formatRun(scriptName, result) {
  const out = truncate(result.stdout.trimEnd());
  const err = truncate(result.stderr.trimEnd());
  const lines = [
    `$ npm run ${scriptName}`,
    `cwd: ${REPO_ROOT}`,
    result.spawnError
      ? `SPAWN FAILED: ${result.spawnError}`
      : `exit code: ${result.exitCode}${result.signal ? ` (signal ${result.signal})` : ''}${result.timedOut ? ' — KILLED BY TIMEOUT' : ''}`,
    `duration: ${(result.durationMs / 1000).toFixed(1)}s`,
    `verdict: ${result.ok ? 'PASS' : 'FAIL'}`,
    '',
    '--- stdout ---',
    out.text || '(empty)',
  ];
  if (err.text) lines.push('', '--- stderr ---', err.text);
  if (out.truncated || err.truncated) lines.push('', '(output truncated — head and tail kept)');
  return lines.join('\n');
}

const TOOLS = [
  {
    name: 'apex_list_scripts',
    description:
      'List the npm scripts this server is allowed to run, with each script\'s command line and timeout, plus the explicitly denied scripts and why. Call this first if unsure what is runnable.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'apex_run_script',
    description:
      'Run one allowlisted npm script in the APEX repo on the Windows host and return its real exit code, stdout and stderr. Use this instead of guessing whether tests/build pass. Only allowlisted verification, QA and build scripts can be run; nothing that deletes files, ships a release, mutates model state, or touches an exchange.',
    inputSchema: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'npm script name, e.g. "test:unit", "lint", "build", "verify"' },
        timeoutMs: { type: 'number', description: 'Optional override, capped at 1800000 (30 min).' },
      },
      required: ['script'],
      additionalProperties: false,
    },
  },
  {
    name: 'apex_env_report',
    description:
      'Report the host environment: node/npm versions, repo root, package version, whether node_modules and dist exist, and which platform-specific binaries (rollup, esbuild) are installed. Use this to confirm the host toolchain is actually usable before blaming a failure on the code.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

async function envReport() {
  const exec = (cmd) => new Promise((resolve) => {
    const c = spawn(cmd, { cwd: REPO_ROOT, shell: true });
    let o = '';
    c.stdout.on('data', (d) => { o += d.toString(); });
    c.stderr.on('data', (d) => { o += d.toString(); });
    c.on('error', () => resolve('(failed)'));
    c.on('close', () => resolve(o.trim() || '(empty)'));
  });

  const nodeModules = path.join(REPO_ROOT, 'node_modules');
  const listNative = (prefix, dir) => {
    try {
      return fs.readdirSync(path.join(nodeModules, dir)).filter((n) => n.startsWith(prefix)).join(', ') || '(none)';
    } catch { return '(directory missing)'; }
  };

  let version = '(unreadable)';
  try { version = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).version; } catch { /* ignore */ }

  return [
    `repo root:        ${REPO_ROOT}`,
    `package version:  ${version}`,
    `platform:         ${process.platform} ${process.arch}`,
    `node (this proc): ${process.version}`,
    `node (shell):     ${await exec('node -v')}`,
    `npm  (shell):     ${await exec('npm -v')}`,
    `node_modules:     ${fs.existsSync(nodeModules) ? 'present' : 'MISSING — run npm ci'}`,
    `dist/:            ${fs.existsSync(path.join(REPO_ROOT, 'dist')) ? 'present' : 'absent'}`,
    `rollup natives:   ${listNative('rollup-', '@rollup')}`,
    `esbuild natives:  ${listNative('', '@esbuild')}`,
  ].join('\n');
}

async function callTool(name, args) {
  if (name === 'apex_list_scripts') {
    const scripts = readScripts();
    const allowed = Object.entries(ALLOWED_SCRIPTS).map(([key, meta]) => {
      const present = Object.prototype.hasOwnProperty.call(scripts, key);
      const cmd = present ? scripts[key] : 'NOT DEFINED IN package.json';
      return `  ${present ? ' ' : '!'} ${key.padEnd(42)} ${Math.round(meta.timeoutMs / 1000)}s  ${cmd}`;
    });
    const denied = Object.entries(DENIED_SCRIPTS).map(([key, why]) => `  ${key.padEnd(42)} ${why}`);
    return [
      `ALLOWED (${allowed.length}) — "!" means the script is allowlisted here but missing from package.json:`,
      ...allowed,
      '',
      `DENIED (${denied.length}) — refused by design:`,
      ...denied,
    ].join('\n');
  }

  if (name === 'apex_env_report') return envReport();

  if (name === 'apex_run_script') {
    const script = String(args?.script ?? '').trim();
    if (!script) return 'Error: "script" is required.';
    if (DENIED_SCRIPTS[script]) {
      return `Refused: "${script}" is denied by this server. Reason: ${DENIED_SCRIPTS[script]}\nRun it yourself in a terminal if you really intend to.`;
    }
    if (!Object.prototype.hasOwnProperty.call(ALLOWED_SCRIPTS, script)) {
      return `Refused: "${script}" is not on the allowlist. Call apex_list_scripts to see what is runnable.\nThis server never runs arbitrary shell commands.`;
    }
    if (!Object.prototype.hasOwnProperty.call(readScripts(), script)) {
      return `Error: "${script}" is allowlisted but does not exist in ${path.join(REPO_ROOT, 'package.json')}.`;
    }
    const result = await runNpmScript(script, typeof args?.timeoutMs === 'number' ? args.timeoutMs : undefined);
    return formatRun(script, result);
  }

  return `Unknown tool: ${name}`;
}

// --- JSON-RPC 2.0 over stdio (newline-delimited) -----------------------------------

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(request) {
  const { id, method, params } = request;
  const isNotification = id === undefined || id === null;

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          },
        };
      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
      case 'tools/call': {
        const text = await callTool(params?.name, params?.arguments ?? {});
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: false } };
      }
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };
      default:
        if (isNotification) return null; // notifications/initialized etc.
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
    }
  } catch (error) {
    if (isNotification) return null;
    return { jsonrpc: '2.0', id, error: { code: -32603, message: String(error?.stack ?? error) } };
  }
}

let buffer = '';
// Requests are handled asynchronously, so stdin closing does NOT mean we are done:
// a `tools/call` that is still running must be allowed to answer first. Track
// in-flight work and only exit once it has drained.
let inFlight = 0;
let stdinClosed = false;
function maybeExit() {
  if (stdinClosed && inFlight === 0) process.exit(0);
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }
    inFlight += 1;
    handle(request)
      .then((response) => { if (response) send(response); })
      .finally(() => { inFlight -= 1; maybeExit(); });
  }
});
process.stdin.on('end', () => { stdinClosed = true; maybeExit(); });

process.stderr.write(`[${SERVER_NAME}] ready — repo root ${REPO_ROOT}\n`);
