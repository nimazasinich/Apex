import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const indexCss = read('src/index.css');
const main = read('src/main.tsx');
const tradingCss = read('src/components/trading/TradingWorkspace.css');
const lightCss = read('src/styles/light-theme-workspace-refinement.css');
const layoutPreference = read('src/lib/tradingLayoutPreference.ts');
const toolbox = read('src/components/workspace/TradingToolbox.tsx');
const drawers = read('src/components/workspace/ToolboxDrawers.tsx');
const account = read('src/components/workspace/AccountViews.tsx');
const general = read('src/components/workspace/GeneralViews.tsx');
const watchlist = read('src/pages/watchlist/WatchlistPage.tsx');
const overviewCss = read('src/components/overview/OverviewWorkspace.css');
const strategy = read('src/pages/strategies/StrategyPage.tsx');
const backtesting = read('src/pages/backtesting/BacktestingPage.tsx');
const backtestDerivedEvidence = read('src/pages/backtesting/useBacktestDerivedEvidence.ts');
const marketRoutes = read('src/services/apexNextMarketRoutes.ts');
const pkg = JSON.parse(read('package.json'));
const sw = read('public/sw.js');
const sparkline = read('src/lib/sparkline.ts');

const checks = [];
const check = (name, pass, detail = '') => {
  const item = { name, pass: Boolean(pass), detail };
  checks.push(item);
  console.log(`${item.pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

check('live index contains shared drawer action layout', indexCss.includes('.apex-drawer-head-actions') && indexCss.includes('margin-left: auto'));
check('live index contains base dock button states', indexCss.includes('.apex-drawer-dock[aria-pressed="true"]'));
check('stale legacy compatibility stylesheet removed', !exists('src/styles/legacy-compat.css'));
check('legacy stylesheet is not imported', !main.includes('legacy-compat.css'));
check('reference trading layout keeps chart, ticket, and depth as explicit cockpit columns', account.includes('apex-trading-chart-column') && account.includes('apex-trading-order-column') && account.includes('apex-trading-market-column') && tradingCss.includes('grid-template-columns: minmax(0, 1fr) 240px 235px !important'));
check('light theme no longer reserves removed fixed order column', !lightCss.includes('grid-template-columns: minmax(0, 1fr) 300px'));
check('instrument facts are restored through the Stage UI component', account.includes('<InstrumentFacts') && tradingCss.includes('.apex-instrument-facts'));
check('Stage UI stylesheet has one deterministic owner', main.includes("import './components/trading/TradingWorkspace.css'") && tradingCss.includes('.apex-trading-terminal.apex-trading-modern'));
check('toolbox retains all seven functional drawers', ['order', 'orders', 'positions', 'depth', 'trades', 'strategy', 'signals'].every((key) => toolbox.includes(`key: '${key}'`)));
check('versioned layout preference persists safely', toolbox.includes('saveTradingLayoutPreference') && layoutPreference.includes('TRADING_LAYOUT_STORAGE_KEY') && layoutPreference.includes('executionDockWidthPx'));
check('shared drawer shell exposes accessible dock state', drawers.includes('aria-pressed={Boolean(docked)}') && drawers.includes('apex-drawer-head-actions'));
check('one order ticket definition is reused by the visible cockpit and toolbox drawer', account.includes('const orderTicket = (') && account.includes('<div className="apex-trading-order-column">') && account.includes('order: <div className="apex-trading-order-drawer-stack">{orderTicket}{riskPanel}</div>') && account.match(/<OrderTicketPanel/g)?.length === 1);
check('market mini charts use only provider-supplied observations where mini charts are rendered', !sparkline.includes('generate1hSparkline') && general.includes('getTickerSparkline(ticker)') && drawers.includes('getTickerSparkline(ticker)') && watchlist.includes('getTickerSparkline(ticker)') && watchlist.includes('getTickerSparkline(selected)') && !account.includes('<MiniSparkline'));
check('new Stage UI route styles keep text at ten pixels or larger', !/font-size:\s*(?:[0-9](?:\.[0-9]+)?)px/.test(`${overviewCss}\n${tradingCss}`));
check('overview is isolated from the retired toolbox geometry', general.includes('className="apex-overview-v2"') && !general.includes('<OverviewToolbox') && overviewCss.includes('.apex-overview-v2'));
check('production strategy integration retained', strategy.includes('/api/strategies/') || strategy.includes('validateStrategy'));
check('production backtesting UI retained', backtesting.includes('diagnostics') && backtestDerivedEvidence.includes('marketCurve'));
check('production backtest route retained', marketRoutes.includes('diagnostics') && marketRoutes.includes('costModel'));
check('release identity and versioned service-worker updates remain aligned', sw.includes(`const APP_VERSION = '${pkg.version}'`) && sw.includes('const CACHE_NAME = `apex-shell-v${APP_VERSION}-${BUILD_HASH}`') && sw.includes('APEX_ACTIVATE_UPDATE'));

const failed = checks.filter((item) => !item.pass);
const report = {
  generatedAt: new Date().toISOString(),
  version: pkg.version,
  passed: checks.length - failed.length,
  total: checks.length,
  checks,
};
fs.mkdirSync(path.join(root, 'QA'), { recursive: true });
fs.writeFileSync(path.join(root, `QA/agent-safe-merge-v${packageVersion}.json`), `${JSON.stringify(report, null, 2)}\n`);

if (failed.length) {
  console.error(`\n${failed.length}/${checks.length} agent safe-merge checks failed.`);
  process.exit(1);
}
console.log(`\nAgent safe merge passed (${checks.length}/${checks.length}).`);
