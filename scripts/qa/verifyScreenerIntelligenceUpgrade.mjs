#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (name, condition) => checks.push({ name, ok: Boolean(condition) });

const app = read('src/App.tsx');
const routes = read('src/services/apexNextMarketRoutes.ts');
const scoring = read('src/lib/scoring.ts');
const authority = read('src/services/canonicalCandidateDecision.ts');
const sampler = read('src/services/openInterestHistory.ts');
const server = read('server.ts');
const analytics = read('src/pages/analytics/AnalyticsCommandPage.tsx');
const analyticsCss = read('src/pages/analytics/AnalyticsPage.css');

check('Screener uses a bounded enrichment budget', app.includes('candidates?limit=24') && routes.includes('index < Math.min(12, scanTickers.length)'));
check('Shadow flag is honored instead of forced on', routes.includes('includeShadow,\n          includeDirectionForTicker') && !routes.includes('ticker.lastPrice, true, includeDirection'));
check('Candidate enrichment has bounded concurrency and a useful cache', routes.includes('scanTickers,\n      5,') && routes.includes('? 45_000 : 60_000'));
check('Scores shrink incomplete evidence and reward confluence', scoring.includes('evidenceAdjustedScore') && scoring.includes('confluenceAdjustment') && scoring.includes('Trend confirmation failed'));
check('SIGNAL has strict confidence, coverage, confluence and net-edge gates', ['MIN_SIGNAL_CONFIDENCE', 'MIN_SIGNAL_COVERAGE_PCT', 'MIN_SIGNAL_NET_EDGE_PCT', "confluence === 'ALIGNED'"].every((text) => authority.includes(text)));
check('Candidate rank accounts for confidence and uncertainty', authority.includes('confidenceBonus') && authority.includes('uncertaintyPenalty') && authority.includes('agreementBonus'));
check('OI sampler delays startup and backs off failures', sampler.includes('initialDelayMs') && sampler.includes('maxBackoffMs') && server.includes('APEX_OI_INITIAL_DELAY_MS') && server.includes('open_interest_sampler_retry_scheduled'));
check('Analytics is locked to the canonical viewport', analyticsCss.includes('2026-08-30 Analytics reference lock') && analyticsCss.includes('@media (min-width: 1181px) and (max-height: 820px)'));
check('Analytics uses supplied trend images and real provider latency', analytics.includes('/analytics/trend-bullish.png') && analytics.includes('/analytics/trend-bearish.png') && analytics.includes('binanceLatencyMs') && analytics.includes('kucoinLatencyMs'));
check('Attached analytics assets are present', ['public/analytics/trend-bullish.png', 'public/analytics/trend-bearish.png', 'Doc/reference/attached/analytics-target.png'].every((file) => fs.existsSync(path.join(root, file))));

for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} Screener/Analytics intelligence checks passed.`);
if (failed.length) process.exit(1);
