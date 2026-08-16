#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const backtestingPage = read('src/pages/backtesting/BacktestingPage.tsx');
const backtestingTopBar = read('src/pages/backtesting/BacktestingTopBar.tsx');
const runBuilder = read('src/pages/backtesting/BacktestRunBuilder.tsx');
const strategyPage = read('src/pages/strategies/StrategyPage.tsx');
const strategyLibrary = read('src/pages/strategies/StrategyLibraryRail.tsx');
const tradingCss = read('src/components/trading/TradingWorkspace.css');
const overviewCss = read('src/components/overview/OverviewWorkspace.css');
const backtestingCss = read('src/pages/backtesting/BacktestingPage.css');
const strategyCss = read('src/pages/strategies/StrategyPage.css');
const indexCss = read('src/index.css');

const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

check('Backtesting top bar exposes accessible mode tabs', backtestingTopBar.includes('role="group"') && backtestingTopBar.includes('aria-label="Backtesting mode"'));
check('Backtesting run builder exposes accessible orchestration controls', runBuilder.includes('aria-label="Smart Mode run orchestration"') || runBuilder.includes('aria-label="Backtesting builder"'));
check('Strategy library supports accessible view toggle', strategyLibrary.includes('aria-pressed={viewMode === \'cards\'}') && strategyLibrary.includes('aria-pressed={viewMode === \'list\'}'));
check('Trading drawer shell exposes accessible dock button', read('src/components/workspace/ToolboxDrawers.tsx').includes('aria-pressed={Boolean(docked)}'));
check('Primary Overview and Trading workspaces keep text at 10px or larger', !/font-size:\s*(?:[0-9](?:\.[0-9]+)?)px/.test(`${overviewCss}\n${tradingCss}`));
check('APEX brand teal theme token is declared and used', indexCss.includes('#009b7a') || indexCss.includes('var(--apex-green)') || backtestingCss.includes('#009b7a'));
check('Focus ring accessibility styles exist in global index', indexCss.includes('focus-visible') || tradingCss.includes('focus-visible'));
check('Reduced motion accessibility overrides exist', backtestingCss.includes('prefers-reduced-motion') && strategyCss.includes('prefers-reduced-motion'));
check('Smart Mode remains default studio mode', backtestingPage.includes("useState<BacktestStudioMode>('smart')"));
check('Synthetic fixture disclaimers are non-deceptive', read('src/pages/backtesting/BacktestCoverageCredibilityPanel.tsx').includes('Synthetic fixture data for offline verification only. Not live market data.') || read('scripts/qa/generateSmartBacktestingSyntheticFixtures.mjs').includes('Synthetic fixture data for offline verification only. Not live market data.'));

const denseResearchSmallText = [...`${backtestingCss}
${strategyCss}`.matchAll(/font-size:\s*([0-9]+(?:\.[0-9]+)?)px/g)]
  .map((match) => Number(match[1]))
  .filter((value) => value < 10);
if (denseResearchSmallText.length) {
  console.warn(`WARN Dense Strategy/Backtesting legacy CSS still contains ${denseResearchSmallText.length} sub-10px declarations; reference-parity work should not be represented as a completed typography accessibility remediation.`);
}

const failed = checks.filter((row) => !row.pass);
console.log(`\nUI Audit & Accessibility Verification: ${checks.length - failed.length}/${checks.length} PASS`);

if (failed.length) {
  process.exit(1);
}
