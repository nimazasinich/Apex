#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const root = process.cwd();
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const versionAtLeast = (actual, minimum) => {
  const a = String(actual).split('.').map(Number);
  const b = String(minimum).split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const av = Number.isFinite(a[i]) ? a[i] : 0;
    const bv = Number.isFinite(b[i]) ? b[i] : 0;
    if (av !== bv) return av > bv;
  }
  return true;
};
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

const accountViews = read('src/components/workspace/AccountViews.tsx');
const toolbox = read('src/components/workspace/TradingToolbox.tsx');
const drawers = read('src/components/workspace/ToolboxDrawers.tsx');
const strategyCss = read('src/pages/strategies/StrategyPage.css');
const main = read('src/main.tsx');
const lock = JSON.parse(read('package-lock.json'));
const pkg = JSON.parse(read('package.json'));
const tarPath = path.join(root, 'vendor/yallist-3.1.1.tgz');
const tarIntegrity = exists('vendor/yallist-3.1.1.tgz')
  ? `sha512-${crypto.createHash('sha512').update(fs.readFileSync(tarPath)).digest('base64')}`
  : '';

check('attached trading toolbox file merged', exists('src/components/workspace/TradingToolbox.tsx'));
check('toolbox imported by active trading page', accountViews.includes("from './TradingToolbox'") && accountViews.includes('<TradingToolbox'));
check('all attached toolbox drawers preserved plus Order', ['order', 'orders', 'positions', 'depth', 'trades', 'strategy', 'signals'].every((key) => toolbox.includes(`key: '${key}'`)));
check('drawer shell reusable export preserved', drawers.includes('export function DrawerShell'));
check('trading activity and reference cockpit execution content preserved', accountViews.includes('TradingActivityPanel') && accountViews.includes('orders: <div className="apex-trading-subpanel-drawer"') && accountViews.includes('positions: <div className="apex-trading-subpanel-drawer"') && accountViews.includes('apex-trading-order-column') && accountViews.includes('apex-trading-market-column') && accountViews.includes('<MarketDepthPanel'));
check('responsive strategy clipping fix preserved', strategyCss.includes('.strategy-studio { display: block; height: auto; min-height: 100%; overflow: visible; }') && strategyCss.includes('.strategy-evidence-rail { margin-bottom: 10px; min-height: 0; overflow: visible; }'));
check('reproducible locked tarball restored', exists('vendor/yallist-3.1.1.tgz') && lock.packages?.['node_modules/yallist']?.resolved === 'file:vendor/yallist-3.1.1.tgz');
check('locked tarball integrity verified', tarIntegrity === lock.packages?.['node_modules/yallist']?.integrity);
check('dead monolithic ReferenceViews excluded', !exists('src/components/workspace/ReferenceViews.tsx'));
check('dead workspace client excluded', !exists('src/services/workspaceClient.ts'));
check('duplicate nested strategy stylesheet excluded', !exists('src/pages/pages/strategies/StrategyPage.css'));
check('opaque attached executable excluded', !exists('APEXProjectHub.exe'));
check('current light hardening retained', main.includes("import './styles/light-theme-hardening.css';") && main.includes("import './styles/light-theme-workspace-refinement.css';"));
check('trading workspace stylesheet loaded once from the entry point', main.includes("import './components/trading/TradingWorkspace.css';") && !accountViews.includes('TradingWorkspace.css'));
check('release identity preserves or advances the audited v1.0.47 baseline', versionAtLeast(pkg.version, '1.0.47'));

let failed = 0;
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
  if (!item.ok) failed += 1;
}

const report = {
  generatedAt: new Date().toISOString(),
  baselineAttachment: 'APEX-complete-ui-safe-merge-v1.0.40',
  mergedRelease: pkg.version,
  checks,
  passed: failed === 0,
};
fs.mkdirSync(path.join(root, 'QA'), { recursive: true });
fs.writeFileSync(path.join(root, `QA/attached-feature-parity-v${packageVersion}.json`), `${JSON.stringify(report, null, 2)}\n`);

if (failed) {
  console.error(`\n${failed}/${checks.length} attached-feature parity checks failed.`);
  process.exit(1);
}
console.log(`\nAttached-feature parity passed (${checks.length}/${checks.length}).`);
