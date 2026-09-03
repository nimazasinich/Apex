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

const SOURCE_ARCHIVE_GIT = 'NOT_AVAILABLE_SOURCE_ARCHIVE';
const SOURCE_ARCHIVE_DIRTY = 'NOT_APPLICABLE';
const PARENT_ARTIFACT_SHA256 = '36e22cb8cbd584264da29bd4ae029a6847898b5e7693dd0d62ff1a6b6ce08ce7';
const PARENT_BUILD_ID = 'apex-2.0.1-f74c0bbe625c';
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

const sourceTreeHash = hash.digest('hex');
const sourceHash = sourceTreeHash.slice(0, 12);
const buildId = `apex-${pkg.version}-${sourceHash}`;
const payload = {
  schemaVersion: 2,
  application: pkg.name,
  version: pkg.version,
  buildId,
  sourceHash,
  sourceTreeHash,
  gitCommit: SOURCE_ARCHIVE_GIT,
  dirtyTree: SOURCE_ARCHIVE_DIRTY,
  parentArtifactSha256: PARENT_ARTIFACT_SHA256,
  parentBuildId: PARENT_BUILD_ID,
  commit: null,
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
  const mismatches = [
    'application',
    'version',
    'buildId',
    'sourceHash',
    'sourceTreeHash',
    'gitCommit',
    'dirtyTree',
    'parentArtifactSha256',
    'parentBuildId',
  ].filter((field) => current[field] !== payload[field]);
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
