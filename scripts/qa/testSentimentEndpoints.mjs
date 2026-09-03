import { performance } from 'perf_hooks';

const S2_BASE = 'https://really-amin-datasourceforcryptocurrency-2.hf.space';
const S4_BASE = 'https://really-amin-datasourceforcryptocurrency-4.hf.space';
const LOCAL_BASE = 'http://localhost:3000';

const endpoints = [
  { id: 1, name: 'Service Sentiment', method: 'GET', path: '/api/service/sentiment' },
  { id: 2, name: 'Real API Sentiment Analyze', method: 'POST', path: '/real/api/sentiment/analyze', body: { text: 'Bitcoin breaks new all-time high amidst strong institutional inflows.' } },
  { id: 3, name: 'HF Sentiment V1', method: 'POST', path: '/api/v1/hf/sentiment', body: { text: 'Bullish market continuation expected for Ethereum.' } },
  { id: 4, name: 'HF Sentiment Batch', method: 'POST', path: '/api/v1/hf/sentiment/batch', body: { texts: ['Bullish momentum', 'Bearish divergence'] } },
  { id: 5, name: 'Multi-Source Sentiment', method: 'GET', path: '/api/multi-source/sentiment' },
  { id: 6, name: 'Sentiment Root Alias', method: 'GET', path: '/api/sentiment' },
  { id: 7, name: 'Sentiment V4 Fallback', method: 'POST', path: '/api/sentiment', body: { text: 'Market sentiment positive' } },
  { id: 8, name: 'Sentiment Analyze Explicit', method: 'POST', path: '/api/sentiment/analyze', body: { text: 'Market rally continues' } },
  { id: 9, name: 'Resource Sentiment Global', method: 'GET', path: '/api/resources/sentiment/global' },
  { id: 10, name: 'Resource Sentiment Coin', method: 'GET', path: '/api/resources/sentiment/coin/BTC' },
  { id: 11, name: 'HF Space Sentiment Global', method: 'GET', path: '/api/hf-space/sentiment' },
  { id: 12, name: 'HF Space Sentiment Asset', method: 'GET', path: '/api/hf-space/sentiment/BTC' },
  { id: 13, name: 'Crypto-DT Sentiment', method: 'GET', path: '/api/new-sources/crypto-dt-source/sentiment' },
  { id: 14, name: 'HF Run Sentiment', method: 'POST', path: '/api/hf/run-sentiment', body: { text: 'Solana volume spikes' } },
  { id: 15, name: 'AI Coin Sentiment', method: 'GET', path: '/api/ai/sentiment/bitcoin' },
  { id: 16, name: 'Social Sentiment', method: 'GET', path: '/api/social/sentiment' },
  { id: 17, name: 'Sentiment Global', method: 'GET', path: '/api/sentiment/global' },
  { id: 18, name: 'Sentiment Asset', method: 'GET', path: '/api/sentiment/asset/BTC' },
  { id: 19, name: 'Alternative FnG V1', method: 'GET', path: '/api/v1/alternative/fng' },
  { id: 20, name: 'Resource Sentiment Fear-Greed', method: 'GET', path: '/api/resources/sentiment/fear-greed' },
  { id: 21, name: 'Crypto-DT Fear-Greed', method: 'GET', path: '/api/new-sources/crypto-dt-source/fear-greed' },
  { id: 22, name: 'Fear & Greed Main', method: 'GET', path: '/api/fear-greed' },
  { id: 23, name: 'Fear & Greed Full History', method: 'GET', path: '/api/fear-greed?limit=0' },
  { id: 24, name: 'Reddit Top', method: 'GET', path: '/api/v1/reddit/top' },
  { id: 25, name: 'Reddit New', method: 'GET', path: '/api/v1/reddit/new' },
  { id: 26, name: 'Crypto-DT Reddit', method: 'GET', path: '/api/new-sources/crypto-dt-source/reddit' },
  { id: 27, name: 'Social Trending', method: 'GET', path: '/api/social/trending' },
  { id: 28, name: 'Sentiment UI Route', method: 'GET', path: '/#/sentiment' },
];

async function probeTarget(targetBase, ep) {
  const url = ep.path.startsWith('/#') ? `${targetBase}${ep.path}` : `${targetBase}${ep.path}`;
  const start = performance.now();
  try {
    const opts = {
      method: ep.method,
      headers: { Accept: 'application/json, text/html' },
      signal: AbortSignal.timeout(8000),
    };
    if (ep.method === 'POST') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(ep.body || {});
    }
    const res = await fetch(url, opts);
    const latency = Math.round(performance.now() - start);
    let sample = '';
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const json = await res.json();
      sample = JSON.stringify(json).slice(0, 100);
    } else {
      sample = (await res.text()).slice(0, 80);
    }
    return { status: res.status, ok: res.ok, latency, sample };
  } catch (err) {
    return { status: 0, ok: false, latency: Math.round(performance.now() - start), error: err.message };
  }
}

async function run() {
  console.log('========================================================================================');
  console.log('                 SENTIMENT MASTER TABLE — 28 ENDPOINTS TEST SUITE');
  console.log('========================================================================================\n');

  console.log('|  # | Endpoint | Method | Space 2 Status | Space 4 Status | Local APEX Status | Sample Data / Notes |');
  console.log('|---:|:---|:---:|:---:|:---:|:---:|:---|');

  for (const ep of endpoints) {
    const [s2Res, s4Res, localRes] = await Promise.all([
      probeTarget(S2_BASE, ep),
      probeTarget(S4_BASE, ep),
      probeTarget(LOCAL_BASE, ep),
    ]);

    const s2Status = s2Res.ok ? `✅ ${s2Res.status} (${s2Res.latency}ms)` : s2Res.status ? `❌ ${s2Res.status}` : `ERR`;
    const s4Status = s4Res.ok ? `✅ ${s4Res.status} (${s4Res.latency}ms)` : s4Res.status ? `❌ ${s4Res.status}` : `ERR`;
    const localStatus = localRes.ok ? `✅ ${localRes.status} (${localRes.latency}ms)` : localRes.status ? `❌ ${localRes.status}` : `ERR`;

    const sample = s2Res.sample || s4Res.sample || localRes.sample || s2Res.error || s4Res.error || '—';
    const cleanSample = sample.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 45);

    console.log(`| ${String(ep.id).padStart(2, ' ')} | \`${ep.path}\` | \`${ep.method}\` | ${s2Status} | ${s4Status} | ${localStatus} | ${cleanSample} |`);
  }

  console.log('\n========================================================================================');
}

run();
