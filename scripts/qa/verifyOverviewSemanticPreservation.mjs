#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));

const signals = read('src/components/overview/OverviewSignalsPanel.tsx');
const market = read('src/components/overview/OverviewMarketSummary.tsx');
const account = read('src/components/overview/OverviewAccountSummary.tsx');
const model = read('src/components/overview/overviewModel.ts');
const analytics = read('src/pages/analytics/AnalyticsCommandPage.tsx');
const insights = read('src/services/workspaceInsights.ts');
const toolbox = read('src/components/workspace/TradingToolbox.tsx');

const checks = [];
function check(name, pass, detail = '') {
  const row = { name, pass: Boolean(pass), detail };
  checks.push(row);
  console.log(`${row.pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

check(
  'overview signal highlight is gated by live market state',
  signals.includes("const marketLive = marketState === 'live'") &&
    signals.includes('marketLive && top?.dataState === \'live\'') &&
    signals.includes("candidate.dataState === 'live'") &&
    signals.includes("candidate.guardPass && candidate.readinessTier !== 'BLOCKED'"),
);
check(
  'non-live signal context is visibly paused rather than actionable',
  signals.includes('Signal display paused — market data') &&
    signals.includes('Signal display paused — candidate inputs') &&
    signals.includes('No actionable live candidates'),
);
check(
  'sentiment composite keeps per-input state and score observability',
  market.includes('sentiment.inputs.map') &&
    market.includes("input.dataState === 'live' ? Math.round(input.score) : 'Skipped'") &&
    market.includes('Sentiment input observability') &&
    market.includes('<ProvenanceChip meta={sentimentProvenance} />'),
);
check(
  'overview financial labels use fields with matching semantics',
  account.includes("label: 'Daily P&L'") &&
    account.includes('realizedPnlUsd') &&
    account.includes('utcDayStart') &&
    account.includes("label: 'Current Exposure'") &&
    account.includes("label: 'Margin Used'") &&
    account.includes("label: 'Margin Utilization'") &&
    !account.includes("label: 'Open Risk'"),
);
check(
  'analytics daily P&L is explicitly realized recent activity, not total P&L',
  analytics.includes('label="Daily P&L"') &&
    analytics.includes('detail="Realized last 24h"') &&
    analytics.includes('item.realizedPnlUsd != null') &&
    analytics.includes('dailyRealized') &&
    analytics.includes('totalPnl'),
);
check(
  'analytics margin telemetry is not mislabeled as open risk',
  analytics.includes('label="Margin Used"') &&
    analytics.includes('label="Margin Utilization"') &&
    analytics.includes('const marginUsed = account.insights?.account.marginUsedUsd') &&
    !analytics.includes('label="Open Risk"') &&
    !analytics.includes('label="Risk Budget Used"'),
);
check(
  'analytics drawdown and risk guard are evidence-derived rather than fabricated',
  analytics.includes('label="Drawdown (Peak)"') &&
    analytics.includes('computePeakDrawdownPct') &&
    analytics.includes('analytics.cumulativePnl') &&
    !analytics.includes('Kill Switch State') &&
    !analytics.includes('All conditions normal') &&
    analytics.includes('Risk Guard State') &&
    analytics.includes('riskScore') && analytics.includes('riskLabel'),
);
check(
  'workspace producer confirms total P&L means realized plus unrealized',
  insights.includes('const totalPnlUsd = realizedPnlUsd === null || unrealizedPnlUsd === null ? null : realizedPnlUsd + unrealizedPnlUsd;'),
);
check(
  'workspace producer confirms marginUsedUsd is margin telemetry',
  insights.includes("const directMarginUsed = optionalNumberKeys(account, ['positionMargin', 'marginUsed'])") &&
    insights.includes("const orderMargin = optionalNumberKeys(account, ['orderMargin', 'frozenFunds'])") &&
    insights.includes('const marginUsedUsd = baseMarginUsed === null ? null'),
);
check(
  'misleading synthetic daily/open-risk derivation helpers are absent',
  !model.includes('dailyPnlFromInsights') && !model.includes('openRiskUsd'),
);
check(
  'signals toolbox badge no longer makes an unconditional LIVE claim',
  toolbox.includes("key: 'signals'") && toolbox.includes("badge: 'SCANNER'") &&
    !/key:\s*'signals'[^\n]+badge:\s*'LIVE'/.test(toolbox),
);

const failed = checks.filter((row) => !row.pass);
const report = {
  generatedAt: new Date().toISOString(),
  version: pkg.version,
  passed: checks.length - failed.length,
  total: checks.length,
  checks,
};
fs.mkdirSync(path.join(root, 'QA'), { recursive: true });
fs.writeFileSync(path.join(root, `QA/overview-semantic-preservation-v${pkg.version}.json`), `${JSON.stringify(report, null, 2)}\n`);

if (failed.length) {
  console.error(`\n${failed.length}/${checks.length} overview semantic-preservation checks failed.`);
  process.exit(1);
}
console.log(`\nOverview semantic preservation passed (${checks.length}/${checks.length}).`);
