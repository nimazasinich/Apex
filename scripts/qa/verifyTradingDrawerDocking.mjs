import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const account = read('src/components/workspace/AccountViews.tsx');
const toolbox = read('src/components/workspace/TradingToolbox.tsx');
const drawers = read('src/components/workspace/ToolboxDrawers.tsx');
const css = read('src/components/trading/TradingWorkspace.css');
const preference = read('src/lib/tradingLayoutPreference.ts');
const pkg = JSON.parse(read('package.json'));
const sw = read('public/sw.js');

const checks = [];
const check = (name, pass) => {
  checks.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
};

check('instrument facts restored above the trading work area', account.includes('<InstrumentFacts') && css.includes('.apex-instrument-facts'));
check('reference order column is visible beside the chart', account.includes('apex-trading-order-column'));
check('one complete order ticket definition is reused by cockpit and drawer', account.includes('const orderTicket = (') && account.includes('{orderTicket}') && account.match(/<OrderTicketPanel/g)?.length === 1);
check('real compact depth is mounted beside the chart', account.includes('apex-trading-market-column') && account.includes('{depthPanel}') && account.includes('orderBook={chartOrderBook}') && account.includes('levels={chartOrderBookLevels}'));
check('decorative fixed depth ladder is retired', !account.includes('[.96,.78,.62,.48,.31]') && account.includes('book?.bids'));
check('all seven trading toolbox tools retained', ['order', 'orders', 'positions', 'depth', 'trades', 'strategy', 'signals'].every((key) => toolbox.includes(`key: '${key}'`)));
check('versioned layout preference supports validated migration and pinning', preference.includes('interface TradingLayoutPreferenceV2') && preference.includes('LEGACY_TRADING_DOCK_STORAGE_KEY') && toolbox.includes('pinnedTools'));
check('ticket and depth remain visible while toolbox can open expanded views', account.includes('inlineTools={[]}') && account.includes('order: <div className="apex-trading-order-drawer-stack">{orderTicket}{riskPanel}</div>') && account.includes('depth: <MarketDepthPanel') && toolbox.includes('isInlineExpansion'));
check('desktop layout preserves chart-first ticket-depth proportions', css.includes('grid-template-columns: minmax(0, 1fr) 240px 235px !important') && css.includes('grid-template-columns: minmax(0,1fr) 292px 278px !important'));
check('compact layout keeps responsive drawer behavior', toolbox.includes("requestedMode === 'compact-drawers'") && css.includes('@container trading-workspace') && css.includes('.apex-trading-modern .apex-drawer'));
check('positions orders and trades remain visible without a toolbox click', account.includes('TradingActivityPanel') && account.includes("{ id: 'positions' as const") && account.includes("{ id: 'orders' as const") && account.includes("{ id: 'trades' as const") && account.includes('<Tabs label="Trading account activity"'));
check('shared drawer shell still exposes accessible pin state', drawers.includes('aria-pressed={Boolean(docked)}'));
check('release identity remains aligned with versioned service-worker updates', sw.includes(`const APP_VERSION = '${pkg.version}'`) && sw.includes('const CACHE_NAME = `apex-shell-v${APP_VERSION}-${BUILD_HASH}`'));

const failed = checks.filter((item) => !item.pass);
fs.mkdirSync(path.join(root, 'QA'), { recursive: true });
fs.writeFileSync(path.join(root, `QA/trading-drawer-docking-v${packageVersion}.json`), `${JSON.stringify({ generatedAt: new Date().toISOString(), evidenceClass: 'source-contract', passed: checks.length - failed.length, total: checks.length, checks }, null, 2)}\n`);

if (failed.length) {
  console.error(`\n${failed.length}/${checks.length} reference trading source-contract checks failed.`);
  process.exit(1);
}
console.log(`\nReference trading source-contract passed (${checks.length}/${checks.length}).`);
