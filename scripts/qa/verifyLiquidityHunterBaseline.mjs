#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const pkg = JSON.parse(read('package.json'));
const registry = read('src/services/strategyRegistry.ts');
const routes = read('src/services/apexNextMarketRoutes.ts');
const server = read('server.ts');
const governance = read('src/services/adaptiveThresholdGovernance.ts');
const baselinePath = 'QA/liquidity-hunter-baseline/baseline.json';
const baseline = exists(baselinePath) ? JSON.parse(read(baselinePath)) : null;

const strategyIds = [...registry.matchAll(/strategyId:\s*'([^']+)'/g)].map((match) => match[1]);
const defaultStrategyMatch = registry.match(/DEFAULT_STRATEGY_ID\s*=\s*'([^']+)'/);
const uniqueStrategyIds = [...new Set([...(defaultStrategyMatch ? [defaultStrategyMatch[1]] : []), ...strategyIds])];
const currentRouteText = `${routes}\n${server}`;
const preservedStrategyIds = baseline?.strategyRegistry?.strategies?.map((item) => item.strategyId) ?? [];
const preservedRouteLiterals = baseline?.apiRoutes?.routes ?? [];
const preservedScriptNames = Object.keys(baseline?.packageScripts?.scripts ?? {});
const checks = [
  ['baseline preservation manifest exists', Boolean(baseline)],
  ['all snapshotted strategy identities remain registered', preservedStrategyIds.length > 0 && preservedStrategyIds.every((id) => uniqueStrategyIds.includes(id))],
  ['all snapshotted API route literals remain present', preservedRouteLiterals.length > 0 && preservedRouteLiterals.every((route) => currentRouteText.includes(route))],
  ['all snapshotted package scripts remain present', preservedScriptNames.length > 0 && preservedScriptNames.every((name) => typeof pkg.scripts?.[name] === 'string')],
  ['preserved strategy inventory is at least the audited 13 identities', uniqueStrategyIds.length >= 13],
  ['baseline strategy remains registered', registry.includes("DEFAULT_STRATEGY_ID = 'apex-composite-scanner-v1'")],
  ['ORB ATR compatibility remains present', registry.includes("key: 'atrStopMultiplier'")],
  ['squeeze canonical widthLookback remains present', registry.includes("key: 'widthLookback'")],
  ['squeezeLookback alias remains present', registry.includes("legacyKeys: ['squeezeLookback']")],
  ['regime router retains 1d support', /regime-routed-ai-ensemble-v1[\s\S]{0,1600}supportedIntervals:\s*\[[^\]]*'1d'/.test(registry)],
  ['backtest route remains registered', routes.includes("'/api/market/backtest'") || server.includes("'/api/market/backtest'" )],
  ['strategy validation route remains registered', routes.includes("/api/strategies/:strategyId/validate")],
  ['optimizer route remains registered', routes.includes("/api/strategies/:strategyId/optimize")],
  ['adaptive governance remains manual', governance.includes('automaticPromotionEnabled: false')],
  ['existing verify script remains present', typeof pkg.scripts?.verify === 'string'],
  ['existing feature preservation gate remains present', typeof pkg.scripts?.['qa:feature-preservation'] === 'string'],
  ['autonomous live execution remains explicitly unavailable while verified manual Live is truthfully scoped', server.includes('autonomous live execution is unavailable') && server.includes('/api/account/orders')],
];

let failures = 0;
for (const [label, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  if (!passed) failures += 1;
}
console.log(`\n${checks.length - failures}/${checks.length} PASS`);
process.exit(failures === 0 ? 0 : 1);
