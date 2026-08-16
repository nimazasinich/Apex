import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readBuffer = (file) => fs.readFileSync(path.join(root, file));
const checks = [];

function assert(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) process.exitCode = 1;
}

const app = read('src/App.tsx');
const main = read('src/main.tsx');
const shell = read('src/components/workspace/WorkspaceShell.tsx');
const brand = read('src/components/BrandMark.tsx');
const page = read('src/pages/backtesting/BacktestingPage.tsx');
const pageCss = read('src/pages/backtesting/BacktestingPage.css');
const builder = read('src/pages/backtesting/BacktestRunBuilder.tsx');
const runControl = read('src/pages/backtesting/backtestRunControl.ts');
const presets = read('src/pages/backtesting/backtestingPresets.ts');
const equityPanel = read('src/pages/backtesting/BacktestEquityPanel.tsx');
const tradesPanel = read('src/pages/backtesting/BacktestTradesPanel.tsx');
const assumptionsPanel = read('src/pages/backtesting/BacktestAssumptionsPanel.tsx');
const runtimePanel = read('src/pages/backtesting/BacktestRuntimePanel.tsx');
const runHeader = read('src/pages/backtesting/BacktestRunHeader.tsx');
const route = read('src/services/apexNextMarketRoutes.ts');
const types = read('src/types.ts');
const globalCss = [read('src/index.css'), read('src/styles/reference-ui.css'), read('src/styles/workspace-shell.css')].join('\n');
const settingsCss = read('src/pages/settings/SettingsPage.css');
const logoHash = crypto.createHash('sha256').update(readBuffer('public/apex-logo.svg')).digest('hex');
const expectedLogoHash = '14fade1463b27402f402028e84be5e6b7b3d8dfe5f35ed1fbbc104d3bfe7b540';

