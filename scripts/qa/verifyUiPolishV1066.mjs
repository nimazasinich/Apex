#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checks = [
  ['Backtesting workspace polish class', 'src/pages/backtesting/BacktestingPage.tsx', 'apex-bt-polish-v1066'],
  ['Backtesting 3-column polished grid', 'src/pages/backtesting/BacktestingPage.css', 'v1.0.66 — Backtesting Studio density'],
  ['Backtesting command bar uses grid areas', 'src/pages/backtesting/BacktestingPage.css', 'grid-template-areas:\n    "title tabs"'],
  ['Backtesting evidence rail remains visible and themed', 'src/pages/backtesting/BacktestingPage.css', '.apex-bt-polish-v1066 .apex-bt-studio-rail'],
  ['Backtesting manual research warning remains present', 'src/pages/backtesting/BacktestingTopBar.tsx', 'This route cannot place an exchange order'],
  ['Trading rail theme override', 'src/components/trading/TradingWorkspace.css', 'v1.0.66 — cross-page trading polish refinement'],
  ['Trading rail remains slide-out toolbox', 'src/components/workspace/TradingToolbox.tsx', 'rail-closed'],
  ['Trading Account Activity slide preference preserved', 'src/components/workspace/AccountViews.tsx', 'apex.trading.accountActivity.open.v2'],
  ['Strategy polish alignment present', 'src/pages/strategies/StrategyStudioReference.css', 'v1.0.66 — Strategy Studio polish alignment'],
  ['Reduced motion respected in Backtesting polish', 'src/pages/backtesting/BacktestingPage.css', 'prefers-reduced-motion: reduce'],
];
const errors = [];
for (const [label, rel, needle] of checks) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    errors.push(`${label}: missing ${rel}`);
    continue;
  }
  const text = fs.readFileSync(abs, 'utf8');
  if (!text.includes(needle)) errors.push(`${label}: missing marker ${JSON.stringify(needle)} in ${rel}`);
}
if (errors.length) {
  console.error('[ui-polish-v1066] FAILED');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('[ui-polish-v1066] 10/10 PASS');
