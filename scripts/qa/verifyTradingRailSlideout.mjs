#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const account = read('src/components/workspace/AccountViews.tsx');
const toolbox = read('src/components/workspace/TradingToolbox.tsx');
const css = read('src/components/trading/TradingWorkspace.css');
const pref = read('src/lib/tradingLayoutPreference.ts');

const checks = [];
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });

check('trading rail has explicit collapsed/open state in runtime state', toolbox.includes('railOpen: boolean') && account.includes('railOpen: false'));
check('rail defaults open on workstation widths but preserves an explicit persisted choice', pref.includes('readTradingRailOpenPreference') && toolbox.includes('stored !== null') && toolbox.includes('window.innerWidth - 184 >= 1080'));
check('arrow slide toggle controls trading tools', toolbox.includes('apex-toolbox-slide-toggle') && toolbox.includes('aria-expanded={railOpen}') && toolbox.includes('Show Trading tools') && toolbox.includes('Hide Trading tools'));
check('rail reserves a dedicated Trading grid column', css.includes('grid-template-columns: minmax(0, 1fr) clamp(58px, 4.5vw, 64px) !important') && css.includes('grid-column: 2 !important'));
check('toolbox is a positioned Trading column, not a page overlay', css.includes('position: relative !important') && css.includes('html body .apex-trading-terminal.apex-trading-modern > .apex-trading-toolbox'));
check('rail supports explicit closed/open visibility states', css.includes('rail-closed') && css.includes('visibility: hidden !important') && css.includes('rail-open .apex-toolbox-rail'));
check('inline Ticket and Depth remain owned by the Trading composition', account.includes('const expandedTool = toolboxState.railOpen') && account.includes('<PriceChart') && account.includes('const depthPanel'));
check('custom APEX SVG rail icons replace mismatched generic icon set', toolbox.includes('function ApexRailIcon') && toolbox.includes('apex-rail-svg') && !toolbox.includes('CircleDollarSign'));
check('rail buttons use theme palette rather than unrelated per-icon colors', css.includes('--tool-accent: var(--apex-trading-secondary)') && !css.includes('apex-trading-toolbox .apex-rail-button:nth-child(8)'));
check('external toolbox requests still open the rail and requested tool', toolbox.includes('setRailOpen(true);') && toolbox.includes('setOpen(requested);'));
check('keyboard escape closes the sliding rail safely', toolbox.includes("event.key === 'Escape'") && toolbox.includes('setRailOpen(false)'));
check('settings remains a real workspace action', toolbox.includes("key: 'settings'") && account.includes("workspaceActions={{ settings: () => navigateWorkspace('settings') }}"));

const failed = checks.filter((row) => !row.pass);
for (const row of checks) console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.name}`);
console.log(`Trading rail slideout QA: ${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);
