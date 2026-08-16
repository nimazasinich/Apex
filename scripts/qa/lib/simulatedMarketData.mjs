import crypto from 'node:crypto';

export const SIMULATION_SCHEMA_VERSION = 1;
export const DEFAULT_SIMULATION_SEED = 0xA9E258;
export const DEFAULT_START_MS = Date.UTC(2026, 0, 1, 0, 0, 0);

const SYMBOLS = [
  { symbol: 'BTC-USDT', base: 65_000, volume: 180 },
  { symbol: 'ETH-USDT', base: 3_500, volume: 1_900 },
  { symbol: 'SOL-USDT', base: 150, volume: 28_000 },
];
const REGIMES = ['bull_trend', 'bear_trend', 'range', 'volatility_shock', 'liquidity_sweep', 'feed_gap_recovery', 'thin_liquidity', 'funding_basis_squeeze'];

export function seededRng(seed = DEFAULT_SIMULATION_SEED) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function regimeReturn(regime, index, rng) {
  const noise = (rng() - 0.5) * 0.003;
  if (regime === 'bull_trend') return 0.00045 + noise;
  if (regime === 'bear_trend') return -0.00045 + noise;
  if (regime === 'range') return Math.sin(index / 17) * 0.0009 + noise * 0.55;
  if (regime === 'volatility_shock') {
    if (index === 190) return -0.085;
    if (index === 191) return 0.04;
    return noise * (index > 180 && index < 230 ? 3.8 : 0.8);
  }
  if (regime === 'liquidity_sweep') {
    if (index % 121 === 90) return -0.022;
    if (index % 121 === 91) return 0.019;
    return 0.00008 + noise * 0.8;
  }
  if (regime === 'thin_liquidity') {
    if (index % 97 === 33) return 0.018 + noise;
    if (index % 97 === 34) return -0.016 + noise;
    return Math.sin(index / 23) * 0.00055 + noise * 0.35;
  }
  if (regime === 'funding_basis_squeeze') {
    if (index >= 250 && index < 270) return 0.0012 + noise * 1.4;
    if (index === 270) return -0.032;
    return 0.00018 + noise * 0.65;
  }
  // feed_gap_recovery: market remains valid around the omitted transport window.
  return 0.0001 + noise * 0.75;
}

function makeCandleSeries({ symbol, base, volume }, regime, bars, seed, startMs) {
  const rng = seededRng(seed);
  const rows = [];
  let price = base;
  for (let index = 0; index < bars; index += 1) {
    if (regime === 'feed_gap_recovery' && index >= 210 && index < 222) continue;
    const open = price;
    const ret = regimeReturn(regime, index, rng);
    const close = Math.max(0.0001, open * (1 + ret));
    const wick = Math.max(open, close) * (0.0002 + rng() * (regime === 'volatility_shock' ? 0.004 : 0.0015));
    const high = Math.max(open, close) + wick;
    const low = Math.max(0.0001, Math.min(open, close) - wick * (0.8 + rng() * 0.4));
    const volumeFactor = regime === 'volatility_shock' && index >= 185 && index <= 230 ? 5
      : regime === 'liquidity_sweep' && index % 121 >= 89 && index % 121 <= 92 ? 4
      : regime === 'thin_liquidity' ? 0.22
      : regime === 'funding_basis_squeeze' && index >= 245 && index <= 275 ? 3.5
      : 1;
    rows.push({
      time: new Date(startMs + index * 60_000).toISOString(),
      open: Number(open.toFixed(8)),
      high: Number(high.toFixed(8)),
      low: Number(low.toFixed(8)),
      close: Number(close.toFixed(8)),
      volume: Number((volume * volumeFactor * (0.55 + rng() * 0.9)).toFixed(8)),
    });
    price = close;
  }
  return rows;
}

