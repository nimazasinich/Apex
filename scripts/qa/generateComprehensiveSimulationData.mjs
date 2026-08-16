#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { generateSimulationCorpus, DEFAULT_SIMULATION_SEED, SIMULATION_SCHEMA_VERSION } from './lib/simulatedMarketData.mjs';

const root = process.cwd();
const outDir = path.join(root, 'QA', 'simulated-data');
const seedArg = process.argv.find((arg) => arg.startsWith('--seed='));
const seed = seedArg ? Number(seedArg.split('=')[1]) : DEFAULT_SIMULATION_SEED;
if (!Number.isInteger(seed) || seed < 0) throw new Error('seed_must_be_nonnegative_integer');
const corpus = generateSimulationCorpus({ seed });
fs.mkdirSync(outDir, { recursive: true });
const files = [];
for (const dataset of corpus.datasets) {
  const stem = `${dataset.symbol.toLowerCase().replaceAll('-', '_')}__${dataset.regime}`;
  const candleFile = `${stem}__candles.json`;
  const eventFile = `${stem}__events.json`;
  const candleText = `${JSON.stringify(dataset.candles)}\n`;
  const eventText = `${JSON.stringify(dataset.events)}\n`;
  fs.writeFileSync(path.join(outDir, candleFile), candleText);
  fs.writeFileSync(path.join(outDir, eventFile), eventText);
  files.push({ file: candleFile, kind: 'candles', symbol: dataset.symbol, regime: dataset.regime, rows: dataset.candles.length, sha256: crypto.createHash('sha256').update(candleText).digest('hex') });
  files.push({ file: eventFile, kind: 'microstructure-events', symbol: dataset.symbol, regime: dataset.regime, rows: dataset.events.length, sha256: crypto.createHash('sha256').update(eventText).digest('hex') });
}
const manifest = {
  schemaVersion: SIMULATION_SCHEMA_VERSION,
  generatedAt: new Date().toISOString(),
  deterministic: true,
  syntheticOnly: true,
  seed,
  requestedBarsPerDataset: corpus.barsRequested,
  datasets: corpus.datasets.length,
  candleRows: files.filter((item) => item.kind === 'candles').reduce((sum, item) => sum + item.rows, 0),
  eventRows: files.filter((item) => item.kind === 'microstructure-events').reduce((sum, item) => sum + item.rows, 0),
  purpose: 'Regression/stress qualification only. Never treated as live evidence, calibration proof, or execution authority.',
  files,
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, outDir: path.relative(root, outDir), ...manifest }, null, 2));
