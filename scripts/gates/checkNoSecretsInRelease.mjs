#!/usr/bin/env node
/** Recursive release gate: secret-file exclusion, placeholder validation, archive inspection, and fresh build proof. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const forbiddenExact = new Set(['.env', '.env.local', '.env.txt', '.external-api-sources.config.json', '.supplemental.config.json', '.telegram.config.json', 'secrets.local.env']);
const forbiddenNamePatterns = [/^\.env\.(?!example$).+/i, /secrets?\.local\.env/i, /(^|[._-])private[._-]?key/i, /^id_rsa(?:\.|$)/i];
const forbiddenExtensions = new Set(['.pem', '.p12', '.pfx', '.key']);
const skippedDirs = new Set(['node_modules', '.git']);
const requiredExamples = ['.env.example', '.external-api-sources.config.example.json'];
const requiredBuiltIdentifiers = ['canonical_v2', 'risk_governor_v1', 'adaptive_governance_v1', 'live-execution-intents'];
const errors = [];
const sourceOnly = process.argv.includes('--source-only');

function forbiddenPath(relPath) {
  const name = basename(relPath);
  if (forbiddenExact.has(name)) return true;
  if (forbiddenNamePatterns.some((pattern) => pattern.test(name))) return true;
  return forbiddenExtensions.has(extname(name).toLowerCase()) && !/example|fixture|public/i.test(relPath);
}

function zipEntries(path) {
  const buffer = readFileSync(path);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 0xffff - 22); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error('zip_eocd_not_found');
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16);
  const rows = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('zip_central_directory_malformed');
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    rows.push(buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return rows.filter(Boolean);
}

function walk(dir) {
  const stack = [dir];
  const files = [];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readDirSafe(current)) {
      if (skippedDirs.has(entry)) continue;
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) stack.push(full); else files.push(full);
    }
  }
  return files;
}

for (const file of walk(root)) {
  const rel = relative(root, file).replaceAll('\\', '/');
  if (forbiddenPath(rel)) errors.push(`Forbidden secret-bearing path: ${rel}`);
  if (extname(file).toLowerCase() === '.zip') {
    try {
      const entries = zipEntries(file);
      for (const entry of entries) if (forbiddenPath(entry)) errors.push(`Forbidden path inside ${rel}: ${entry}`);
    } catch (error) {
      errors.push(`Unable to inspect archive ${rel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

for (const name of requiredExamples) {
  const path = join(root, name);
  if (!existsSync(path)) errors.push(`Required placeholder file missing: ${name}`);
  else {
    const text = readFileSync(path, 'utf8');
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) errors.push(`Private key material found in template: ${name}`);
  }
}

if (!sourceOnly) {
  const distServerPath = join(root, 'dist', 'server.cjs');
  const distIndexPath = join(root, 'dist', 'index.html');
  if (!existsSync(distServerPath) || !existsSync(distIndexPath)) {
    errors.push('dist/server.cjs or dist/index.html missing — run `npm run build` before packaging.');
  } else {
    const srcMtime = latestSourceMtime();
    const distMtime = Math.max(statSync(distServerPath).mtimeMs, statSync(distIndexPath).mtimeMs);
    if (distMtime < srcMtime) errors.push(`dist/ predates source changes (${new Date(distMtime).toISOString()} < ${new Date(srcMtime).toISOString()}).`);
    const bundleText = readFileSync(distServerPath, 'utf8');
    for (const identifier of requiredBuiltIdentifiers) if (!bundleText.includes(identifier)) errors.push(`dist/server.cjs is missing expected identifier "${identifier}".`);
  }
}

function latestSourceMtime() {
  const roots = ['src', 'server.ts', 'package.json', 'scripts'];
  let latest = 0;
  for (const item of roots) {
    const target = join(root, item);
    if (!existsSync(target)) continue;
    for (const file of statSync(target).isDirectory() ? walk(target) : [target]) latest = Math.max(latest, statSync(file).mtimeMs);
  }
  return latest;
}
function readDirSafe(dir) { try { return readdirSync(dir); } catch { return []; } }

if (errors.length) {
  console.error('\n[release-gate] FAILED\n');
  for (const error of [...new Set(errors)]) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(sourceOnly
  ? '[release-gate] passed: source-only secret scan, archive scan, and template checks succeeded.'
  : '[release-gate] passed: recursive secret scan, archive scan, templates, and fresh dist checks succeeded.');
