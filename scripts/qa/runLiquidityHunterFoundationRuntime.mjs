#!/usr/bin/env node
import { loadTypeScript } from './lib/loadTypeScript.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = loadTypeScript();

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-liquidity-foundation-'));
// Transpiled modules live under the temporary tree, so Node would otherwise
// search upward from the temp directory and miss this checkout's dependencies
// (notably undici and socks-proxy-agent). Keep the harness isolated while
// exposing the already-installed dependency tree through a junction/symlink.
const tempNodeModules = path.join(temp, 'node_modules');
try {
  fs.symlinkSync(path.join(root, 'node_modules'), tempNodeModules, process.platform === 'win32' ? 'junction' : 'dir');
} catch (error) {
  throw new Error(`runtime_dependency_link_failed:${error instanceof Error ? error.message : String(error)}`);
}
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
  const errors = (output.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(`transpile_failed:${file}:${errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, ' ')).join('|')}`);
  const target = path.join(temp, file.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output.outputText);
}

const fromTemp = (file) => require(path.join(temp, file));
const { readLiquidityHunterFeatureFlags } = fromTemp('src/services/liquidityHunter/featureFlags.js');
const { getEdgeCatalog } = fromTemp('src/services/liquidityHunter/edgeCatalog.js');
const { InProcessEventBus } = fromTemp('src/services/realtime/inProcessEventBus.js');
const { AppendOnlyEventLog } = fromTemp('src/services/realtime/appendOnlyEventLog.js');
const { SequenceGuard, sequenceKey } = fromTemp('src/services/realtime/sequenceGuard.js');
const { WorldStateStore } = fromTemp('src/services/realtime/worldStateStore.js');
const { RealtimeSeriesStore } = fromTemp('src/services/realtime/realtimeSeriesStore.js');
const { OrderBookRebuilder } = fromTemp('src/services/realtime/orderBookRebuilder.js');
const { RealtimeHealthTracker } = fromTemp('src/services/realtime/realtimeHealth.js');
const { SnapshotCoordinator } = fromTemp('src/services/realtime/snapshotCoordinator.js');
const { initializeLiquidityHunterFoundation, getLiquidityHunterOperationsSnapshot, shutdownLiquidityHunterFoundation } = fromTemp('src/services/liquidityHunter/foundationRuntime.js');
const { publishFundingOiBootstrap, KUCOIN_FUNDING_OI_BOOTSTRAP_SOURCE } = fromTemp('src/services/liquidityHunter/restContextBootstrapCore.js');
const { evaluateFundingOiEdge } = fromTemp('src/services/liquidityHunter/edges/fundingOiEdge.js');

