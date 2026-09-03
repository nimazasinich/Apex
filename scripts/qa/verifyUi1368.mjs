/**
 * Real-browser 1368x753 light-theme QA for restricted environments.
 *
 * The frontend is bundled from the current source with Vite and mounted into an
 * about:blank page via setContent(). API calls are bridged through Node to the
 * real local Express server because some managed Chromium environments block
 * direct navigation to localhost. Market endpoints are deterministic QA fixtures
 * only; account/strategy/security endpoints still hit the real server.
 *
 * This script has zero execution authority and forces automated execution killed.
 */
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const PORT = Number(process.env.APEX_QA_INLINE_PORT || 43239);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT_DIR = path.resolve(ROOT, process.env.APEX_QA_OUT_DIR || 'test-results/ui-1368-light');
const SYSTEM_CHROMIUM = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].find((candidate) => fs.existsSync(candidate)) || '';
const EXECUTABLE = String(process.env.APEX_PLAYWRIGHT_EXECUTABLE || SYSTEM_CHROMIUM).trim();
const DEFAULT_ROUTES = [
  'overview', 'markets', 'watchlist', 'screener', 'portfolio', 'trading', 'orders', 'positions',
  'alerts', 'history', 'analytics', 'backtesting', 'academy', 'strategies', 'settings', 'help',
];
const ROUTES = String(process.env.APEX_QA_ROUTES || '').trim()
  ? String(process.env.APEX_QA_ROUTES).split(',').map((route) => route.trim()).filter((route) => DEFAULT_ROUTES.includes(route))
  : DEFAULT_ROUTES;
const SCREENSHOT_ROUTES = new Set(ROUTES);
const VIEWPORT = {
  width: Number(process.env.APEX_QA_VIEWPORT_WIDTH || 1368),
  height: Number(process.env.APEX_QA_VIEWPORT_HEIGHT || 753),
};
const PRIVATE_RUNTIME_CONFIG = path.resolve(ROOT, '.external-api-sources.config.json');
const PRIVATE_RUNTIME_CONFIG_PREEXISTED = fs.existsSync(PRIVATE_RUNTIME_CONFIG);

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let server = null;


function isMissingPlaywrightBrowser(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /Executable doesn't exist|playwright install|browserType\.launch.*executable/i.test(message);
}

async function stopServer() {
  if (!server?.pid) return;
  const child = server;
  try {
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
  } catch {
    try { child.kill('SIGTERM'); } catch { /* no-op */ }
  }
  await sleep(750);
  if (child.exitCode == null && child.signalCode == null) {
    try {
      if (process.platform === 'win32') spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else process.kill(-child.pid, 'SIGKILL');
    } catch {
      try { child.kill('SIGKILL'); } catch { /* no-op */ }
    }
  }
  server = null;
}

