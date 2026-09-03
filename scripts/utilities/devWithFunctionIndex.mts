#!/usr/bin/env node
/**
 * Dev runner that always keeps the function index live.
 * Starts the APEX server and the function-index watcher together so every
 * source edit is checked for new/changed symbols and re-indexed automatically.
 *
 * Usage: npm run dev
 * Server only: npm run dev:server
 */
import 'dotenv/config';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureApexPortAvailable } from './portTakeover.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const isWin = process.platform === 'win32';
const cliArgs = process.argv.slice(2);
const forwardedPort = getCliValue('port');
const forwardedHost = getCliValue('host');
const childEnv = {
  ...process.env,
  ...(forwardedPort ? { PORT: forwardedPort } : {}),
  ...(forwardedHost ? { HOST: forwardedHost } : {}),
};

function getCliValue(name: string) {
  const longFlag = `--${name}`;
  const equalsFlag = `--${name}=`;
  const equalsMatch = cliArgs.find((arg) => arg.startsWith(equalsFlag));
  if (equalsMatch) {
    return equalsMatch.slice(equalsFlag.length);
  }
  const index = cliArgs.indexOf(longFlag);
  if (index >= 0 && cliArgs[index + 1] !== undefined) {
    return cliArgs[index + 1];
  }
  if (name === 'port') {
    return cliArgs.find((arg) => /^\d+$/.test(arg)) ?? null;
  }
  if (name === 'host') {
    return cliArgs.find((arg) => !arg.startsWith('--') && !/^\d+$/.test(arg)) ?? null;
  }
  return null;
}

function run(label: string, args: string[], required = false) {
  const child = spawn(process.execPath, ['--import', 'tsx', ...args], {
    cwd: root,
    stdio: 'inherit',
    env: childEnv,
    shell: false,
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (signal) {
      console.log(`[${label}] stopped (${signal})`);
      if (required) shutdown(0);
      return;
    }
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
      if (required) shutdown(code);
      return;
    }
    if (required) shutdown(0);
  });
  return child;
}

const children: ReturnType<typeof spawn>[] = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      if (isWin && child.pid) {
        execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      /* ignore */
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const parsedPort = Number(forwardedPort ?? childEnv.PORT ?? '3000');
const serverPort = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
const serverHost = forwardedHost ?? childEnv.HOST ?? process.env.APEX_HOST ?? '127.0.0.1';
await ensureApexPortAvailable({
  port: serverPort,
  host: serverHost,
  workspaceRoot: root,
  force: /^(1|true|yes)$/i.test(process.env.APEX_FORCE_PORT_TAKEOVER || ''),
});

console.log('[dev] Starting function-index watcher (auto-detect new/changed functions)…');
children.push(run('index', ['scripts/utilities/generateFunctionIndex.mts', '--watch']));

console.log('[dev] Starting APEX server…');
const serverArgs = ['server.ts', ...cliArgs];
children.push(run('server', serverArgs, true));
