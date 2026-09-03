#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { QA_SUITES } from './qaSuiteCatalog.mjs';

const suite = process.argv[2];
if (suite === '--list' || suite === '-l') {
  for (const [name, scripts] of Object.entries(QA_SUITES)) {
    console.log(`${name} (${scripts.length})`);
    for (const script of scripts) console.log(`  - ${script}`);
  }
  process.exit(0);
}
if (!suite || !QA_SUITES[suite]) {
  console.error(`Usage: node scripts/qa/runQaSuite.mjs <${Object.keys(QA_SUITES).join('|')}>|--list`);
  process.exit(2);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const script of QA_SUITES[suite]) {
  console.log(`\n[qa-suite:${suite}] npm run ${script}`);
  // On Windows, spawning a .cmd file with shell:false throws EINVAL rather than
  // running it (a Node/Windows spawn limitation, not a script failure) — Windows
  // requires shell:true for .cmd/.bat executables. Other platforms are unaffected.
  const result = spawnSync(npm, ['run', script], { stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
  if (result.error) {
    console.error(`[qa-suite:${suite}] FAIL at ${script} spawn error: ${result.error.message}`);
    process.exit(1);
  }
  if ((result.status ?? 1) !== 0) {
    console.error(`[qa-suite:${suite}] FAIL at ${script} exit=${result.status}`);
    process.exit(result.status ?? 1);
  }
}
console.log(`\n[qa-suite:${suite}] PASS (${QA_SUITES[suite].length} checks)`);
