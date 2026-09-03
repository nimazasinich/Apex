#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (label, condition) => checks.push([label, Boolean(condition)]);

const app = read('src/App.tsx');
const shell = read('src/components/workspace/WorkspaceShell.tsx');
const overviewCss = read('src/components/overview/OverviewWorkspace.css');
const analytics = read('src/pages/analytics/AnalyticsCommandPage.tsx');
const analyticsCss = read('src/pages/analytics/AnalyticsPage.css');
const academy = read('src/pages/academy/AcademyPage.tsx');
const academyCss = read('src/pages/academy/AcademyPage.css');
const shellCss = read('src/styles/workspace-shell.css');
const browserQa = read('scripts/qa/verifyUi1368.mjs');
const capture = read('scripts/capture/capture-dashboard.mts');

check('Overview has six-state strip and three-column command layout', overviewCss.includes('.apex-overview-status-cards') && overviewCss.includes('grid-template-columns: 30fr 42fr 28fr'));
check('Overview treats 1368x753 as canonical', overviewCss.includes('Fixed stage at 1368 x 753') && overviewCss.includes('canonical Overview contract is 1368x753') && overviewCss.includes('grid-template-rows: auto minmax(0, 1fr) minmax(0, 1fr)'));
check('Overview progressively scales on spacious canvases', overviewCss.includes('@media (min-width: 1600px) and (min-height: 900px)') && overviewCss.includes('grid-template-rows: 88px'));
check('Analytics command route is active', app.includes("import { AnalyticsPage } from './pages/analytics/AnalyticsCommandPage'") && app.includes("case 'analytics': content = <AnalyticsPage"));
check('Analytics matches supplied panel inventory', ['Market Analytics', 'Signal Analytics', 'Autopilot Lifecycle', 'Risk Analytics', 'Execution Analytics', 'Latest Strategy Validation Snapshots', 'Alerts & Anomalies', 'Provider / Data Source Health'].every((text) => analytics.includes(text)));
check('Analytics is data-backed and fail-honest', analytics.includes('market.tickers') && analytics.includes('account.insights') && analytics.includes('Not instrumented'));
check('Analytics uses the supplied runtime trend assets', analytics.includes('/analytics/trend-bullish.png') && analytics.includes('/analytics/trend-bearish.png') && fs.existsSync(path.join(root, 'public/analytics/trend-bullish.png')) && fs.existsSync(path.join(root, 'public/analytics/trend-bearish.png')));
check('Analytics uses canonical 1368x753 density', analyticsCss.includes('Canonical 1368x753 density') && analyticsCss.includes('@media (max-width: 1599px), (max-height: 899px)'));
check('Analytics is responsive', analyticsCss.includes('@media (max-width: 1120px)') && analyticsCss.includes('@media (max-width: 700px)'));
check('Academy route and navigation are active', app.includes("case 'academy': content = <AcademyPage") && shell.includes("{ id: 'academy', label: 'Academy'"));
check('Academy matches supplied evidence-workspace composition', ['Strategy Academy', 'Evidence-driven strategy research workspace', 'Strategy Registry', 'Strategy Comparison', 'Smart Recommendations', 'Next-stage Readiness', 'Research Drill-down:', 'Research Actions'].every((text) => academy.includes(text)) && academy.includes('Missing values remain unavailable') && academy.includes('Promotion authority remains server-side'));
check('Academy controls are interactive', ['setQuery(', 'setFamily(', 'setScopeFilter(', 'toggleSelection(', 'setDrillTab('].every((text) => academy.includes(text)));
check('Academy fits the canonical 1368x753 stage', academyCss.includes('canonical 1368 × 753 desktop composition') && academyCss.includes('@media (min-width: 1181px) and (max-height: 820px)'));
check('Academy is scoped to the canonical desktop viewport', !academyCss.includes('@media (max-width: 1180px)') && !academyCss.includes('@media (max-width: 760px)'));
check('Shared shell is calibrated for the canonical viewport', shellCss.includes('Canonical 1368x753 desktop shell calibration') && shellCss.includes('grid-template-columns: 160px minmax(0, 1fr)'));
check('Visual QA and capture default to exactly 1368x753', browserQa.includes("APEX_QA_VIEWPORT_WIDTH || 1368") && browserQa.includes("APEX_QA_VIEWPORT_HEIGHT || 753") && capture.includes("readPositiveInteger('VIEWPORT_WIDTH', 1368)") && capture.includes("readPositiveInteger('VIEWPORT_HEIGHT', 753)"));
check('Reference screenshots are never used as page backgrounds', !/background(?:-image)?\s*:\s*url\([^)]*(Aug 18|Aug 19|Aug 27|ChatGPT Image)/i.test(`${overviewCss}\n${analyticsCss}\n${academyCss}`));

const failed = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
if (failed.length) process.exit(1);
console.log(`\nAttached reference-page contract passed (${checks.length}/${checks.length}).`);
