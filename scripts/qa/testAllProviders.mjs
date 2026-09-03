import { performance } from 'perf_hooks';

const S4_BASE = 'https://really-amin-datasourceforcryptocurrency-4.hf.space';
const S2_BASE = 'https://really-amin-datasourceforcryptocurrency-2.hf.space';
const KUCOIN_FUTURES_BASE = 'https://api-futures.kucoin.com';
const BINANCE_FUTURES_BASE = 'https://fapi.binance.com';
const LOCAL_BASE = 'http://localhost:3000';

const results = [];

async function probe(category, name, url, options = {}, validator = null) {
  const start = performance.now();
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeout || 10000) });
    const latency = Math.round(performance.now() - start);
    let ok = res.ok;
    let details = `HTTP ${res.status}`;
    let data = null;

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (validator && ok) {
      try {
        const vResult = validator(data, res);
        if (vResult !== true) {
          ok = false;
          details += ` - ${vResult}`;
        }
      } catch (err) {
        ok = false;
        details += ` - Validation error: ${err.message}`;
      }
    }

    const item = { category, name, ok, latency, details };
    results.push(item);
    console.log(`[${ok ? 'PASS' : 'FAIL'}] [${category}] ${name} (${details}, ${latency}ms)`);
    return { ok, data, latency };
  } catch (err) {
    const latency = Math.round(performance.now() - start);
    const item = { category, name, ok: false, latency, details: err.message };
    results.push(item);
    console.log(`[FAIL] [${category}] ${name} (Error: ${err.message}, ${latency}ms)`);
    return { ok: false, error: err.message, latency };
  }
}

