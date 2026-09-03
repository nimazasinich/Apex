import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const app = read('src/App.tsx');
const academy = read('src/pages/academy/AcademyPage.tsx');
const routes = read('src/services/apexNextMarketRoutes.ts');
const account = read('src/services/connectedExchange.ts');
const accountTypes = read('src/services/accountTypes.ts');
const accountStatus = read('src/lib/accountSnapshotStatus.ts');
const portfolio = read('src/pages/portfolio/PortfolioPage.tsx');
const strategyPage = read('src/pages/strategies/StrategyPage.tsx');
const replayPanel = read('src/pages/backtesting/LiquidityHunterReplayPanel.tsx');
const settingsPage = read('src/pages/settings/SettingsPage.tsx');
const intelligencePanel = read('src/components/IntelligenceSourcesSettingsPanel.tsx');

const checks = [];
function check(name, ok) {
  checks.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}

check('Analytics participates in selected-market detail loading', app.includes("page !== 'analytics'"));
check('Overview and Analytics share non-microstructure last-good detail cache', app.includes("includeMicrostructure ? 'micro' : 'base'"));
check('Account refresh re-probes connection after failed bootstrap', app.includes('Re-probe connection state here') && app.includes("getConnection({ signal: AbortSignal.timeout(8_000) })"));
check('Account recovery polling remains active while disconnected', app.includes("accountIsAvailable(connection) ? 8_000 : 12_000"));
check('Academy endpoints fail independently', academy.includes('Promise.allSettled([') && !academy.includes('void Promise.all(['));
check('Ticker universe has bounded last-verified fallback', routes.includes('LAST_VERIFIED_TICKER_MAX_AGE_MS') && routes.includes('staleVerifiedTickerUniverse'));
check('Candidate route has bounded last-verified fallback', routes.includes('lastVerifiedResponseKey') && routes.includes('ticker_universe_temporarily_unavailable'));
check('Symbol detail early failures flow through stale-if-error cache', routes.includes('throw new Error(`verified_ticker_unavailable:') && routes.includes('staleFallback: true'));
check('Live account secondary reads are isolated', account.includes('Promise.allSettled(requests)') && account.includes("quality: { state: failures.length ? 'partial' : 'complete', failures }"));
check('Account snapshot contract exposes partial quality', accountTypes.includes("state: 'complete' | 'partial'"));
check('Partial account snapshots are visibly degraded without hiding rows', accountStatus.includes("state: 'partial'") && accountStatus.includes("label: 'Partial snapshot'"));
check('Portfolio no longer synthesizes equity or KPI sparklines', !portfolio.includes('DEMO_EQUITY_TRACE') && !portfolio.includes('METRIC_CHARTS'));
check('Strategy ancillary reads are timeout-bound and isolated', strategyPage.includes("fetchJsonWithTimeout<{ governance?: unknown }>('/api/liquidity-hunter/edge-thresholds'") && strategyPage.includes('Promise.allSettled(['));
check('Backtesting replay evidence survives one failed ancillary endpoint', replayPanel.includes('Promise.allSettled([') && replayPanel.includes('Partial replay evidence'));
check('Settings security bootstrap cannot hang the page indefinitely', settingsPage.includes("fetchJsonWithTimeout<Record<string, unknown>>('/api/security/bootstrap'"));
check('Intelligence feed health is timeout-bound', intelligencePanel.includes("fetchJsonWithTimeout<FeedHealth>('/api/intelligence/feeds'"));

const failed = checks.filter((row) => !row.ok);
if (failed.length) {
  console.error(`\nDataflow hardening failed (${failed.length}/${checks.length}).`);
  process.exit(1);
}
console.log(`\nDataflow hardening passed (${checks.length}/${checks.length}).`);
