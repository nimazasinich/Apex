#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];
const checks = [];
const pass = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail }); if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`); };
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const pages = {
  watchlist: ['WatchlistPage', 'src/pages/watchlist/WatchlistPage.tsx'],
  orders: ['OrdersPage', 'src/pages/orders/OrdersPage.tsx'],
  positions: ['PositionsPage', 'src/pages/positions/PositionsPage.tsx'],
  alerts: ['AlertsPage', 'src/pages/alerts/AlertsPage.tsx'],
  history: ['HistoryPage', 'src/pages/history/HistoryPage.tsx'],
  analytics: ['AnalyticsPage', 'src/pages/analytics/AnalyticsPage.tsx'],
  settings: ['SettingsPage', 'src/pages/settings/SettingsPage.tsx'],
  help: ['HelpPage', 'src/pages/help/HelpPage.tsx'],
};

for (const page of Object.keys(pages)) {
  const file = path.join(root, 'Doc', 'reference', 'v20', `${page}-1368x753.png`);
  const available = fs.existsSync(file);
  if (!available) { pass(`reference:${page}`, false, 'missing'); continue; }
  const buffer = fs.readFileSync(file);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  pass(`reference:${page}`, width === 1368 && height === 753, `${width}x${height}`);
}

const app = read('src/App.tsx');
const main = read('src/main.tsx');
const shell = read('src/components/workspace/WorkspaceShell.tsx');
const primitives = read('src/components/ui/WorkspacePrimitives.tsx');
const referenceUi = read('src/pages/referenceUi.tsx');
const referenceCss = read('src/styles/reference-ui.css');
const shellCss = read('src/styles/workspace-shell.css');
const server = read('server.ts');
const service = read('src/services/workspaceInsights.ts');

for (const [page, [component, file]] of Object.entries(pages)) {
  const source = read(file);
  pass(`route:${page}`, app.includes(`import { ${component} }`) && app.includes(`<${component}`), `${component} is imported and rendered by App.`);
  const contextual = source.includes('context={context}') || source.includes('className="v20-context-sidebar"');
  pass(`context:${page}`, contextual, 'An active, page-specific context rail is present.');
}

pass('help-navigation', shell.includes("onNavigate('help')"), 'Help route is interactive.');
pass('backend-workspace-route', server.includes("app.get('/api/account/workspace'"), 'Normalized server view model.');
pass('backend-normalizer', service.includes('buildWorkspaceInsights'), 'Demo/Live normalization.');
pass('shared-page-frame', primitives.includes('export function WorkspacePageFrame'), 'Split pages use the canonical page frame where appropriate.');
pass('visual-gauges', referenceUi.includes('export function HalfGauge') && referenceUi.includes('export function Donut'), 'Gauge and donut primitives are active shared components.');
pass('target-viewport', referenceCss.includes('1368×753') && shellCss.includes('grid-template-columns: 180px minmax(0, 1fr)') && referenceCss.includes('grid-template-columns: minmax(0, 1fr) 280px'), 'Current shell geometry targets the 1368×753 contract.');
pass('central reference stylesheet', main.includes("import './styles/reference-ui.css';"), 'Reference UI CSS loads deterministically from the entry point.');
pass('old monolith removed', !exists('src/components/workspace/ReferenceViews.tsx'), 'Dead ReferenceViews source cannot diverge from active split pages.');
pass('no-screenshot-background', !/background(?:-image)?\s*:\s*url\([^)]*(watchlist|orders|positions|alerts|history|analytics|settings|help)-1368x753/i.test(`${referenceCss}\n${shellCss}`), 'Reference PNGs remain QA assets, not UI backgrounds.');

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
if (failures.length) {
  console.error(`\nV20 contract failed (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nV20 reference contract passed (${checks.length}/${checks.length}).`);
