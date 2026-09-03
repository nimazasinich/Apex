#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const classified = new Set([
  '.agent-index', '.apex-data', '.claude', '.env.example', '.external-api-sources.config.example.json', '.gitattributes', '.github', '.gitignore',
  '.mcp-recovered', '.node-version', '.nvmrc', '.playwright-browsers', '.serena', 'apex-npm-tarballs.zip', 'CLAUDE.md', 'Doc', 'QA', 'README.md', 'README.txt', '_archive', '_qa', '_release', 'dist', 'index.html',
  'node_modules', 'openapi', 'package-lock.json', 'package.json', 'public', 'RUN-APEX.bat', 'scripts', 'server.ts', 'src', 'tests',
  'test-results', 'tools', 'tsconfig.json', 'tsconfig.ui02.json', 'vendor', 'VERSION', 'vite.config.ts',
  'APEX_V1_0_71_VERIFICATION.txt', 'APEX_v2_0_13_PATCH_NOTES.md', 'AUDIT_FIX_REPORT.md',
  'LITE_TRANSFER_MANIFEST.md', 'NEXT_AGENT_RULES.md', 'REMEDIATION_CHECKPOINTS.json', 'REMEDIATION_CHECKPOINTS.md',
  'evidence', 'APP_INDEX', '.apex-private-seed', 'HF2_BINANCE_PROXY_RECOVERY.md', 'HF2_BINANCE_PROXY_RECOVERY.patch',
  'APEX_ACADEMY_SYSTEM_UPGRADE_REPORT.md',
]);
// `.git` is version-control metadata, not a source artifact to classify. It is
// created by every clone and every `actions/checkout` run, so it is filtered out
// here rather than added to the classified source set.
const entries = readdirSync(root).sort().filter((entry) => entry !== '.git');
const unknown = entries.filter((entry) => !classified.has(entry));
const contract = readFileSync(resolve(root, 'Doc/repository/ROOT_CONTRACT.md'), 'utf8');
const errors = [];
if (unknown.length) errors.push(`unclassified_root_entries:${unknown.join(',')}`);
for (const required of ['README.txt', '.github/', '.claude/', '.nvmrc', '.node-version', 'openapi/', 'tools/', 'vendor/', '_archive/', 'QA/']) {
  if (!contract.includes(`\`${required}\``)) errors.push(`root_contract_missing:${required}`);
}
if (!contract.includes('file:vendor/*')) errors.push('root_contract_missing_vendor_lockfile_reason');
if (!contract.includes('separate build artifact')) errors.push('root_contract_missing_artifact_separation');
if (errors.length) {
  console.error('[root-contract] FAILED');
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}
console.log(`[root-contract] passed: ${entries.length} current root entries are explicitly classified.`);