function cleanupEphemeralQaRuntimeState() {
  if (PRIVATE_RUNTIME_CONFIG_PREEXISTED) return;
  try {
    if (fs.existsSync(PRIVATE_RUNTIME_CONFIG)) fs.unlinkSync(PRIVATE_RUNTIME_CONFIG);
  } catch (error) {
    console.warn(`[qa-cleanup] could not remove generated private config: ${String(error)}`);
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(BASE, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch { /* retry */ }
    if (server?.exitCode != null) throw new Error(`QA server exited with ${server.exitCode}`);
    await sleep(250);
  }
  throw new Error(`QA server not ready at ${BASE}`);
}

function qaTickers() {
  const rows = [
    ['BTC-USDT', 67842.50, 'Bitcoin', 1_340_000_000_000, ['Major Coins']],
    ['ETH-USDT', 3271.45, 'Ethereum', 393_010_000_000, ['Major Coins', 'DeFi', 'Layer 1']],
    ['SOL-USDT', 162.38, 'Solana', 75_150_000_000, ['Major Coins', 'Layer 1']],
    ['BNB-USDT', 598.21, 'BNB', 87_420_000_000, ['Major Coins', 'Layer 1']],
    ['XRP-USDT', 0.5237, 'XRP', 29_410_000_000, ['Major Coins']],
    ['DOGE-USDT', 0.1245, 'Dogecoin', 18_010_000_000, ['Major Coins']],
    ['ADA-USDT', 0.45, 'Cardano', 15_900_000_000, ['Layer 1']],
    ['AVAX-USDT', 32.16, 'Avalanche', 13_170_000_000, ['DeFi', 'Layer 1']],
    ['LINK-USDT', 18, 'Chainlink', 10_900_000_000, ['DeFi']],
    ['SUI-USDT', 1.4, 'Sui', 4_200_000_000, ['Layer 1']],
    ['LTC-USDT', 94, 'Litecoin', 7_100_000_000, ['Major Coins']],
    ['BCH-USDT', 520, 'Bitcoin Cash', 10_300_000_000, ['Major Coins']],
  ];
  const now = Date.now();
  return rows.map(([symbol, rawPrice, displayName, marketCapUsd, tags], index) => {
    const price = Number(rawPrice);
    const direction = index === 4 || index === 5 || index === 7 ? -1 : 1;
    const change = direction * (0.37 + (index % 4) * 0.78);
    const sparkline24h = Array.from({ length: 24 }, (_, point) => price * (1 + direction * point * 0.00055 + Math.sin((point + index) / 3.2) * 0.0035));
    const sparkline7d = Array.from({ length: 28 }, (_, point) => price * (1 + direction * point * 0.0012 + Math.sin((point + index) / 4.1) * 0.006));
    return {
      symbol,
      lastPrice: price,
      turnover24h: 250_000_000 - index * 8_000_000,
      priceChange24hPct: Number(change.toFixed(2)),
      volume24h: 50_000 + index * 3_000,
      high24h: price * 1.025,
      low24h: price * 0.975,
      fundingRate: index % 2 ? 0.0001 : -0.00005,
      openInterest: 80_000_000 - index * 2_000_000,
      dataState: 'degraded',
      timestamp: now,
      sparkline1h: sparkline24h.slice(-16),
      displayName,
      marketCapUsd,
      tags,
      sparkline24h,
      sparkline7d,
    };
  });
}

function qaCandles(limit = 120) {
  const now = Date.now();
  return Array.from({ length: limit }, (_, index) => {
    const close = 65000 + Math.sin(index / 9) * 850 + index * 2;
    return {
      timestamp: now - (limit - index) * 60_000,
      open: close - 30,
      high: close + 90,
      low: close - 100,
      close,
      volume: 800 + index * 4,
    };
  });
}


function qaBacktestResult() {
  const now = Date.now();
  const start = now - 83 * 24 * 60 * 60 * 1000;
  const pointCount = 72;
  let equity = 100;
  let peak = 100;
  const equityCurve = [];
  const marketCurve = [];
  for (let index = 0; index < pointCount; index += 1) {
    const progress = index / (pointCount - 1);
    const strategyStep = 0.13 + Math.sin(index / 3.1) * 0.16 + Math.cos(index / 7.4) * 0.08 + (index > 32 ? 0.08 : -0.01);
    equity *= 1 + strategyStep / 100;
    peak = Math.max(peak, equity);
    const timestamp = start + index * ((now - start) / (pointCount - 1));
    equityCurve.push({
      step: index,
      timestamp,
      equity: Number(equity.toFixed(4)),
      drawdownPct: Number((((equity - peak) / peak) * 100).toFixed(4)),
    });
    const normalized = 100 + progress * 7.1 + Math.sin(index / 4.8) * 2.4 - Math.cos(index / 9.2) * 1.1;
    marketCurve.push({
      step: index,
      timestamp,
      close: Number((114_500 * normalized / 100).toFixed(2)),
      normalized: Number(normalized.toFixed(4)),
    });
  }

  const rPattern = [0.72, 0.60, 0.71, -0.36, 0.61, 0.48, -0.28, 0.83, 0.55, -0.41, 0.94, 0.66];
  const timeline = Array.from({ length: 162 }, (_, index) => {
    const timestamp = start + (index + 2) * ((now - start) / 39);
    const winsTarget = ((index * 7) % 17) < 10;
    const baseR = Math.abs(rPattern[index % rPattern.length]);
    const rMultiple = winsTarget ? Math.max(0.42, baseR) : -Math.max(0.28, Math.min(0.78, baseR));
    const entry = 114_200 + index * 76 + Math.sin(index / 2.4) * 410;
    const stopDistance = 420 + (index % 4) * 55;
    const long = index % 3 !== 1;
    const outcome = rMultiple >= 0 ? 'WIN' : 'LOSS';
    const exit = long ? entry + rMultiple * stopDistance : entry - rMultiple * stopDistance;
    return {
      symbol: index % 5 === 0 ? 'ETH-USDT' : 'BTC-USDT',
      timestamp,
      price: Number(entry.toFixed(2)),
      score: 68 + (index % 17),
      tier: index % 7 === 0 ? 'WATCHLIST' : 'CONFIRMED',
      outcome,
      entry: Number(entry.toFixed(2)),
      exit: Number(exit.toFixed(2)),
      stop: Number((long ? entry - stopDistance : entry + stopDistance).toFixed(2)),
      target: Number((long ? entry + stopDistance * 1.8 : entry - stopDistance * 1.8).toFixed(2)),
      rMultiple,
      barsHeld: 2 + (index % 9),
      pnlPct: Number((rMultiple * 0.72).toFixed(3)),
      reason: outcome === 'WIN' ? 'Target or managed exit reached.' : 'Protective stop reached.',
    };
  });

  return {
    symbol: 'BTC-USDT',
    direction: 'LONG',
    interval: '1h',
    candlesUsed: 1612,
    lookbackCandles: 1612,
    simulatedScans: 1532,
    flaggedSignals: 214,
    acceptedCandidates: timeline.length,
    rejectedCandidates: 178,
    rejectionCounts: { LOW_CONFIDENCE: 82, REGIME_CONFLICT: 61, LIQUIDITY_GUARD: 35 },
    historicalWinRatePct: 58.2,
    avgRMultipleRealized: 0.079,
    avgPnlPct: 0.357,
    totalPnlPct: 12.84,
    maxDrawdownPct: 9.42,
    profitFactor: 1.89,
    wins: 94,
    losses: 68,
    timed: 0,
    strategy: 'APEX Multi-Alpha Fusion Long/Short',
    strategyVersion: 2,
    replayMode: 'LAB_PREVIEW',
    source: 'QA_LAB_BACKTEST_FIXTURE',
    requestedBars: 2000,
    maxHoldBars: 72,
    runtime: {
      totalMs: 1824,
      tickerLookupMs: 18,
      historyFetchMs: 264,
      replayMs: 1542,
      tickerLookupState: 'live',
      replayCache: 'MISS',
    },
    costModel: {
      commissionPctPerSide: 0.04,
      slippagePctPerSide: 0.05,
      fundingPctEstimate: 0.01,
      roundTripCostPct: 0.19,
      appliedByEngine: true,
    },
    audit: {
      runId: 'qa-lab-backtest-20260815',
      engine: 'QA_LAB_PREVIEW_ONLY',
      generatedAt: now,
      closedCandlesOnly: true,
      lookaheadPolicy: 'DISABLED',
      fillPolicy: 'NEXT_BAR_OR_BRACKET',
      deterministic: true,
      configFingerprint: 'qa-lab-preview-not-production-evidence',
    },
    disclaimer: 'LAB PREVIEW · deterministic synthetic backtest result for browser visual QA only. Not production evidence.',
    equityCurve,
    marketCurve,
    diagnostics: {
      requestedBars: 2000,
      candlesReturned: 1612,
      warmupBars: 80,
      executableBars: 1532,
      tradeCount: timeline.length,
    },
    timeline,
    dataState: 'degraded',
  };
}


function qaAccountWorkspace() {
  const now = Date.now();
  const connection = {
    status: 'demo', mode: 'demo', exchange: 'kucoin', environment: 'DEMO',
    profile: { id: 'qa-lab-preview', name: 'QA Lab Preview', accountType: 'DEMO' },
    connectedAt: new Date(now - 86_400_000).toISOString(),
    expiresAt: new Date(now + 30 * 86_400_000).toISOString(),
    portfolioState: 'available', executionState: 'unlocked', requiresOrderPreview: true,
    requiresExplicitConfirmation: true, maxOrderNotionalUsd: 50_000, startingBalanceUsd: 100_000,
    liveAvailable: false,
  };
  const orders = [
    ['ORD-8F3K2L', 'BTC-USDT', 'buy', 'Limit', 1, 0.65, 67850, 67842.50, 'partially_filled', 0],
    ['ORD-3J9M7P', 'ETH-USDT', 'buy', 'Limit', 2, 1.25, 3274, 3271.45, 'partially_filled', 3],
    ['ORD-6D2N8Q', 'SOL-USDT', 'sell', 'Limit', 2, 2, 162.38, 162.38, 'filled', 8],
    ['ORD-1P7V5X', 'BNB-USDT', 'buy', 'Market', 1.5, 1.5, null, 598.21, 'filled', 13],
    ['ORD-9L6Z3T', 'XRP-USDT', 'sell', 'Limit', 1000, 0, 0.55, null, 'cancelled', 22],
    ['ORD-4A2H9B', 'DOGE-USDT', 'buy', 'Limit', 10000, 5000, 0.1245, 0.1245, 'open', 34],
    ['ORD-7K1W2M', 'AVAX-USDT', 'buy', 'Limit', 3, 3, 32.16, 32.16, 'filled', 41],
    ['ORD-5Q8R6Y', 'LINK-USDT', 'sell', 'Limit', 500, 0, 18, null, 'cancelled', 47],
  ].map(([id, symbol, side, type, size, filled, price, avg, status, mins]) => ({
    id, symbol, side, type, size, filled,
    fillPct: Number(size) > 0 ? Number(filled) / Number(size) * 100 : 0,
    price, averageFillPrice: avg, status,
    createdAt: now - (Number(mins) + 18) * 60_000,
    updatedAt: now - Number(mins) * 60_000,
  }));
  const positions = [
    ['pos-btc','BTC-USDT','BTC','LONG',0.54762,82951.23,80636.91,2314.32,5.36,1245,10,54125.40],
    ['pos-eth','ETH-USDT','ETH','LONG',2.213,2854.11,2073.66,1730.45,9.41,2845,5,1980.20],
    ['pos-sol','SOL-USDT','SOL','LONG',142.3,93.36,79.69,1945.88,17.17,126.5,4,60.15],
    ['pos-bnb','BNB-USDT','BNB','LONG',23.45,373.50,349.06,572.99,7.01,520,3,252.80],
    ['pos-xrp','XRP-USDT','XRP','SHORT',7842,0.7921,0.8299,-296.41,-4.55,602,3,1.102],
    ['pos-usdt','USDT-USDT','USDT','LONG',6972.74,1.0001,1.0001,0,0,1000,1,null],
  ].map(([id,symbol,asset,side,size,mark,entry,pnl,pct,margin,lev,liq]) => ({
    id,symbol,asset,side,size,valueUsd:Number(size)*Number(mark),entryPrice:entry,markPrice:mark,
    unrealizedPnlUsd:pnl,pnlPct:pct,marginUsd:margin,marginRatioPct:Number(margin)/100000*100,leverage:lev,liquidationPrice:liq,
  }));
  const activities = [
    ['act-1','trade','Trade Executed','BTC/USDT • Buy','BTC-USDT',0.045,'BTC',3058.91,126.31,'completed','TRD-7A8B2C1D','positive',0],
    ['act-2','deposit','Deposit','USDT • ERC20',null,5000,'USDT',5000,null,'completed','DEP-3F6H9K2L','positive',192],
    ['act-3','withdrawal','Withdrawal','ETH • ERC20',null,-2.25,'ETH',-6122.58,null,'completed','WDR-9J2K4M5N','negative',1110],
    ['act-4','transfer','Transfer','Spot → Futures',null,-1000,'USDT',-1000,null,'completed','TRF-4L8P7Q1R','negative',1295],
    ['act-5','funding','Funding Fee','Perpetual Futures','BTC-USDT',-12.35,'USDT',-12.35,-12.35,'completed','FEE-6M2N9P3Q','negative',1476],
    ['act-6','login','Login','Chrome on macOS',null,null,null,null,null,'success','LOG-1R2T3Y4U','neutral',1740],
    ['act-7','deposit','Deposit','BTC • Bitcoin',null,0.01,'BTC',678.45,null,'completed','DEP-8V7B3N2M','positive',2320],
    ['act-8','withdrawal','Withdrawal','USDC • ERC20',null,-1500,'USDC',-1500,null,'pending','WDR-5C6V8B9N','negative',2600],
  ].map(([id,type,title,subtitle,symbol,amount,currency,usdValue,realizedPnlUsd,status,reference,direction,mins]) => ({
    id,timestamp:now-Number(mins)*60_000,type,title,subtitle,symbol,amount,currency,usdValue,realizedPnlUsd,status,reference,direction,
  }));
  const cumulativePnl = Array.from({length:30},(_,i)=>({timestamp:now-(29-i)*86_400_000,value:Number((-400 + i*245 + Math.sin(i/2.8)*420).toFixed(2))}));
  const monthlyPnl = [
    ['Dec',4980],['Jan',6410],['Feb',-2150],['Mar',10120],['Apr',12380],['May',5720],
  ].map(([month,value])=>({month,value}));
  const heatmap = Array.from({length:25},(_,i)=>({weekday:i%5,bucket:Math.floor(i/5),value:Math.round((Math.sin(i*1.7)*0.5+0.5)*1800-600)}));
  const topAssets = [
    ['BTC-USDT',2945.32,43.1],['ETH-USDT',1845.21,27],['SOL-USDT',1238.45,18.1],['BNB-USDT',542.31,8],['XRP-USDT',270.89,3.8],
  ].map(([symbol,pnlUsd,pct])=>({symbol,pnlUsd,pct}));
  const insights = {
    generatedAt:new Date(now).toISOString(),
    account:{currency:'USDT',equityUsd:100250,availableBalanceUsd:42350,unrealizedPnlUsd:6267.23,realizedPnlUsd:6842.18,marginUsedUsd:6338.50,marginRatioPct:18.33,buyingPowerUsd:42350,riskScore:22,riskLabel:'Low'},
    positions,orders,activities,
    analytics:{totalPnlUsd:6842.18,realizedPnlUsd:5748.62,unrealizedPnlUsd:1093.56,winRatePct:68.4,profitFactor:2.14,sharpeRatio:1.32,totalTrades:128,cumulativePnl,monthlyPnl,heatmap,topAssets},
  };
  const snapshotPositions = positions.map((position) => ({
    id: position.id,
    symbol: position.symbol,
    currentQty: position.side === 'SHORT' ? -Math.abs(Number(position.size)) : Number(position.size),
    avgEntryPrice: position.entryPrice,
    markPrice: position.markPrice,
    unrealisedPnl: position.unrealizedPnlUsd,
    realLeverage: position.leverage,
    liquidationPrice: position.liquidationPrice,
    posInit: position.marginUsd,
    isOpen: true,
  }));
  const snapshotOrders = orders
    .filter((order) => order.status === 'open' || order.status === 'partially_filled')
    .map((order) => ({
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      type: String(order.type).toLowerCase(),
      size: order.size,
      dealSize: order.filled,
      filledSize: order.filled,
      price: order.price,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }));
  const snapshotTrades = activities
    .filter((activity) => activity.type === 'trade')
    .map((activity) => ({
      id: activity.id,
      symbol: activity.symbol,
      side: String(activity.subtitle || '').toLowerCase().includes('buy') ? 'buy' : 'sell',
      type: 'filled',
      dealSize: Math.abs(Number(activity.amount || 0)),
      tradeTime: activity.timestamp,
    }));
  const snapshot = {
    account:{currency:'USDT',accountEquity:100250,equity:100250,availableBalance:42350,availableMargin:42350,positionMargin:6338.50,realizedPnl:5748.62,unrealizedPnl:1093.56},
    positions:snapshotPositions,
    openOrders:snapshotOrders,
    recentOrders:orders.slice(0,5),
    recentTrades:snapshotTrades,
    positionHistory:[],serverTime:now,syncedAt:new Date(now).toISOString(),
  };
  return { connection, snapshot, insights, reconciliation:null };
}

function syntheticMarketResponse(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl, 'http://apex.qa'); } catch { return null; }
  const pathname = parsed.pathname;
  const tickers = qaTickers();

  if (pathname === '/api/account/workspace') {
    return qaAccountWorkspace();
  }
  if (pathname === '/api/market/top-volume') {
    return { symbols: tickers, dataState: 'degraded', source: 'QA_INLINE_MARKET_FIXTURE' };
  }
  if (pathname === '/api/market/sentiment') {
    return {
      score: 68,
      zone: 'Bullish',
      inputs: [],
      dataState: 'degraded',
      timestamp: Date.now(),
      source: 'QA_INLINE_MARKET_FIXTURE',
    };
  }
  if (pathname === '/api/market/backtest') {
    return qaBacktestResult();
  }
  if (pathname === '/api/market/candidates') {
    const timestamp = Date.now();
    const base = {
      lastPrice: 67842.5, priceChange24hPct: 0.37, turnover24h: 250_000_000,
      guardPass: true, guardReasons: [], momentumScore: 78, orderFlowScore: 76,
      fundingScore: 64, structureScore: 82, liquidityScore: 88,
      timeframeConfluence: true, timeframeDetails: { tf15m: 'BULLISH', tf1h: 'BULLISH' },
      dataState: 'degraded', timeframeConfluenceState: 'ALIGNED', featureCompletenessPct: 94,
      signalLifecycle: { state: 'SHADOW', observedAt: timestamp },
    };
    return {
      longCandidates: [{ ...base, symbol: 'ETH-USDT', lastPrice: 3271.45, direction: 'LONG', score: 84, readinessTier: 'CONFIRMED', signalId: 'QA-ETH-LONG' }],
      shortCandidates: [{ ...base, symbol: 'BTC-USDT', direction: 'SHORT', score: 78, readinessTier: 'WATCHLIST', signalId: 'QA-BTC-SHORT' }],
      scanTimestamp: timestamp, shadowMode: true,
      directionShadowMode: true, dataState: 'degraded', source: 'QA_INLINE_MARKET_FIXTURE',
    };
  }
  if (pathname.includes('/api/strategies/') && pathname.endsWith('/fusion-preview')) {
    const generatedAt = Date.now();
    return {
      snapshot: {
        version: 'strategy_fusion_v1',
        strategyId: 'crypto-multi-alpha-ls-v1',
        strategyVersion: 2,
        symbol: 'BTC-USDT',
        interval: '1h',
        direction: 'LONG',
        generatedAt,
        generatedAtIso: new Date(generatedAt).toISOString(),
        score: 0.74,
        confidence: 0.82,
        completeness: 0.98,
        agreement: 0.86,
        qualityMultiplier: 0.96,
        actionable: true,
        state: 'ACTIONABLE',
        components: [{
          key: 'liquidity', label: 'Liquidity', role: 'QUALITY', configuredWeight: 0.12,
          effectiveWeight: 0.12, required: false, contribution: 0.101, value: 0.84,
          quality: 'LIVE', available: true, observedAt: new Date(generatedAt).toISOString(),
          reason: 'Synthetic browser-QA fixture for visual evaluation only.'
        }],
        missingRequired: [], warnings: [], reasons: ['Browser-QA laboratory preview only.']
      },
      note: 'LAB PREVIEW · synthetic fusion values for browser visual QA only.'
    };
  }
  if (pathname.startsWith('/api/market/symbol/')) {
    const symbol = decodeURIComponent(pathname.split('/').pop() || 'BTC-USDT');
    const ticker = tickers.find((item) => item.symbol === symbol) || tickers[0];
    return {
      symbol,
      ticker,
      candles: qaCandles(120),
      orderBook: { symbol, bidDepthUsd: 5_400_000, askDepthUsd: 5_100_000, imbalancePct: 2.8, dataState: 'degraded' },
      orderBookLevels: null,
      levels: null,
      longScore: null,
      shortScore: null,
      tradePlanLong: null,
      tradePlanShort: null,
      dataState: 'degraded',
      source: 'QA_INLINE_MARKET_FIXTURE',
    };
  }
  return null;
}

