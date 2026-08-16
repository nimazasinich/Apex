#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); } catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js'); }
require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  module._compile(output, filename);
};

const root = process.cwd();
const registry = require(path.join(root, 'src/services/strategyRegistry.ts'));
const parameters = require(path.join(root, 'src/services/strategyParameters.ts'));
const engines = require(path.join(root, 'src/services/strategyEngine/index.ts'));

const priorStrategyIds = [
  'apex-composite-scanner-v1',
  'crypto-multi-alpha-ls-v1',
  'adaptive-long-short-trend-portfolio-v1',
  'funding-basis-carry-v1',
  'opening-range-vwap-rvol-breakout-v1',
  'volatility-squeeze-trend-volume-expansion-v1',
  'multi-timeframe-vwap-pullback-reacceleration-v1',
  'liquidity-sweep-fvg-reversal-v1',
  'dynamic-cointegration-basket-v1',
  'l2-liquidity-state-scalper-v1',
  'cross-exchange-market-making-v1',
  'funding-aware-avellaneda-mm-v1',
  'regime-routed-ai-ensemble-v1',
];
const all = registry.listStrategyDefinitions({ includeBaseline: true });
const byId = new Map(all.map((definition) => [definition.strategyId, definition]));
const failures = [];
const check = (name, condition, details = '') => {
  const pass = Boolean(condition);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${details ? ` — ${details}` : ''}`);
  if (!pass) failures.push(name);
};

check('all previous strategy IDs remain registered', priorStrategyIds.every((id) => byId.has(id)));
check('no previous package strategy was removed', priorStrategyIds.filter((id) => !byId.has(id)).length === 0);

const orb = byId.get('opening-range-vwap-rvol-breakout-v1');
const squeeze = byId.get('volatility-squeeze-trend-volume-expansion-v1');
const router = byId.get('regime-routed-ai-ensemble-v1');
check('ORB retains manual ATR stop control', orb?.parameters.some((parameter) => parameter.key === 'atrStopMultiplier'));
check('squeeze retains width-lookback control', squeeze?.parameters.some((parameter) => parameter.key === 'widthLookback'));
check('squeeze retains manual ATR stop control', squeeze?.parameters.some((parameter) => parameter.key === 'atrStopMultiplier'));
check('squeeze accepts the newer parameter alias', squeeze?.parameters.find((parameter) => parameter.key === 'widthLookback')?.legacyKeys?.includes('squeezeLookback'));
check('regime router retains the previous 1d interval', router?.supportedIntervals.includes('1d'));

const normalized = parameters.normalizeStrategyParameterAliases(squeeze, { squeezeLookback: 120, rewardRisk: 2.2 });
check('saved squeezeLookback profiles migrate to widthLookback', normalized.widthLookback === 120);
check('unrelated saved parameters survive alias migration', normalized.rewardRisk === 2.2);

const routeSource = fs.readFileSync(path.join(root, 'src/services/apexNextMarketRoutes.ts'), 'utf8');
const strategyPageSource = fs.readFileSync(path.join(root, 'src/pages/strategies/StrategyPage.tsx'), 'utf8');
check('API execution normalizes saved and request parameter aliases', routeSource.includes('normalizeStrategyParameterAliases(args.definition'));
check('fusion preview accepts legacy parameter aliases', routeSource.includes('readStrategyParameterValue(parameter, rawParameters)'));
check('Strategy Studio restores aliases from workspace and optimization profiles', strategyPageSource.includes('buildStrategyParameterValues') && strategyPageSource.includes('normalizeStrategyParameterAliases(selected'));

for (const definition of all) {
  if (definition.status === 'blocked' || definition.status === 'deprecated' || definition.engine !== 'bespoke') continue;
  check(`active bespoke runner remains registered: ${definition.strategyId}`, typeof engines.bespokeStrategyRunners[definition.runFn] === 'function');
}

function makeCandles() {
  const rows = [];
  let close = 100;
  for (let index = 0; index < 900; index += 1) {
    const regime = Math.floor(index / 180) % 4;
    const drift = regime === 0 ? 0.13 : regime === 1 ? 0.015 : regime === 2 ? -0.11 : 0.06;
    const open = close;
    close = Math.max(5, close + drift + Math.sin(index / 8) * 0.08);
    rows.push({
      time: new Date(Date.UTC(2026, 0, 1) + index * 15 * 60_000).toISOString(),
      open,
      high: Math.max(open, close) + 0.45 + (index % 53 === 0 ? 1.1 : 0),
      low: Math.min(open, close) - 0.42 - (index % 67 === 0 ? 0.9 : 0),
      close,
      volume: 1_000 + (index % 24) * 35 + (index % 47 === 0 ? 2_000 : 0),
    });
  }
  return rows;
}
const candles = makeCandles();
const squeezeRunner = engines.bespokeStrategyRunners.volatilitySqueezeExpansion;
const sharedContext = { symbol: 'BTC-USDT', interval: '15m', direction: 'BOTH', maxBars: 48, candles, transactionCostModel: { feePct: 0.08, spreadPct: 0.045, fundingRate: 0.0001, fundingIntervalBars: 8 } };
const oldKeyResult = squeezeRunner({ ...sharedContext, parameters: { widthLookback: 120, atrStopMultiplier: 1.4 } });
const aliasResult = squeezeRunner({ ...sharedContext, parameters: { squeezeLookback: 120, atrStopMultiplier: 1.4 } });
check('legacy and newer squeeze lookback keys execute identically', JSON.stringify(oldKeyResult) === JSON.stringify(aliasResult));
check('compatibility replay remains deterministic', JSON.stringify(oldKeyResult) === JSON.stringify(squeezeRunner({ ...sharedContext, parameters: { widthLookback: 120, atrStopMultiplier: 1.4 } })));

console.log(`\n${failures.length ? 'FAILED' : 'PASSED'} feature-preservation runtime contract (${priorStrategyIds.length} prior strategies).`);
process.exit(failures.length ? 1 : 0);
