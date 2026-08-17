#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const serviceWorkerPath = path.join(dist, 'sw.js');
const buildInfoPath = path.join(dist, 'build-info.json');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

if (!fs.existsSync(serviceWorkerPath)) {
  console.error('[service-worker] dist/sw.js is missing; run the Vite build first.');
  process.exit(1);
}

function fallbackDistHash() {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (absolute !== serviceWorkerPath) files.push(absolute);
    }
  };
  walk(dist);
  files.sort();
  const hash = crypto.createHash('sha256');
  for (const absolute of files) {
    hash.update(path.relative(dist, absolute).replaceAll(path.sep, '/'));
    hash.update('\0');
    hash.update(fs.readFileSync(absolute));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

let buildHash = null;
if (fs.existsSync(buildInfoPath)) {
  const info = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
  if (info.version !== packageJson.version) {
    console.error(`[service-worker] build-info version ${info.version} does not match package ${packageJson.version}.`);
    process.exit(1);
  }
  if (typeof info.buildId === 'string' && info.buildId.length >= 7) buildHash = info.buildId.slice(0, 12);
}
buildHash ||= fallbackDistHash();

let source = fs.readFileSync(serviceWorkerPath, 'utf8');
source = source.replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${packageJson.version}';`);
source = source.replace(/const BUILD_HASH = '[^']+';/, `const BUILD_HASH = '${buildHash}';`);
if (!source.includes(`const BUILD_HASH = '${buildHash}';`)) {
  console.error('[service-worker] build hash constant was not found.');
  process.exit(1);
}
fs.writeFileSync(serviceWorkerPath, source);
console.log(`[service-worker] stamped dist/sw.js with v${packageJson.version}-${buildHash}`);
