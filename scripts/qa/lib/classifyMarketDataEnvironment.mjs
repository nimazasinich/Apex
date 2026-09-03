/**
 * Classify whether an Autopilot runtime gate is blocked by its execution
 * environment rather than by the controller/state machine.
 *
 * This helper is intentionally conservative: it returns SKIP_ELIGIBLE only
 * when every primary market provider is unavailable and the observed failures
 * are overwhelmingly transport/proxy/geo/rate-limit shaped. Unknown semantic
 * failures remain ASSERT_LOGIC so the QA gate fails instead of hiding a bug.
 */
const TRANSPORT_RE = /(timeout|timed out|abort|fetch failed|econn|enotfound|eai_again|socket|network|proxy|dns|unreachable|connect|forbidden|geo.?block|cloudflare)/i;
const TRANSPORT_STATUSES = new Set([0, 403, 408, 429, 451, 502, 503, 504]);

function flattenProbeFailures(health) {
  const groups = health?.exchangeConnectivity ?? {};
  const rows = [];
  for (const [provider, probes] of Object.entries(groups)) {
    if (!probes || typeof probes !== 'object') continue;
    for (const [probe, result] of Object.entries(probes)) {
      if (result?.ok === true) continue;
      rows.push({
        provider,
        probe,
        status: Number.isFinite(Number(result?.status)) ? Number(result.status) : 0,
        reason: String(result?.reason ?? ''),
        message: String(result?.message ?? ''),
      });
    }
  }
  return rows;
}

function isTransportFailure(row) {
  return TRANSPORT_STATUSES.has(row.status) || TRANSPORT_RE.test(`${row.reason} ${row.message}`);
}

export function classifyMarketDataEnvironment(health) {
  if (!health || health?.server !== 'ok' || health?.health?.server?.status !== 'READY') {
    return { disposition: 'ASSERT_LOGIC', reason: 'server_health_contract_unavailable', failureRate: 0, transportFailureRate: 0 };
  }

  const providerStates = [
    ['kucoin', health?.health?.kucoinCore?.status],
    ['binance', health?.health?.binanceSentiment?.status],
  ];
  const readyProviders = providerStates.filter(([, status]) => status === 'READY').map(([name]) => name);
  if (readyProviders.length > 0) {
    return { disposition: 'RUN', reason: `primary_provider_ready:${readyProviders.join(',')}`, failureRate: 0, transportFailureRate: 0 };
  }

  const failures = flattenProbeFailures(health);
  if (!failures.length) {
    return { disposition: 'ASSERT_LOGIC', reason: 'primary_providers_unready_without_probe_failures', failureRate: 1, transportFailureRate: 0 };
  }
  const transportFailures = failures.filter(isTransportFailure);
  const transportFailureRate = transportFailures.length / failures.length;
  const allPrimaryUnavailable = providerStates.every(([, status]) => status === 'UNAVAILABLE');

  if (allPrimaryUnavailable && transportFailureRate >= 0.75) {
    const summary = transportFailures.slice(0, 4)
      .map((row) => `${row.provider}.${row.probe}:${row.status || row.reason || 'transport_error'}`)
      .join(',');
    return {
      disposition: 'SKIP_ELIGIBLE',
      reason: `primary_market_data_transport_unavailable:${summary}`,
      failureRate: 1,
      transportFailureRate,
    };
  }

  return {
    disposition: 'ASSERT_LOGIC',
    reason: `primary_market_data_unready_nontransport:transport_rate=${transportFailureRate.toFixed(2)}`,
    failureRate: 1,
    transportFailureRate,
  };
}
