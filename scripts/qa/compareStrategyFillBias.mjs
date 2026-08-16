#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.cwd();
const fixturePath = path.resolve(process.argv[2] || 'tests/fixtures/strategy/historical-candles.json');
const payload = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const candles = Array.isArray(payload.candles) ? payload.candles.map((row) => ({
  time: typeof row.time === 'string' ? row.time : new Date(Number(row.timestamp)).toISOString(),
  open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume || 0),
})) : [];
if (candles.length < 300) throw new Error(`At least 300 historical candles are required; received ${candles.length}.`);

const engineSourceDir = path.join(root, 'src/services/strategyEngine');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-fill-bias-'));
const engineFiles = ['replayHarness.ts', 'orbVwapBreakout.ts', 'volatilitySqueezeExpansion.ts', 'vwapPullbackReacceleration.ts', 'adaptiveTrendPortfolio.ts', 'regimeRoutedComposite.ts', 'index.ts'];
const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS };

function compileVariant(name, legacy) {
  const variantRoot = path.join(temp, name);
  const targetDir = path.join(variantRoot, 'strategyEngine');
  fs.mkdirSync(targetDir, { recursive: true });
  const costs = fs.readFileSync(path.join(root, 'src/services/transactionCosts.ts'), 'utf8');
  fs.writeFileSync(path.join(variantRoot, 'transactionCosts.js'), ts.transpileModule(costs, { compilerOptions }).outputText);
  for (const file of engineFiles) {
    let source = fs.readFileSync(path.join(engineSourceDir, file), 'utf8');
    if (legacy && file === 'replayHarness.ts') {
      source = source
        .replace('const entryIndex = signalIndex + 1;', 'const entryIndex = signalIndex;')
        .replace('const entry = entryBar.open || entryBar.close;', 'const entry = entryBar.close;')
        .replace('for (let index = entryIndex; index <= exitIndex;', 'for (let index = entryIndex + 1; index <= exitIndex;')
        .replace('const barsHeld = Math.max(1, exitIndex - entryIndex + 1);', 'const barsHeld = Math.max(1, exitIndex - entryIndex);');
    }
    if (legacy && file !== 'replayHarness.ts') {
      source = source
        .replaceAll('candles.length - 1', 'candles.length - 2')
        .replaceAll('primary.length - 1', 'primary.length - 2')
        .replaceAll('index + trade.barsHeld + 1', 'index + trade.barsHeld + 2');
    }
    fs.writeFileSync(path.join(targetDir, file.replace(/\.ts$/, '.js')), ts.transpileModule(source, { compilerOptions }).outputText);
  }
  return require(path.join(targetDir, 'index.js')).bespokeStrategyRunners;
}

const current = compileVariant('current', false);
const legacy = compileVariant('legacy', true);
const context = {
  symbol: 'BTC-USDT', interval: '1h', direction: 'LONG', maxBars: 24, candles,
  parameters: {}, transactionCostModel: { feePct: 0.08, spreadPct: 0.05, fundingRate: 0.0001, fundingIntervalBars: 8 },
};
const names = ['adaptiveTrendPortfolio', 'orbVwapBreakout', 'volatilitySqueezeExpansion', 'vwapPullbackReacceleration'];
const results = Object.fromEntries(names.map((name) => {
  const legacyResult = legacy[name](context);
  const currentResult = current[name](context);
  return [name, {
    legacySameBar: { trades: legacyResult.summary.trades, winRatePct: legacyResult.summary.winRate * 100, totalPnlPct: legacyResult.summary.totalPnlPct },
    causalNextBar: { trades: currentResult.summary.trades, winRatePct: currentResult.summary.winRate * 100, totalPnlPct: currentResult.summary.totalPnlPct },
    pnlDeltaPct: currentResult.summary.totalPnlPct - legacyResult.summary.totalPnlPct,
  }];
}));
console.log(JSON.stringify({ candles: candles.length, costModel: context.transactionCostModel, results }, null, 2));
fs.rmSync(temp, { recursive: true, force: true });
