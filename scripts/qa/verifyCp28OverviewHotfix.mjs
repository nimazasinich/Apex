import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const status = read('src/components/overview/OverviewStatusCards.tsx');
const completionCss = read('src/components/overview/OverviewMockupCompletion.css');
const registry = read('src/services/strategyRegistry.ts');

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass: Boolean(pass), detail });

const domTokens = [
  'apex-overview-status-main',
  'apex-overview-status-chip',
  'apex-overview-status-meta',
  'apex-overview-status-bars',
  'status-${card.key}',
];
const cssTokens = [
  '.apex-overview-status-main',
  '.apex-overview-status-chip',
  '.apex-overview-status-meta',
  '.apex-overview-status-bars',
  '.apex-overview-status-card.status-trading',
  '.apex-overview-status-card.status-risk',
  '.apex-overview-status-card.status-providers',
  '.apex-overview-status-card.status-execution',
  '.apex-overview-status-card.status-freshness',
];
check('status-card DOM exposes every mockup-completion grid area', domTokens.every((token) => status.includes(token)));
check('mockup-completion CSS owns the same status-card contract', cssTokens.every((token) => completionCss.includes(token)));
check('retired incompatible status-card markup is absent', !status.includes('apex-overview-status-badge') && !status.includes('apex-overview-status-foot') && !status.includes('apex-overview-status-micro'));

const helperMatch = registry.match(/function scannerWeightParameter[\s\S]*?max:\s*([0-9.]+)/);
const maxAllowed = helperMatch ? Number(helperMatch[1]) : Number.NaN;
const defaults = [...registry.matchAll(/scannerWeightParameter\([^,]+,[^,]+,\s*([0-9.]+)/g)].map((match) => Number(match[1]));
const maxDefault = defaults.length ? Math.max(...defaults) : Number.NaN;
check('scanner-weight public range contains every declared default', Number.isFinite(maxAllowed) && Number.isFinite(maxDefault) && maxAllowed >= maxDefault, `max=${maxAllowed}; highest default=${maxDefault}`);
check('scanner-weight range accepts the validation identity regression value 2.9', Number.isFinite(maxAllowed) && maxAllowed >= 2.9, `max=${maxAllowed}`);

let failed = 0;
for (const row of checks) {
  console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.name}${row.detail ? ` — ${row.detail}` : ''}`);
  if (!row.pass) failed += 1;
}
if (failed) {
  console.error(`\nCP28 Overview hotfix verification failed (${failed}/${checks.length}).`);
  process.exit(1);
}
console.log(`\nCP28 Overview hotfix source verification passed (${checks.length}/${checks.length}).`);
