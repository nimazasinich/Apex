#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const accountViews = read('src/components/workspace/AccountViews.tsx');
const toolbox = read('src/components/workspace/TradingToolbox.tsx');
const facts = read('src/components/trading/InstrumentFacts.tsx');
const css = read('src/components/trading/TradingWorkspace.css');

const checks = [];
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });

check('market strip includes real More Markets navigation action', accountViews.includes('apex-market-strip-more') && accountViews.includes("navigateWorkspace('markets')"));
check('instrument header exposes trading mode and strategy context', facts.includes('tradingMode') && facts.includes('strategySummary') && accountViews.includes('strategySummary={systemContext?.strategyName || null}'));
check('order ticket renders Set Order / Review / Confirm workflow', accountViews.includes('apex-order-flow-steps') && accountViews.includes('Set Order') && accountViews.includes('Review') && accountViews.includes('Confirm'));
check('order review has explicit disabled reason before unsafe preview', accountViews.includes('orderBlockReason') && accountViews.includes('Review blocked') && accountViews.includes('disabled={working || Boolean(orderBlockReason)}'));
check('expired preview uses friendly non-confirmable review-again copy', accountViews.includes('Preview expired — review again') && accountViews.includes('The market moved. Please review this order again before confirming.'));
check('market depth advertises ticket prefill only when handler exists', accountViews.includes('apex-depth-click-hint') && accountViews.includes('Click a price to prefill the ticket') && accountViews.includes('disabled={!onPickPrice}'));
check('activity panel preserves Positions / Orders / Trades and adds Alerts / Performance / Logs', accountViews.includes("'alerts' | 'performance' | 'logs'") && accountViews.includes("label: 'Alerts'") && accountViews.includes("label: 'Performance'") && accountViews.includes("label: 'Logs'"));
check('activity panel uses real local alert storage event rather than mock data', accountViews.includes('LOCAL_PRICE_ALERTS_KEY') && accountViews.includes('readLocalPriceAlerts') && accountViews.includes('LOCAL_PRICE_ALERTS_EVENT'));
check('right rail includes Ticket, Orders, Positions, Depth, Trades, Strategy, Signals, Settings', ['order','orders','positions','depth','trades','strategy','signals','settings'].every((key) => toolbox.includes(`key: '${key}'`)));
check('right rail communicates inline/drawer/workspace behavior', toolbox.includes('behavior:') && toolbox.includes('apex-rail-behavior') && toolbox.includes('workspaceActions'));
check('drawers remain inside Trading toolbox instead of page-wide overlay', css.includes('.apex-trading-toolbox .apex-drawer') && css.includes('position: absolute') && css.includes('right: 100%'));
check('confirmation overlay is scoped to Trading workspace boundaries', css.includes('.apex-confirm-backdrop') && css.includes('position: absolute'));
check('palette follows APEX calm light trading tokens', css.includes('--apex-trading-primary: #009b7a') && css.includes('--apex-trading-border: #e5eaf0') && css.includes('--apex-trading-warning-bg: #fff4e8'));
check('responsive container rules keep chart-first layout scalable', css.includes('@container trading-workspace') && css.includes('minmax(430px, 1fr)'));
check('reduced motion preference is respected', css.includes('@media (prefers-reduced-motion: reduce)'));
check('accessibility semantics kept for tabs/tools/pressed market buttons', accountViews.includes('aria-pressed={ticker.symbol === selectedTicker?.symbol}') && toolbox.includes('aria-pressed={open === tool.key}') && accountViews.includes('aria-label="Order workflow"'));
check('trading lab preview is explicitly development-gated', accountViews.includes("import.meta.env.DEV && import.meta.env.VITE_APEX_TRADING_LAB_PREVIEW === 'true'") && !accountViews.includes('const TRADING_LAB_PREVIEW_ENABLED = true;'));
check('trading lab preview remains visibly labeled when enabled', accountViews.includes('LAB PREVIEW') || facts.includes('LAB PREVIEW'));


const failed = checks.filter((row) => !row.pass);
for (const row of checks) console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.name}`);
console.log(`Trading page modernization QA: ${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);
