/**
 * Field-verify the proxy transport modes specified in HF2_BINANCE_PROXY_RECOVERY.md:
 * 1. Direct (mode: 'off', type: 'socks5', address: '')
 * 2. Manual SOCKS5H (mode: 'manual', type: 'socks5', address: '127.0.0.1:1080')
 * 3. Manual HTTP CONNECT (mode: 'manual', type: 'http', address: '127.0.0.1:8080')
 * 4. Auto (mode: 'auto', type: 'socks5', address: '')
 */

import { probeProxyConfiguration } from '../../src/services/proxyFetch.ts';

const TARGETS = [
  { provider: 'Binance Futures', url: 'https://fapi.binance.com/fapi/v1/time' },
  { provider: 'KuCoin Futures', url: 'https://api-futures.kucoin.com/api/v1/timestamp' },
  { provider: 'HF Space 2', url: 'https://nimazasinich-market-data-service.hf.space/api/new-sources/status' },
  { provider: 'HF Space 4', url: 'https://nimazasinich-market-data-service-4.hf.space/api/health' },
];

const MODES = [
  { name: '1. Direct Mode', config: { mode: 'off', type: 'socks5', address: '' } },
  { name: '2. Manual SOCKS5H (Local SOCKS)', config: { mode: 'manual', type: 'socks5', address: '127.0.0.1:1080' } },
  { name: '3. Manual HTTP CONNECT (Local HTTP)', config: { mode: 'manual', type: 'http', address: '127.0.0.1:8080' } },
  { name: '4. Auto Mode (Direct First + Proxy Discovery)', config: { mode: 'auto', type: 'socks5', address: '' } },
];

async function runFieldProbes() {
  console.log('================================================================');
  console.log('APEX HF2 — Field-Verify Proxy Transport Probes');
  console.log('================================================================');
  console.log(`Targets: ${TARGETS.map(t => t.provider).join(', ')}\n`);

  const summary = [];

  for (const item of MODES) {
    console.log(`--- Probing: ${item.name} ---`);
    try {
      const probe = await probeProxyConfiguration(item.config, TARGETS, 10_000);
      const passed = probe.results.filter(r => r.ok).length;
      console.log(`Results (${passed}/${probe.results.length} succeeded):`);
      for (const res of probe.results) {
        console.log(`  - [${res.ok ? 'PASS' : 'FAIL'}] ${res.provider}: status=${res.status}, latency=${res.latencyMs}ms, route=${res.route}, routeLabel="${res.routeLabel}", error=${res.error || 'none'}`);
      }
      summary.push({
        mode: item.name,
        ok: passed > 0,
        passed,
        total: probe.results.length,
        results: probe.results,
      });
    } catch (err) {
      console.error(`  ERROR during probe: ${err.message}`);
      summary.push({
        mode: item.name,
        ok: false,
        error: err.message,
      });
    }
    console.log('');
  }

  console.log('================================================================');
  console.log('FIELD PROBE SUMMARY REPORT');
  console.log('================================================================');
  for (const s of summary) {
    console.log(`${s.mode}: ${s.passed > 0 ? 'ACTIVE' : 'FAILED'} (${s.passed ?? 0}/${s.total ?? 0} endpoints reachable)`);
  }
}

runFieldProbes().catch(console.error);
