#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const manifest = readJson('public/manifest.json');
const worker = readFileSync(resolve(root, 'public/sw.js'), 'utf8');
const workerVersion = worker.match(/const APP_VERSION = '([^']+)'/)?.[1] ?? null;
const checks = {
  packageAndLock: pkg.version === lock.version && pkg.version === lock.packages?.['']?.version,
  manifest: pkg.version === manifest.version,
  serviceWorker: pkg.version === workerVersion,
  archiveScriptUsesPackageVersion: readFileSync(resolve(root, 'scripts/utilities/createReleaseArchive.mts'), 'utf8').includes('apex-unified-terminal-v${version}.zip'),
};
console.log(JSON.stringify({ version: pkg.version, workerVersion, checks }, null, 2));
if (Object.values(checks).some((value) => !value)) process.exit(1);
