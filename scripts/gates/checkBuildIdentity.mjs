#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const infoPath = path.join(root, 'public', 'build-info.json');
const buildScript = fs.readFileSync(path.join(root, 'scripts/utilities/buildAndBundle.mts'), 'utf8');
const swStamp = fs.readFileSync(path.join(root, 'scripts/utilities/stampServiceWorker.mjs'), 'utf8');
const errors = [];

try {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'utilities', 'generateBuildIdentity.mjs'), '--check'], { cwd: root, stdio: 'pipe' });
} catch (error) {
  const detail = error?.stderr?.toString?.().trim() || error?.stdout?.toString?.().trim() || 'build identity freshness check failed';
  errors.push(detail);
}

if (!fs.existsSync(infoPath)) errors.push('public/build-info.json missing');
else {
  const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  if (info.version !== pkg.version) errors.push(`build-info version ${info.version} != package ${pkg.version}`);
  if (typeof info.buildId !== 'string' || info.buildId.length < 7) errors.push('build-info buildId missing/short');
  if (typeof info.sourceHash !== 'string' || info.sourceHash.length < 7) errors.push('build-info sourceHash missing/short');
}
if (!buildScript.includes("label: 'build identity'")) errors.push('build pipeline does not generate identity before Vite');
if (!swStamp.includes('build-info.json')) errors.push('service worker stamp does not consume build identity');
if (errors.length) {
  console.error('[build-identity] FAILED');
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}
console.log('[build-identity] passed');
