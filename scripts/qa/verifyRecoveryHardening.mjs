import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const checks = [];

function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail });
}

const routes = read('src/services/apexNextMarketRoutes.ts');
const market = read('src/services/marketDataService.ts');
const proxy = read('src/services/proxyFetch.ts');
const main = read('src/main.tsx');
const recovery = read('src/styles/page-recovery.css');
const providerPanel = read('src/components/overview/OverviewProviderHealthPanel.tsx');
const providerCards = read('src/components/overview/OverviewStatusCards.tsx');
const attention = read('src/components/overview/OverviewAttentionPanel.tsx');

check('Independent provider probes are implemented', market.includes('probePrimaryProviderHealth') && market.includes('binance:health_ping') && market.includes('kucoin:health_timestamp'));
check('System health uses independent probes', routes.includes('marketDataService.probePrimaryProviderHealth()') && !routes.includes("market.source === 'kucoin' ? 'live'"));
check('Provider latency is surfaced', providerPanel.includes('row.latency') && providerPanel.includes('binanceLatencyMs'));
check('Provider summary counts primary and supplemental sources', providerCards.includes('providerHealthCounts') && providerCards.includes("providers.set('binance'"));
check('Smart DNS is wired to the direct dispatcher', proxy.includes('lookup: directDnsLookup') && proxy.includes("APEX_SMART_DNS || 'auto'"));
check('Proxy discovery remains direct-first', proxy.includes("return ['direct', ...proxies]") && proxy.includes('SMART_FALLBACK_ROUTES'));
check('Recovery CSS is loaded last', main.lastIndexOf("./styles/page-recovery.css") > main.lastIndexOf('./components/trading/TradingWorkspace.css'));
check('Orders have one named-grid recovery contract', recovery.includes('grid-template-areas: "hero" "kpis" "table"') && recovery.includes('.v20-orders-table'));
check('Screener rows and rails are contained', recovery.includes('flex-wrap: nowrap !important') && recovery.includes('overflow-x: hidden !important'));
check('Exact overview calm-state asset is used semantically', attention.includes('/overview-action-clear.png') && attention.includes('All systems operational'));
check('Supplied calm-state asset exists', exists('public/overview-action-clear.png'));
check('Supplied portfolio asset exists', exists('public/portfolio/holdings-wallet-reference.png'));
check('Attached page references are preserved', exists('Doc/reference/attached/overview-target.png') && exists('Doc/reference/attached/orders-issue.png') && exists('Doc/reference/attached/screener-issue.png'));

for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
}

const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} recovery checks passed.`);
if (failed.length) process.exitCode = 1;
