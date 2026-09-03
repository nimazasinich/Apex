#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import { QA_SUITES } from './qaSuiteCatalog.mjs';
import { VERIFY_FAST_CHAIN } from '../gates/gateDependencyMap.mjs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const scripts = pkg.scripts ?? {};
const owners = new Map();
const problems = [];

for (const [suite, leaves] of Object.entries(QA_SUITES)) {
  if (!Array.isArray(leaves) || leaves.length === 0) problems.push(`empty_suite:${suite}`);
  for (const leaf of leaves) {
    if (!scripts[leaf]) problems.push(`missing_npm_script:${suite}:${leaf}`);
    const previous = owners.get(leaf);
    if (previous) problems.push(`duplicate_leaf_owner:${leaf}:${previous}:${suite}`);
    else owners.set(leaf, suite);
    if (leaf.startsWith('qa:suite:')) problems.push(`suite_recursion:${suite}:${leaf}`);
  }
}


const fastGates = new Set(VERIFY_FAST_CHAIN.map((entry) => entry.gate));
for (const [suite, leaves] of Object.entries(QA_SUITES)) {
  for (const leaf of leaves) {
    if (!fastGates.has(leaf)) problems.push(`verify_fast_missing_suite_leaf:${suite}:${leaf}`);
  }
}

for (const required of ['qa:live-data-truth', 'qa:attached-reference-pages', 'qa:research-agent', 'qa:function-usage-index', 'check:build-identity']) {
  if (!QA_SUITES['source-core']?.includes(required)) problems.push(`source_core_missing_required:${required}`);
}
for (const required of ['qa:unified-safety-runtime', 'qa:autopilot-lifecycle-environment', 'qa:autopilot-lifecycle-runtime']) {
  if (!QA_SUITES['runtime-safety']?.includes(required)) problems.push(`runtime_safety_missing_required:${required}`);
}

if (problems.length) {
  console.error(`FAIL QA suite catalog (${problems.length} problems)`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`PASS QA suite catalog: ${Object.keys(QA_SUITES).length} suites, ${owners.size} uniquely-owned checks.`);
