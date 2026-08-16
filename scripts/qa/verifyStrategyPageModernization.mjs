#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('src/pages/strategies/StrategyPage.tsx');
const library = read('src/pages/strategies/StrategyLibraryRail.tsx');
const workspace = read('src/pages/strategies/StrategyModelWorkspace.tsx');
const evidence = read('src/pages/strategies/StrategyEvidenceRail.tsx');
const stepper = read('src/pages/strategies/StrategyWorkflowStepper.tsx');
const compare = read('src/pages/strategies/StrategyCompareDialog.tsx');
const detail = read('src/pages/strategies/StrategyDetailPage.tsx');
const css = read('src/pages/strategies/StrategyStudioReference.css');

const checks = [];
const check = (name, condition, detail = '') => checks.push({ name, pass: Boolean(condition), detail });

check('strategy scope stays inside existing route', page.includes('<StrategyLibraryRail') && page.includes('<StrategyModelWorkspace') && page.includes('<StrategyEvidenceRail') && !page.includes('navigateWorkspace(\'overview\')'));
check('Card/List view mode type exists', library.includes("export type StrategyLibraryViewMode = 'cards' | 'list'"));
check('view mode preference persists in localStorage', page.includes('apex:strategy-library-view-mode:v1') && page.includes('readStrategyLibraryViewMode') && page.includes('writeStrategyLibraryViewMode'));
check('view toggle is semantic and accessible', library.includes('aria-label="Strategy library display mode"') && library.includes('aria-pressed={viewMode === \'cards\'}') && library.includes('aria-pressed={viewMode === \'list\'}'));
check('card view and list row view render different structures', library.includes('strategy-library-card') && library.includes('strategy-library-row') && library.includes("return viewMode === 'cards'"));
check('library preserves search filters bookmark-only clear and selection', library.includes('type="search"') && library.includes('filters.status') && library.includes('filters.category') && library.includes('filters.bookmarkedOnly') && library.includes('onSelect(strategy.strategyId)'));
check('library bookmark toggle is a real handler', library.includes('onToggleBookmark(strategy.strategyId)') && page.includes('const toggleBookmark = (strategyId: string = selected.strategyId)'));
check('workflow stepper exposes real state labels', stepper.includes("type StepState") && stepper.includes('validationRunning') && stepper.includes('evidenceReady') && stepper.includes('blocked') && stepper.includes('aria-label={`${item.label}. ${stateLabel(stepState)}'));
check('configuration context handlers preserved', workspace.includes('onSymbolChange(event.target.value)') && workspace.includes('onIntervalChange') && workspace.includes('<DirectionSelector'));
check('parameter numeric and slider synchronization preserved', workspace.includes('strategy-parameter-number') && workspace.includes('strategy-parameter-slider') && workspace.includes('onParameterChange(parameter.key, Number(event.target.value))'));
check('changed parameter state and reset defaults added', workspace.includes('changedParameterKeys') && workspace.includes('Reset defaults') && workspace.includes('Default ${parameter.default}'));
check('primary action and safety copy remain real', workspace.includes('onSendToBacktesting') && workspace.includes('Strategy Studio is research-only'));
check('Dynamic Fusion live context preserved', workspace.includes('compositeScoreLabel') && workspace.includes('fusionSnapshot.score') && workspace.includes('window.setInterval(onRefreshFusion, 30_000)'));
check('evidence rail uses requested card groups', evidence.includes('Primary Evidence / Validation') && evidence.includes('Research Tools') && evidence.includes('Warnings &amp; Limits') && evidence.includes('Data &amp; Ecosystem') && evidence.includes('Advanced Evidence / Provenance'));
check('validation optimization liquidity hunter and autopilot preserved', evidence.includes('onRunValidation') && evidence.includes('onRunOptimization') && evidence.includes('onRunLiquidityHunter') && evidence.includes('SmartAutopilotMiniToggle'));
check('evidence readiness remains honest', evidence.includes("const evidenceReady = bound && status === 'Verified'") && evidence.includes('Evidence Pending') && evidence.includes('performance is not presented as verified performance'));
check('manual testnet safety remains explicit', evidence.includes('CONFIRM_LIQUIDITY_HUNTER_TESTNET') && evidence.includes('cannot enable autonomous live execution'));
check('compare dialog explains evidence limits', compare.includes('Select up to three registered strategies') && compare.includes('Not comparable'));
check('detail dialog explains guided/advanced edit behavior', detail.includes('Guided mode protects registered defaults') && detail.includes('Edited values are transferred to Backtesting only'));
check('CSS scoped to Strategy page and palette-aligned', css.includes('v1.0.61 Strategy Studio modernization') && css.includes('--ss-green:#009B7A') && css.includes('--ss-warning:#F97316'));
check('CSS includes responsive grid behavior', css.includes('@media (max-width: 1180px)') && css.includes('@media (max-width: 900px)'));
check('CSS includes focus and reduced motion', css.includes('focus-visible') && css.includes('prefers-reduced-motion'));

const failed = checks.filter((row) => !row.pass);
console.log(`Strategy page modernization contract: ${checks.length - failed.length}/${checks.length} PASS`);
for (const row of checks) console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${row.name}${row.detail ? ` — ${row.detail}` : ''}`);
fs.writeFileSync(path.join(root, 'QA/strategy-page-modernization-v1.0.61.json'), JSON.stringify({ generatedAt: new Date().toISOString(), passed: failed.length === 0, checks }, null, 2));
if (failed.length) process.exit(1);
