#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); }
catch { ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js'); }
const root = process.cwd();
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const sourceFile = path.join(root, 'src/services/replay/microstructureFillSimulator.ts');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-lh-micro-bench-'));
try {
  const compiled = ts.transpileModule(fs.readFileSync(sourceFile, 'utf8'), {
    fileName: sourceFile,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const target = path.join(temp, 'microstructureFillSimulator.js');
  fs.writeFileSync(target, compiled);
  const { runMicrostructureSimulationBatch } = require(target);

  const t0 = Date.UTC(2026, 7, 7, 12, 0, 0);
  const events = [
    { eventId: 'ob', type: 'ORDERBOOK_SNAPSHOT', source: 'qa', symbol: 'BTC-USDT', exchangeTimestamp: t0, receivedAt: t0, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { bids: [{ price: 100, size: 20 }], asks: [{ price: 100.1, size: 20 }] } },
    { eventId: 'q0', type: 'QUOTE', source: 'qa', symbol: 'BTC-USDT', exchangeTimestamp: t0, receivedAt: t0, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { bid: 100, ask: 100.1, bidSize: 20, askSize: 20 } },
  ];
  for (let index = 1; index <= 3000; index += 1) {
    const price = 100 + Math.sin(index / 40) * 0.9 + index / 3000 * 1.5;
    events.push({ eventId: `t${index}`, type: 'TRADE', source: 'qa', symbol: 'BTC-USDT', exchangeTimestamp: t0 + index * 100, receivedAt: t0 + index * 100, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { price, size: 1 + index % 5, aggressorSide: index % 2 ? 'BUY' : 'SELL' } });
    if (index % 10 === 0) events.push({ eventId: `q${index}`, type: 'QUOTE', source: 'qa', symbol: 'BTC-USDT', exchangeTimestamp: t0 + index * 100, receivedAt: t0 + index * 100, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { bid: price - 0.05, ask: price + 0.05, bidSize: 20, askSize: 20 } });
  }
  const taskCount = 64;
  const inputs = Array.from({ length: taskCount }, (_, index) => ({
    simulationId: `bench-${index}`,
    symbol: 'BTC-USDT',
    events,
    orderSide: index % 2 ? 'SELL' : 'BUY',
    entryType: 'MARKET',
    submitAt: t0 + index % 100 * 100,
    quantity: 2,
    stopPrice: index % 2 ? 102.5 : 98,
    targetPrice: index % 2 ? 98.5 : 102.5,
    latencyMs: 25,
    maxHorizonMs: 300_000,
    makerFeeBps: 2,
    takerFeeBps: 5,
    marketSlippageBps: 1,
  }));

  const measure = async (workerCount) => {
    const started = performance.now();
    const result = await runMicrostructureSimulationBatch(inputs, workerCount);
    return { ms: performance.now() - started, result };
  };
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  // Warm both pool widths before recording timings. Alternate measurement order
  // to reduce cold-start and host-scheduler bias in the reported median.
  await runMicrostructureSimulationBatch(inputs.slice(0, 8), 1);
  await runMicrostructureSimulationBatch(inputs.slice(0, 8), 4);
  const singleRuns = [];
  const parallelRuns = [];
  let singleResult = null;
  let parallelResult = null;
  for (let round = 0; round < 3; round += 1) {
    const order = round % 2 === 0 ? [1, 4] : [4, 1];
    for (const workerCount of order) {
      const measurement = await measure(workerCount);
      if (workerCount === 1) { singleRuns.push(measurement.ms); singleResult = measurement.result; }
      else { parallelRuns.push(measurement.ms); parallelResult = measurement.result; }
    }
  }
  const singleMs = median(singleRuns);
  const parallelMs = median(parallelRuns);
  const artifact = {
    generatedAt: new Date().toISOString(),
    methodology: 'SYNTHETIC_CPU_STRESS_NOT_PROFITABILITY_EVIDENCE',
    tasks: taskCount,
    eventsPerTask: events.length,
    repetitions: 3,
    singleWorkerRunsMs: singleRuns.map((value) => Number(value.toFixed(2))),
    fourWorkerRunsMs: parallelRuns.map((value) => Number(value.toFixed(2))),
    singleWorkerMedianMs: Number(singleMs.toFixed(2)),
    fourWorkerMedianMs: Number(parallelMs.toFixed(2)),
    observedMedianSpeedup: Number((singleMs / parallelMs).toFixed(2)),
    uniqueWorkersSingle: new Set(singleResult.map((row) => row.workerThreadId)).size,
    uniqueWorkersParallel: new Set(parallelResult.map((row) => row.workerThreadId)).size,
    resultsIdenticalByStatus: singleResult.every((row, index) => row.result.status === parallelResult[index]?.result.status && row.result.netReturnPct === parallelResult[index]?.result.netReturnPct),
    caveat: 'Worker-thread speedup is hardware/runtime dependent and is not a trading-performance claim.',
  };
  fs.mkdirSync(path.join(root, 'QA'), { recursive: true });
  fs.writeFileSync(path.join(root, 'QA', `liquidity-hunter-microstructure-worker-benchmark-v${packageVersion}.json`), JSON.stringify(artifact, null, 2) + '\n');
  console.log(JSON.stringify(artifact, null, 2));
  if (artifact.uniqueWorkersSingle !== 1 || artifact.uniqueWorkersParallel !== 4 || !artifact.resultsIdenticalByStatus) process.exitCode = 1;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
