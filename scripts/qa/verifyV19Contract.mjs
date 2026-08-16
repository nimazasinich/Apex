import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const checks = [];
const expect = (name, condition, detail) => checks.push({ name, ok: Boolean(condition), detail });

const css = read('src/index.css');
const app = read('src/App.tsx');
const market = read('src/services/marketDataService.ts');
const routes = read('src/services/apexNextMarketRoutes.ts');
const server = read('server.ts');
const vite = read('vite.config.ts');
const capture = read('scripts/capture/capture-dashboard.mts');

expect('1368 viewport width', css.includes('--apex-sidebar-w: 184px') && css.includes('max-width: 1450px'), 'V19 desktop media contract');
expect('753 viewport height', css.includes('max-height: 820px') && css.includes('grid-template-rows: 58px'), '58px header inside the 753px frame');
expect('right context rail', css.includes('--apex-rail-w: 48px') && css.includes('--apex-drawer-w: 306px'), 'Right rail and drawer remain first-class layout columns');
expect('chart feed empty state', css.includes('.apex-chart-feed-state') && existsSync(resolve(root, 'src/components/PriceChart.tsx')), 'No synthetic chart is drawn when providers fail');
expect('KuCoin seconds granularity', market.includes("'1m': 60") && market.includes("'1h': 3600"), 'KuCoin futures kline granularity is seconds');
expect('request coalescing', market.includes('coalesceMarketRequest') && market.includes('masterLimit'), 'Concurrent initial routes share provider work');
expect('fast overview detail route', routes.includes('includeMicrostructure') && app.includes('includeMicrostructure=${page === \'trading\' ? \'1\' : \'0\'}'), 'Overview does not wait for trading-only microstructure');
expect('live API no-cache', server.includes("app.use('/api'") && server.includes('no-store, no-cache'), 'Empty API responses cannot be replayed by browser/proxy caches');
expect('standalone Vite API proxy', vite.includes("'/api'") && vite.includes('APEX_API_ORIGIN'), 'Direct Vite sessions can reach the backend when it is running on port 3000');
expect('capture default 1368x753', capture.includes("'VIEWPORT_WIDTH', 1368") && capture.includes("'VIEWPORT_HEIGHT', 753"), 'Visual QA uses the product viewport by default');

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name} — ${check.detail}`);
}
const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.error(`\n${failed.length} V19 contract check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} V19 contract checks passed.`);