function makeMicrostructureEvents(symbolSpec, regime, seed, startMs, count = 140) {
  const rng = seededRng(seed ^ 0x5f3759df);
  let mid = symbolSpec.base;
  const events = [];
  const source = 'apex-deterministic-sim';
  const event = (type, timestamp, payload) => ({
    eventId: `${symbolSpec.symbol}-${regime}-${events.length}`,
    type,
    source,
    symbol: symbolSpec.symbol,
    exchangeTimestamp: timestamp,
    receivedAt: timestamp + Math.floor(rng() * 8),
    schemaVersion: 1,
    ingestionKind: 'REPLAY',
    payload,
  });
  for (let index = 0; index < count; index += 1) {
    const timestamp = startMs + index * 250;
    let step = (rng() - 0.5) * 0.0008;
    if (regime === 'liquidity_sweep' && index === 65) step = -0.018;
    if (regime === 'liquidity_sweep' && index === 66) step = 0.015;
    if (regime === 'volatility_shock' && index === 70) step = -0.045;
    if (regime === 'thin_liquidity' && index % 53 === 31) step = (rng() < 0.5 ? -1 : 1) * 0.012;
    if (regime === 'funding_basis_squeeze' && index >= 82 && index <= 92) step = 0.0025 + (rng() - 0.5) * 0.001;
    mid = Math.max(0.0001, mid * (1 + step));
    const spreadBps = regime === 'volatility_shock' && index >= 65 && index <= 80 ? 18
      : regime === 'thin_liquidity' ? 12 + rng() * 24
      : regime === 'funding_basis_squeeze' && index >= 80 && index <= 96 ? 8 + rng() * 12
      : 2 + rng() * 5;
    const half = mid * spreadBps / 20_000;
    const bid = mid - half;
    const ask = mid + half;
    const liquidityScale = regime === 'thin_liquidity' ? 0.12 : regime === 'funding_basis_squeeze' && index >= 80 && index <= 96 ? 0.45 : 1;
    const bidSize = (2 + rng() * 40) * liquidityScale;
    const askSize = (2 + rng() * 40) * liquidityScale;
    if (index === 0 || index % 20 === 0) {
      events.push(event('ORDERBOOK_SNAPSHOT', timestamp, {
        bids: [{ price: bid, size: bidSize }, { price: bid * 0.9995, size: bidSize * 1.4 }],
        asks: [{ price: ask, size: askSize }, { price: ask * 1.0005, size: askSize * 1.4 }],
      }));
    }
    events.push(event('QUOTE', timestamp + 10, { bid, ask, bidSize, askSize }));
    events.push(event('TRADE', timestamp + 30, {
      price: rng() < 0.5 ? bid : ask,
      size: 0.1 + rng() * 8,
      aggressorSide: rng() < 0.5 ? 'BUY' : 'SELL',
    }));
    if (index % 7 === 0) {
      events.push(event('ORDERBOOK_DELTA', timestamp + 45, {
        updates: [{ side: 'BID', price: bid, size: bidSize * (0.5 + rng()) }, { side: 'ASK', price: ask, size: askSize * (0.5 + rng()) }],
      }));
    }
  }
  return events;
}

export function generateSimulationCorpus({ seed = DEFAULT_SIMULATION_SEED, bars = 480, startMs = DEFAULT_START_MS } = {}) {
  const datasets = [];
  let ordinal = 0;
  for (const symbolSpec of SYMBOLS) {
    for (const regime of REGIMES) {
      const localSeed = (seed + ordinal * 7919) >>> 0;
      const candles = makeCandleSeries(symbolSpec, regime, bars, localSeed, startMs);
      const events = makeMicrostructureEvents(symbolSpec, regime, localSeed, startMs + bars * 60_000);
      datasets.push({ symbol: symbolSpec.symbol, regime, seed: localSeed, candles, events });
      ordinal += 1;
    }
  }
  return { schemaVersion: SIMULATION_SCHEMA_VERSION, seed, startMs, barsRequested: bars, datasets };
}

export function stableJson(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}

export function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}
