#!/usr/bin/env node
import { loadTypeScript } from './lib/loadTypeScript.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = loadTypeScript();
const root = process.cwd();
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-lh-validation-'));
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
const { InProcessEventBus } = fromTemp('src/services/realtime/inProcessEventBus.js');
const { DeribitOptionsPublicFeed } = fromTemp('src/services/realtime/deribitOptionsPublicFeed.js');
const { HyperliquidWalletObservationFeed } = fromTemp('src/services/realtime/hyperliquidWalletObservationFeed.js');
const { RealtimeSeriesStore } = fromTemp('src/services/realtime/realtimeSeriesStore.js');
const { WorldStateStore } = fromTemp('src/services/realtime/worldStateStore.js');
const { OrderBookRebuilder } = fromTemp('src/services/realtime/orderBookRebuilder.js');
const { evaluateWhalePositioningEdge } = fromTemp('src/services/liquidityHunter/edges/whalePositioningEdge.js');
const { evaluateContrarianWalletEdge } = fromTemp('src/services/liquidityHunter/edges/contrarianWalletEdge.js');
const { deriveWalletGrade } = fromTemp('src/services/liquidityHunter/walletGrading.js');
const { analyzeLiquidityHunterSetupOutcomes } = fromTemp('src/services/replay/liquidityHunterOutcomeAnalysis.js');
const { runLiquidityHunterWalkForwardValidation } = fromTemp('src/services/replay/liquidityHunterWalkForwardValidation.js');
const { LiquidityHunterPaperCanary } = fromTemp('src/services/liquidityHunter/paperCanary.js');

