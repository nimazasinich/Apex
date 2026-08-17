#!/usr/bin/env node
/**
 * Desktop UI CSS enforcement — rejects arbitrary colors and unapproved patterns.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Scan all desktop UI sources under src/components + App shell. */
const enforceRoots = ['src/components', 'src/App.tsx'];

/** Files/dirs fully allowlisted (token defs, mobile-only legacy, third-party embeds). */
const allowlistPaths = [
  'src/index.css',
  'src/components/TrackingObservatoryPanel.tsx',
  'src/components/TrackingBottomDock.tsx',
  'src/components/MobileWorkspaceNav.tsx',
  'src/components/SignalDetailSheet.tsx',
  'src/components/MetricIntegral.tsx',
  'src/components/ChartDeckPanel.tsx',
  'src/components/LevelLadder.tsx',
  'src/components/LevelHUD.tsx',
  'src/App.tsx', // mixed mobile/desktop shell — desktop workspace routes use unified template
  'src/components/TradingChart',
  'src/components/chart',
];

const violations = [];
const ARBITRARY_TAILWIND = /\b(?:bg|text|border|from|to|via|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/g;
const HEX_IN_CLASS = /className=["'`][^"'`]*#([0-9a-fA-F]{3,8})/g;
const FORBIDDEN_PATTERNS = [
  { re: /\bglass-[a-z0-9-]+\b/g, label: 'uncontrolled glass-* class' },
  { re: /\bglow-[a-z0-9-]+\b/g, label: 'uncontrolled glow-* class' },
  { re: /\bneon-[a-z0-9-]+\b/g, label: 'uncontrolled neon-* class' },
  { re: /\bapex-glow-/g, label: 'decorative apex-glow-* class' },
  { re: /\bzoom\s*:/g, label: 'CSS zoom' },
  { re: /transform\s*:\s*scale\s*\(/g, label: 'global transform scaling' },
];

function isAllowlisted(relPath) {
  return allowlistPaths.some((p) => relPath.replace(/\\/g, '/').startsWith(p.replace(/\\/g, '/')));
}

function collectFiles(target, acc = []) {
  const abs = join(root, target);
  if (!statSync(abs, { throwIfNoEntry: false })) return acc;
  const st = statSync(abs);
  if (st.isFile() && (abs.endsWith('.tsx') || abs.endsWith('.ts') || abs.endsWith('.css'))) {
    acc.push(abs);
    return acc;
  }
  if (st.isDirectory()) {
    for (const name of readdirSync(abs)) {
      if (name === 'node_modules') continue;
      collectFiles(join(target, name), acc);
    }
  }
  return acc;
}

function scanFile(file) {
  const rel = relative(root, file).replace(/\\/g, '/');
  if (isAllowlisted(rel)) return;
  const text = readFileSync(file, 'utf8');
  let m;
  ARBITRARY_TAILWIND.lastIndex = 0;
  while ((m = ARBITRARY_TAILWIND.exec(text))) {
    violations.push(`${rel}: arbitrary Tailwind color ${m[0]}`);
  }
  HEX_IN_CLASS.lastIndex = 0;
  while ((m = HEX_IN_CLASS.exec(text))) {
    violations.push(`${rel}: raw hex in className`);
  }
  for (const { re, label } of FORBIDDEN_PATTERNS) {
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      violations.push(`${rel}: ${label} (${m[0]})`);
    }
  }
}

const files = new Set();
for (const target of enforceRoots) {
  for (const f of collectFiles(target)) files.add(f);
}
for (const file of files) scanFile(file);

if (violations.length) {
  console.error('CSS enforcement gate failed:\n');
  for (const v of violations.slice(0, 50)) console.error(`  - ${v}`);
  if (violations.length > 50) console.error(`  ... and ${violations.length - 50} more`);
  process.exit(1);
}

console.log(`CSS enforcement gate passed (${files.size} desktop UI files scanned).`);
