import fs from 'node:fs';
import path from 'node:path';
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
const account = read('src/components/workspace/AccountViews.tsx');
const toolbox = read('src/components/workspace/TradingToolbox.tsx');
const shell = read('src/components/workspace/WorkspaceShell.tsx');
const events = read('src/lib/tradingToolboxEvents.ts');
const css = read('src/styles/trading-drawer-docking.css');
const pkg = JSON.parse(read('package.json'));

const checks = [];
const check = (name, pass) => {
  checks.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
};

check('trading chart column contains no positions/orders/depth activity panel', !account.includes('apex-trading-activity-panel') && !account.includes("activityTab === 'orders'") && !account.includes("activityTab === 'positions'"));
check('orders drawer exists in toolbox', toolbox.includes("key: 'orders'") && account.includes('orders: <div className="apex-trading-subpanel-drawer"'));
check('positions drawer exists in toolbox', toolbox.includes("key: 'positions'") && account.includes('positions: <div className="apex-trading-subpanel-drawer"'));
check('strategy drawer remains available', toolbox.includes("key: 'strategy'") && account.includes('strategy: renderStrategyContextPanel()') && account.includes('<SystemLinkPanel context={systemLinkContext}'));
check('all trading tools use one shared request event', events.includes('TRADING_TOOLBOX_REQUEST_EVENT') && toolbox.includes('TRADING_TOOLBOX_REQUEST_EVENT'));
check('top-level management routes and explicit toolbox requests coexist', shell.includes("{ id: 'orders', label: 'Orders'") && shell.includes("{ id: 'positions', label: 'Positions'") && shell.includes("{ id: 'strategies', label: 'Strategies'") && events.includes('export function requestTradingTool') && toolbox.includes('TRADING_TOOLBOX_REQUEST_EVENT'));
check('open drawers use a dedicated adjacent grid column', css.includes('.apex-trading-terminal.tool-open') && css.includes('calc(var(--apex-trading-drawer-w) + var(--apex-trading-rail-w))'));
check('undocked drawer is not absolutely positioned over chart', !css.includes('.apex-trading-toolbox.open.undocked .apex-drawer {\n  position: absolute'));
check('cockpit keeps chart, ticket, and depth visible together', account.includes('apex-trading-chart-column') && account.includes('apex-trading-order-column') && account.includes('apex-trading-market-column') && css.includes('.apex-trading-cockpit'));
check('rail is compact enough for seven tools', css.includes('height: 68px !important') && css.includes('gap: 6px !important'));
check('release version preserves or advances the v1.0.47 submenu baseline', versionAtLeast(pkg.version, '1.0.47'));

const failed = checks.filter((item) => !item.pass);
fs.mkdirSync(path.join(root, 'QA'), { recursive: true });
fs.writeFileSync(path.join(root, `QA/trading-submenu-relocation-v${packageVersion}.json`), `${JSON.stringify({ generatedAt: new Date().toISOString(), passed: checks.length - failed.length, total: checks.length, checks }, null, 2)}\n`);

if (failed.length) {
  console.error(`\n${failed.length}/${checks.length} trading submenu relocation checks failed.`);
  process.exit(1);
}
console.log(`\nTrading submenu relocation passed (${checks.length}/${checks.length}).`);
