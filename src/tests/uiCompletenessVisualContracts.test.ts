import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('UI completeness visual-regression contracts', () => {
  it('keeps phone shell width bounded instead of expanding the stage', () => {
    const css = read('src/styles/workspace-shell.css');
    expect(css).toContain('Phone shell hardening');
    expect(css).toMatch(/\.apex-shell\.strategy-active \.apex-global-search[\s\S]*?width:\s*min\(156px,\s*48vw\)\s*!important/);
    expect(css).toMatch(/\.apex-page-frame[\s\S]*?display:\s*block/);
  });

  it('keeps the alert builder as a real responsive form', () => {
    const css = read('src/pages/alerts/AlertsPage.css');
    expect(css).toMatch(/\.alert-builder-card \.apex-v3-form-grid/);
    expect(css).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/\.alerts-context[\s\S]*?overflow-y:\s*auto/);
  });

  it('keeps Backtesting to one authoritative Run Backtest CTA', () => {
    const page = read('src/pages/backtesting/BacktestingPage.tsx');
    expect(page).toContain('apex-bt-preflight-guidance');
    expect(page).toContain('Use the primary');
    expect((page.match(/Run Backtest/g) || []).length).toBeGreaterThanOrEqual(1);
  });

  it('prevents Strategy Studio actions from overlaying model content', () => {
    const css = read('src/pages/strategies/StrategyPage.css');
    expect(css).toMatch(/\.strategy-model-actions\s*\{[\s\S]*?position:\s*static/);
    expect(css).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?\.strategy-studio[\s\S]*?width:\s*100%\s*!important/);
  });

  it('gives Trading chart icon controls accessible names', () => {
    const chart = read('src/components/PriceChart.tsx');
    expect(chart).toContain('aria-label="Draw trendline"');
    expect(chart).toMatch(/aria-label=\{[^}]*live/i);
  });

  it('stacks Analytics main content and context rail on phones', () => {
    const css = read('src/styles/reference-ui.css');
    expect(css).toContain('Analytics responsive completeness');
    expect(css).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?\.v20-analytics-page\s*\{[\s\S]*?display:\s*block/);
    expect(css).toMatch(/\.v20-analytics-page > \.v20-context-sidebar[\s\S]*?height:\s*auto/);
  });

  it('stacks Orders before the assistant rail on phones', () => {
    const css = read('src/styles/reference-ui.css');
    expect(css).toContain('Orders responsive completeness');
    expect(css).toMatch(/\.v20-orders-page\s*\{[\s\S]*?display:\s*block/);
    expect(css).toMatch(/\.v20-orders-page > \.v20-context-sidebar[\s\S]*?margin-top:\s*10px/);
    expect(css).toMatch(/\.v20-orders-page \.v20-orders-table > table[\s\S]*?min-width:\s*920px/);
  });

  it('keeps dark Orders empty states and assistant artwork bounded', () => {
    const css = read('src/styles/reference-ui.css');
    expect(css).toMatch(/data-apex-theme-resolved="dark"\] \.v20-orders-page \.orders-empty-visual[\s\S]*?width:\s*205px/);
    expect(css).toMatch(/data-apex-theme-resolved="dark"\] \.v20-orders-page \.orders-empty-visual svg[\s\S]*?width:\s*150px/);
    expect(css).toMatch(/data-apex-theme-resolved="dark"\] \.v20-orders-page \.orders-assistant-empty[\s\S]*?grid-template-rows:\s*34px minmax\(0, 1fr\) auto/);
  });

  it('renders the current Strategy Studio configuration and live-fusion states explicitly', () => {
    const page = read('src/pages/strategies/StrategyModelWorkspace.tsx');
    const css = read('src/pages/strategies/StrategyPage.css');
    expect(page).toContain('strategy-direction-control');
    expect(page).toContain('strategy-live-context-badge');
    expect(page).toContain('strategy-fusion-metrics');
    expect(page).toContain('strategy-fusion-details');
    expect(css).toMatch(/\.strategy-direction-control/);
    expect(css).toMatch(/\.strategy-live-context-badge/);
    expect(css).toMatch(/\.strategy-fusion-metrics/);
  });

  it('preserves narrow-screen content flow instead of hidden desktop grids', () => {
    const shell = read('src/styles/workspace-shell.css');
    const strategy = read('src/pages/strategies/StrategyPage.css');
    expect(shell).toMatch(/@media\s*\(max-width:\s*1119px\)[\s\S]*?\.apex-page-main[\s\S]*?overflow:\s*visible/);
    expect(strategy).toMatch(/\.strategy-library-rail[\s\S]*?max-width:\s*100%\s*!important/);
  });

  it('reuses the shared dialog focus trap across active workspace modals', () => {
    const files = [
      'src/components/workspace/AccountViews.tsx',
      'src/pages/analytics/AnalyticsPage.tsx',
      'src/pages/help/HelpPage.tsx',
      'src/pages/strategies/StrategyCompareDialog.tsx',
      'src/pages/strategies/StrategyDetailPage.tsx',
    ];
    for (const file of files) {
      expect(read(file)).toContain('useDialogA11y');
    }
    expect(read('src/lib/useDialogA11y.ts')).toContain('useDialogA11y<T extends HTMLElement');
    expect(read('src/pages/help/HelpPage.tsx')).not.toContain("window.addEventListener('keydown', closeOnEscape)");
  });

  it('clears stale order confirmation state and labels chart icon controls', () => {
    const account = read('src/components/workspace/AccountViews.tsx');
    const chart = read('src/components/PriceChart.tsx');
    expect(account).toContain('aria-label="Order confirmation phrase"');
    expect(account).toContain('aria-label="Close order confirmation"');
    expect(account).toMatch(/const closePreview = useCallback\(\(\) => \{[\s\S]*?setConfirmation\(''\)/);
    expect(chart).toContain('aria-label="Draw horizontal level"');
    expect(chart).toContain('aria-label="Clear drawings"');
    expect(chart).toContain('aria-label="Reset zoom"');
  });

  it('keeps History and Help in document flow on narrow screens', () => {
    const history = read('src/pages/history/HistoryPage.css');
    const help = read('src/pages/help/HelpPage.css');
    expect(history).toMatch(/@media\s*\(max-width:\s*1119px\)[\s\S]*?\.apex-v3-history-main[\s\S]*?height:\s*auto/);
    expect(history).toMatch(/@media\s*\(max-width:\s*520px\)[\s\S]*?\.apex-v3-history-page \.apex-v3-table[\s\S]*?min-width:\s*780px/);
    expect(help).toMatch(/@media\s*\(max-width:\s*1119px\)[\s\S]*?\.apex-v3-help-main[\s\S]*?height:\s*auto/);
    expect(help).toMatch(/@media\s*\(max-width:\s*520px\)[\s\S]*?\.apex-v3-help-topics,[\s\S]*?grid-template-columns:\s*1fr/);
  });
});
