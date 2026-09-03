#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const lineCount = (file) => read(file).split(/\r?\n/).length;
const checks = [];
function check(name, pass, detail = '') {
  const item = { name, pass: Boolean(pass), detail };
  checks.push(item);
  console.log(`${item.pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const pkg = JSON.parse(read('package.json'));
const server = read('server.ts');
const security = read('src/services/serverSecurity.ts');
const account = read('src/components/workspace/AccountViews.tsx');
const priceChart = read('src/components/PriceChart.tsx');
const chartGeometry = read('src/components/priceChartGeometry.ts');
const workspaceContext = read('src/lib/workspaceContext.ts');
const toolbox = read('src/components/workspace/TradingToolbox.tsx');
const layoutPreference = read('src/lib/tradingLayoutPreference.ts');
const strategyPage = read('src/pages/strategies/StrategyPage.tsx');
const strategyWorkspace = read('src/pages/strategies/StrategyModelWorkspace.tsx');
const strategyCompare = read('src/pages/strategies/StrategyCompareDialog.tsx');
const strategyPresentation = read('src/pages/strategies/strategyPresentation.ts');
const strategyRegistry = read('src/services/strategyRegistry.ts');
const app = read('src/App.tsx');
const releaseScript = read('scripts/utilities/createReleaseArchive.mts');
const cleanup = read('scripts/qa/cleanupQaArtifacts.mts');
const qaRetentionPolicy = read('Doc/qa/QA_RETENTION_POLICY.md');
const v20Acceptance = read('Doc/qa/V20_VISUAL_ACCEPTANCE.md');
const ci = read('.github/workflows/ci.yml');
const nightly = read('.github/workflows/nightly.yml');

check('runtime engines support the executed and CI ranges', pkg.engines?.node === '>=22 <25' && pkg.engines?.npm === '>=10.9 <12' && pkg.devEngines?.runtime?.version === '>=22 <25' && pkg.packageManager === 'npm@10.9.2');
check('Stage SEC security policy is present', security.includes('export function buildSecurityHeaders') && security.includes('export function isComputeHeavyRoute') && security.includes('export class MutationRateLimiter'));
check('Stage SEC middleware is wired before route registration', server.indexOf('buildSecurityHeaders(req.path)') > 0 && server.indexOf('isComputeHeavyRoute(req.path)') > server.indexOf('buildSecurityHeaders(req.path)') && server.indexOf("registerApexNextMarketRoutes(app") > server.indexOf('isComputeHeavyRoute(req.path)'));
check('compute limiter returns Retry-After and is pruned', server.includes("res.setHeader('Retry-After'") && server.includes('computeRateLimiter.prune()'));
check('pre-existing hardening was preserved', server.includes('gracefulShutdown') && server.includes('writePrivateJsonFileSync') && security.includes('assertSafeOutboundUrlResolved'));
check('CI validates Node 22 and 24', /node-version:\s*\[22\.x,\s*24\.x\]/.test(ci) || (ci.includes('22.x') && ci.includes('24.x')));
check('nightly workflow remains present', nightly.includes('schedule:') && nightly.includes('cron:'));
check('release creation writes SHA-256 sidecar', releaseScript.includes("createHash('sha256')") && releaseScript.includes("`${archivePath}.sha256`") && releaseScript.includes('writeFileSync(sha256Path'));
check('Layers3 empty-state import is fixed', /import\s*\{[^}]*Layers3[^}]*\}\s*from\s*'lucide-react'/.test(account) && account.includes('<Layers3 size={18} />'));
check('QA cleanup implementation and capture imports are restored', cleanup.includes('export function runQaCleanup') && ['scripts/capture/captureEmptyStates.mts','scripts/capture/verifySplitDockHeaded.mts','scripts/capture/captureV3FinalAcceptance.mts'].every((file) => read(file).includes("../qa/cleanupQaArtifacts.mts")));
check('QA retention commands and policy are integrated', pkg.scripts?.['qa:cleanup'] === 'tsx scripts/qa/cleanupQaArtifacts.mts' && pkg.scripts?.['qa:cleanup:dry'] === 'tsx scripts/qa/cleanupQaArtifacts.mts --dry-run' && qaRetentionPolicy.includes('Never remove the previous accepted evidence') && qaRetentionPolicy.includes('refuses targets outside'));
check('V20 acceptance command and truthfulness contract are integrated', pkg.scripts?.['qa:v20-contract'] === 'node scripts/qa/verifyV20ReferenceContract.mjs' && v20Acceptance.includes('npm run qa:v20-contract') && v20Acceptance.includes('do not synthesize historical price paths') && v20Acceptance.includes('does not certify'));
check('function-index commands match the shipped utilities layout', pkg.scripts?.['index:functions:check'] === 'tsx scripts/utilities/generateFunctionIndex.mts --if-changed' && pkg.scripts?.['index:functions:query'] === 'tsx scripts/utilities/queryFunctionIndex.mts' && read('Doc/FUNCTION_INDEX_AUTOMATION.md').includes('scripts/utilities/devWithFunctionIndex.mts') && read('Doc/FUNCTION_INDEX_AUTOMATION.md').includes('scripts/utilities/subfinder/README.md'));

const backtestingFiles = [
  'BacktestAssumptionsPanel.tsx',
  'BacktestDataQualityPanel.tsx',
  'BacktestEquityPanel.tsx',
  'BacktestEvidenceTabs.tsx',
  'BacktestHistoryPanel.tsx',
  'BacktestMetricStrip.tsx',
  'BacktestRunBuilder.tsx',
  'BacktestRunHeader.tsx',
  'BacktestRuntimePanel.tsx',
  'BacktestTradesPanel.tsx',
];
const backtestingPage = read('src/pages/backtesting/BacktestingPage.tsx');
const backtestRunControl = read('src/pages/backtesting/backtestRunControl.ts');
const backtestMetrics = read('src/pages/backtesting/backtestMetrics.ts');
const backtestDerivedEvidence = read('src/pages/backtesting/useBacktestDerivedEvidence.ts');
const backtestingSourceGraph = [backtestingPage, ...backtestingFiles.map((file) => read(`src/pages/backtesting/${file}`))].join('\n');
check('Backtesting remains split into the ten approved components', backtestingFiles.every((file) => exists(`src/pages/backtesting/${file}`)) && backtestingFiles.every((file) => backtestingSourceGraph.includes(`./${file.replace('.tsx', '')}`) || backtestingPage.includes(file.replace('.tsx', ''))));
check('Backtesting coordinator remains bounded', lineCount('src/pages/backtesting/BacktestingPage.tsx') <= 750, `${lineCount('src/pages/backtesting/BacktestingPage.tsx')} lines`);
check('Backtesting owns and invalidates stale requests', backtestingPage.includes('LatestRequestGate') && backtestingPage.includes('Backtest cancelled because the run configuration changed') && backtestRunControl.includes('buildBacktestConfigKey') && backtestRunControl.includes('orderedParameters'));
check('Backtesting metric provenance is separated in code', backtestingPage.includes('useBacktestDerivedEvidence') && backtestDerivedEvidence.includes('deriveLocalBacktestSummary') && backtestMetrics.includes('never overwrite the') && backtestMetrics.includes('canonical metrics returned by the server') && read('src/pages/backtesting/BacktestMetricStrip.tsx').includes('Canonical server metrics') && read('src/pages/backtesting/BacktestMetricStrip.tsx').includes('Local display calculation'));
check('Backtest evidence is identity-bound before Trading reuse', workspaceContext.includes('matchesBacktestEvidence') && ['strategyId', 'symbol', 'direction', 'interval'].every((field) => workspaceContext.includes(`evidence.${field} === expected.${field}`)) && account.includes('matchesBacktestEvidence(systemContext, activeEvidenceIdentity)'));
check('PriceChart drawing coordinates follow observed width', priceChart.includes('calculatePriceChartGeometry(containerSize.width') && !priceChart.includes('const CHART_WIDTH = 960') && chartGeometry.includes('containerWidth'));
check('Trading facts and actions are explicit and truthful', account.includes('<InstrumentFacts') && account.includes('reviewOrderActionLabel') && account.includes('submitOrderActionLabel') && read('src/components/trading/instrumentPresentation.ts').includes('Market venue · unreported'));
check('active routes load the split Strategy and Backtesting pages', app.includes("./pages/strategies/StrategyPage") && app.includes("./pages/backtesting/BacktestingPage") && !app.includes("./pages/StrategyStudioPage"));
check('Strategy primary actions match the truthful reference contract', ['View Details','Send to Backtesting','Compare','Bookmark Strategy'].every((label) => strategyWorkspace.includes(label)) && !strategyWorkspace.includes('Save as Preset'));
check('Strategy Studio transfers rather than running a hidden backtest', strategyWorkspace.includes('Strategy Studio is research-only') && strategyWorkspace.includes('validation and execution evidence stay explicit in Backtesting') && strategyPage.includes("navigateWorkspace('backtesting')") && !strategyPage.includes('runBacktest') && !strategyPage.includes('/api/market/backtest'));
check('Strategy compare mode exposes Not comparable', strategyCompare.includes('Not comparable') && strategyCompare.includes('evidenceComparable'));
check('evidence labels are provenance-qualified', strategyPresentation.includes("return 'Verified'") && strategyPresentation.includes("return 'Evidence Pending'") && strategyPresentation.includes('hasBoundEvidence'));
check('known Fork B render crash is not present', !strategyPage.includes('statusLabel('));
check('misleading product terminology is absent from active Strategy source', !/AI-Assisted|APEX Score|Institutional-grade|Institutional grade/.test(`${strategyPage}\n${strategyWorkspace}\n${strategyCompare}\n${strategyPresentation}\n${strategyRegistry}`));
check('AI research work is explicitly evidence-gated', strategyRegistry.includes("categories: ['Core 10', 'AI Research'") && strategyRegistry.includes('independently bound verification evidence'));
check('Trading layout persistence is shared and validated', toolbox.includes('loadTradingLayoutPreference') && toolbox.includes('saveTradingLayoutPreference') && layoutPreference.includes('parseTradingLayoutPreference') && layoutPreference.includes('LEGACY_TRADING_DOCK_STORAGE_KEY'));
check('Trading preference tests are restored', exists('src/tests/tradingLayoutPreference.test.ts') && read('src/tests/tradingLayoutPreference.test.ts').includes('migrates the legacy dock boolean'));
check('replay arrays have explicit element types', read('src/services/directionDivergence.ts').includes('const ranges: number[] = []') && ['adaptiveTrendPortfolio','orbVwapBreakout','volatilitySqueezeExpansion','vwapPullbackReacceleration'].every((file) => read(`src/services/strategyEngine/${file}.ts`).includes('Array<ReturnType<typeof simulateBracketTrade>>')));

const failed = checks.filter((item) => !item.pass);
const report = {
  generatedAt: new Date().toISOString(),
  evidenceClass: 'source-contract',
  release: pkg.version,
  passed: checks.length - failed.length,
  total: checks.length,
  checks,
};
fs.mkdirSync(path.join(root, 'QA'), { recursive: true });
fs.writeFileSync(path.join(root, 'QA/merged-stage-sec-ui-contract.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failed.length) {
  console.error(`\n${failed.length}/${checks.length} merged Stage SEC/UI checks failed.`);
  process.exit(1);
}
console.log(`\nMerged Stage SEC/UI source contract passed (${checks.length}/${checks.length}).`);
