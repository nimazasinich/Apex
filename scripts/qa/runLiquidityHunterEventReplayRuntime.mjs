#!/usr/bin/env node
import { loadTypeScript } from './lib/loadTypeScript.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = loadTypeScript();
const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-event-replay-'));
function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && full.endsWith('.ts') && !full.endsWith('.test.ts')) files.push(full);
  }
  return files;
}
for (const absolute of walk(path.join(root, 'src'))) {
  const file = path.relative(root, absolute);
  const output = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10, esModuleInterop: true },
  });
  const errors = (output.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(`transpile_failed:${file}:${errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('|')}`);
  const target = path.join(temp, file.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output.outputText);
}
const fromTemp = (file) => require(path.join(temp, file));
const { createReplayDatasetManifest, verifyReplayDatasetManifest } = fromTemp('src/services/replay/replayDatasetManifest.js');
const { runLiquidityHunterEventReplay } = fromTemp('src/services/replay/eventReplayRunner.js');

const BASE = Date.UTC(2026, 7, 7, 12, 0, 0);
const checks = [];
const check = (label, condition) => { const passed = Boolean(condition); checks.push({ label, passed }); console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`); };
let seq = 0;
const event = (type, source, offset, payload, extra = {}) => ({
  eventId: `rp:${String(++seq).padStart(5, '0')}`,
  type,
  source,
  symbol: 'BTC-USDT',
  exchangeTimestamp: BASE + offset,
  receivedAt: BASE + offset + 2,
  schemaVersion: 1,
  ingestionKind: 'REPLAY',
  payload,
  ...extra,
});

try {
  const events = [];
  for (let i = 0; i < 16; i += 1) events.push(event('FUNDING', 'binance-usdm-rest-context', -16 * 60_000 + i * 60_000, { rate: 0.00008 + i * 0.000002 }));
  events.push(event('FUNDING', 'binance-usdm-rest-context', -20_000, { rate: 0.0012 }));
  events.push(event('OPEN_INTEREST', 'binance-usdm-rest-context', -10_000, { openInterest: 1000 }));
  events.push(event('OPEN_INTEREST', 'binance-usdm-rest-context', -5_000, { openInterest: 1040 }));
  events.push(event('ORDERBOOK_SNAPSHOT', 'binance-usdm-ws', -4_000, { bids: [{ price: 64990, size: 4 }], asks: [{ price: 65010, size: 4 }] }, { sequence: 100 }));
  for (let i = 0; i < 22; i += 1) {
    const t = -3_500 + i * 100;
    events.push(event('TRADE', i % 2 ? 'bybit-linear-ws' : 'binance-usdm-ws', t, { price: 65000 - i, size: 1, aggressorSide: i < 12 ? 'SELL' : 'BUY' }));
  }
  events.push(event('ORDERBOOK_DELTA', 'binance-usdm-ws', -1_000, { updates: [{ side: 'BID', price: 64990, size: 6 }] }, { sequenceStart: 101, sequence: 101, previousSequence: 100 }));

  const manifest = createReplayDatasetManifest(events, { datasetId: 'qa-replay-dataset', createdAt: BASE });
  check('manifest records deterministic SHA-256 identity', manifest.eventCount === events.length && manifest.checksumSha256.length === 64);
  check('manifest verification passes the untouched dataset', verifyReplayDatasetManifest(events, manifest).length === 0);
  const tampered = structuredClone(events);
  tampered[0].payload.rate = 99;
  check('manifest detects tampered replay data', verifyReplayDatasetManifest(tampered, manifest).includes('manifest_checksum_mismatch'));

  const flags = {
    liquidityHunterEnabled: true,
    shadowOnly: true,
    realtimeEventRecordingEnabled: false,
    publicFeedsEnabled: false,
    binancePublicFeedEnabled: false,
    bybitPublicFeedEnabled: false,
    realtimeL2Enabled: true,
    optionsGexEnabled: false,
      deribitOptionsPublicEnabled: false,
      hyblockLiquidationTopologyEnabled: false,
    walletGradingEnabled: false, hyperliquidWalletObserverEnabled: false,
      hyperliquidWalletHistoryGradingEnabled: false,
    sentimentVelocityEnabled: false,
    metaModelEnabled: false,
    websocketEnabled: false,
      paperCanaryEnabled: false,
    testnetCanaryEnabled: false,
    autonomousLiveExecutionEnabled: false,
  };
  const first = await runLiquidityHunterEventReplay({ events, symbol: 'BTC-USDT', flags, manifest, evaluateEveryEvents: 10, currentPriceAt: async () => 65000 });
  const second = await runLiquidityHunterEventReplay({ events, symbol: 'BTC-USDT', flags, manifest, evaluateEveryEvents: 10, currentPriceAt: async () => 65000 });
  check('event replay is bit-stable across repeated runs', first.deterministicFingerprint === second.deterministicFingerprint);
  check('event replay uses deterministic IDs', first.evaluations.map((row) => row.evaluationId).join(',') === second.evaluations.map((row) => row.evaluationId).join(',') && first.evaluations.every((row) => /^replay-\d{10}$/.test(row.evaluationId)));
  check('historical replay retains old events instead of wall-clock pruning them', first.seriesStats.events >= events.length - 1);
  check('replay preserves sequence-validated Binance orderbook state', first.orderBookStats.valid >= 1);
  check('replay remains shadow-only and non-authoritative', first.evaluations.every((row) => row.shadowOnly && !row.authoritative));
  check('replay never creates an execution authorization', first.evaluations.every((row) => !row.reasons.some((reason) => reason.includes('execution_authorized'))));

  const failures = checks.filter((row) => !row.passed);
  console.log(`\nLiquidity Hunter event replay runtime: ${checks.length - failures.length}/${checks.length} PASS`);
  process.exitCode = failures.length ? 1 : 0;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
