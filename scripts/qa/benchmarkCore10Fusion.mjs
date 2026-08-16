#!/usr/bin/env node
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); } catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js'); }
require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  module._compile(output, filename);
};

const { getStrategyDefinition, listCoreStrategyDefinitions } = require('../../src/services/strategyRegistry.ts');
const { evaluateStrategyFusion } = require('../../src/services/strategyFusion.ts');
const { runRegimeRoutedComposite } = require('../../src/services/strategyEngine/regimeRoutedComposite.ts');

function candles(count = 900) {
  let price = 100;
  return Array.from({ length: count }, (_, index) => {
    const regime = Math.floor(index / 150) % 4;
    const drift = regime === 0 ? 0.0012 : regime === 1 ? 0.00005 : regime === 2 ? -0.001 : 0.00055;
    const pulse = Math.sin(index / 9) * 0.001;
    const open = price;
    price = Math.max(1, price * (1 + drift + pulse));
    return {
      time: new Date(1_700_000_000_000 + index * 900_000).toISOString(), open,
      high: Math.max(open, price) * 1.003, low: Math.min(open, price) * 0.997,
      close: price, volume: 1_000 * (regime === 1 ? 0.7 : regime === 2 ? 1.9 : 1.15) + index,
    };
  });
}
function quantile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] || 0;
}
const rows = candles();
const definition = getStrategyDefinition('whale-flow-sentiment-reversal-v1');
const now = new Date().toISOString();
const input = {
  definition, symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', candles: rows.slice(-320),
  news: { category: 'news', provider: 'fixture', symbol: 'BTC-USDT', data: [{ title: 'fixture', url: 'fixture', source: 'fixture', publishedAt: now, sentiment: 'bullish' }], source: 'live', status: 'OK', latencyMs: 0, updatedAt: now },
  sentiment: { category: 'sentiment', provider: 'fixture', symbol: 'BTC-USDT', data: { value: 0.7, label: 'POSITIVE', confidence: 0.85 }, source: 'live', status: 'OK', latencyMs: 0, updatedAt: now },
  onchain: { category: 'onchain', provider: 'fixture', symbol: 'BTC-USDT', data: [{ type: 'exchange_withdrawal', amount: 1, amountUSD: 2_000_000, direction: 'outbound', chain: 'bitcoin', transactionHash: 'fixture', timestamp: now }], source: 'live', status: 'OK', latencyMs: 0, updatedAt: now },
};
const fusionTimes = [];
let normalized = null;
for (let index = 0; index < 500; index += 1) {
  const start = performance.now();
  const snapshot = evaluateStrategyFusion(input);
  fusionTimes.push(performance.now() - start);
  const stable = JSON.stringify({ ...snapshot, generatedAt: 0, generatedAtIso: '' });
  if (normalized === null) normalized = stable;
  if (stable !== normalized) throw new Error('Fusion output is not deterministic after timestamp normalization.');
}
const routerTimes = [];
let routed = null;
for (let index = 0; index < 12; index += 1) {
  const start = performance.now();
  const result = runRegimeRoutedComposite({ symbol: 'BTC-USDT', interval: '15m', direction: 'BOTH', maxBars: 48, candles: rows, parameters: {}, transactionCostModel: { feePct: 0.08, spreadPct: 0.05, fundingRate: 0.0001, fundingIntervalBars: 8 } });
  routerTimes.push(performance.now() - start);
  const stable = JSON.stringify(result);
  if (routed === null) routed = stable;
  if (stable !== routed) throw new Error('Regime router output is not deterministic.');
}
console.log(JSON.stringify({
  passed: true,
  coreStrategies: listCoreStrategyDefinitions().length,
  fusion: { iterations: fusionTimes.length, medianMs: quantile(fusionTimes, 0.5), p95Ms: quantile(fusionTimes, 0.95) },
  regimeRouter: { iterations: routerTimes.length, medianMs: quantile(routerTimes, 0.5), p95Ms: quantile(routerTimes, 0.95) },
}, null, 2));
