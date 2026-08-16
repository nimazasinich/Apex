#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

const app = read('src/App.tsx');
const shell = read('src/components/workspace/WorkspaceShell.tsx');
const strategy = read('src/pages/strategies/StrategyPage.tsx');
const backtesting = read('src/pages/backtesting/BacktestingPage.tsx');
const backtestBuilder = read('src/pages/backtesting/BacktestRunBuilder.tsx');
const backtestHeader = read('src/pages/backtesting/BacktestRunHeader.tsx');
const backtestHero = read('src/pages/backtesting/BacktestEvidenceHero.tsx');
const strategyWorkspace = read('src/pages/strategies/StrategyModelWorkspace.tsx');
const strategyDirectionPolicy = read('src/pages/strategies/directionPolicy.ts');
const help = read('src/pages/help/HelpPage.tsx');
const analytics = read('src/pages/analytics/AnalyticsPage.tsx');
const history = read('src/pages/history/HistoryPage.tsx');
const accountClient = read('src/services/accountClient.ts');
const decisionMemory = read('src/services/decisionMemory.ts');
const journal = read('src/components/workspace/DecisionJournalDrawer.tsx');
const accountViews = read('src/components/workspace/AccountViews.tsx');

check('strategy mutation helper', strategy.includes('apiMutate(') && strategy.includes('/validate'));
check('strategy explicit direction', strategyWorkspace.includes('<DirectionSelector') && strategy.includes('setDirection') && strategy.includes('direction: identity.direction') && strategyDirectionPolicy.includes("return ['LONG', 'SHORT']"));
check('backtesting explicit direction', backtesting.includes('setDirection') && backtestBuilder.includes('<DirectionSelector') && backtestHero.includes('Configuration changed since last run') && backtestHeader.includes('STALE CONFIGURATION'));
check('health trigger and drawer', help.includes('View Status') && help.includes('<SystemHealthDrawer') && shell.includes('<SystemHealthDrawer'));
check('analytics correlation', analytics.includes('<CorrelationMatrix') && exists('src/pages/analytics/components/CorrelationMatrix.tsx'));
check('history current insights', history.includes('props.insights?.activities') && !history.includes('/api/account/history'));
check('decision journal canonical store', journal.includes('DecisionMemoryDB') && decisionMemory.includes('async patch(') && decisionMemory.includes('async delete('));
check('canonical trade plan visualization', accountViews.includes('<TradePlanRiskReward') && exists('src/components/trading/TradePlanRiskReward.tsx'));
check('active page modules', ['WatchlistPage','OrdersPage','PositionsPage','AlertsPage','HistoryPage','AnalyticsPage','SettingsPage','HelpPage'].every((name) => app.includes(`<${name}`)));
check('no active ReferenceViews import', !app.includes('ReferenceViews'));
check('no disconnected workspace client', !exists('src/services/workspaceClient.ts'));
check('no deleted legacy endpoints in active pages', ![help, analytics, history].some((text) => /\/api\/(?:account\/(?:history|analytics)|help\/)/.test(text)));
check('account mutations shared', accountClient.includes("apiMutate('/api/account/connection'") && !/fetch\('\/api\/account\/connection'[\s\S]{0,160}method:\s*'DELETE'/.test(accountClient));
check('duplicate paths removed', !exists('src/pages/components/workspace/AccountViews.tsx') && !exists('src/pages/pages/strategies/StrategyPage.css'));
check('score disclaimer', journal.includes('scores are not probabilities') && analytics.includes('No score is treated as probability'));

const failed = checks.filter((item) => !item.ok);
const report = { generatedAt: new Date().toISOString(), passed: checks.length - failed.length, failed: failed.length, checks };
fs.mkdirSync(path.join(root, 'QA'), { recursive: true });
fs.writeFileSync(path.join(root, 'QA/consolidation-integration-qa.json'), `${JSON.stringify(report, null, 2)}\n`);
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
if (failed.length) process.exit(1);
console.log(`\nConsolidation integration passed (${checks.length}/${checks.length}).`);
