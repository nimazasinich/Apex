import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('src/pages/strategies/StrategyPage.tsx');
const library = read('src/pages/strategies/StrategyLibraryRail.tsx');
const workspace = read('src/pages/strategies/StrategyModelWorkspace.tsx');
const evidence = read('src/pages/strategies/StrategyEvidenceRail.tsx');
const stepper = read('src/pages/strategies/StrategyWorkflowStepper.tsx');
const css = read('src/pages/strategies/StrategyStudioReference.css');

const checks = [];
const check = (name, condition, detail = '') => checks.push({ name, pass: Boolean(condition), detail });

check('reference stylesheet is imported after legacy page styles', page.indexOf("import './StrategyPage.css';") >= 0 && page.indexOf("import './StrategyStudioReference.css';") > page.indexOf("import './StrategyPage.css';"));
check('three-column Strategy Studio remains in existing route', page.includes('<StrategyLibraryRail') && page.includes('strategy-center-column') && page.includes('<StrategyEvidenceRail'));
check('real workflow stepper is state-derived', page.includes('hasBoundEvidence(selected)') && page.includes("validationRunning") && stepper.includes("'discover'") && stepper.includes("'send-to-backtesting'"));
check('library keeps search filters bookmarks and selection', library.includes('type="search"') && library.includes('filters.status') && library.includes('filters.category') && library.includes('filters.dataTier') && library.includes('filters.direction') && library.includes('bookmarkedOnly') && library.includes('onSelect(strategy.strategyId)'));
check('library uses only local strategy artwork', (library.includes('/assets/strategies/strategy-card-') || library.includes('<StrategyArtwork')) && !/https?:\/\//.test(library));
check('configuration keeps real market timeframe direction handlers', workspace.includes('onSymbolChange(event.target.value)') && workspace.includes('onIntervalChange') && workspace.includes('<DirectionSelector'));
check('numeric parameters synchronize range and numeric input', workspace.includes('strategy-parameter-number') && workspace.includes('strategy-parameter-slider') && workspace.includes('onParameterChange(parameter.key, Number(event.target.value))'));
check('dynamic fusion is real-state driven', workspace.includes('compositeScoreLabel') && workspace.includes('fusionSnapshot.score') && workspace.includes('fusionSnapshot.completeness') && workspace.includes('fusionSnapshot?.confidence') && workspace.includes("fusionByKey.get('liquidity')"));
check('dynamic fusion auto-refresh is real', workspace.includes('window.setInterval(onRefreshFusion, 30_000)') && workspace.includes('checked={autoRefresh}'));
check('details compare bookmark send actions preserved', workspace.includes('onOpenDetails') && workspace.includes('onCompare') && workspace.includes('onBookmark') && workspace.includes('onSendToBacktesting'));
check('validation optimization and liquidity hunter actions preserved', evidence.includes('onRunValidation') && evidence.includes('onRunOptimization') && evidence.includes('onRunLiquidityHunter'));
check('evidence ready is conditional on bound server evidence', evidence.includes("{evidenceReady ? 'Evidence Ready'") && evidence.includes("const evidenceReady = bound && status === 'Verified'") && evidence.includes('hasBoundEvidence(strategy)'));
check('manual testnet confirmation safety preserved', evidence.includes('CONFIRM_LIQUIDITY_HUNTER_TESTNET') && evidence.includes('autonomousLiveExecutionEnabled'));
check('optimizer promotion and rollback controls preserved', evidence.includes('onPromoteOptimization') && evidence.includes('onRollbackOptimization') && evidence.includes('promotion.eligible'));
check('canonical validation metrics and provenance preserved', evidence.includes('snapshot.netReturnPct') && evidence.includes('snapshot.validationMethod') && evidence.includes('snapshot.runId'));
check('reference grid geometry uses approved side-rail widths', css.includes('Reference parity lock — supplied Strategy Studio image (1350×759 baseline)') && css.includes('grid-template-columns: 256px minmax(0, 1fr) 256px !important'));
check('desktop reference contract keeps dominant center workspace with non-compressed rails', css.includes('@media (min-width: 1280px) and (max-width: 1450px)') && css.includes('grid-template-columns: 256px minmax(0, 1fr) 256px !important'));
check('green-teal primary actions present', css.includes('linear-gradient(105deg,#0A95A8 0%,#079D8C 50%,#0B985F 100%)'));
check('slider active track follows reference gradient', css.includes('#16A05C') && css.includes('#0BA786') && css.includes('#0B9FAD'));

for (const asset of ['strategy-hero-isometric.svg','strategy-card-fusion.svg','strategy-card-trend.svg','strategy-card-funding.svg','strategy-card-breakout.svg','strategy-card-volatility.svg']) {
  check(`local asset ${asset}`, fs.existsSync(path.join(root, 'public/assets/strategies', asset)));
}

const failed = checks.filter((row) => !row.pass);
console.log(`Strategy Studio reference contract: ${checks.length - failed.length}/${checks.length} PASS`);
for (const row of checks) console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${row.name}${row.detail ? ` — ${row.detail}` : ''}`);

const out = { generatedAt: new Date().toISOString(), checks, passed: failed.length === 0 };
fs.writeFileSync(path.join(root, 'QA/strategy-studio-reference-contract.json'), JSON.stringify(out, null, 2));
if (failed.length) process.exit(1);
