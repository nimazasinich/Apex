import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const checks = [];
const check = (name, condition, detail) => checks.push({ name, passed: Boolean(condition), detail });

const app = read('src/App.tsx');
const main = read('src/main.tsx');
const indexCss = read('src/index.css');
const backtest = read('src/pages/backtesting/BacktestingPage.tsx');
const backtestDerived = read('src/pages/backtesting/useBacktestDerivedEvidence.ts');
const backtestRunControl = read('src/pages/backtesting/backtestRunControl.ts');
const backtestAssumptions = read('src/pages/backtesting/BacktestAssumptionsPanel.tsx');
const strategy = read('src/pages/strategies/StrategyPage.tsx');
const trading = read('src/components/workspace/AccountViews.tsx');
const routes = read('src/services/apexNextMarketRoutes.ts');
const adapter = read('src/services/strategyEngine/scannerPresetAdapter.ts');
const vite = read('vite.config.ts');

check('route-level lazy loading', app.includes("lazy(() => import('./pages/backtesting/BacktestingPage')") && app.includes("lazy(() => import('./pages/strategies/StrategyPage')") && app.includes("lazy(() => import('./components/workspace/AccountViews')"), 'Trading, Backtesting, and Strategy are dynamic page chunks.');
check('Suspense fallback', app.includes('<Suspense fallback={<RouteSkeleton page={page} />}>') && app.includes("from './components/ui/RouteSkeleton'"), 'Lazy workspaces render the shared route-specific skeleton.');
check('page CSS not globally loaded', !main.includes('BacktestingPage.css') && !main.includes('StrategyPage.css'), 'Heavy page CSS is loaded with its page chunk.');
check('Tailwind source scope', indexCss.includes('@import \"tailwindcss\" source(\"./\");') && indexCss.indexOf('@import \"tailwindcss\" source(\"./\");') < indexCss.indexOf('@layer base'), 'Local font imports may precede Tailwind; Tailwind still scans src and loads before layers.');
check('chart vendor chunk', vite.includes("return 'vendor-charts'"), 'Recharts and D3 dependencies are isolated.');
check('cost model reaches API', backtestRunControl.includes('commissionPct: String(request.commissionPct)') && backtestRunControl.includes('slippagePct: String(request.slippagePct)') && backtestRunControl.includes('fundingPct: String(request.fundingPct)'), 'The shared request serializer sends all cost assumptions to the replay backend.');
check('no client double cost', backtestDerived.includes('trade.rMultiple * riskPct') && !backtestDerived.includes('rawReturnPct - roundTripCostPct') && backtestAssumptions.includes('Applied by engine'), 'Server-adjusted R-multiple is only capital-scaled in the UI and engine costs remain provenance-labelled.');
check('engine applies selected cost', routes.includes('transactionCostPct: roundTripCostPct') && adapter.includes('grossPnlPct - transactionCostPct'), 'Both bespoke and scanner-preset paths use the selected execution cost.');
check('audit contract', routes.includes("lookaheadPolicy: 'DISABLED'") && routes.includes('closedCandlesOnly: true') && routes.includes('configFingerprint'), 'Replay response exposes deterministic audit metadata.');
check('cross-page context', backtest.includes('writeWorkspaceContext') && strategy.includes('writeWorkspaceContext') && trading.includes('readWorkspaceContext'), 'Strategy, Backtesting, and Trading share one session context.');
check('strategy request aborts', strategy.includes('validationAbortRef.current?.abort()') && strategy.includes('signal: controller.signal') && !strategy.includes('/api/market/backtest?'), 'Changing Strategy configuration aborts stale validation work and backtests remain a routed hand-off.');
check('trading bridge', trading.includes('apex-trading-system-bridge') && trading.includes("navigateWorkspace('backtesting')"), 'Trading shows attached strategy and backtest evidence.');

const failed = checks.filter((item) => !item.passed);
for (const item of checks) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name} — ${item.detail}`);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exit(1);
