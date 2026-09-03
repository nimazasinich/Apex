import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (name, condition) => checks.push({ name, ok: Boolean(condition) });

const general = read('src/components/workspace/GeneralViews.tsx');
const account = read('src/components/overview/OverviewAccountSummary.tsx');
const market = read('src/components/overview/OverviewMarketSummary.tsx');
const signals = read('src/components/overview/OverviewSignalsPanel.tsx');
const attention = read('src/components/overview/OverviewAttentionPanel.tsx');
const activity = read('src/components/overview/OverviewActivityPanel.tsx');
const providers = read('src/components/overview/OverviewProviderHealthPanel.tsx');
const execution = read('src/components/overview/OverviewExecutionSnapshotPanel.tsx');
const css = read('src/components/overview/OverviewWorkspace.css');
const proxy = read('src/services/proxyFetch.ts');
const marketRoutes = read('src/services/apexNextMarketRoutes.ts');
const academy = read('src/pages/academy/AcademyPage.tsx');
const analytics = read('src/pages/analytics/AnalyticsCommandPage.tsx');

check('overview has eight numbered reference panels',
  account.includes('>1</span>') && market.includes('>2</span>') && signals.includes('>3</span>') && general.includes('>4</span>') && attention.includes('>5</span>') && activity.includes('>6</span>') && providers.includes('>7</span>') && execution.includes('>8</span>'));
check('account summary includes allocation and health modules', account.includes('Asset Allocation') && account.includes('Account Health'));
check('market snapshot includes four-tile universe and selected market plot', market.includes('slice(0, 4)') && market.includes('MarketAreaPlot') && market.includes('Market Breadth (24h)'));
check('priority panel uses supplied clear-state artwork', attention.includes('/overview-action-clear.png') && fs.existsSync(path.join(root, 'public/overview-action-clear.png')));
check('activity keeps positions/orders/decisions/alerts tabs', activity.includes("['positions', 'Positions'") && activity.includes("['orders', 'Orders'") && activity.includes("['trades', 'Decisions'") && activity.includes("['activity', 'Alerts'"));
check('provider table keeps latency honest', providers.includes('row.latency') && providers.includes('Number.isFinite(latencyMs)') && !providers.includes('Math.random'));
check('execution snapshot is four metrics', execution.includes("label: 'Avg Latency'") && execution.includes("label: 'Fill Rate'") && execution.includes("label: 'Avg Slippage'") && execution.includes("label: 'Timeouts (1h)'"));
check('reference lower-grid proportions are locked', css.includes('grid-template-columns: 18fr 44fr 38fr'));
check('overview css has no font below 10px', !/font-size:\s*(?:[0-9](?:\.[0-9]+)?)px/.test(css));
check('smart proxy hardening preserved', proxy.includes('520, 521, 522, 523, 524') && proxy.includes('direct-first'));
check('market symbol 503 resilience preserved', marketRoutes.includes('buildDerivedTickerFromCandles') && marketRoutes.includes('bootstrapCandles'));
check('strategy academy reference refinement preserved', academy.includes('Strategy Comparison') && academy.includes('Research Drill-down:') && academy.includes('Smart Recommendations'));
check('analytics reference work preserved', analytics.includes('analytics-command-page') && analytics.includes('analytics-trend-icon') && analytics.includes('/analytics/trend-bullish.png'));

for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
const failed = checks.filter((item) => !item.ok);
if (failed.length) process.exit(1);
