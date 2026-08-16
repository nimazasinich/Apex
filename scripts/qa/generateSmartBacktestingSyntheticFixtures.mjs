#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const outDir = path.join(root, 'QA', 'smart-backtesting-fixtures');
const seed = 0xA9E1_063;
const horizons = [500, 1000, 2000, 3000, 5000];
const regimes = ['trend', 'sideways', 'volatile', 'gap_partial', 'low_trade', 'no_trade'];

function makeRng(initial) {
  let state = initial >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function candleSeries({ bars, regime, symbol, timeframeMinutes }) {
  const rng = makeRng(seed ^ bars ^ regime.length ^ symbol.length);
  const start = Date.UTC(2026, 0, 1, 0, 0, 0);
  const step = timeframeMinutes * 60_000;
  let price = symbol.startsWith('BTC') ? 62000 : symbol.startsWith('ETH') ? 3400 : 140;
  const rows = [];
  for (let i = 0; i < bars; i += 1) {
    if (regime === 'gap_partial' && (i % 97 === 0 || i % 181 === 0)) continue;
    let drift = 0;
    let shock = 0;
    if (regime === 'trend') drift = 0.00042;
    if (regime === 'sideways') drift = Math.sin(i / 33) * 0.00012;
    if (regime === 'volatile') shock = (rng() - 0.5) * 0.015;
    if (regime === 'low_trade') drift = Math.sin(i / 90) * 0.00004;
    if (regime === 'no_trade') drift = Math.sin(i / 150) * 0.00001;
    const noise = (rng() - 0.5) * (regime === 'no_trade' ? 0.00008 : 0.0028);
    const move = drift + shock + noise;
    const open = price;
    const close = Math.max(0.01, open * (1 + move));
    const wick = Math.max(open, close) * (0.0008 + rng() * (regime === 'volatile' ? 0.008 : 0.002));
    const high = Math.max(open, close) + wick;
    const low = Math.max(0.01, Math.min(open, close) - wick);
    const volume = regime === 'no_trade' ? 0 : 10 + rng() * (regime === 'volatile' ? 1400 : 320);
    rows.push({ timestamp: start + i * step, open: round(open), high: round(high), low: round(low), close: round(close), volume: round(volume, 4) });
    price = close;
  }
  return rows;
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const files = [];
for (const bars of horizons) {
  for (const regime of regimes) {
    const symbol = bars % 2000 === 0 ? 'ETH-USDT' : 'BTC-USDT';
    const timeframeMinutes = bars >= 3000 ? 15 : 60;
    const rows = candleSeries({ bars, regime, symbol, timeframeMinutes });
    const payload = {
      schemaVersion: 1,
      label: 'Synthetic fixture data for offline verification only. Not live market data.',
      syntheticOnly: true,
      liveMarketData: false,
      seed,
      purpose: 'Smart Backtesting offline verification of horizons, gaps, partial history, low-trade, and no-trade states.',
      symbol,
      timeframe: `${timeframeMinutes}m`,
      requestedBars: bars,
      returnedBars: rows.length,
      regime,
      candles: rows,
    };
    const file = `smart_${bars}_${regime}.json`;
    const body = `${JSON.stringify(payload, null, 2)}\n`;
    fs.writeFileSync(path.join(outDir, file), body);
    files.push({ file, bars, regime, rows: rows.length, sha256: crypto.createHash('sha256').update(body).digest('hex') });
  }
}
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  syntheticOnly: true,
  liveQualificationClaimed: false,
  label: 'Synthetic fixture data for offline verification only. Not live market data.',
  seed,
  horizons,
  regimes,
  files,
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, outDir: path.relative(root, outDir), fixtureFiles: files.length, horizons, regimes, syntheticOnly: true }, null, 2));
