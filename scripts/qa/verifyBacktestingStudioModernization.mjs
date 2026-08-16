#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('src/pages/backtesting/BacktestingPage.tsx');
const builder = read('src/pages/backtesting/BacktestRunBuilder.tsx');
const types = read('src/pages/backtesting/backtestingTypes.ts');
const coverage = read('src/pages/backtesting/backtestCoverage.ts');
const coveragePanel = read('src/pages/backtesting/BacktestCoverageCredibilityPanel.tsx');
const rail = read('src/pages/backtesting/BacktestEvidenceRail.tsx');
const css = read('src/pages/backtesting/BacktestingPage.css');

const checks = [];
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });

check('Backtesting Studio scope keeps real page/components', page.includes('<BacktestRunBuilder') && page.includes('<BacktestCoverageCredibilityPanel') && page.includes('<BacktestEvidenceRail') && !page.includes("navigateWorkspace('overview')"));
check('Smart Mode is default and Manual / Expert remains available', page.includes("useState<BacktestStudioMode>('smart')") && page.includes('Manual <small>Expert</small>') && builder.includes('Manual / Expert Builder'));
check('Smart checkpoint persistence uses localStorage key', page.includes("apex:backtesting-smart-checkpoint:v1") && page.includes('readSmartCheckpoint') && page.includes('persistSmartCheckpoint'));
check('Smart Start Stop Resume controls are one safe primary flow', builder.includes('Start Smart Backtest') && builder.includes('Stop') && builder.includes('Resume Smart Backtest') && page.includes('stopSmartBacktest') && page.includes('resumeSmartBacktest'));
check('Smart loop uses canonical backtest route instead of fake data', page.includes("await runBacktest('smart')") && page.includes("fetch(`/api/market/backtest?") && page.includes("'X-APEX-Backtest-Source': source"));
check('Smart loop evaluates best and latest result separately', page.includes('scoreSmartBacktest') && page.includes('bestScore') && page.includes('latestScore') && builder.includes('Best result') && builder.includes('Latest result'));
check('Smart stop conditions are visible and bounded', builder.includes('max iterations 250') && builder.includes('20 no-improvement iterations') && page.includes('SMART_MAX_RUNTIME_MS') && page.includes('SMART_NO_IMPROVEMENT_LIMIT'));
check('Manual controls and existing handlers remain reachable', builder.includes('Advanced manual controls') && builder.includes('onStrategyChange') && builder.includes('onSymbolChange') && builder.includes('onIntervalChange') && builder.includes('onParameterChange') && builder.includes('onRun'));
check('Coverage helper distinguishes requested returned used executable', coverage.includes('requestedCandles') && coverage.includes('returnedCandles') && coverage.includes('usedCandles') && coverage.includes('executableCandles'));
check('Coverage panel exposes partial history honestly', coveragePanel.includes('Run Coverage &amp; Credibility') && coveragePanel.includes('Partial history') && coveragePanel.includes('Partial data is not presented as a complete backtest'));
check('Actual date range and provider metadata shown', coveragePanel.includes('Actual range') && coveragePanel.includes('Provider') && coveragePanel.includes('closed candles'));
check('Right evidence rail groups requested cards', rail.includes('Data Quality') && rail.includes('Execution Assumptions') && rail.includes('Warnings &amp; Limitations') && rail.includes('Export / Save Report') && rail.includes('Run History'));
check('Right rail actions use existing handlers only', page.includes('onExport={exportResult}') && page.includes("setEvidenceTab('history')") && page.includes("setEvidenceTab('data-quality')") && page.includes("setEvidenceTab('runtime')"));
check('No live trading order is triggered by backtesting', builder.includes('never creates a live trading order') && builder.includes('never submits an exchange order') && !page.includes('/api/orders'));
check('CSS is scoped and palette aligned', css.includes('v1.0.63 Backtesting Studio runtime hardening') && css.includes('--bt-studio-green: #009b7a') && css.includes('--bt-studio-warning-bg: #fff4e8'));
check('Responsive and reduced motion rules exist', css.includes('@media (max-width: 1280px)') && css.includes('@media (max-width: 900px)') && css.includes('@media (prefers-reduced-motion: reduce)'));
check('Accessibility semantics for mode and builder controls exist', page.includes('aria-label="Backtesting mode"') && builder.includes('aria-pressed={studioMode === \'smart\'}') && builder.includes('aria-label="Smart Mode run orchestration"'));

const failed = checks.filter((row) => !row.pass);
console.log(`Backtesting Studio modernization QA: ${checks.length - failed.length}/${checks.length} PASS`);
for (const row of checks) console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.name}`);
fs.writeFileSync(path.join(root, 'QA/backtesting-studio-modernization-v1.0.63.json'), JSON.stringify({ generatedAt: new Date().toISOString(), passed: failed.length === 0, checks }, null, 2));
if (failed.length) process.exit(1);
