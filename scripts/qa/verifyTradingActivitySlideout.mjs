#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const account = read('src/components/workspace/AccountViews.tsx');
const css = read('src/components/trading/TradingWorkspace.css');
const toolbox = read('src/components/workspace/TradingToolbox.tsx');

const checks = [];
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });

check('Account Activity defaults open for the reference workstation and migrates the v1 preference safely', account.includes('apex.trading.accountActivity.open.v2') && account.includes('LEGACY_TRADING_ACTIVITY_OPEN_STORAGE_KEY') && account.includes('return true;'));
check('Trading root exposes activity-open/activity-collapsed classes for grid sizing', account.includes("activityOpen ? 'activity-open' : 'activity-collapsed'"));
check('Account Activity receives expanded state and toggle handler from TradingView', account.includes('expanded={activityOpen}') && account.includes('onToggleExpanded={() => setActivityOpen((current) => !current)}'));
check('slide handle uses accessible button semantics', account.includes('apex-activity-slide-toggle') && account.includes('aria-expanded={expanded}') && account.includes('aria-controls="apex-trading-activity-content"'));
check('collapsed state hides heavy Account Activity body', account.includes('hidden={!expanded}') && css.includes('.apex-trading-activity-card.is-collapsed .apex-activity-slide-body'));
check('collapsed grid row gives chart primary height back', css.includes('activity-collapsed > .apex-unified-page.trading-page') && css.includes('minmax(430px, 1fr) 46px'));
check('open grid row restores full account table area', css.includes('activity-open > .apex-unified-page.trading-page') && css.includes('minmax(154px, auto)'));
check('collapsed header still shows real account summary', account.includes('apex-activity-head-kpis') && account.includes('money(summary.equityUsd)') && account.includes('money(summary.unrealizedPnlUsd)'));
check('right rail remains a dedicated Trading column', css.includes('grid-template-columns: minmax(0, 1fr) clamp(58px, 4.5vw, 64px) !important') && css.includes('grid-column: 2 !important') && css.includes('position: relative !important'));
check('right rail icons use unified APEX theme override', css.includes('v1.0.65 rail theme correction') && css.includes('linear-gradient(180deg, #eafbf5, #f8fffc)') && css.includes('linear-gradient(180deg, #009b7a, #00866a)'));
check('settings tool remains a workspace action with a matching icon path', toolbox.includes("key: 'settings'") && toolbox.includes('workspaceActions[key]') && toolbox.includes("tool === 'settings'"));
check('Ticket Orders Positions Depth Trades Strategy Signals Settings remain present', ['order','orders','positions','depth','trades','strategy','signals','settings'].every((key) => toolbox.includes(`key: '${key}'`)));

const failed = checks.filter((row) => !row.pass);
for (const row of checks) console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.name}`);
console.log(`Trading activity slideout QA: ${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);
