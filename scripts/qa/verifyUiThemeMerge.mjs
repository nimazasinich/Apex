#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const checks = [];
const check = (name, ok) => checks.push([name, Boolean(ok)]);

const tokens = read('src/styles/tokens.css');
const referenceCss = read('src/styles/reference-ui.css');
const helpCss = read('src/pages/help/HelpPage.css');
const helpTsx = read('src/pages/help/HelpPage.tsx');
const watchlistCss = read('src/pages/watchlist/WatchlistPage.css');
const shell = read('src/components/workspace/WorkspaceShell.tsx');

const darkTokenBlock = tokens.match(/:root\[data-apex-theme-resolved="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1] || '';
const requiredDarkTokens = [
  '--apex-canvas', '--apex-surface', '--apex-surface-soft', '--apex-border',
  '--apex-divider', '--apex-ink-900', '--apex-muted-600', '--apex-green-300',
  '--apex-green-400', '--apex-focus',
];
const requiredV20DarkTokens = [
  '--v20-bg', '--v20-surface', '--v20-surface-soft', '--v20-border',
  '--v20-text', '--v20-muted', '--v20-green-soft', '--v20-red-soft',
];

check('global dark APEX token block exists', darkTokenBlock.length > 0);
check('global dark APEX token block is complete', requiredDarkTokens.every((token) => darkTokenBlock.includes(`${token}:`)));
check('V20 dark surface contract exists', referenceCss.includes(':root[data-apex-theme-resolved="dark"]') && requiredV20DarkTokens.every((token) => referenceCss.includes(`${token}:`)));
check('V20 cards use theme surfaces', [
  '.v20-table-card', '.v20-context-sidebar', '.v20-chart-card', '.v20-settings-card', '.v20-topic-grid button',
].every((selector) => referenceCss.includes(selector)) && referenceCss.includes('background: var(--v20-surface)'));
check('Help surfaces use APEX theme variables', helpCss.includes('background: var(--apex-surface)') && helpCss.includes('background: var(--apex-surface-soft)'));
check('Watchlist surfaces use APEX theme variables', watchlistCss.includes('var(--apex-surface)') && watchlistCss.includes('var(--apex-surface-soft)'));
check('Header exposes an explicit Settings shortcut', shell.includes('aria-label="Open settings"') && shell.includes('<Settings size={18} />'));
check('Tutorial cards target the interactive button class', helpCss.includes('.apex-v3-tutorial-card {') && !helpCss.includes('.apex-v3-tutorial-grid article'));
check('Tutorial cards reference all extracted thumbnails', [
  'getting-started.png', 'first-trade.png', 'portfolio.png', 'security.png',
].every((name) => helpTsx.includes(`/tutorial-thumbnails/${name}`) && exists(`public/tutorial-thumbnails/${name}`)));
check('Legacy v3-workspace stylesheet is not imported', !read('src/main.tsx').includes('v3-workspace.css') && !read('src/index.css').includes('v3-workspace.css'));
check('Interaction feedback layer remains enabled', read('src/main.tsx').includes("./styles/interaction-polish.css"));

for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) process.exitCode = 1;
}

if (!process.exitCode) console.log(`\nUI theme merge contract passed (${checks.length}/${checks.length}).`);
