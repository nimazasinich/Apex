import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const contract = JSON.parse(read('Doc/plans/active/layout-contract-v3.json'));
const css = [
  'src/styles/workspace-shell.css',
  'src/styles/reference-ui.css',
  'src/styles/interaction-polish.css',
  'src/pages/watchlist/WatchlistPage.css',
  'src/pages/alerts/AlertsPage.css',
  'src/pages/history/HistoryPage.css',
  'src/pages/settings/SettingsPage.css',
  'src/pages/help/HelpPage.css',
].map(read).join('\n');
const app = read('src/App.tsx');
const shell = read('src/components/workspace/WorkspaceShell.tsx');
const server = read('server.ts');

assert.equal(contract.canonicalViewport.width, 1368);
assert.equal(contract.canonicalViewport.height, 753);
assert.equal(contract.shell.sidebarWidth, 180);
assert.equal(contract.shell.headerHeight, 52);
assert.equal(contract.shell.contextWidth, 300);
assert.equal(contract.shell.mainWidth, 852);
assert.equal(contract.shell.usableHeight, 677);

for (const fragment of [
  'grid-template-columns: 180px minmax(0, 1fr)',
  'grid-template-rows: 52px minmax(0, 1fr)',
  'grid-template-columns: minmax(0, 1fr) 300px',
  'padding: 12px',
  'gap: 12px',
  'overflow: hidden',
]) assert.ok(css.includes(fragment), `missing CSS contract fragment: ${fragment}`);

const requiredPages = ['watchlist', 'orders', 'positions', 'alerts', 'history', 'analytics', 'settings', 'help'];
for (const page of requiredPages) {
  assert.ok(app.includes(`case '${page}'`), `missing route: ${page}`);
  assert.ok(css.includes(`apex-v3-${page}`), `missing page CSS: ${page}`);
}
assert.equal((app.match(/case 'settings'/g) || []).length, 1, 'duplicate settings route');
assert.ok(shell.includes("'help'"), 'Help route missing from shell');
assert.ok(shell.includes('Ctrl') || shell.includes('metaKey'), 'global keyboard search missing');

for (const endpoint of [
  '/api/account/workspace',
  '/api/account/connection',
  '/api/account/orders/preview',
  '/api/system/health',
]) assert.ok(server.includes(endpoint), `missing backend endpoint: ${endpoint}`);

assert.ok(server.includes('Number.isFinite(Number(item?.fee))'), 'backend finite-number normalization missing');
assert.ok(read('src/components/ui/WorkspacePrimitives.tsx').includes("if (raw == null || raw === '') continue"), 'frontend null-to-zero protection missing');
assert.ok(!app.includes("case 'settings': content = <SettingsPage") || (app.match(/case 'settings'/g) || []).length === 1);

console.log('APEX V3 static contract checks passed.');
