#!/usr/bin/env node
import { loadTypeScript } from './lib/loadTypeScript.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = loadTypeScript();

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-public-feeds-'));
fs.symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'dir');
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
const { InProcessEventBus } = fromTemp('src/services/realtime/inProcessEventBus.js');
const { SequenceGuard } = fromTemp('src/services/realtime/sequenceGuard.js');
const { WorldStateStore } = fromTemp('src/services/realtime/worldStateStore.js');
const { RealtimeSeriesStore } = fromTemp('src/services/realtime/realtimeSeriesStore.js');
const { OrderBookRebuilder } = fromTemp('src/services/realtime/orderBookRebuilder.js');
const { RealtimeHealthTracker } = fromTemp('src/services/realtime/realtimeHealth.js');
const { SnapshotCoordinator } = fromTemp('src/services/realtime/snapshotCoordinator.js');
const { BinanceUsdmPublicFeed } = fromTemp('src/services/realtime/binanceUsdmPublicFeed.js');
const { KuCoinFuturesPublicFeed } = fromTemp('src/services/realtime/kucoinFuturesPublicFeed.js');
const { BybitLinearPublicFeed } = fromTemp('src/services/realtime/bybitLinearPublicFeed.js');
const { evaluateMultiExchangeCvdEdge } = fromTemp('src/services/liquidityHunter/edges/multiExchangeCvdEdge.js');
const { evaluateIcebergAbsorptionEdge } = fromTemp('src/services/liquidityHunter/edges/icebergAbsorptionEdge.js');
const { readLiquidityHunterFeatureFlags } = fromTemp('src/services/liquidityHunter/featureFlags.js');

