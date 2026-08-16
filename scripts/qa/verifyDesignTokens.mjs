#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const indexPath = path.join(root, 'src/index.css');
const tokensPath = path.join(root, 'src/styles/tokens.css');

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(indexPath)) fail('src/index.css exists');
if (!fs.existsSync(tokensPath)) fail('src/styles/tokens.css exists');
if (process.exitCode) process.exit(process.exitCode);

const indexCss = fs.readFileSync(indexPath, 'utf8');
const tokensCss = fs.readFileSync(tokensPath, 'utf8');
const importPattern = /@import\s+["']\.\/styles\/tokens\.css["']\s*;/g;
const imports = [...indexCss.matchAll(importPattern)];
const importIndex = imports[0]?.index ?? -1;
const layerIndex = indexCss.indexOf('@layer');
const definitions = new Set(
  [...tokensCss.matchAll(/(--apex-[a-z0-9-]+)\s*:/gi)].map((match) => match[1]),
);

const requiredTokens = [
  '--apex-green-050', '--apex-green-100', '--apex-green-200',
  '--apex-green-300', '--apex-green-400', '--apex-green-500',
  '--apex-green-600', '--apex-green-700', '--apex-green-800',
  '--apex-red-050', '--apex-red-500', '--apex-orange-500',
  '--apex-blue-500', '--apex-violet-500', '--apex-teal-500',
  '--apex-ink-950', '--apex-ink-900', '--apex-ink-700',
  '--apex-muted-600', '--apex-muted-400', '--apex-canvas',
  '--apex-surface', '--apex-surface-soft', '--apex-surface-selected',
  '--apex-border', '--apex-divider', '--apex-positive',
  '--apex-negative', '--apex-focus', '--apex-soft',
];

const checks = [
  ['tokens.css imported exactly once', imports.length === 1],
  ['tokens import appears before @layer rules', importIndex >= 0 && layerIndex >= 0 && importIndex < layerIndex],
  ['core APEX token contract is complete', requiredTokens.every((token) => definitions.has(token))],
  ['tokens.css contains no remote imports', !/@import\s+(?:url\()?['"]?https?:\/\//i.test(tokensCss)],
  ['tokens.css contains a single root contract', (tokensCss.match(/:root\s*\{/g) ?? []).length === 1],
];

for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) process.exitCode = 1;
}

if (!process.exitCode) {
  console.log(`\nDesign token contract passed (${checks.length}/${checks.length}).`);
}
