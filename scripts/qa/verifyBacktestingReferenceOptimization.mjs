#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const page = read('src/pages/backtesting/BacktestingPage.tsx');
const topBar = read('src/pages/backtesting/BacktestingTopBar.tsx');
const builder = read('src/pages/backtesting/BacktestRunBuilder.tsx');
const hero = read('src/pages/backtesting/BacktestEvidenceHero.tsx');
const tabs = read('src/pages/backtesting/BacktestEvidenceTabs.tsx');
const css = read('src/pages/backtesting/BacktestingPage.css');
const orchestrator = read('src/services/multiStrategyResearchOrchestrator.ts');
const optimizer = read('src/pages/backtesting/useBacktestingOptimization.ts');

const checks = [];
function check(name, condition) {
  const ok = Boolean(condition);
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}

check('reference smart-lab subtitle is preserved', topBar.includes('Smart backtesting that finds, validates, and improves your edge.'));
check('legacy full-width autopilot banner is removed from active markup', !page.includes('className={`apex-bt-autopilot'));
check('Backtesting still exposes Research Matrix multi-agent workflow', page.includes('setMultiResearchOpen(true)') && page.includes('Research Matrix'));
check('pre-run Evidence tabs render before any result exists', page.includes('<BacktestEvidenceTabs') && page.includes('result={null}'));
check('pre-run first three tabs match reference order', tabs.indexOf("label: 'Output Overview'") < tabs.indexOf("label: 'Evidence Notes'") && tabs.indexOf("label: 'Evidence Notes'") < tabs.indexOf("label: 'Run History'"));
check('reference hero uses the bundled backtesting evidence SVG', hero.includes("assets/backtesting/apex-backtesting-evidence-hero.svg"));
check('reference hero places copy before illustration', hero.indexOf('apex-bt-hero-copy') < hero.indexOf('apex-bt-hero-art'));
check('1368 reference grid is 390px plus dominant Evidence Area', css.includes('grid-template-columns: 390px minmax(0, 1fr) !important'));
check('identity metrics use six columns at target viewport', css.includes('grid-template-columns: repeat(6, minmax(0, 1fr)) !important'));
check('configure form exposes reference three-column control rows', builder.includes('apex-bt-three-col apex-bt-market-period-row') && builder.includes('apex-bt-three-col apex-bt-replay-window-row'));
check('strategy parameter grid exposes three columns at target viewport', css.includes('grid-template-columns: repeat(3, minmax(0, 1fr)) !important'));
check('robust optimizer is compact/collapsible rather than another full-width page banner', builder.includes('optimizationExpanded') && builder.includes('aria-expanded={optimizationExpanded}'));
check('Backtesting hydrates exact-context optimizer state', optimizer.includes('/optimization?${query.toString()}') && optimizer.includes('latestReport'));
check('Backtesting can run safe optimization and explicit promotion', optimizer.includes('/optimize`') && optimizer.includes('/optimization/promote`'));
check('promoted parameters become effective unless user explicitly overrides them', page.includes('parameterOverrideRef') && optimizer.includes('mergePromotedParameters'));
check('UI distinguishes current promoted candidate by source report identity', (page + optimizer).includes('activeOptimizationProfile.sourceReportAt === optimizationReport.generatedAt'));
check('optimizer copy explicitly refuses forced positive claims', builder.includes('It never forces a positive result.') || tabs.includes('instead of forcing a positive result'));
check('multi-trading paper portfolio now requires positive realized research evidence', orchestrator.includes('const positiveEvidence = metrics.totalPnlPct > 0') && orchestrator.includes('(metrics.profitFactor ?? 0) > 1') && orchestrator.includes('metrics.tradeCount >= 4'));
check('multi-trading remains fail-closed when evidence is weak', orchestrator.includes('!positiveEvidence') && orchestrator.includes('empty paper portfolio is preferable'));

const failed = checks.filter((entry) => !entry.ok);
console.log(`\nBacktesting reference/optimization contract: ${checks.length - failed.length}/${checks.length} PASS`);
process.exit(failed.length ? 1 : 0);