async function makeInlineBundle() {
  const result = await build({
    configFile: false,
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': ROOT } },
    define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      cssCodeSplit: false,
      assetsInlineLimit: 1_000_000_000,
      lib: { entry: path.resolve(ROOT, 'src/main.tsx'), name: 'ApexInlineQa', formats: ['iife'] },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const outputs = Array.isArray(result) ? result.flatMap((entry) => entry.output) : result.output;
  const js = outputs.find((entry) => entry.type === 'chunk')?.code;
  const cssAsset = outputs.find((entry) => entry.type === 'asset' && entry.fileName.endsWith('.css'));
  if (!js || !cssAsset) throw new Error('Inline QA bundle did not produce JS/CSS output');
  let css = String(cssAsset.source);
  const logoPath = path.resolve(ROOT, 'public/apex-logo.svg');
  if (fs.existsSync(logoPath)) {
    const logo = fs.readFileSync(logoPath).toString('base64');
    css = css
      .replaceAll('url(/apex-logo.svg)', `url(data:image/svg+xml;base64,${logo})`)
      .replaceAll('url("/apex-logo.svg")', `url("data:image/svg+xml;base64,${logo}")`);
  }
  return { js, css };
}

async function main() {
  const serverCommand = process.execPath;
  const serverArgs = ['--import', 'tsx', 'server.ts'];
  server = spawn(serverCommand, serverArgs, {
    cwd: ROOT,
    detached: process.platform !== 'win32',
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(PORT),
      APEX_PORT: String(PORT),
      DISABLE_HMR: 'true',
      APEX_ENABLE_HMR: 'false',
      APEX_DECISION_MEMORY_MIRROR: 'false',
      APEX_KILL_AUTOMATED_EXECUTION: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (chunk) => process.stdout.write(`[qa-server] ${String(chunk)}`));
  server.stderr?.on('data', (chunk) => process.stderr.write(`[qa-server:err] ${String(chunk)}`));
  await waitForServer();

  const { js, css } = await makeInlineBundle();
  const apexLogoPath = path.resolve(ROOT, 'public/apex-logo.svg');
  const apexLogoDataUri = fs.existsSync(apexLogoPath)
    ? `data:image/svg+xml;base64,${fs.readFileSync(apexLogoPath).toString('base64')}`
    : '';
  const tutorialAssetDir = path.resolve(ROOT, 'public/tutorial-thumbnails');
  const tutorialAssets = fs.existsSync(tutorialAssetDir)
    ? Object.fromEntries(fs.readdirSync(tutorialAssetDir)
      .filter((name) => name.toLowerCase().endsWith('.png'))
      .map((name) => [`/tutorial-thumbnails/${name}`, `data:image/png;base64,${fs.readFileSync(path.resolve(tutorialAssetDir, name)).toString('base64')}`]))
    : {};
  // Static assets the app loads as ordinary <img src="/<dir>/<file>"> requests.
  // The inline bundle renders into an about:blank document (page.setContent below), whose base
  // URL has an opaque path, so a root-relative asset path cannot be resolved into an absolute
  // URL at all: the browser never issues a request, the image errors synchronously, and any
  // component-level onError fallback wins. Inlining these directories from the CURRENT dist as
  // data URIs is what makes real artwork observable in the 1368x753 capture. Generic by design --
  // add a directory name here and it is inlined the same way.
  const STATIC_ASSET_MIME = { '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.avif': 'image/avif' };
  const STATIC_ASSET_DIRS = ['crypto-icons'];
  const staticAssets = {};
  const missingStaticAssetDirs = [];
  for (const dirName of STATIC_ASSET_DIRS) {
    const assetDir = path.resolve(ROOT, 'dist', dirName);
    if (!fs.existsSync(assetDir)) {
      missingStaticAssetDirs.push(`dist/${dirName}`);
      continue;
    }
    for (const name of fs.readdirSync(assetDir)) {
      const mime = STATIC_ASSET_MIME[path.extname(name).toLowerCase()];
      if (!mime) continue;
      staticAssets[`/${dirName}/${name}`] = `data:${mime};base64,${fs.readFileSync(path.resolve(assetDir, name)).toString('base64')}`;
    }
  }

  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
    ...(EXECUTABLE ? { executablePath: EXECUTABLE } : {}),
  };
  let browser;
  try {
    browser = await chromium.launch(launchOptions);
  } catch (error) {
    if (!isMissingPlaywrightBrowser(error)) throw error;
    const reason = 'environment_missing_playwright_browser';
    const report = {
      generatedAt: new Date().toISOString(),
      mode: 'REAL_BROWSER_INLINE_BUNDLE_WITH_LOCAL_SERVER_TRANSPORT_BRIDGE',
      skipped: true,
      skipReason: reason,
      viewport: VIEWPORT,
      theme: 'light',
      routesChecked: ROUTES,
      executionSafety: { automatedExecutionKilled: true, orderSubmissionTested: false },
      summary: { passed: false, skipped: true, failures: 0 },
    };
    fs.writeFileSync(path.resolve(OUT_DIR, 'ui-1368-light-report.json'), `${JSON.stringify(report, null, 2)}
`);
    console.log(`SKIP 1368x753 visual browser QA — ${reason}. Install Playwright Chromium or set APEX_PLAYWRIGHT_EXECUTABLE to execute this gate.`);
    await stopServer();
    await sleep(150);
    cleanupEphemeralQaRuntimeState();
    if (process.env.APEX_QA_ALLOW_BROWSER_SKIP !== '1') process.exitCode = 1;
    return;
  }
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: 'light', deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  await page.exposeFunction('__apexQaFetch', async (request) => {
    const rawUrl = String(request?.url || '');
    const marketFixture = syntheticMarketResponse(rawUrl);
    if (marketFixture) {
      return { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(marketFixture) };
    }
    try {
      let target;
      if (/^https?:\/\//i.test(rawUrl)) {
        const parsed = new URL(rawUrl);
        if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
          return { status: 503, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: false, error: 'external_network_disabled_in_inline_qa' }) };
        }
        target = `${BASE}${parsed.pathname}${parsed.search}`;
      } else {
        target = `${BASE}${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`;
      }
      const response = await fetch(target, {
        method: request?.method || 'GET',
        headers: request?.headers || {},
        body: request?.body || undefined,
        signal: AbortSignal.timeout(12_000),
      });
      return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: await response.text() };
    } catch (error) {
      return { status: 599, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: false, error: String(error) }) };
    }
  });

  await page.evaluate(`(() => {
    function makeStorage(seed = []) {
      const store = new Map(seed);
      return {
        getItem(k){ return store.get(k) ?? null; },
        setItem(k,v){ store.set(k,String(v)); },
        removeItem(k){ store.delete(k); }, clear(){ store.clear(); },
        key(i){ return Array.from(store.keys())[i] ?? null; },
        get length(){ return store.size; }
      };
    }
    Object.defineProperty(window,'localStorage',{configurable:true,value:makeStorage([
      ['apex_theme_v1','light'],
      ['apex_watchlist_favorites_v1','[\"BTC-USDT\",\"ETH-USDT\",\"SOL-USDT\"]'],
      ['apex_next_alerts_v1',JSON.stringify([
        {id:'qa-confirmed-any',name:'High-confidence setup',enabled:true,direction:'BOTH',minReadiness:'CONFIRMED',minScore:80,triggeredCount:3},
        {id:'qa-btc-short',name:'BTC directional setup',enabled:true,direction:'SHORT',minReadiness:'WATCHLIST',minScore:70,symbolFilter:'BTC-USDT',triggeredCount:2},
        {id:'qa-eth-long',name:'ETH momentum watch',enabled:true,direction:'LONG',minReadiness:'CONFIRMED',minScore:82,symbolFilter:'ETH-USDT',triggeredCount:4},
        {id:'qa-score',name:'Score breakout 75+',enabled:true,direction:'BOTH',minReadiness:'WATCHLIST',minScore:75,triggeredCount:1},
        {id:'qa-long',name:'Long candidate watch',enabled:true,direction:'LONG',minReadiness:'WATCHLIST',minScore:70,triggeredCount:5},
        {id:'qa-short',name:'Short candidate watch',enabled:true,direction:'SHORT',minReadiness:'WATCHLIST',minScore:72,triggeredCount:2},
        {id:'qa-confirmed-btc',name:'BTC confirmed only',enabled:false,direction:'BOTH',minReadiness:'CONFIRMED',minScore:85,symbolFilter:'BTC-USDT',triggeredCount:0},
        {id:'qa-broad',name:'Broad market pulse',enabled:true,direction:'BOTH',minReadiness:'CAUTION',minScore:65,triggeredCount:7}
      ])]
    ])});
    Object.defineProperty(window,'sessionStorage',{configurable:true,value:makeStorage()});
    window.fetch = async function(input, init = {}) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const headers = {};
      if (init && init.headers) {
        if (init.headers instanceof Headers) init.headers.forEach((v,k) => headers[k] = v);
        else Object.assign(headers, init.headers);
      }
      const bridged = await window.__apexQaFetch({
        url, method: (init && init.method) || 'GET', headers,
        body: init && typeof init.body === 'string' ? init.body : undefined
      });
      return new Response(bridged.body, {status: bridged.status, headers: bridged.headers});
    };
    class QAWebSocket {
      static CONNECTING=0; static OPEN=1; static CLOSING=2; static CLOSED=3;
      constructor(url){ this.url=String(url); this.readyState=1; this.protocol=''; this.extensions=''; this.bufferedAmount=0; this.binaryType='blob'; this.onopen=null; this.onclose=null; this.onerror=null; this.onmessage=null; queueMicrotask(() => this.onopen && this.onopen(new Event('open'))); }
      close(){ this.readyState=3; if(this.onclose)this.onclose(new CloseEvent('close',{code:1000,reason:'inline-qa'})); }
      send(){} addEventListener(type,cb){ if(type==='open')queueMicrotask(() => cb(new Event('open'))); } removeEventListener(){} dispatchEvent(){ return true; }
    }
    Object.defineProperty(window,'WebSocket',{configurable:true,value:QAWebSocket});
    var QA_STATIC_ASSETS = ${JSON.stringify(staticAssets)};
    var QA_STATIC_PREFIXES = ${JSON.stringify(STATIC_ASSET_DIRS.map((dirName) => `/${dirName}/`))};
    window.__APEX_QA_MISSING_ASSETS = [];
    (function patchStaticAssetLoading(){
      function resolveQaAsset(value){
        var raw = value == null ? '' : String(value);
        if (!raw || raw.slice(0,5) === 'data:') return raw;
        var pathOnly = raw.split('?')[0].split('#')[0];
        var matched = false;
        for (var i=0;i<QA_STATIC_PREFIXES.length;i++){ if (pathOnly.indexOf(QA_STATIC_PREFIXES[i]) === 0) { matched = true; break; } }
        if (!matched) return raw;
        if (QA_STATIC_ASSETS[pathOnly]) return QA_STATIC_ASSETS[pathOnly];
        if (window.__APEX_QA_MISSING_ASSETS.indexOf(pathOnly) === -1) window.__APEX_QA_MISSING_ASSETS.push(pathOnly);
        return raw;
      }
      var proto = HTMLImageElement.prototype;
      var nativeSrc = Object.getOwnPropertyDescriptor(proto, 'src');
      if (nativeSrc && nativeSrc.set) {
        Object.defineProperty(proto, 'src', {
          configurable: true,
          enumerable: nativeSrc.enumerable,
          get: function(){ return nativeSrc.get.call(this); },
          set: function(value){ nativeSrc.set.call(this, resolveQaAsset(value)); }
        });
      }
      var nativeSetAttribute = Element.prototype.setAttribute;
      Object.defineProperty(proto, 'setAttribute', {
        configurable: true,
        writable: true,
        value: function(name, value){
          if (String(name).toLowerCase() === 'src') return nativeSetAttribute.call(this, name, resolveQaAsset(value));
          return nativeSetAttribute.call(this, name, value);
        }
      });
    })();
    location.hash='#/overview';
  })()`);

  const html = `<!doctype html><html data-apex-theme="light" data-apex-theme-resolved="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body class="antialiased overflow-hidden"><div id="root"></div><script>${js}<\/script></body></html>`;
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2_000);
  if (apexLogoDataUri) {
    await page.evaluate((logoDataUri) => {
      document.querySelectorAll('img[src="/apex-logo.svg"]').forEach((img) => img.setAttribute('src', logoDataUri));
    }, apexLogoDataUri);
  }

  const routeResults = [];
  for (const route of ROUTES) {
    await page.evaluate(`location.hash='#/${route}'`);
    await page.waitForTimeout(route === 'backtesting' || route === 'strategies' ? 1_100 : 550);
    if (route === 'backtesting') {
      const canonicalRun = page.getByRole('button', { name: 'Run Backtest', exact: true });
      if (await canonicalRun.count()) {
        await canonicalRun.first().click();
        await page.waitForTimeout(700);
      }
    }
    if (route === 'strategies') {
      const refreshFusion = page.getByRole('button', { name: 'Refresh live fusion' });
      if (await refreshFusion.count()) {
        await refreshFusion.first().click();
        await page.waitForTimeout(450);
      }
    }
    if (route === 'help' && Object.keys(tutorialAssets).length) {
      await page.evaluate((assets) => {
        document.querySelectorAll('img[src^="/tutorial-thumbnails/"]').forEach((img) => {
          const source = img.getAttribute('src');
          if (source && assets[source]) img.setAttribute('src', assets[source]);
        });
      }, tutorialAssets);
      await page.waitForTimeout(120);
    }
    const metrics = await page.evaluate(`(() => ({
      theme: document.documentElement.dataset.apexThemeResolved || '',
      rootTextLength: document.getElementById('root')?.innerText.trim().length || 0,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      recoveryVisible: document.body.innerText.includes('WORKSPACE RECOVERY'),
      coinIcons: (() => {
        const images = Array.from(document.querySelectorAll('.apex-coin-icon img'));
        return { total: images.length, painted: images.filter((image) => image.naturalWidth > 0).length };
      })(),
      backtestSetup: (() => {
        const el=document.querySelector('.apex-bt-run-builder');
        if (!el) return null;
        // Smart mode owns the primary action in Smart Controls; manual mode keeps the canonical run button in builder actions.
        const action=el.querySelector('.apex-bt-smart-primary, .apex-bt-builder-actions .apex-bt-run-button');
        const er=el.getBoundingClientRect();
        const ar=action?.getBoundingClientRect();
        return {
          clientHeight:el.clientHeight, scrollHeight:el.scrollHeight, clientWidth:el.clientWidth, scrollWidth:el.scrollWidth,
          primaryActionVisible:Boolean(ar && ar.top >= er.top - 1 && ar.bottom <= er.bottom + 1 && ar.width > 0 && ar.height > 0)
        };
      })(),
      strategyColumns: (() => { const el=document.querySelector('.strategy-studio'); return el ? getComputedStyle(el).gridTemplateColumns : null; })(),
      ordersLayout: (() => {
        const card=document.querySelector('.v20-orders-table');
        if (!card) return null;
        const rect=(node) => { if (!node) return null; const r=node.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:r.height}; };
        const rows=[...card.querySelectorAll('tbody tr')];
        return {
          card:rect(card), table:rect(card.querySelector('table')), tbody:rect(card.querySelector('tbody')),
          firstRow:rect(rows[0]), lastRow:rect(rows[rows.length-1]), pagination:rect(card.querySelector('.v20-pagination')),
          gridRows:getComputedStyle(card).gridTemplateRows,
        };
      })(),
      backtestCoverage: (() => {
        const el=document.querySelector('.apex-bt-coverage-panel');
        if (!el) return null;
        const rect=(node) => { if (!node) return null; const r=node.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:r.height,display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility}; };
        return {
          panel: rect(el),
          header: rect(el.querySelector(':scope > header')),
          counts: rect(el.querySelector('.apex-bt-coverage-counts')),
          meta: rect(el.querySelector('.apex-bt-coverage-meta')),
          warning: rect(el.querySelector('.apex-bt-coverage-warning')),
          overflow: getComputedStyle(el).overflow,
          position: getComputedStyle(el).position,
          gridRows: getComputedStyle(el).gridTemplateRows,
          evidenceArea: rect(el.parentElement),
          layout: rect(document.querySelector('.apex-bt-layout')),
          workspace: rect(document.querySelector('.apex-backtest-workspace')),
        };
      })()
    }))()`);
    routeResults.push({ route, ...metrics });
    if (SCREENSHOT_ROUTES.has(route)) {
      await page.screenshot({ path: path.resolve(OUT_DIR, `${route}-light-${VIEWPORT.width}x${VIEWPORT.height}.png`), fullPage: false });
    }
  }

  const unresolvedStaticAssets = await page.evaluate('(window.__APEX_QA_MISSING_ASSETS || []).slice()');
  const relevantConsoleErrors = consoleErrors.filter((message) => !/favicon|external_network_disabled_in_inline_qa/i.test(message));
  const failures = [];
  for (const result of routeResults) {
    if (result.theme !== 'light') failures.push(`${result.route}: theme=${result.theme || 'empty'}`);
    if (result.rootTextLength < 40) failures.push(`${result.route}: root text too small (${result.rootTextLength})`);
    if (result.scrollWidth > result.clientWidth + 1) failures.push(`${result.route}: horizontal overflow ${result.scrollWidth}/${result.clientWidth}`);
    if (result.scrollHeight > result.clientHeight + 1) failures.push(`${result.route}: document vertical overflow ${result.scrollHeight}/${result.clientHeight}`);
    if (result.recoveryVisible) failures.push(`${result.route}: workspace recovery screen rendered`);
    if (result.coinIcons?.total > 0 && result.coinIcons.painted === 0) {
      failures.push(`${result.route}: no coin icon artwork painted (${result.coinIcons.total} mounted, 0 with intrinsic size)`);
    }
  }
  const backtesting = routeResults.find((result) => result.route === 'backtesting');
  if (ROUTES.includes('backtesting') && !backtesting?.backtestSetup) failures.push('backtesting: Run Builder not found');
  else if (backtesting?.backtestSetup) {
    const scrollRatio = backtesting.backtestSetup.clientHeight > 0
      ? backtesting.backtestSetup.scrollHeight / backtesting.backtestSetup.clientHeight
      : Number.POSITIVE_INFINITY;
    if (scrollRatio > 1.4) failures.push(`backtesting: Run Builder excessive vertical scroll ${backtesting.backtestSetup.scrollHeight}/${backtesting.backtestSetup.clientHeight}`);
    if (!backtesting.backtestSetup.primaryActionVisible) failures.push('backtesting: primary Smart/Run action is not visible inside the Run Builder');
    if (backtesting.backtestSetup.scrollWidth > backtesting.backtestSetup.clientWidth + 1) failures.push(`backtesting: Run Builder horizontal scroll ${backtesting.backtestSetup.scrollWidth}/${backtesting.backtestSetup.clientWidth}`);
  }
  const strategies = routeResults.find((result) => result.route === 'strategies');
  if (ROUTES.includes('strategies') && !strategies?.strategyColumns) failures.push('strategies: three-column studio grid not found');
  const orders = routeResults.find((result) => result.route === 'orders');
  if (ROUTES.includes('orders') && orders?.ordersLayout?.lastRow && orders?.ordersLayout?.pagination) {
    if (orders.ordersLayout.lastRow.bottom > orders.ordersLayout.pagination.top + 1) {
      failures.push(`orders: final row overlaps pagination (${orders.ordersLayout.lastRow.bottom.toFixed(1)} > ${orders.ordersLayout.pagination.top.toFixed(1)})`);
    }
  }
  for (const error of pageErrors) failures.push(`pageerror: ${error}`);
  for (const error of relevantConsoleErrors) failures.push(`console: ${error}`);
  for (const dirName of missingStaticAssetDirs) failures.push(`static asset directory missing: ${dirName} (run npm run build before this gate)`);
  for (const assetPath of unresolvedStaticAssets) failures.push(`static asset referenced by the app but absent from dist: ${assetPath}`);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'REAL_BROWSER_INLINE_BUNDLE_WITH_LOCAL_SERVER_TRANSPORT_BRIDGE',
    viewport: VIEWPORT,
    theme: 'light',
    executable: EXECUTABLE || 'playwright-managed',
    routesChecked: ROUTES,
    marketDataMode: 'DETERMINISTIC_QA_FIXTURE_ONLY',
    staticAssets: {
      directories: STATIC_ASSET_DIRS,
      source: 'dist',
      inlined: Object.keys(staticAssets).length,
      unresolved: unresolvedStaticAssets,
      missingDirectories: missingStaticAssetDirs,
    },
    executionSafety: { automatedExecutionKilled: true, orderSubmissionTested: false },
    summary: { passed: failures.length === 0, failures: failures.length, pageErrors: pageErrors.length, consoleErrors: relevantConsoleErrors.length },
    failures,
    routeResults,
  };
  fs.writeFileSync(path.resolve(OUT_DIR, 'ui-1368-light-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.summary, null, 2));

  await browser.close();
  await stopServer();
  await sleep(150);
  cleanupEphemeralQaRuntimeState();
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (error) => {
  await stopServer();
  await sleep(150);
  cleanupEphemeralQaRuntimeState();
  console.error(error);
  process.exit(1);
});
