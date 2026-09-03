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
const shellCss = read('src/styles/workspace-shell.css');
const marketsCss = read('src/components/workspace/MarketsPage.css');
const marketsPage = read('src/components/workspace/MarketsPage.tsx');
const overviewStatus = read('src/components/overview/OverviewStatusCards.tsx');
const overviewProviders = read('src/components/overview/OverviewProviderHealthPanel.tsx');
const overviewMarket = read('src/components/overview/OverviewMarketSummary.tsx');
const overviewAccount = read('src/components/overview/OverviewAccountSummary.tsx');
const overviewSignals = read('src/components/overview/OverviewSignalsPanel.tsx');
const watchlist = read('src/pages/watchlist/WatchlistPage.tsx');
const overviewCss = read('src/components/overview/OverviewWorkspace.css');
const overviewCompletionCss = read('src/components/overview/OverviewMockupCompletion.css');
const generalViews = read('src/components/workspace/GeneralViews.tsx');
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
  ['desktop navigation rail stays scrollable but hides scrollbar chrome', shellCss.includes('overflow-y: auto !important') && shellCss.includes('scrollbar-width: none !important') && shellCss.includes('-ms-overflow-style: none !important') && shellCss.includes('.apex-nav::-webkit-scrollbar { display: none !important; }')],
  ['markets pagination owns row overflow without internal scrollbars', marketsCss.includes('.apex-mkt2-table-scroll { overflow: hidden !important') && marketsCss.includes('.apex-mkt2-sidebar { overflow: hidden !important') && css.includes('.apex-mkt2-table-scroll') && css.includes('overflow: hidden !important')],
  ['market range presentation is neutral rail plus explicit fill', marketsPage.includes('apex-mkt2-range-fill') && marketsCss.includes('background: #dfe7e3 !important') && !marketsCss.includes('.apex-mkt2-range-cell-track { position: relative; height: 4px; border-radius: 999px; background: linear-gradient')],
  ['market sentiment fallback provenance is transparent and compact', marketsCss.includes('.apex-mkt2-panel-provenance .apex-provenance-chip') && marketsCss.includes('background: transparent !important') && marketsCss.includes('.apex-mkt2-sentiment-card .apex-mkt2-panel-provenance .apex-provenance-source { display: none; }')],
  ['overview freshness distinguishes fallback from live', overviewStatus.includes("chartFeed.dataState === 'degraded'") && overviewStatus.includes("value: 'FALLBACK'") && overviewStatus.includes("chartFeed.dataState === 'live'")],
  ['overview provider status strip reports verified health counts without hardcoding', overviewStatus.includes('providerHealthCounts(diagnostics)') && overviewStatus.includes('`${healthy} / ${configured} OK`') && overviewStatus.includes("health.binanceStatus === 'live'") && overviewStatus.includes("health.kucoinStatus === 'live'") && !overviewStatus.includes("value: '7 / 8 OK'")],
  ['overview status-card DOM matches the mockup-completion grid contract', ['apex-overview-status-main', 'apex-overview-status-chip', 'apex-overview-status-meta', 'apex-overview-status-bars', 'status-${card.key}'].every((token) => overviewStatus.includes(token)) && ['.apex-overview-status-main', '.apex-overview-status-chip', '.apex-overview-status-meta', '.apex-overview-status-bars', '.apex-overview-status-card.status-trading'].every((token) => overviewCompletionCss.includes(token))],
  ['overview provider panel renders primary plus real supplemental diagnostics in the reference table', overviewProviders.includes("systemProvider('Binance'") && overviewProviders.includes("systemProvider('KuCoin'") && overviewProviders.includes('providers.map(supplementalProvider)') && overviewCss.includes('.apex-overview-provider-table') && generalViews.includes('health={diagnostics?.health.data ?? null}')],
  ['overview provider panel keeps all diagnostics accessible without an arbitrary source-count badge', !overviewProviders.includes('SOURCES</em>') && overviewProviders.includes('Provider / Data Health') && !overviewProviders.includes('slice(0, 6)') && overviewProviders.includes('tabIndex={0}') && overviewCss.includes('overflow: auto; scrollbar-gutter: stable')],
  ['overview provider rows keep current-state line semantics and only observed request latency', overviewProviders.includes('apex-overview-provider-current-line') && overviewProviders.includes('Number.isFinite(latencyMs)') && overviewProviders.includes('health?.binanceLatencyMs') && overviewProviders.includes('health?.kucoinLatencyMs') && !overviewProviders.includes('Math.random')],
  ['overview section chrome uses the supplied numbered reference hierarchy', overviewCss.includes('.apex-overview-section-num') && overviewAccount.includes('>1</span>') && overviewMarket.includes('>2</span>') && overviewSignals.includes('>3</span>') && generalViews.includes('>4</span>')],
  ['overview market summary reserves the reference tile/chart geometry and clips overlap safely', overviewCss.includes('grid-template-rows: 34px 82px minmax(0, 1fr) 48px auto auto') && overviewMarket.includes('MarketAreaPlot') && overviewCss.includes('.apex-overview-summary-focus') && overviewCss.includes('overflow: hidden')],
  ['overview sentiment fallback provenance remains inspectable without covering the reference layout', overviewMarket.includes('Sentiment input observability') && overviewMarket.includes('sentiment.inputs.map') && overviewCss.includes('.apex-overview-sentiment-inputs') && overviewCss.includes('position: absolute')],
  ['watchlist sentiment removes the grey remainder arc', shellCss.includes('.context-sentiment-card .apex-v3-donut') && shellCss.includes('transparent 0') && watchlist.includes('context-sentiment-card')],
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