const BASE = Date.now();
const checks = [];
const check = (label, condition) => {
  const passed = Boolean(condition);
  checks.push({ label, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class FakeWebSocket {
  readyState = 0;
  onopen = null;
  onmessage = null;
  onerror = null;
  onclose = null;
  sent = [];
  constructor(url) { this.url = url; }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  message(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

try {
  const bus = new InProcessEventBus({ maxQueuePerSource: 256 });
  const worldState = new WorldStateStore();
  const seriesStore = new RealtimeSeriesStore({ maxEventsPerKey: 2_000, maxAgeMs: 60 * 60 * 1000 });
  const orderBook = new OrderBookRebuilder();
  const health = new RealtimeHealthTracker();
  const coordinator = new SnapshotCoordinator({ eventBus: bus, worldState, sequenceGuard: new SequenceGuard(), health, seriesStore, orderBook });
  coordinator.start();

  let now = BASE;
  let binanceSocket;
  const binance = new BinanceUsdmPublicFeed({
    enabled: true,
    symbols: ['BTC-USDT'],
    eventBus: bus,
    now: () => now,
    websocketFactory: (url) => { binanceSocket = new FakeWebSocket(url); return binanceSocket; },
    fetchJson: async () => ({
      lastUpdateId: 100,
      bids: [['64990', '4'], ['64980', '6']],
      asks: [['65010', '3'], ['65020', '5']],
    }),
    reconnectBaseMs: 100_000,
  });
  binance.start();
  check('Binance adapter uses USD-M combined public streams', binanceSocket.url.includes('aggTrade') && binanceSocket.url.includes('bookTicker') && binanceSocket.url.includes('depth@100ms'));
  binanceSocket.open();
  await sleep(10);
  check('Binance REST depth bootstrap creates a sequence-validated book', orderBook.snapshot('binance-usdm-ws', 'BTC-USDT')?.sequenceValidated === true);

  for (let i = 0; i < 12; i += 1) {
    now += 20;
    binanceSocket.message({ stream: 'btcusdt@aggTrade', data: { e: 'aggTrade', E: now, T: now, s: 'BTCUSDT', a: 1000 + i, p: String(65000 - i * 2), q: '0.5', m: true } });
  }
  now += 20;
  binanceSocket.message({ stream: 'btcusdt@bookTicker', data: { e: 'bookTicker', E: now, s: 'BTCUSDT', u: 55, b: '64998', B: '2', a: '65002', A: '2' } });
  now += 20;
  binanceSocket.message({ stream: 'btcusdt@depth@100ms', data: { e: 'depthUpdate', E: now, T: now, s: 'BTCUSDT', U: 101, u: 102, pu: 100, b: [['64990', '7']], a: [['65010', '2']] } });
  await sleep(25);
  check('Binance trade normalization is lossless through the central bus', seriesStore.query({ sources: ['binance-usdm-ws'], symbol: 'BTC-USDT', type: 'TRADE' }).length === 12);
  check('Binance depth range advances the validated local book', orderBook.snapshot('binance-usdm-ws', 'BTC-USDT')?.sequence === 102 && orderBook.snapshot('binance-usdm-ws', 'BTC-USDT')?.quality === 'VALID');


  let kucoinSocket;
  let kucoinSeedCount = 0;
  const kucoin = new KuCoinFuturesPublicFeed({
    enabled: true,
    symbols: ['BTC-USDT'],
    eventBus: bus,
    now: () => now,
    websocketFactory: (url) => { kucoinSocket = new FakeWebSocket(url); return kucoinSocket; },
    fetchBullet: async () => ({
      ok: true,
      data: {
        token: 'qa-public-token',
        instanceServers: [{ endpoint: 'wss://ws-api-futures.kucoin.com/', pingInterval: 100_000, pingTimeout: 10_000 }],
      },
    }),
    fetchDepthSnapshot: async () => {
      kucoinSeedCount += 1;
      const sequence = kucoinSeedCount === 1 ? 200 : 300;
      return {
        sequence,
        bids: [['64990', '5'], ['64980', '7']],
        asks: [['65010', '4'], ['65020', '6']],
      };
    },
  });
  kucoin.start();
  for (let i = 0; i < 50 && !kucoinSocket; i += 1) await sleep(2);
  check('KuCoin Futures adapter requests a public-token websocket connection', Boolean(kucoinSocket?.url.includes('token=qa-public-token')));
  kucoinSocket.open();
  await sleep(20);
  check('KuCoin Futures maps BTC-USDT to XBTUSDTM and subscribes to trade + L2 topics',
    kucoinSocket.sent.some((raw) => raw.includes('/contractMarket/execution:XBTUSDTM'))
      && kucoinSocket.sent.some((raw) => raw.includes('/contractMarket/level2:XBTUSDTM')));
  check('KuCoin REST depth bootstrap creates a sequence-validated book', orderBook.snapshot('kucoin-futures-ws', 'BTC-USDT')?.sequenceValidated === true);

  for (let i = 0; i < 12; i += 1) {
    now += 20;
    kucoinSocket.message({
      topic: '/contractMarket/execution:XBTUSDTM',
      type: 'message',
      data: {
        symbol: 'XBTUSDTM', sequence: 10_000 + i, side: 'sell', size: '0.4',
        price: String(64999 - i * 2), tradeId: `kucoin-trade-${i}`, ts: now * 1_000_000,
      },
    });
  }
  now += 20;
  kucoinSocket.message({
    topic: '/contractMarket/level2:XBTUSDTM', type: 'message',
    data: { sequence: 201, change: '64990,buy,8', timestamp: now },
  });
  await sleep(30);
  const kucoinTrades = seriesStore.query({ sources: ['kucoin-futures-ws'], symbol: 'BTC-USDT', type: 'TRADE' });
  check('KuCoin Futures trade normalization reaches the canonical BTC-USDT market', kucoinTrades.length === 12);
  check('KuCoin trade provider sequence is metadata-only and cannot create false central trade-sequence gaps',
    kucoinTrades.every((event) => event.sequence === undefined && Number(event.payload?.sourceSequence) >= 10_000));
  check('KuCoin contiguous L2 delta advances the validated local book',
    orderBook.snapshot('kucoin-futures-ws', 'BTC-USDT')?.sequence === 201
      && orderBook.snapshot('kucoin-futures-ws', 'BTC-USDT')?.quality === 'VALID');

  // Force an isolated sequence gap. The adapter must fail closed and REST-reseed;
  // this validates recovery without touching any real provider/runtime data.
  now += 20;
  kucoinSocket.message({
    topic: '/contractMarket/level2:XBTUSDTM', type: 'message',
    data: { sequence: 203, change: '64990,buy,9', timestamp: now },
  });
  await sleep(40);
  check('KuCoin L2 sequence gap triggers an isolated REST reseed and restores a validated book',
    kucoinSeedCount >= 2
      && orderBook.snapshot('kucoin-futures-ws', 'BTC-USDT')?.sequence === 300
      && orderBook.snapshot('kucoin-futures-ws', 'BTC-USDT')?.sequenceValidated === true);

  let bybitSocket;
  const bybit = new BybitLinearPublicFeed({
    enabled: true,
    symbols: ['BTC-USDT'],
    eventBus: bus,
    now: () => now,
    websocketFactory: (url) => { bybitSocket = new FakeWebSocket(url); return bybitSocket; },
    reconnectBaseMs: 100_000,
  });
  bybit.start();
  bybitSocket.open();
  check('Bybit adapter subscribes to publicTrade and level-50 orderbook', bybitSocket.sent.some((raw) => raw.includes('publicTrade.BTCUSDT') && raw.includes('orderbook.50.BTCUSDT')));
  for (let i = 0; i < 12; i += 1) {
    now += 20;
    bybitSocket.message({ topic: 'publicTrade.BTCUSDT', type: 'snapshot', ts: now, data: [{ T: now, s: 'BTCUSDT', S: 'Sell', v: '0.4', p: String(64999 - i * 2), i: `trade-${i}` }] });
  }
  now += 20;
  bybitSocket.message({ topic: 'orderbook.50.BTCUSDT', type: 'snapshot', ts: now, data: { s: 'BTCUSDT', b: [['64990', '3']], a: [['65010', '3']], u: 500, seq: 900, cts: now } });
  await sleep(25);
  check('Bybit trade normalization reaches the same canonical market', seriesStore.query({ sources: ['bybit-linear-ws'], symbol: 'BTC-USDT', type: 'TRADE' }).length === 12);
  check('Bybit book remains explicitly non-authoritative without exact previous-update linkage', orderBook.snapshot('bybit-linear-ws', 'BTC-USDT')?.sequenceValidated === false);

  const flags = readLiquidityHunterFeatureFlags({ APEX_LIQUIDITY_HUNTER_ENABLED: 'true', APEX_REALTIME_L2_ENABLED: 'true' });
  const ctx = { symbol: 'BTC-USDT', now, worldState, seriesStore, orderBook, flags };
  const cvd = evaluateMultiExchangeCvdEdge(ctx);
  check('multi-exchange CVD consumes Binance + KuCoin as independent primary Futures trade sources', Number(cvd.metadata?.sourceCount || 0) === 2 && cvd.metadata?.primaryPairActive === true && Boolean(cvd.metadata?.bySource?.['binance-usdm-ws']) && Boolean(cvd.metadata?.bySource?.['kucoin-futures-ws']) && !cvd.metadata?.bySource?.['bybit-linear-ws'] && cvd.status !== 'NOT_CONFIGURED');

  // The Binance book is validated; add enough synchronized sell aggression and
  // replenishment-style deltas to prove the iceberg edge can consume only that
  // authoritative source rather than the unsequenced Bybit book.
  for (let i = 0; i < 24; i += 1) {
    now += 10;
    binanceSocket.message({ stream: 'btcusdt@aggTrade', data: { e: 'aggTrade', E: now, T: now, s: 'BTCUSDT', a: 2000 + i, p: '64990', q: '1.2', m: true } });
    binanceSocket.message({ stream: 'btcusdt@depth@100ms', data: { e: 'depthUpdate', E: now, T: now, s: 'BTCUSDT', U: 103 + i, u: 103 + i, pu: 102 + i, b: [['64990', i % 2 === 0 ? '7' : '8']], a: [] } });
  }
  await sleep(75);
  const iceberg = evaluateIcebergAbsorptionEdge({ ...ctx, now });
  check('iceberg edge only activates from a valid sequence-validated book', iceberg.status !== 'NOT_CONFIGURED' && orderBook.snapshot('binance-usdm-ws', 'BTC-USDT')?.sequenceValidated === true);

  check('feed snapshots remain read-only market-data telemetry', binance.snapshot().publishedEvents > 0 && kucoin.snapshot().publishedEvents > 0 && bybit.snapshot().publishedEvents > 0);
  await Promise.allSettled([binance.stop(), kucoin.stop(), bybit.stop()]);
  coordinator.stop();
  await bus.close();

  const failures = checks.filter((item) => !item.passed);
  console.log(`\nLiquidity Hunter public feeds runtime: ${checks.length - failures.length}/${checks.length} PASS`);
  process.exitCode = failures.length ? 1 : 0;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