async function run() {
  console.log('================================================================');
  console.log('   APEX CONSOLIDATED DATA SOURCES & PROVIDER FULL QA SUITE');
  console.log('================================================================\n');

  // --- Category 1: Hugging Face Space 4 ---
  console.log('--- 1. Hugging Face Space 4 Canonical Routes ---');
  await probe('Space 4', 'Coverage', `${S4_BASE}/api/apex/coverage`, {}, (d) => d.success === true && (!!d.manifest || !!d.components));
  await probe('Space 4', 'Trading Pairs', `${S4_BASE}/trading_pairs.txt`, {}, (d) => typeof d === 'string' && d.includes('BTCUSDT'));
  await probe('Space 4', 'History OHLCV (1h)', `${S4_BASE}/api/history?symbol=BTCUSDT&interval=1h&limit=5`, {}, (d) => Array.isArray(d?.data) && d.data.length > 0);
  await probe('Space 4', 'Funding Rate', `${S4_BASE}/api/apex/funding/BTCUSDT?limit=5`, {}, (d) => d.success === true && Array.isArray(d?.data));
  await probe('Space 4', 'Open Interest', `${S4_BASE}/api/apex/open-interest/BTCUSDT?period=1h&limit=5`, {}, (d) => d.success === true);
  await probe('Space 4', 'Fear & Greed', `${S4_BASE}/api/apex/sentiment/fear-greed?limit=5`, {}, (d) => d.success === true && Array.isArray(d?.data));
  await probe('Space 4', 'News Feed', `${S4_BASE}/api/apex/news?limit=5`, {}, (d) => d.success === true && Array.isArray(d?.data));
  await probe('Space 4', 'Whale Flow Feed', `${S4_BASE}/api/apex/whale-flow?limit=5`, {}, (d) => d.success === true && Array.isArray(d?.data));
  await probe('Space 4', 'Short Hunter (LIVE-only limit=30)', `${S4_BASE}/api/short-hunter/snapshot/BTCUSDT?interval=1h&limit=30`, { timeout: 15000 }, (d) => !!d && (d.success === true || d.symbol === 'BTCUSDT'));

  // --- Category 2: Hugging Face Space 2 ---
  console.log('\n--- 2. Hugging Face Space 2 Canonical Routes ---');
  await probe('Space 2', 'OHLCV (1h)', `${S2_BASE}/api/ohlcv?symbol=BTCUSDT&timeframe=1h&limit=5`, {}, (d) => d.success === true && Array.isArray(d?.data) && d.data.length > 0);
  await probe('Space 2', 'Fear & Greed Index', `${S2_BASE}/api/fear-greed?limit=5`, {}, (d) => d.success === true && Array.isArray(d?.data));
  await probe('Space 2', 'Multi-Source Sentiment', `${S2_BASE}/api/multi-source/sentiment`, {}, (d) => d.success === true && d.data?.value !== undefined && !!d.source);
  await probe('Space 2', 'Funding Rate', `${S2_BASE}/api/apex/funding/BTCUSDT?limit=5`, { timeout: 15000 }, (d) => d.success === true);

  // --- Category 3: KuCoin Futures Public Endpoints ---
  console.log('\n--- 3. KuCoin Futures Public Endpoints ---');
  await probe('KuCoin Futures', 'Server Timestamp', `${KUCOIN_FUTURES_BASE}/api/v1/timestamp`, {}, (d) => d.code === '200000');
  await probe('KuCoin Futures', 'Ticker XBTUSDTM', `${KUCOIN_FUTURES_BASE}/api/v1/ticker?symbol=XBTUSDTM`, {}, (d) => d.code === '200000' && !!d.data?.price);
  await probe('KuCoin Futures', 'Candles (1m)', `${KUCOIN_FUTURES_BASE}/api/v1/kline/query?symbol=XBTUSDTM&granularity=1`, {}, (d) => d.code === '200000' && Array.isArray(d?.data));
  await probe('KuCoin Futures', 'Contracts List', `${KUCOIN_FUTURES_BASE}/api/v1/contracts/active`, {}, (d) => d.code === '200000' && Array.isArray(d?.data));

  // --- Category 4: Binance Futures Public Endpoints ---
  console.log('\n--- 4. Binance Futures Public Endpoints ---');
  await probe('Binance Futures', 'Server Time', `${BINANCE_FUTURES_BASE}/fapi/v1/time`, {}, (d) => !!d?.serverTime);
  await probe('Binance Futures', '24hr Ticker BTCUSDT', `${BINANCE_FUTURES_BASE}/fapi/v1/ticker/24hr?symbol=BTCUSDT`, {}, (d) => !!d?.lastPrice);
  await probe('Binance Futures', 'Klines (1m)', `${BINANCE_FUTURES_BASE}/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=5`, {}, (d) => Array.isArray(d) && d.length > 0);
  await probe('Binance Futures', 'Premium Index / Funding', `${BINANCE_FUTURES_BASE}/fapi/v1/premiumIndex?symbol=BTCUSDT`, {}, (d) => !!d?.lastFundingRate);
  await probe('Binance Futures', 'Open Interest', `${BINANCE_FUTURES_BASE}/fapi/v1/openInterest?symbol=BTCUSDT`, {}, (d) => !!d?.openInterest);

  // --- Category 5: Public Free & News Providers ---
  console.log('\n--- 5. Keyless Public Fallbacks & News Providers ---');
  await probe('Alternative.me', 'Fear & Greed Index', 'https://api.alternative.me/fng/?limit=1', {}, (d) => Array.isArray(d?.data) && d.data.length > 0);
  await probe('CoinGecko', 'Keyless Simple Price (BTC,ETH)', 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd', {}, (d) => !!d?.bitcoin?.usd);
  await probe('NewsData.io', 'Crypto News Query', 'https://newsdata.io/api/1/latest?apikey=pub_0541f8b03d49486285f479c3b9a41fd8&q=crypto&language=en', {}, (d) => d.status === 'success' && Array.isArray(d?.results));

  // --- Category 6: Local APEX Engine ---
  console.log('\n--- 6. Local APEX Engine Endpoints ---');
  await probe('Local APEX', '/api/health', `${LOCAL_BASE}/api/health`, {}, (d) => !!d && (d.server === 'ok' || typeof d.uptimeSeconds === 'number'));
  await probe('Local APEX', '/api/operations/status', `${LOCAL_BASE}/api/operations/status`, {}, (d) => !!d && (Array.isArray(d.providers) || typeof d.providers === 'object'));
  await probe('Local APEX', '/api/market/top-volume', `${LOCAL_BASE}/api/market/top-volume`, {}, (d) => !!d && Array.isArray(d.symbols) && d.symbols.length > 0);
  await probe('Local APEX', '/api/hf-space/historical/BTCUSDT', `${LOCAL_BASE}/api/hf-space/historical/BTCUSDT?limit=5`, { timeout: 15000 }, (d) => d.ok === true && Array.isArray(d.candles));

  console.log('\n================================================================');
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`TOTAL QA PROBES: ${passed} / ${total} PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================');
}

run();
