import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const checks = [];

function check(name, predicate) {
  let passed = false;
  let detail = '';
  try {
    passed = Boolean(predicate());
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
  }
  checks.push({ name, passed, detail });
}

const activeDialogs = [
  'src/components/workspace/AccountViews.tsx',
  'src/pages/analytics/AnalyticsPage.tsx',
  'src/pages/help/HelpPage.tsx',
  'src/pages/strategies/StrategyCompareDialog.tsx',
  'src/pages/strategies/StrategyDetailPage.tsx',
  'src/pages/backtesting/MultiStrategyResearchPanel.tsx',
];

check('shared dialog hook is generic', () =>
  read('src/lib/useDialogA11y.ts').includes('useDialogA11y<T extends HTMLElement'));
check('all active audited dialogs reuse useDialogA11y', () =>
  activeDialogs.every((file) => read(file).includes('useDialogA11y')));
check('help has no duplicate Escape listener', () =>
  !read('src/pages/help/HelpPage.tsx').includes("window.addEventListener('keydown', closeOnEscape)"));
check('order confirmation clears stale phrase on close', () =>
  /const closePreview = useCallback\(\(\) => \{[\s\S]*?setConfirmation\(''\)/.test(read('src/components/workspace/AccountViews.tsx')));
check('order confirmation input has accessible name', () =>
  read('src/components/workspace/AccountViews.tsx').includes('aria-label="Order confirmation phrase"'));
check('price chart icon controls have accessible names', () => {
  const chart = read('src/components/PriceChart.tsx');
  return [
    'aria-label="Draw trendline"',
    'aria-label="Draw horizontal level"',
    'aria-label="Clear drawings"',
    'aria-label="Reset zoom"',
  ].every((token) => chart.includes(token));
});
check('history leaves fixed-height desktop grid on narrow screens', () =>
  /@media\s*\(max-width:\s*1119px\)[\s\S]*?\.apex-v3-history-main[\s\S]*?height:\s*auto/.test(read('src/pages/history/HistoryPage.css')));
check('history table preserves horizontal scroller contract on phones', () =>
  /@media\s*\(max-width:\s*520px\)[\s\S]*?\.apex-v3-history-page \.apex-v3-table[\s\S]*?min-width:\s*780px/.test(read('src/pages/history/HistoryPage.css')));
check('help leaves fixed-height desktop grid on narrow screens', () =>
  /@media\s*\(max-width:\s*1119px\)[\s\S]*?\.apex-v3-help-main[\s\S]*?height:\s*auto/.test(read('src/pages/help/HelpPage.css')));
check('help topics collapse to one column on phones', () =>
  /@media\s*\(max-width:\s*520px\)[\s\S]*?\.apex-v3-help-topics,[\s\S]*?grid-template-columns:\s*1fr/.test(read('src/pages/help/HelpPage.css')));
check('legacy duplicate workspace pages are retired', () => [
  'src/pages/StrategiesPage.tsx',
  'src/pages/StrategyDetailPage.tsx',
  'src/pages/StrategyStudioPage.tsx',
  'src/components/BacktestingPage.tsx',
  'src/components/workspace/SettingsView.tsx',
].every((file) => !fs.existsSync(path.join(root, file))));
check('GeneralViews owns Overview only', () => {
  const general = read('src/components/workspace/GeneralViews.tsx');
  return general.includes('export function OverviewView') && !/export function (WatchlistView|AlertsView|AnalyticsView)/.test(general);
});
check('Research Matrix is active and paper-only', () => {
  const page = read('src/pages/backtesting/BacktestingPage.tsx');
  const panel = read('src/pages/backtesting/MultiStrategyResearchPanel.tsx');
  return page.includes('<MultiStrategyResearchPanel') && /research \/ paper only/i.test(panel) && !/Place Order|Submit Live|Execute Live/.test(panel);
});

check('browser capability presentation is dependency-neutral', () => {
  const capability = read('src/lib/capabilityStatus.ts');
  return capability.includes("from '../contracts/providerCapabilities'") && !capability.includes("from '../services/providerRouter'");
});
check('System Health visibly distinguishes planned, shadow and live authority', () => {
  const drawer = read('src/components/workspace/SystemHealthDrawer.tsx');
  return drawer.includes('listProviderCapabilities')
    && drawer.includes('listModuleCapabilities')
    && drawer.includes('Declared capability status')
    && drawer.includes('Planned and shadow modules are never presented as active authority');
});
check('shared provenance truth remains wired to active market intelligence cards', () => {
  const sentiment = read('src/components/SentimentGaugeCard.tsx');
  const correlation = read('src/components/CorrelationMatrixCard.tsx');
  return sentiment.includes('<ProvenanceChip') && correlation.includes('<ProvenanceChip');
});

for (const item of checks) {
  console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
}

const failed = checks.filter((item) => !item.passed);
console.log(`\nUI completion R2: ${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) process.exit(1);
