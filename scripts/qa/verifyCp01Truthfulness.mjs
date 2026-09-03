#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const failures = [];
const check = (name, condition) => { if (!condition) failures.push(name); else console.log(`[PASS] ${name}`); };

const workspaceSource = fs.readFileSync(path.join(root, 'src/services/workspaceInsights.ts'), 'utf8');
check('workspace has no UNKNOWN-USDT provider-shaped fallback', !workspaceSource.includes('UNKNOWN-USDT'));
check('workspace has no fabricated activity Date.now fallback', !/timestampKeys\([^\n]+\)\s*\|\|\s*Date\.now/.test(workspaceSource));
check('workspace position side preserves UNKNOWN', workspaceSource.includes("side: 'LONG' | 'SHORT' | 'UNKNOWN'"));
check('workspace account values are nullable', workspaceSource.includes('equityUsd: number | null'));
check('workspace mark price has no entry-price fallback', !/markPrice[^\n]+entryPrice/.test(workspaceSource));

const formatterSource = fs.readFileSync(path.join(root, 'src/pages/referenceUi.tsx'), 'utf8');
check('shared formatters reject null before numeric conversion', formatterSource.includes("value === null || value === undefined || !Number.isFinite(value)"));

const tabdealSource = fs.readFileSync(path.join(root, 'src/services/exchanges/tabdeal/tabdealNormalizer.ts'), 'utf8');
check('Tabdeal numeric parser returns null for missing', tabdealSource.includes("if (value === null || value === undefined || value === '') return null"));
check('Tabdeal missing position direction is UNKNOWN', tabdealSource.includes("positionAmt === null ? 'UNKNOWN'"));
check('Tabdeal missing order side is UNKNOWN', tabdealSource.includes("r.side === 'BUY' ? 'BUY' : 'UNKNOWN'"));

// Node 22 can type-strip this module because all workspace imports are type-only.
const { buildWorkspaceInsights } = await import(pathToFileURL(path.join(root, 'src/services/workspaceInsights.ts')).href);
const base = { account: {}, positions: [], openOrders: [], recentOrders: [], recentTrades: [], positionHistory: [], serverTime: null, syncedAt: '2026-08-30T00:00:00Z' };
let insights = buildWorkspaceInsights(base);
check('missing equity remains null', insights.account.equityUsd === null);
check('missing available balance remains null', insights.account.availableBalanceUsd === null);
check('empty analytics does not fabricate a current-time point', insights.analytics.cumulativePnl.length === 0);
insights = buildWorkspaceInsights({ ...base, account: { accountEquity: 10_000 }, positions: [{ currentQty: null, entryPrice: 100 }], openOrders: [{ id: 'o1' }], recentTrades: [{ id: 't1', price: 100, size: 1 }] });
check('missing symbol remains null', insights.positions[0]?.symbol === null && insights.orders[0]?.symbol === null);
check('missing direction remains UNKNOWN', insights.positions[0]?.side === 'UNKNOWN' && insights.orders[0]?.side === 'unknown');
check('missing mark price remains null', insights.positions[0]?.markPrice === null);
check('missing event timestamp remains null', insights.activities.find((row) => row.id === 't1')?.timestamp === null);

if (failures.length) {
  console.error(`CP01 FAILED: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('CP01 truthfulness acceptance: PASS');
