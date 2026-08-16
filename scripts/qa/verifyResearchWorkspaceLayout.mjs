#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const btCss = read('src/pages/backtesting/BacktestingPage.css');
const btPage = read('src/pages/backtesting/BacktestingPage.tsx');
const multiPanel = read('src/pages/backtesting/MultiStrategyResearchPanel.tsx');
const strategyCss = read('src/pages/strategies/StrategyPage.css');
const strategyPage = read('src/pages/strategies/StrategyPage.tsx');

const checks = [
  ['backtesting keeps current R2 clarity layout', btCss.includes('v2.4 clarity + density pass') && /\.apex-bt-layout\.apex-bt-layout-modernized\s*\{[\s\S]*?grid-template-columns:\s*388px minmax\(0, 1fr\)/.test(btCss)],
  ['backtesting collapses to natural one-column flow', /@media \(max-width: 820px\)[\s\S]*?\.apex-bt-layout\.apex-bt-layout-modernized\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);\s*overflow:\s*visible;/.test(btCss)],
  ['backtesting keeps single canonical run builder', btPage.includes('<BacktestRunBuilder') && btPage.includes('<BacktestEvidenceTabs')],
  ['backtesting exposes restored Research Matrix from active page', btPage.includes('Research Matrix') && btPage.includes('<MultiStrategyResearchPanel')],
  ['research matrix is paper/research only', /research \/ paper only/i.test(multiPanel) && !/Place Order|Submit Live|Execute Live/.test(multiPanel)],
  ['research matrix uses shared R2 dialog accessibility', multiPanel.includes('useDialogA11y') && multiPanel.includes('role="dialog"') && multiPanel.includes('aria-modal="true"')],
  ['research matrix is responsive', /@media \(max-width: 800px\)[\s\S]*?\.apex-bt-multi-config,[\s\S]*?grid-template-columns:\s*1fr/.test(btCss)],
  ['research result provenance is visible', multiPanel.includes('candlesUsed') && multiPanel.includes('requestedBars') && multiPanel.includes('dataSource')],
  ['paper sizing remains explicit entry/stop work', multiPanel.includes('Entry') && multiPanel.includes('Stop') && multiPanel.includes('Paper sizing')],
  ['strategy keeps three-surface desktop ownership', /grid-template-columns:\s*232px minmax\(0, 1fr\) 286px/.test(strategyCss)],
  ['strategy phone layout uses natural document flow', /@media \(max-width: 760px\)[\s\S]*?\.strategy-studio\s*\{[\s\S]*?display:\s*block !important;[\s\S]*?height:\s*auto !important;/.test(strategyCss)],
  ['strategy phone actions are not sticky', /@media \(max-width: 760px\)[\s\S]*?\.strategy-model-actions\s*\{\s*position:\s*static;/.test(strategyCss)],
  ['strategy keeps model workspace component', strategyPage.includes('<StrategyModelWorkspace')],
  ['strategy keeps evidence rail component', strategyPage.includes('<StrategyEvidenceRail')],
  ['strategy keeps manual backtesting handoff', strategyPage.includes('onSendToBacktesting={() => sendToBacktesting()}')],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failed += 1;
}
console.log(`Research workspace layout contract: ${checks.length - failed}/${checks.length}`);
if (failed) process.exit(1);