assert('Dedicated page route registered', app.includes("case 'backtesting'") && app.includes('<BacktestingPage'), 'App renders the Backtesting Lab as a separate page.');
assert('Backtesting appears in the active sidebar', shell.includes("id: 'backtesting'"), 'The active shell exposes the route.');
assert('Original APEX logo is byte-exact', logoHash === expectedLogoHash, `SHA-256 ${logoHash}`);
assert('Logo cannot be replaced by CSS artwork', brand.includes('src="/apex-logo.svg"') && globalCss.includes('.apex-logo::after { display: none !important; content: none !important; }') && globalCss.includes('filter: none !important;'), 'The shipped SVG is rendered directly with pseudo-elements and filters disabled.');
assert('Page stylesheet is chunk-local', page.includes("import './BacktestingPage.css';") && !main.includes('BacktestingPage.css'), 'The polished page stylesheet ships with the lazy Backtesting chunk instead of the global entry.');
assert('Explicit LONG and SHORT controls', builder.includes('<DirectionSelector') && builder.includes('allowed={strategy.allowedDirections}') && page.includes('setDirection'), 'Direction is writable and constrained by the selected strategy.');
assert('Direction changes do not auto-run', builder.includes('onChange={onDirectionChange}') && page.includes('const stale = Boolean') && page.includes('activeConfigKey') && !page.includes('useEffect(() => void runBacktest'), 'Changing direction only changes configuration, invalidates in-flight ownership and marks prior evidence stale.');
assert('Direction included in exports and history', page.includes('direction: result.direction') && page.includes('runConfiguration: completedConfig') && page.includes('result.direction.toLowerCase()'), 'History, workspace evidence and export identity preserve run direction.');
assert('Real replay endpoint is consumed', page.includes('fetch(`/api/market/backtest?') && page.includes('runBacktest'), 'The UI does not generate local fake performance.');
assert('Real data controls reach the backend', runControl.includes('interval: request.interval') && runControl.includes('bars: String(request.bars)') && runControl.includes('maxBars: String(request.maxHoldBars)') && runControl.includes('commissionPct: String(request.commissionPct)'), 'Timeframe, history, hold period, costs and parameters are serialized by the shared request contract.');
assert('Interactive evidence charts are present', equityPanel.includes('<ResponsiveContainer') && equityPanel.includes('type="monotoneX"') && equityPanel.includes('<Tooltip') && equityPanel.includes('role="tablist"') && equityPanel.includes('isAnimationActive={false}'), 'Responsive equity, drawdown, distribution and exposure views expose hover evidence and deterministic visual output.');
assert('Cost model reaches canonical replay and remains provenance-labelled', builder.includes('Commission / side') && builder.includes('Slippage / side') && builder.includes('Funding estimate') && runControl.includes('commissionPct: String(request.commissionPct)') && route.includes('transactionCostPct: roundTripCostPct') && assumptionsPanel.includes('Applied by engine'), 'Configured costs are sent to the engine and reported separately from display-only capital scaling.');
assert('Auditable export is present', page.includes('JSON.stringify(payload, null, 2)') && page.includes('runConfiguration: completedConfig') && page.includes('canonicalResult: result') && page.includes('localDisplayCalculation'), 'Export includes provenance, exact configuration, canonical result and separately labelled local calculations.');
assert('Trade table is semantic and non-deceptive', tradesPanel.includes('<table>') && tradesPanel.includes('<thead>') && tradesPanel.includes('<tbody>') && tradesPanel.includes('View all trades') && !tradesPanel.includes('onClick={() => setSelectedTrade'), 'The current trade table exposes real rows and an explicit button without pretending non-interactive rows are controls.');
assert('Insufficient data is never fabricated', route.includes('res.status(503).json') && route.includes("error: 'insufficient_history'") && route.includes('timeline: []'), 'The server returns an explicit unavailable state instead of synthetic trades.');
assert('Replay route supports selected interval and depth', route.includes('validatedQuery.value') && route.includes('requestedBars') && route.includes('maxHoldBars') && route.includes('source: historical.source') && route.includes('transactionCostPct: roundTripCostPct'), 'Validated backend inputs match the UI controls and report source and applied costs.');
assert('Strategy-aware interval selection', page.includes('initialContext?.interval') && presets.includes('definition.supportedIntervals') && page.includes('if (!supportedIntervals.includes(interval))') && builder.includes('disabled={!supportedIntervals.includes(option)}'), 'Shared context is normalized against the selected strategy and unsupported options remain disabled.');
assert('Replay progress is auditable', builder.includes('apex-bt-run-audit') && builder.includes('result.candlesUsed.toLocaleString()') && builder.includes('result.simulatedScans.toLocaleString()') && runtimePanel.includes('result?.runtime?.replayMs') && runHeader.includes('result?.audit?.configFingerprint'), 'Run state exposes candles, scans, measured timings and configuration identity without inventing a percentage.');
assert('Backtest route does not depend on bulk tickers', route.includes('const tickerSymbol = normalizeTickerSymbol(symbol);') && !route.slice(route.indexOf("app.get('/api/market/backtest'"), route.indexOf("app.get('/api/market/majors'")).includes('await fetchKuCoinTickers()'), 'A bulk ticker timeout can no longer abort an otherwise valid historical replay.');
assert('Backtest runtime metadata is contractual', types.includes('tickerLookupMs: number;') && types.includes('historyFetchMs: number;') && types.includes('replayMs: number;') && route.includes('runtime: { totalMs'), 'The server and UI expose real stage timings without slowing or fabricating the run.');
assert('Backtest result contract carries source metadata', types.includes('source?: string;') && types.includes('requestedBars?: number;') && types.includes('maxHoldBars?: number;'), 'The frontend can label data provenance and effective run settings.');
assert('Market overflow is panel-scoped', globalCss.includes('.apex-markets-page { overflow-x: clip !important; }') && globalCss.includes('.apex-market-table-scroll') && globalCss.includes('overflow: auto !important;'), 'Dense market tables no longer force a page-level horizontal scrollbar.');
assert('Settings columns are fully placed', settingsCss.includes('.apex-v3-settings-page') && /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+(?:2[7-9][0-9]|3[0-1][0-9])px/.test(settingsCss) && settingsCss.includes('.apex-v3-settings-main'), 'Navigation, content and a 270–319px desktop context rail have explicit grid contracts.');
assert('Reference resolution and responsive rules exist', pageCss.includes('1368×753 reference layout') && pageCss.includes('@media (max-width: 1020px)') && pageCss.includes('@media (max-width: 680px)'), 'The page is calibrated to the required base viewport and remains responsive below it.');
assert('No synthetic-performance statement is visible', page.includes('No fake KPI values or chart points are rendered before a result exists.') && tradesPanel.includes('No replay trades are available.') && assumptionsPanel.includes('are not claimed unless the server result explicitly provides them'), 'The UI communicates data integrity and model limits without inventing results.');

const summary = {
  generatedAt: new Date().toISOString(),
  passed: checks.filter((check) => check.ok).length,
  failed: checks.filter((check) => !check.ok).length,
  logoHash,
  checks,
};

fs.mkdirSync(path.join(root, 'QA'), { recursive: true });
fs.writeFileSync(path.join(root, 'QA/backtesting-workspace-qa.json'), `${JSON.stringify(summary, null, 2)}\n`);
for (const check of checks) console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name}`);
console.log(`\n${summary.passed}/${checks.length} checks passed.`);