const checks = [];
const check = (label, condition) => { const passed = Boolean(condition); checks.push({ label, passed }); console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`); };
const BASE = Date.UTC(2026, 7, 7, 10, 0, 0);
const makeEvent = (type, sequence, eventId = `${type}-${sequence}`, payload = { price: 100 + sequence, size: 1 }, source = 'binance-usdm') => ({
  eventId, type, source, symbol: 'BTC-USDT', exchangeTimestamp: BASE + sequence, receivedAt: BASE + sequence + 5, sequence, schemaVersion: 1, payload,
});

try {
  const flags = readLiquidityHunterFeatureFlags({});
  check('feature flags default off', flags.liquidityHunterEnabled === false && flags.realtimeEventRecordingEnabled === false);
  check('shadow only is mandatory', flags.shadowOnly === true && flags.autonomousLiveExecutionEnabled === false);
  let shadowDisableRejected = false;
  try { readLiquidityHunterFeatureFlags({ APEX_LIQUIDITY_HUNTER_SHADOW_ONLY: 'false' }); } catch (error) { shadowDisableRejected = String(error).includes('cannot_be_disabled'); }
  check('attempt to disable shadow-only is rejected', shadowDisableRejected);
  check('ten evidence-only edges exist', getEdgeCatalog().length === 10 && getEdgeCatalog().every((edge) => edge.evidenceOnly));

  const ordered = [];
  const bus = new InProcessEventBus({ maxQueuePerSource: 8 });
  bus.subscribe(async (event) => { ordered.push(event.eventId); });
  const dispositions = await Promise.all([bus.publish(makeEvent('TRADE', 1)), bus.publish(makeEvent('TRADE', 2)), bus.publish(makeEvent('TRADE', 3))]);
  check('event bus preserves per-source order', ordered.join(',') === 'TRADE-1,TRADE-2,TRADE-3');
  check('trade publications are lossless/delivered by default', dispositions.every((value) => value === 'DELIVERED') && bus.stats().sampled === 0);

  const guard = new SequenceGuard();
  check('sequence seed accepted', guard.inspect(makeEvent('TRADE', 10)).status === 'ACCEPTED');
  check('sequence gap detected and latch remains gapped', guard.inspect(makeEvent('TRADE', 12)).status === 'GAP' && guard.inspect(makeEvent('TRADE', 13)).status === 'GAP');
  guard.seed(sequenceKey(makeEvent('TRADE', 11)), 11);
  check('explicit reseed recovers sequence', guard.inspect(makeEvent('TRADE', 12)).status === 'ACCEPTED');
  const bookGuard = new SequenceGuard();
  check('orderbook snapshot and deltas share one sequence family', bookGuard.inspect(makeEvent('ORDERBOOK_SNAPSHOT', 100)).status === 'ACCEPTED' && bookGuard.inspect(makeEvent('ORDERBOOK_DELTA', 101)).status === 'ACCEPTED');
  const ranged = { ...makeEvent('ORDERBOOK_DELTA', 104), sequenceStart: 102, previousSequence: 101 };
  check('range sequences accept an update window that covers the expected sequence', bookGuard.inspect(ranged).status === 'ACCEPTED');
  const badLinked = { ...makeEvent('ORDERBOOK_DELTA', 106), sequenceStart: 105, previousSequence: 999 };
  check('provider previous-sequence mismatch fails closed', bookGuard.inspect(badLinked).status === 'GAP');
  check('authoritative orderbook snapshot reseeds a gapped sequence', bookGuard.inspect(makeEvent('ORDERBOOK_SNAPSHOT', 200)).status === 'ACCEPTED' && bookGuard.inspect({ ...makeEvent('ORDERBOOK_DELTA', 202), sequenceStart: 201, previousSequence: 200 }).status === 'ACCEPTED');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-lh-runtime-'));
  const eventPath = path.join(dir, 'events.jsonl');
  const log = new AppendOnlyEventLog({ filePath: eventPath, fsync: false, maxSegmentBytes: 64 * 1024 });
  await log.append(makeEvent('TRADE', 1));
  await log.flush();
  check('worker-thread event log persists acknowledged writes', log.readAll().events.length === 1);
  const permissionsRestricted = process.platform === 'win32'
    ? (() => {
        try {
          const acl = execFileSync('icacls.exe', [eventPath], { encoding: 'utf8', windowsHide: true });
          const identity = [process.env.USERDOMAIN, process.env.USERNAME].filter(Boolean).join('\\').toLowerCase();
          const normalized = acl.toLowerCase();
          return Boolean(identity)
            && normalized.includes(identity)
            && !normalized.includes('everyone:')
            && !normalized.includes('authenticated users:')
            && !normalized.includes('builtin\\users:');
        } catch { return false; }
      })()
    : (fs.statSync(eventPath).mode & 0o777) === 0o600;
  check('event log permissions are owner-only', permissionsRestricted);
  await log.close();

  const bus2 = new InProcessEventBus({ maxQueuePerSource: 8 });
  const worldState = new WorldStateStore();
  const seriesStore = new RealtimeSeriesStore({ maxEventsPerKey: 64, maxAgeMs: 60_000 });
  const orderBook = new OrderBookRebuilder();
  const health = new RealtimeHealthTracker();
  const coordinator = new SnapshotCoordinator({ eventBus: bus2, worldState, sequenceGuard: new SequenceGuard(), health, seriesStore, orderBook });
  coordinator.start();
  await bus2.publish(makeEvent('TRADE', 1));
  check('accepted event is materialized into bounded series and world state', seriesStore.stats().events === 1 && worldState.snapshot(BASE + 100).entries.length === 1);
  await bus2.publish(makeEvent('TRADE', 3));
  const invalid = worldState.snapshot(BASE + 100).entries.find((row) => row.eventType === 'TRADE');
  check('sequence gap invalidates world state immediately', invalid?.quality === 'INVALID');
  check('sequence gap clears affected realtime series', seriesStore.stats().events === 0);
  coordinator.stop();
  await bus2.close();

  const bootstrapBus = new InProcessEventBus({ maxQueuePerSource: 128 });
  const bootstrapSeries = new RealtimeSeriesStore({ maxEventsPerKey: 256, maxAgeMs: 30 * 24 * 60 * 60 * 1000 });
  const bootstrapWorld = new WorldStateStore();
  const bootstrapBook = new OrderBookRebuilder();
  const bootstrapCoordinator = new SnapshotCoordinator({
    eventBus: bootstrapBus,
    worldState: bootstrapWorld,
    sequenceGuard: new SequenceGuard(),
    health: new RealtimeHealthTracker(),
    seriesStore: bootstrapSeries,
    orderBook: bootstrapBook,
  });
  bootstrapCoordinator.start();
  const fundingHistoryRows = Array.from({ length: 16 }, (_, index) => ({
    fundingRate: String(0.0001 + ((index % 4) - 1.5) * 0.00001),
    fundingTime: BASE - (16 - index) * 8 * 60 * 60 * 1000,
  }));
  const oiHistoryRows = Array.from({ length: 8 }, (_, index) => ({
    sumOpenInterest: String(1000 + index * 5),
    timestamp: BASE - (8 - index) * 5 * 60 * 1000,
  }));
  const bootstrap = await publishFundingOiBootstrap({
    symbol: 'BTC-USDT',
    eventBus: bootstrapBus,
    seriesStore: bootstrapSeries,
    now: BASE,
    raw: {
      fundingHistory: fundingHistoryRows,
      currentFunding: { lastFundingRate: '0.0012', time: BASE },
      openInterestHistory: oiHistoryRows,
      currentOpenInterest: { openInterest: '1080', time: BASE },
    },
  });
  check('public funding/OI bootstrap accepts historical context without fabricating timestamps', bootstrap.available && bootstrap.fundingEvents === 17 && bootstrap.openInterestEvents === 9);
  const fundingEvidence = evaluateFundingOiEdge({ symbol: 'BTC-USDT', now: BASE, seriesStore: bootstrapSeries, orderBook: bootstrapBook, worldState: bootstrapWorld, flags: readLiquidityHunterFeatureFlags({ APEX_LIQUIDITY_HUNTER_ENABLED: 'true' }) });
  check('bootstrapped funding/OI evidence is usable by Layer 1', fundingEvidence.status === 'PASS' && fundingEvidence.direction === 'SHORT');
  await publishFundingOiBootstrap({
    symbol: 'BTC-USDT',
    eventBus: bootstrapBus,
    seriesStore: bootstrapSeries,
    now: BASE,
    source: KUCOIN_FUNDING_OI_BOOTSTRAP_SOURCE,
    raw: {
      fundingHistory: fundingHistoryRows.map((row) => ({ fundingRate: row.fundingRate, ts: row.fundingTime })),
      currentFunding: { fundingRate: '0.00115', ts: BASE },
      openInterestHistory: oiHistoryRows.map((row) => ({ openInterest: row.sumOpenInterest, ts: row.timestamp })),
      currentOpenInterest: { openInterest: '1078', ts: BASE },
    },
  });
  const pairFundingEvidence = evaluateFundingOiEdge({ symbol: 'BTC-USDT', now: BASE, seriesStore: bootstrapSeries, orderBook: bootstrapBook, worldState: bootstrapWorld, flags: readLiquidityHunterFeatureFlags({ APEX_LIQUIDITY_HUNTER_ENABLED: 'true' }) });
  check('funding/OI edge recognizes Binance + KuCoin as the primary Futures context pair', pairFundingEvidence.status === 'PASS' && pairFundingEvidence.direction === 'SHORT' && pairFundingEvidence.metadata?.primaryPairActive === true && pairFundingEvidence.metadata?.sourceCount === 2);
  bootstrapCoordinator.stop();
  await bootstrapBus.close();

  const closeBus = new InProcessEventBus({ maxQueuePerSource: 8 });
  let releaseClose;
  const blocker = new Promise((resolve) => { releaseClose = resolve; });
  closeBus.subscribe(async () => blocker);
  const publication = closeBus.publish(makeEvent('TRADE', 20));
  await Promise.resolve();
  let closeResolved = false;
  const closePromise = closeBus.close().then(() => { closeResolved = true; });
  await Promise.resolve();
  check('event bus close waits for in-flight work', closeResolved === false);
  releaseClose();
  await publication;
  await closePromise;
  check('event bus close completes after drain', closeResolved === true);

  const disabled = initializeLiquidityHunterFoundation({});
  check('core remains disabled by default', disabled.status === 'DISABLED');
  await shutdownLiquidityHunterFoundation();
  const enabled = initializeLiquidityHunterFoundation({ APEX_LIQUIDITY_HUNTER_ENABLED: 'true' });
  check('enabled core initializes shadow-only without execution dependency', enabled.status === 'CORE_READY' && enabled.shadowOnly === true && enabled.executionDependency === false);
  check('operations snapshot cannot enable autonomous live execution', getLiquidityHunterOperationsSnapshot({}).autonomousLiveExecutionEnabled === false);
  await shutdownLiquidityHunterFoundation();

  const failures = checks.filter((item) => !item.passed);
  console.log(`\nLiquidity Hunter foundation runtime: ${checks.length - failures.length}/${checks.length} PASS`);
  process.exitCode = failures.length ? 1 : 0;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
