#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

const app = read('src/App.tsx');
const main = read('src/main.tsx');
const shell = read('src/components/workspace/WorkspaceShell.tsx');
const css = read('src/index.css');
const shellCss = read('src/styles/workspace-shell.css');
const referenceCss = read('src/styles/reference-ui.css');
const portfolio = read('src/pages/portfolio/PortfolioPage.tsx');
const orders = read('src/pages/orders/OrdersPage.tsx');
const positions = read('src/pages/positions/PositionsPage.tsx');
const analytics = read('src/pages/analytics/AnalyticsPage.tsx');
const referenceUi = read('src/pages/referenceUi.tsx');
const backtestingCss = read('src/pages/backtesting/BacktestingPage.css');
const proxyFetch = read('src/services/proxyFetch.ts');
const pageCssFiles = [
  'src/pages/watchlist/WatchlistPage.css',
  'src/pages/alerts/AlertsPage.css',
  'src/pages/history/HistoryPage.css',
  'src/pages/settings/SettingsPage.css',
  'src/pages/help/HelpPage.css',
];
const pageCss = pageCssFiles.map(read).join('\n');

check('portfolio active route', app.includes("import { PortfolioPage }") && app.includes("case 'portfolio': content = <PortfolioPage"));
check('workspace shell stylesheet linked centrally', main.includes("import './styles/workspace-shell.css'") && !shell.includes('workspace-shell.css'));
check('old monolithic workspace stylesheet removed', !exists('src/styles/v3-workspace.css'));
check('page styles split into independent modules', pageCssFiles.every(exists) && [
  'WatchlistPage.css',
  'AlertsPage.css',
  'HistoryPage.css',
  'SettingsPage.css',
  'HelpPage.css',
].every((name) => read(`src/pages/${name.replace('Page.css', '').toLowerCase()}/${name.replace('.css', '.tsx')}`).includes(`./${name}`)));
check('workspace page classes styled', ['apex-page-frame','apex-v3-panel','apex-v3-table','apex-v3-metrics'].every((name) => shellCss.includes(`.${name}`)) && ['apex-v3-settings-main','apex-v3-help-main','apex-v3-history-main','apex-v3-alerts-main','apex-v3-watchlist-main'].every((name) => pageCss.includes(`.${name}`)));
check('backtesting controls collision free', backtestingCss.includes('grid-template-areas: "capital direction" "risk risk"') && backtestingCss.includes('.apex-bt-risk-profile-field { grid-area: risk; }'));
check('local proxy recovery enabled', proxyFetch.includes("process.env.PROXY_MODE || 'auto'") && proxyFetch.includes('APEX_AUTO_LOCAL_PROXY_PORT') && proxyFetch.includes('APEX_AUTO_LOCAL_PROXY_SCHEME') && proxyFetch.includes('socks5://127.0.0.1:${autoPort}'));
check('market provider budgets support local tunnels', read('src/services/marketDataService.ts').includes('MARKET_BULK_TIMEOUT_MS') && read('src/services/marketDataService.ts').includes('MARKET_CANDLE_TIMEOUT_MS'));
check('portfolio screenshot layout', portfolio.includes('v20-portfolio-page') && portfolio.includes('v20-metrics six') && portfolio.includes('Portfolio Performance') && portfolio.includes('Asset Allocation') && portfolio.includes('Account Health'));
check('orders screenshot layout', orders.includes('v20-orders-page') && orders.includes('Order Assistant') && orders.includes('v20-table-tabs') && orders.includes('v20-orders-table'));
check('positions screenshot layout', positions.includes('v20-positions-page') && positions.includes('Exposure by Asset') && positions.includes('Leverage Distribution') && positions.includes('Account Risk'));
check('analytics screenshot layout', analytics.includes('v20-analytics-page') && analytics.includes('Cumulative P&amp;L') && analytics.includes('Asset Allocation Performance') && analytics.includes('Monthly Performance') && analytics.includes('P&amp;L Heatmap') && analytics.includes('Strategy Insights') && analytics.includes('Risk Decomposition'));
check('shared UI primitives', referenceUi.includes('SoftMetric') && referenceUi.includes('Donut') && referenceUi.includes('LinePlot') && referenceUi.includes('HonestEmpty'));
check('real account contracts', [portfolio, orders, positions, analytics].every((source) => source.includes('insights')));
check('safe order actions preserved', orders.includes('cancelLiveOrder') && orders.includes('buildOrderDraftTransfer') && orders.includes('window.confirm'));
check('correlation preserved', analytics.includes('<CorrelationMatrix') && analytics.includes('correlationOpen'));
check('score honesty', analytics.includes('not a calibrated win probability'));
check('matching search copy', shell.includes('Search markets, symbols or contracts...'));
check('reference CSS module linked centrally', main.includes("import './styles/reference-ui.css'") && !referenceUi.includes('reference-ui.css') && ['v20-portfolio-page','v20-orders-page','v20-positions-page','v20-analytics-page','v20-correlation-dialog'].every((name) => referenceCss.includes(`.${name}`)));
check('index stylesheet reduced', css.split('\n').length < 8000 && !css.includes('.v20-reference-page'));
check('responsive reference CSS', referenceCss.includes('@media (max-width: 1180px)') && referenceCss.includes('@media (max-width: 760px)'));
check('canonical 1368 page contracts', [
  read('src/pages/watchlist/WatchlistPage.css'),
  read('src/pages/alerts/AlertsPage.css'),
  read('src/pages/history/HistoryPage.css'),
  read('src/pages/settings/SettingsPage.css'),
  read('src/pages/help/HelpPage.css'),
].every((source) => source.includes('1368') || source.includes('grid-template')));
check('no screenshot-as-background', !/background(?:-image)?\s*:\s*url\([^)]*(portfolio-reference|analytics-reference|positions-reference|orders-reference)/i.test(`${css}\n${referenceCss}\n${pageCss}`));
check('heavy reference attachments excluded', ['portfolio','analytics','positions','orders'].every((name) => !exists(`Doc/reference/v31-ui-targets/${name}-reference.png`)));

const failed = checks.filter((item) => !item.ok);
const report = { generatedAt: new Date().toISOString(), passed: checks.length - failed.length, failed: failed.length, checks };
fs.mkdirSync(path.join(root, 'QA'), { recursive: true });
fs.writeFileSync(path.join(root, 'QA/reference-ui-redesign-qa.json'), `${JSON.stringify(report, null, 2)}\n`);
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
if (failed.length) process.exit(1);
console.log(`\nReference UI redesign passed (${checks.length}/${checks.length}).`);
