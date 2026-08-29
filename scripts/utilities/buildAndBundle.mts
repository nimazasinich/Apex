#!/usr/bin/env node
/**
 * Build wrapper — replaces the previous `vite build && esbuild ... && tsx ...`
 * chain in package.json's "build" script.
 *
 * Why this exists: on this machine, PowerShell treats any stderr output from
 * a native child process (even benign warnings with a zero exit code) as a
 * terminating "NativeCommandError". That silently killed the `&&` chain after
 * the esbuild step, even though every step had actually succeeded — `npm run
 * build` reported exit code 1 while dist/index.html, dist/server.cjs and
 * dist/server.cjs.map were all written correctly.
 *
 * This script runs the same three steps with Node's own child_process
 * spawning (shell: true only for npx resolution on Windows), and makes the
 * pass/fail decision itself from each child's real exit code — not from
 * whatever the parent shell decides to do with stderr noise. Output is still
 * streamed straight through (stdio: 'inherit'), so this is a drop-in
 * replacement, not a black box.
 *
 * Usage: npm run build   (now calls: tsx scripts/utilities/buildAndBundle.mts)
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const isWin = process.platform === 'win32';
const npx = isWin ? 'npx.cmd' : 'npx';

type Step = { label: string; command: string; args: string[] };

const steps: Step[] = [
  { label: 'build identity', command: process.execPath, args: ['scripts/utilities/generateBuildIdentity.mjs'] },
  { label: 'vite build', command: npx, args: ['vite', 'build'] },
  { label: 'service worker build stamp', command: process.execPath, args: ['scripts/utilities/stampServiceWorker.mjs'] },
  {
    label: 'esbuild (server.cjs)',
    command: npx,
    args: [
      'esbuild',
      'server.ts',
      '--bundle',
      '--platform=node',
      '--format=cjs',
      '--packages=external',
      '--sourcemap',
      '--outfile=dist/server.cjs',
    ],
  },
  {
    label: 'function index',
    command: process.execPath,
    // `tsx`'s CLI opens an IPC socket, which is prohibited on some hardened
    // QA runners. Node's loader path executes the same TypeScript without IPC.
    args: ['--import', 'tsx', 'scripts/utilities/generateFunctionIndex.mts', '--if-changed'],
  },
];

function runStep(step: Step): number {
  console.log(`\n[build] ▶ ${step.label}`);

  // On Windows, shell is only required for batch files/scripts (like npx.cmd).
  // Running process.execPath (node.exe) with shell: true can fail if its path contains spaces.
  const useShell = isWin && step.command !== process.execPath;

  const result = spawnSync(step.command, step.args, {
    cwd: root,
    stdio: 'inherit',
    shell: useShell,
  });

  if (result.error) {
    console.error(`[build] ✗ ${step.label} failed to start: ${result.error.message}`);
    return 1;
  }

  const status = result.status ?? 1;

  if (status !== 0) {
    console.error(`[build] ✗ ${step.label} exited with code ${status}`);
  } else {
    console.log(`[build] ✓ ${step.label} done`);
  }

  return status;
}

for (const step of steps) {
  const status = runStep(step);
  if (status !== 0) {
    process.exit(status);
  }
}

console.log('\n[build] ✓ all steps completed successfully.');
process.exit(0);
