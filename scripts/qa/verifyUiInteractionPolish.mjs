#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (name, condition, detail = '') => checks.push({ name, ok: Boolean(condition), detail });

const main = read('src/main.tsx');
const app = read('src/App.tsx');
const shell = read('src/components/workspace/WorkspaceShell.tsx');
const feedback = read('src/components/ui/WorkspaceFeedbackCenter.tsx');
const feedbackCss = read('src/components/ui/WorkspaceFeedbackCenter.css');
const interactionCss = read('src/styles/interaction-polish.css');
const positions = read('src/pages/positions/PositionsPage.tsx');
const orders = read('src/pages/orders/OrdersPage.tsx');
const alerts = read('src/pages/alerts/AlertsPage.tsx');
const history = read('src/pages/history/HistoryPage.tsx');
const help = read('src/pages/help/HelpPage.tsx');
const settings = read('src/pages/settings/SettingsPage.tsx');
const watchlist = read('src/pages/watchlist/WatchlistPage.tsx');

check('canonical workspace shell class enabled', shell.includes('apex-shell apex-workspace'));
check('global feedback center mounted', shell.includes('<WorkspaceFeedbackCenter />') && feedback.includes('WORKSPACE_FEEDBACK_EVENT'));
check('feedback supports all tones and dismissal', ['success', 'error', 'warning', 'info'].every((tone) => feedback.includes(`${tone}:`)) && feedback.includes('Dismiss notification'));
check('interaction stylesheet loaded last', main.includes("import './styles/interaction-polish.css'"));
check('keyboard and focus interaction coverage', shell.includes("event.key === 'Home'") && shell.includes("event.key === 'End'") && interactionCss.includes(':focus-visible'));
check('global search has explicit clear action', shell.includes('Clear global search') && shell.includes('apex-search-clear'));
check('theme toggle is interactive and persistent', shell.includes('setThemePreference') && shell.includes('apex-theme-toggle'));
check('system health entry points are actionable', shell.includes('Open market data and system health details') && shell.includes('apex-data-status-action'));
check('reduced motion is respected', interactionCss.includes('@media (prefers-reduced-motion: reduce)'));
check('dark mode selected-row parity', interactionCss.includes('data-apex-theme-resolved="dark"') && interactionCss.includes('tbody tr.selected'));

const positionHeaders = ['Asset', 'Side', 'Size', 'Entry Price', 'Mark Price', 'Unrealized P&L', 'P&L (%)', 'Margin', 'Leverage', 'Liq. Price', 'Action'];
check('positions preserves all eleven columns', positionHeaders.every((header) => positions.includes(`label: '${header}'`)) && positions.includes('POSITION_HEADERS.map'));
check('positions supports selection, sorting and trading transfer', positions.includes('setSelectedId(position.id)') && positions.includes('Sort positions') && positions.includes('Open this market in Trading'));
check('positions has honest account metric naming', positions.includes('Unrealized P&L') && positions.includes('Realized P&L') && !positions.includes('Daily P&L'));
check('positions exposes functional row action', positions.includes('Open this market in Trading') && !positions.includes('<MoreHorizontal'));

check('orders supports filter reset and selection clearing', orders.includes('Order filters cleared') && orders.includes('Clear Filters') && orders.includes('Clear selected order'));
check('orders supports copy, cancellation and trading draft transfer', orders.includes('Copy full order ID') && orders.includes('cancelLiveOrder') && orders.includes("actionLabel: props.onOpenTrading ? 'Open Trading'"));
check('orders tabs expose tab semantics', orders.includes('role="tab"') && orders.includes('aria-selected'));

check('alerts supports edit, reset, delete confirmation and feedback', alerts.includes('Edit Alert Rule') && alerts.includes('Reset alert builder') && alerts.includes('window.confirm') && alerts.includes('Alert rule updated'));
check('alerts controls expose accessible switch and keyboard behavior', alerts.includes('role="switch"') && alerts.includes('aria-checked={rule.enabled}') && alerts.includes("event.key === ' '"));
check('history supports CSV export, pagination clamping and clear filters', history.includes('URL.revokeObjectURL') && history.includes('if (page > pages) setPage(pages)') && history.includes('History filters cleared'));
check('help supports manual health refresh and accessible modals', help.includes('System health updated') && help.includes('useDialogA11y') && help.includes('aria-modal="true"') && help.includes('aria-labelledby="help-tutorial-title"') && help.includes('aria-labelledby="help-support-title"'));
check('help avoids unsupported availability claim', !help.includes('24/7'));

const settingsSections = [
  ['account', 'Account'],
  ['security', 'Security'],
  ['appearance', 'Appearance'],
  ['notifications', 'Notifications'],
  ['trading', 'Trading'],
  ['api', 'API Management'],
  ['devices', 'Devices'],
];
check('settings preserves all seven sections', settingsSections.every(([id, label]) => settings.includes(`{ id: '${id}', label: '${label}'`)));
check('settings exposes saved/unsaved preference state', settings.includes('Unsaved changes') && settings.includes('Reset changes') && settings.includes('hasPreferenceChanges'));
check('settings security status has retry path', settings.includes('const loadSecurity = useCallback') && settings.includes('onRetry={() => void loadSecurity()}'));
check('watchlist supports safe favorite updates and trading transfer', watchlist.includes('Added to watchlist') && watchlist.includes('Removed from watchlist') && watchlist.includes('props.onOpenTrading()') && watchlist.includes('opened in Trading'));
check('account navigation callbacks are wired', app.includes('onOpenTrading') && app.includes('onOpenSettings'));
check('toast text remains readable', feedbackCss.includes('font-size: 12px') && feedbackCss.includes('font-size: 10.5px'));

const failed = checks.filter((item) => !item.ok);
const report = {
  generatedAt: new Date().toISOString(),
  baseViewport: '1368x753',
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
};
fs.mkdirSync(path.join(root, 'QA'), { recursive: true });
fs.writeFileSync(path.join(root, 'QA/ui-interaction-polish-qa.json'), `${JSON.stringify(report, null, 2)}\n`);

for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
}
if (failed.length) process.exit(1);
console.log(`\nUI interaction polish passed (${checks.length}/${checks.length}).`);
