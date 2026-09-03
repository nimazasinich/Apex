async function testEndpoint(name, url, options = {}) {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), ...options });
    const latencyMs = Date.now() - start;
    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }
    const ok = res.ok;
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} (${res.status}, ${latencyMs}ms)`);
    return { name, ok, status: res.status, latencyMs, data };
  } catch (err) {
    const latencyMs = Date.now() - start;
    console.log(`[FAIL] ${name} (Error: ${err.message}, ${latencyMs}ms)`);
    return { name, ok: false, status: 0, latencyMs, error: err.message };
  }
}

async function main() {
  console.log('=== VERIFYING CANONICAL HUGGING FACE & PUBLIC FUTURES PROVIDERS ===\n');

  console.log('--- 1. Space 4 Blueprint Routes ---');
  await testEndpoint('Space 4 Coverage', 'https://really-amin-datasourceforcryptocurrency-4.hf.space/api/apex/coverage');
  await testEndpoint('Space 4 Trading Pairs', 'https://really-amin-datasourceforcryptocurrency-4.hf.space/trading_pairs.txt');
  await testEndpoint('Space 4 History OHLCV', 'https://really-amin-datasourceforcryptocurrency-4.hf.space/api/history?symbol=BTCUSDT&interval=1h&limit=5');
  await testEndpoint('Space 4 Funding Rate', 'https://really-amin-datasourceforcryptocurrency-4.hf.space/api/apex/funding/BTCUSDT?limit=5');
  await testEndpoint('Space 4 Open Interest', 'https://really-amin-datasourceforcryptocurrency-4.hf.space/api/apex/open-interest/BTCUSDT?period=1h&limit=5');
  await testEndpoint('Space 4 Fear & Greed', 'https://really-amin-datasourceforcryptocurrency-4.hf.space/api/apex/sentiment/fear-greed?limit=1');
  await testEndpoint('Space 4 News', 'https://really-amin-datasourceforcryptocurrency-4.hf.space/api/apex/news?limit=5');
  await testEndpoint('Space 4 Whale Flow', 'https://really-amin-datasourceforcryptocurrency-4.hf.space/api/apex/whale-flow?limit=5');
  await testEndpoint('Space 4 Short Hunter (LIVE-only limit=30)', 'https://really-amin-datasourceforcryptocurrency-4.hf.space/api/short-hunter/snapshot/BTCUSDT?interval=1h&limit=30');

  console.log('\n--- 2. Space 2 Blueprint Routes ---');
  await testEndpoint('Space 2 OHLCV', 'https://really-amin-datasourceforcryptocurrency-2.hf.space/api/ohlcv?symbol=BTCUSDT&timeframe=1h&limit=5');
  await testEndpoint('Space 2 Fear & Greed', 'https://really-amin-datasourceforcryptocurrency-2.hf.space/api/fear-greed?limit=1');
  await testEndpoint('Space 2 Funding', 'https://really-amin-datasourceforcryptocurrency-2.hf.space/api/apex/funding/BTCUSDT');

  console.log('\n--- 3. Binance Public USD-M Futures Routes ---');
  await testEndpoint('Binance Server Time', 'https://fapi.binance.com/fapi/v1/time');
  await testEndpoint('Binance 24hr Ticker', 'https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BTCUSDT');
  await testEndpoint('Binance Klines (1m)', 'https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=5');
  await testEndpoint('Binance Premium Index / Funding', 'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT');
  await testEndpoint('Binance Open Interest', 'https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT');

  console.log('\n--- 4. KuCoin Public Futures Routes ---');
  await testEndpoint('KuCoin Timestamp', 'https://api-futures.kucoin.com/api/v1/timestamp');
  await testEndpoint('KuCoin Ticker', 'https://api-futures.kucoin.com/api/v1/ticker?symbol=XBTUSDTM');
  await testEndpoint('KuCoin Candles (1m)', 'https://api-futures.kucoin.com/api/v1/kline/query?symbol=XBTUSDTM&granularity=1');
  await testEndpoint('KuCoin Contract Details', 'https://api-futures.kucoin.com/api/v1/contracts/XBTUSDTM');

  console.log('\n--- 5. Local Server Health & Operations ---');
  const healthRes = await testEndpoint('Local Server /api/health', 'http://localhost:3000/api/health');
  const opRes = await testEndpoint('Local Server /api/operations/status', 'http://localhost:3000/api/operations/status');

  if (opRes.data?.providers) {
    console.log('\nProvider Summary:');
    console.log(`Configured Healthy: ${opRes.data.providers.summary.configuredHealthyProviders} / ${opRes.data.providers.summary.configuredProviders}`);
    console.log('Provider List:');
    opRes.data.providers.items.forEach(p => {
      console.log(`  - ${p.name.padEnd(16)} | ${p.category.padEnd(12)} | Status: ${p.status.padEnd(14)} | Healthy: ${p.isHealthy}`);
    });
  }
}

main();