const checks = [];
const check = (label, condition) => { const passed = Boolean(condition); checks.push({ label, passed }); console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`); };
const waitFor = async (predicate, timeoutMs = 2000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
};

try {
  // 1) Deribit credential-free public option-flow proxy.
  const bus = new InProcessEventBus({ maxQueuePerSource: 1000 });
  const received = [];
  bus.subscribe((event) => { received.push(event); });
  const now = Date.UTC(2026, 7, 7, 12, 0, 0);
  const trades = Array.from({ length: 16 }, (_, index) => ({
    trade_id: String(1000 + index),
    timestamp: now - index * 1000,
    instrument_name: index % 2 ? 'BTC-28AUG26-70000-C' : 'BTC-28AUG26-65000-P',
    direction: index % 3 ? 'buy' : 'sell',
    amount: 1 + index / 10,
    contracts: 1 + index,
    index_price: 68000,
    iv: 60 + index * 0.1,
  }));
  const fakeFetch = async (url) => {
    if (url.includes('get_last_trades_by_currency')) return { result: { trades } };
    if (url.includes('public/ticker')) {
      const instrument = new URL(url).searchParams.get('instrument_name');
      return { result: { instrument_name: instrument, open_interest: 1000, underlying_price: 68000, index_price: 68000, greeks: { gamma: 0.000012 } } };
    }
    throw new Error(`unexpected_url:${url}`);
  };
  const deribit = new DeribitOptionsPublicFeed({
    enabled: true,
    symbols: ['BTC-USDT'],
    eventBus: bus,
    fetchJson: fakeFetch,
    now: () => now + 5000,
    pollIntervalMs: 120000,
  });
  deribit.start();
  await waitFor(() => deribit.snapshot().publishedEvents >= 12);
  await deribit.stop();
  await bus.drainAll();
  check('Deribit public proxy publishes normalized option events', received.filter((event) => event.type === 'OPTION_TRADE').length >= 12);
  check('Deribit option events preserve taker direction and event-time IV gamma provenance', received.filter((event) => event.type === 'OPTION_TRADE').every((event) => ['BUY', 'SELL'].includes(event.payload.takerSide) && event.payload.methodology === 'DERIBIT_PUBLIC_TAKER_FLOW_EVENT_TIME_IV_GAMMA_PROXY' && event.payload.gammaMethodology === 'BLACK_SCHOLES_FROM_DERIBIT_TRADE_IV_ZERO_RATE'));
  check('Deribit provider requires no execution or credential dependency', deribit.snapshot().source === 'deribit-options-public' && deribit.snapshot().rejectedEvents === 0);
  let deribitAllowlistRejected = false;
  try { new DeribitOptionsPublicFeed({ enabled: true, symbols: ['BTC-USDT'], eventBus: bus, baseUrl: 'https://example.com/api/v2' }); } catch { deribitAllowlistRejected = true; }
  check('Deribit public endpoint override is restricted to official HTTPS hosts', deribitAllowlistRejected);
  await bus.close();

  // 2) Hyperliquid public observation is deliberately UNRATED and pseudonymized.
  const walletBus = new InProcessEventBus({ maxQueuePerSource: 1000 });
  const walletEvents = [];
  walletBus.subscribe((event) => { walletEvents.push(event); });
  const rawWallet = '0x1111111111111111111111111111111111111111';
  const hyperFetch = async (_url, body) => {
    if (body?.type === 'clearinghouseState') {
      return { assetPositions: [{ position: { coin: 'BTC', szi: '0.75', leverage: { value: '4' } } }] };
    }
    if (body?.type === 'userFills') {
      return [
        { coin: 'BTC', closedPnl: '12.5', time: now - 1000 },
        { coin: 'BTC', closedPnl: '-4.2', time: now - 2000 },
      ];
    }
    throw new Error(`unexpected_hyperliquid_request:${JSON.stringify(body)}`);
  };
  const hyper = new HyperliquidWalletObservationFeed({
    enabled: true,
    symbols: ['BTC-USDT'],
    wallets: [rawWallet],
    eventBus: walletBus,
    fetchJson: hyperFetch,
    now: () => now,
    pollIntervalMs: 120000,
  });
  hyper.start();
  await waitFor(() => hyper.snapshot().publishedEvents >= 1);
  await walletBus.drainAll();
  const observed = walletEvents.find((event) => event.type === 'WALLET_POSITION');
  check('Hyperliquid observer publishes only pseudonymized UNRATED evidence', Boolean(observed) && observed.payload.wallet !== rawWallet && observed.payload.grade === 'UNRATED' && observed.payload.gradingReady === false);
  check('Hyperliquid raw watchlist address never enters the central event payload', !JSON.stringify(observed || {}).toLowerCase().includes(rawWallet.toLowerCase()));
  const publishedBeforeDuplicatePoll = hyper.snapshot().publishedEvents;
  await hyper.pollWallet(rawWallet);
  await walletBus.drainAll();
  check('Hyperliquid observer suppresses unchanged duplicate position observations', hyper.snapshot().publishedEvents === publishedBeforeDuplicatePoll);

  const walletSeries = new RealtimeSeriesStore();
  for (const event of walletEvents) walletSeries.append(event, now);
  // Even a forged declared grade must not escape the observation-only boundary.
  for (let index = 0; index < 6; index += 1) {
    for (const grade of ['S', 'F']) {
      walletSeries.append({
        eventId: `obs-forged-${grade}-${index}`, type: 'WALLET_POSITION', source: 'hyperliquid-wallet-public-observer', symbol: 'BTC-USDT',
        exchangeTimestamp: now - index, receivedAt: now - index, schemaVersion: 1, ingestionKind: 'REPLAY',
        payload: { wallet: `hl-forged-${grade}-${index}`, grade, direction: index % 2 ? 'LONG' : 'SHORT', leverage: 10, closedTrades: 500, netPnlPct: grade === 'S' ? 100 : -100, maxDrawdownPct: grade === 'S' ? 1 : 90, observationOnly: true, gradingReady: false },
      }, now);
    }
  }
  const walletContext = { symbol: 'BTC-USDT', now, seriesStore: walletSeries, worldState: new WorldStateStore(), orderBook: new OrderBookRebuilder() };
  const whaleEvidence = evaluateWhalePositioningEdge(walletContext);
  const contrarianEvidence = evaluateContrarianWalletEdge(walletContext);
  check('UNRATED public wallet observations cannot become S/A whale PASS evidence', whaleEvidence.status === 'UNKNOWN' && whaleEvidence.score === null);
  check('UNRATED public wallet observations cannot become F-grade contrarian PASS evidence', contrarianEvidence.status === 'UNKNOWN' && contrarianEvidence.score === null);
  check('Observation-only source cannot self-declare forged S/F grades', whaleEvidence.metadata?.gradedWallets === 0 && contrarianEvidence.status === 'UNKNOWN');
  check('Missing wallet PnL/drawdown metrics are not coerced to zero grades', deriveWalletGrade({ closedTrades: 200, netPnlPct: null, maxDrawdownPct: null }) === 'UNRATED');
  await hyper.stop();
  await walletBus.close();

  // 3) Signal-price outcome analysis is explicitly not a fill simulator.
  const base = now;
  const marketEvents = [
    { eventId: 'p0', type: 'TRADE', source: 'qa', symbol: 'BTC-USDT', exchangeTimestamp: base, receivedAt: base, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { price: 100, size: 1, aggressorSide: 'BUY' } },
    { eventId: 'p1', type: 'TRADE', source: 'qa', symbol: 'BTC-USDT', exchangeTimestamp: base + 60_000, receivedAt: base + 60_000, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { price: 102, size: 1, aggressorSide: 'BUY' } },
    { eventId: 'p2', type: 'TRADE', source: 'qa', symbol: 'BTC-USDT', exchangeTimestamp: base + 120_000, receivedAt: base + 120_000, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { price: 104.2, size: 1, aggressorSide: 'BUY' } },
  ];
  const evaluation = {
    evaluationId: 'eval-1', symbol: 'BTC-USDT', generatedAt: base, setupId: 'setup-1', setupState: 'READY_FOR_CONFIRMATION', transitions: [], layers: [], evidence: [],
    macro: { expectedSweepDirection: 'DOWN', postSweepTradeBias: 'LONG', volatilityRegime: 'AMPLIFYING', score: 0.8 },
    target: null,
    trigger: { kind: 'ABSORPTION_REVERSAL_TRIGGER', direction: 'LONG', score: 0.9, invalidationPrice: 98, reasons: [] },
    shadowValidation: 'CONFIRM', fusionScore: 0.8, eligibleForManualConfirmation: true, shadowOnly: true, authoritative: false, reasons: [],
  };
  const outcomes = analyzeLiquidityHunterSetupOutcomes({ events: marketEvents, evaluations: [evaluation], symbol: 'BTC-USDT', horizonsMs: [180000], roundTripCostBps: 10 });
  const h = outcomes.outcomes[0]?.horizons[0];
  check('Outcome analysis remains non-execution signal-price analysis', outcomes.executionSimulation === false && outcomes.methodology === 'SIGNAL_PRICE_FORWARD_OUTCOME');
  check('Outcome analysis detects 2R before invalidation', h?.twoRBeforeInvalidation === true && h?.invalidationHit === false);
  check('Outcome analysis applies configured analytical cost haircut', h?.netDirectionalReturnPct < h?.grossDirectionalReturnPct);

  // 4) Paper canary tracks touches only and never submits orders.
  const paper = new LiquidityHunterPaperCanary({ enabled: true, storePath: null, horizonMs: 10 * 60_000, now: () => base });
  await paper.initialize();
  const captured = paper.capture(evaluation, 100, base);
  paper.onMarketEvent(marketEvents[1]);
  paper.onMarketEvent(marketEvents[2]);
  const paperSnap = paper.snapshot();
  check('Paper canary captures only eligible manual-confirmation setup', captured?.setupId === 'setup-1' && paperSnap.records.length === 1);
  check('Paper canary resolves 2R without exchange execution', paperSnap.records[0].status === 'HIT_2R' && paperSnap.orderSubmissionAllowed === false && paperSnap.executionDependency === false);

  // 5) Purged chronological walk-forward + final holdout report.
  const replayEvents = [];
  let id = 0;
  for (let minute = 0; minute < 8 * 60; minute += 1) {
    const ts = base + minute * 60_000;
    replayEvents.push({ eventId: `wf:${++id}`, type: 'TRADE', source: minute % 2 ? 'binance-usdm-ws' : 'bybit-linear-ws', symbol: 'BTC-USDT', exchangeTimestamp: ts, receivedAt: ts + 1, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { price: 100 + Math.sin(minute / 20), size: 1, aggressorSide: minute % 2 ? 'BUY' : 'SELL' } });
    if (minute % 5 === 0) replayEvents.push({ eventId: `wf:${++id}`, type: 'FUNDING', source: 'qa-funding', symbol: 'BTC-USDT', exchangeTimestamp: ts, receivedAt: ts + 1, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { rate: 0.0001 + Math.sin(minute / 50) * 0.00002 } });
    if (minute % 5 === 0) replayEvents.push({ eventId: `wf:${++id}`, type: 'OPEN_INTEREST', source: 'qa-oi', symbol: 'BTC-USDT', exchangeTimestamp: ts, receivedAt: ts + 1, schemaVersion: 1, ingestionKind: 'REPLAY', payload: { openInterest: 1000 + minute } });
  }
  const flags = {
    liquidityHunterEnabled: true, shadowOnly: true, realtimeEventRecordingEnabled: false, publicFeedsEnabled: false,
    binancePublicFeedEnabled: false, kucoinPublicFeedEnabled: false, bybitPublicFeedEnabled: false, realtimeL2Enabled: false, optionsGexEnabled: false,
    deribitOptionsPublicEnabled: false, hyblockLiquidationTopologyEnabled: false, walletGradingEnabled: false, hyperliquidWalletObserverEnabled: false, hyperliquidWalletHistoryGradingEnabled: false, sentimentVelocityEnabled: false, metaModelEnabled: false,
    websocketEnabled: false, paperCanaryEnabled: false, testnetCanaryEnabled: false, autonomousLiveExecutionEnabled: false,
  };
  const first = await runLiquidityHunterWalkForwardValidation({ events: replayEvents, symbol: 'BTC-USDT', flags, foldCount: 2, holdoutFraction: 0.2, warmupMs: 30 * 60_000, purgeMs: 5 * 60_000, embargoMs: 5 * 60_000, evaluateEveryEvents: 25, maxConcurrency: 2, roundTripCostBps: 10 });
  const second = await runLiquidityHunterWalkForwardValidation({ events: replayEvents, symbol: 'BTC-USDT', flags, foldCount: 2, holdoutFraction: 0.2, warmupMs: 30 * 60_000, purgeMs: 5 * 60_000, embargoMs: 5 * 60_000, evaluateEveryEvents: 25, maxConcurrency: 2, roundTripCostBps: 10 });
  check('Validation creates walk-forward folds plus untouched final holdout', first.walkForward.length === 2 && first.holdout.window.role === 'HOLDOUT');
  check('Validation records purge and embargo isolation', first.windows.every((window) => window.purgeBeforeMs === 5 * 60_000) && first.holdout.window.embargoBeforeMs === 5 * 60_000);
  check('Validation report is deterministic for identical event data and policy', first.fingerprintSha256 === second.fingerprintSha256);
  check('Validation remains shadow-only with no automatic promotion', first.shadowOnly === true && first.authoritative === false && first.automaticPromotionEnabled === false);

  const failures = checks.filter((row) => !row.passed);
  const artifact = {
    generatedAt: new Date().toISOString(),
    checks,
    summary: {
      passed: checks.length - failures.length,
      total: checks.length,
      deribitMode: 'PUBLIC_TRADE_PLUS_CURRENT_TICKER_GREEKS_SHADOW_PROXY',
      hyperliquidMode: 'PSEUDONYMIZED_UNRATED_OBSERVATION_ONLY',
      paperCanaryExecutionDependency: false,
      automaticPromotionEnabled: false,
      validation: { folds: first.walkForward.length, holdoutRole: first.holdout.window.role, purgeMs: first.policy.purgeMs, embargoMs: first.policy.embargoMs },
    },
  };
  fs.mkdirSync(path.join(root, 'QA'), { recursive: true });
  fs.writeFileSync(path.join(root, 'QA', `liquidity-hunter-validation-providers-v${packageVersion}.json`), JSON.stringify(artifact, null, 2) + '\n');
  console.log(`\nLiquidity Hunter validation/providers runtime: ${checks.length - failures.length}/${checks.length} PASS`);
  process.exitCode = failures.length ? 1 : 0;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
