import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const main = read('src/main.tsx');
const trading = read('src/components/workspace/AccountViews.tsx');
const tradingToolbox = read('src/components/workspace/TradingToolbox.tsx');
const toolboxDrawers = read('src/components/workspace/ToolboxDrawers.tsx');
const toolboxCss = read('src/styles/trading-toolbox-integration.css');
const css = read('src/styles/light-theme-workspace-refinement.css');
const pkg = JSON.parse(read('package.json'));
const yallistPath = path.join(root, 'vendor/yallist-3.1.1.tgz');
const yallistIntegrity = fs.existsSync(yallistPath) ? `sha512-${crypto.createHash('sha512').update(fs.readFileSync(yallistPath)).digest('base64')}` : '';
const lock = JSON.parse(read('package-lock.json'));

const checks = [
  ['refinement stylesheet loads before TradingWorkspace owner CSS', main.indexOf("import './styles/light-theme-workspace-refinement.css';") >= 0 && main.indexOf("import './components/trading/TradingWorkspace.css';") > main.indexOf("import './styles/light-theme-workspace-refinement.css';")],
  ['attached trading toolbox restored', trading.includes('<TradingToolbox') && tradingToolbox.includes('export function TradingToolbox')],
  ['trading toolbox exposes seven functional drawers', ['order', 'orders', 'positions', 'depth', 'trades', 'strategy', 'signals'].every((view) => tradingToolbox.includes(`key: '${view}'`))],
  ['trading subpanels relocated out of chart column', !trading.includes('apex-trading-activity-panel') && trading.includes('orders: <div className="apex-trading-subpanel-drawer"') && trading.includes('positions: <div className="apex-trading-subpanel-drawer"')],
  ['drawer shell is exported for toolbox reuse', toolboxDrawers.includes('export function DrawerShell')],
  ['trading toolbox layout contract exists', toolboxCss.includes('.apex-trading-terminal') && toolboxCss.includes('.apex-trading-cockpit')],
  ['light markets fit contract exists', css.includes('.apex-content:has(.apex-mkt2)')],
  ['light trading fit contract exists', css.includes('.apex-content:has(.apex-trading-terminal)')],
  ['orders and positions polish exists', css.includes('.v20-orders-page') && css.includes('.v20-positions-page')],
  ['settings polish exists', css.includes('.apex-v3-settings-page')],
  ['strategy clipping repair exists', css.includes('.apex-strategy-studio') && css.includes('overflow: auto !important')],
  ['package and lockfile versions are synchronized', pkg.version === lock.version && pkg.version === lock.packages?.['']?.version],
  ['untrusted executable excluded', !fs.existsSync(path.join(root, 'APEXProjectHub.exe'))],
  ['locked yallist tarball is bundled', fs.existsSync(yallistPath) && lock.packages?.['node_modules/yallist']?.resolved === 'file:vendor/yallist-3.1.1.tgz'],
  ['bundled yallist integrity matches lock', yallistIntegrity === lock.packages?.['node_modules/yallist']?.integrity],
];

let failed = 0;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
  if (!pass) failed += 1;
}

if (failed) {
  console.error(`\n${failed}/${checks.length} workspace light-polish checks failed.`);
  process.exit(1);
}
console.log(`\nWorkspace light-polish contract passed (${checks.length}/${checks.length}).`);
