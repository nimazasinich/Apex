#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const publicDir = path.join(root, 'public');
const output = path.join(publicDir, 'build-info.json');

function command(commandName, args) {
  try { return execFileSync(commandName, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '_release' || entry.name === '_qa' || entry.name === 'test-results') continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute, out);
    else if (entry.isFile()) out.push(absolute);
  }
  return out;
}

const commit = command('git', ['rev-parse', '--short=12', 'HEAD']);
const hash = crypto.createHash('sha256');
for (const rel of ['package.json', 'package-lock.json', 'server.ts', 'index.html', 'vite.config.ts', 'tsconfig.json', 'tsconfig.ui02.json']) {
  const absolute = path.join(root, rel);
  if (!fs.existsSync(absolute)) continue;
  hash.update(rel);
  hash.update('\0');
  hash.update(fs.readFileSync(absolute));
  hash.update('\0');
}
for (const base of ['src', 'public', 'scripts', 'openapi']) {
  for (const absolute of walk(path.join(root, base))) {
    if (absolute === output) continue;
    hash.update(path.relative(root, absolute).replaceAll(path.sep, '/'));
    hash.update('\0');
    hash.update(fs.readFileSync(absolute));
    hash.update('\0');
  }
}

const sourceHash = hash.digest('hex').slice(0, 12);
const dirtyOutput = commit ? command('git', ['status', '--porcelain']) : null;
const dirtyTree = commit ? Boolean(dirtyOutput) : null;
const buildId = commit && !dirtyTree
  ? commit
  : commit
    ? `${commit.slice(0, 8)}-${sourceHash.slice(0, 8)}`
    : sourceHash;
const payload = {
  schemaVersion: 1,
  application: pkg.name,
  version: pkg.version,
  buildId,
  sourceHash,
  commit: commit || null,
  dirtyTree,
  generatedAt: new Date().toISOString(),
  nodeVersion: process.version,
  platform: process.platform,
  architecture: process.arch,
};

if (process.argv.includes('--check')) {
  if (!fs.existsSync(output)) {
    console.error('[build-identity] public/build-info.json is missing');
    process.exit(1);
  }
  const current = JSON.parse(fs.readFileSync(output, 'utf8'));
  const mismatches = ['version', 'buildId', 'sourceHash'].filter((field) => current[field] !== payload[field]);
  if (mismatches.length) {
    console.error(`[build-identity] stale identity: ${mismatches.join(', ')}`);
    process.exit(1);
  }
  console.log(`[build-identity] current: v${payload.version} build ${payload.buildId}`);
  process.exit(0);
}

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`[build-identity] v${payload.version} build ${payload.buildId}`);
