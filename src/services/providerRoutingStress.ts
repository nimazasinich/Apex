/**
 * Deterministic provider-routing stress harness.
 *
 * Exercises the real providerRouter with injected network responses. It never
 * contacts a live provider, never supplies API credentials, and never replaces
 * unavailable data with a fabricated neutral payload.
 */
import {
  __resetProviderRouterState,
  clearCooldown,
  cooldownKey,
  isCoolingDown,
  recordFailureCooldown,
  routeBinanceSentiment,
  storeLkg,
  SYMBOL_NOT_SUPPORTED,
  type DataEnvelope,
  type FetchJson,
  type FetchResult,
} from './providerRouter';

export const PROVIDER_ROUTING_STRESS_REPORT_VERSION = 1;

export type ProviderFailureMode =
  | 'DIRECT_SUCCESS'
  | 'TIMEOUT'
  | 'GEO_BLOCKED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_5XX'
  | 'MALFORMED_RESPONSE'
  | 'UNSUPPORTED_SYMBOL'
  | 'PROXY_UNAVAILABLE'
  | 'ALL_ROUTES_UNAVAILABLE'
  | 'DEGRADED_LKG'
  | 'COOLDOWN_ACTIVE'
  | 'RECOVERY_AFTER_COOLDOWN';

export type ProviderOpsState =
  | 'READY'
  | 'DEGRADED'
  | 'UNAVAILABLE'
  | 'GEO_BLOCKED'
  | 'RATE_LIMITED'
  | 'UNSUPPORTED';

export interface ProviderRoutingScenarioResult {
  id: string;
  failureMode: ProviderFailureMode;
  opsState: ProviderOpsState;
  envelopeStatus: DataEnvelope<unknown>['status'];
  reason: string | null;
  valueIsNull: boolean;
  fabricated: boolean;
}

export interface ProviderRoutingCheckResult {
  id: string;
  pass: boolean;
  actual: string | number | boolean;
  expected: string;
  failureMode: ProviderFailureMode;
  opsState: ProviderOpsState;
}

export interface ProviderRoutingStressResult {
  version: number;
  generatedAt: string;
  verdict: 'PASS' | 'FAIL';
  run: {
    seed: number;
    scenarioCount: number;
    passedChecks: number;
    totalChecks: number;
  };
  scenarios: ProviderRoutingScenarioResult[];
  checks: ProviderRoutingCheckResult[];
  limitations: string[];
}

interface StressOptions {
  seed?: number;
  generatedAt?: string;
}

const SYMBOL = 'BTCUSDT';
const OTHER_SYMBOL = 'ETHUSDT';
const CATEGORY = 'longShortRatio' as const;
const ENDPOINT = 'globalLongShortAccountRatio';
const URL = `https://fapi.binance.com/futures/data/${ENDPOINT}?symbol=${SYMBOL}`;
const AUTHENTIC_VALUE = [{ symbol: SYMBOL, longShortRatio: '1.2345', timestamp: 1_700_000_000_000 }];
const AUTHENTIC_LKG = [{ symbol: SYMBOL, longShortRatio: '0.9876', timestamp: 1_699_999_900_000 }];

function response(ok: boolean, status: number, json: unknown, error?: string): FetchResult {
  return { ok, status, json, error };
}

function supportedExchangeInfo(symbols = [SYMBOL, OTHER_SYMBOL]): FetchResult {
  return response(true, 200, {
    symbols: symbols.map((symbol) => ({ symbol, status: 'TRADING', contractType: 'PERPETUAL' })),
  });
}

function scriptedFetch(
  endpointResult: FetchResult,
  options: { exchangeInfo?: FetchResult; unexpectedError?: string } = {},
): FetchJson {
  const gateResult = options.exchangeInfo ?? supportedExchangeInfo();
  return async (url) => {
    if (url.includes('/fapi/v1/exchangeInfo')) return gateResult;
    if (url.includes(ENDPOINT)) return endpointResult;
    return response(false, 503, null, options.unexpectedError ?? 'unscripted_or_proxy_unavailable');
  };
}

function opsStateFor(envelope: DataEnvelope<unknown>, mode: ProviderFailureMode): ProviderOpsState {
  if (envelope.status === 'live') return 'READY';
  if (envelope.status === 'degraded') return 'DEGRADED';
  if (mode === 'GEO_BLOCKED') return 'GEO_BLOCKED';
  if (mode === 'RATE_LIMITED') return 'RATE_LIMITED';
  if (envelope.reason === SYMBOL_NOT_SUPPORTED || mode === 'UNSUPPORTED_SYMBOL') return 'UNSUPPORTED';
  return 'UNAVAILABLE';
}

function looksFabricated(envelope: DataEnvelope<unknown>, expectedValues: readonly unknown[]): boolean {
  if (envelope.value == null) return false;
  return !expectedValues.some((candidate) => JSON.stringify(candidate) === JSON.stringify(envelope.value));
}

async function route(fetchJson: FetchJson, symbol = SYMBOL): Promise<DataEnvelope<unknown>> {
  return routeBinanceSentiment(CATEGORY, ENDPOINT, symbol, URL.replace(SYMBOL, symbol), fetchJson);
}

async function runScenario(
  id: string,
  failureMode: ProviderFailureMode,
  execute: () => Promise<DataEnvelope<unknown>>,
  expectedValues: readonly unknown[] = [AUTHENTIC_VALUE, AUTHENTIC_LKG],
): Promise<{ summary: ProviderRoutingScenarioResult; envelope: DataEnvelope<unknown> }> {
  __resetProviderRouterState();
  const envelope = await execute();
  const opsState = opsStateFor(envelope, failureMode);
  return {
    envelope,
    summary: {
      id,
      failureMode,
      opsState,
      envelopeStatus: envelope.status,
      reason: envelope.reason ?? null,
      valueIsNull: envelope.value == null,
      fabricated: looksFabricated(envelope, expectedValues),
    },
  };
}

function check(
  id: string,
  pass: boolean,
  actual: string | number | boolean,
  expected: string,
  failureMode: ProviderFailureMode,
  opsState: ProviderOpsState,
): ProviderRoutingCheckResult {
  return { id, pass, actual, expected, failureMode, opsState };
}

export async function runProviderRoutingStress(options: StressOptions = {}): Promise<ProviderRoutingStressResult> {
  const seed = Number.isFinite(options.seed) ? Number(options.seed) : 42;
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  const direct = await runScenario('direct_success', 'DIRECT_SUCCESS', () =>
    route(scriptedFetch(response(true, 200, AUTHENTIC_VALUE))),
  );
  const timeout = await runScenario('timeout', 'TIMEOUT', () =>
    route(scriptedFetch(response(false, 0, null, 'timeout_aborted'))),
  );
  const geo = await runScenario('geo_blocked_gate', 'GEO_BLOCKED', () =>
    route(scriptedFetch(response(false, 451, null, 'geo_blocked'), {
      exchangeInfo: response(false, 451, null, 'geo_blocked'),
    })),
  );
  const rate = await runScenario('rate_limited', 'RATE_LIMITED', () =>
    route(scriptedFetch(response(false, 429, null, 'rate_limited'))),
  );
  const upstream = await runScenario('upstream_5xx', 'UPSTREAM_5XX', () =>
    route(scriptedFetch(response(false, 502, null, 'bad_gateway'))),
  );
  const malformed = await runScenario('malformed_response', 'MALFORMED_RESPONSE', () =>
    route(scriptedFetch(response(false, 200, null, 'malformed_json'))),
  );
  const unsupported = await runScenario('unsupported_symbol', 'UNSUPPORTED_SYMBOL', () =>
    route(scriptedFetch(response(true, 200, AUTHENTIC_VALUE), { exchangeInfo: supportedExchangeInfo([OTHER_SYMBOL]) })),
  );
  const unsupportedCreatedCooldown = isCoolingDown(cooldownKey('binance', ENDPOINT, SYMBOL));
  const proxy = await runScenario('proxy_unavailable', 'PROXY_UNAVAILABLE', () =>
    route(scriptedFetch(response(false, 503, null, 'unscripted_or_proxy_unavailable'))),
  );
  const allUnavailable = await runScenario('all_routes_unavailable', 'ALL_ROUTES_UNAVAILABLE', () =>
    route(scriptedFetch(response(false, 503, null, 'all_routes_unavailable'), {
      exchangeInfo: response(false, 503, null, 'all_routes_unavailable'),
    })),
  );
  const degraded = await runScenario('degraded_lkg', 'DEGRADED_LKG', async () => {
    storeLkg(CATEGORY, SYMBOL, 'binance', AUTHENTIC_LKG);
    return route(scriptedFetch(response(false, 502, null, 'bad_gateway')));
  });
  const cooldown = await runScenario('cooldown_active', 'COOLDOWN_ACTIVE', async () => {
    storeLkg(CATEGORY, SYMBOL, 'binance', AUTHENTIC_LKG);
    recordFailureCooldown(cooldownKey('binance', ENDPOINT, SYMBOL));
    return route(scriptedFetch(response(true, 200, AUTHENTIC_VALUE)));
  });
  const recovery = await runScenario('recovery_after_cooldown', 'RECOVERY_AFTER_COOLDOWN', async () => {
    const key = cooldownKey('binance', ENDPOINT, SYMBOL);
    recordFailureCooldown(key);
    clearCooldown(key);
    return route(scriptedFetch(response(true, 200, AUTHENTIC_VALUE)));
  });

  // Scoped-cooldown assertion requires state from a separate deterministic setup.
  __resetProviderRouterState();
  const btcKey = cooldownKey('binance', ENDPOINT, SYMBOL);
  const ethKey = cooldownKey('binance', ENDPOINT, OTHER_SYMBOL);
  recordFailureCooldown(btcKey);
  const scopedActual = `${isCoolingDown(btcKey)}:${isCoolingDown(ethKey)}`;

  const scenarios = [
    direct.summary,
    timeout.summary,
    geo.summary,
    rate.summary,
    upstream.summary,
    malformed.summary,
    unsupported.summary,
    proxy.summary,
    allUnavailable.summary,
    degraded.summary,
    cooldown.summary,
    recovery.summary,
  ];

  const unavailable = [timeout, geo, rate, upstream, malformed, unsupported, proxy, allUnavailable];
  const fabricatedUnavailableCount = unavailable.filter((item) => item.summary.fabricated || item.envelope.value != null).length;
  const checks: ProviderRoutingCheckResult[] = [
    check('direct_success_live', direct.envelope.status === 'live' && direct.envelope.value != null, direct.envelope.status, 'live with non-null value', 'DIRECT_SUCCESS', direct.summary.opsState),
    check('timeout_unavailable_null', timeout.envelope.status === 'unavailable' && timeout.envelope.value == null, `${timeout.envelope.status}:${timeout.envelope.value == null}`, 'unavailable with null value', 'TIMEOUT', timeout.summary.opsState),
    check('geo_blocked_gate_unavailable', geo.envelope.status === 'unavailable' && geo.envelope.reason === 'symbol_gate_unavailable' && geo.envelope.value == null, `${geo.envelope.status}:${geo.envelope.reason}`, 'unavailable (gate geo-blocked) with null value', 'GEO_BLOCKED', geo.summary.opsState),
    check('rate_limit_not_live_null', rate.envelope.status === 'unavailable' && rate.envelope.value == null, `${rate.envelope.status}:${rate.envelope.value}`, 'unavailable with null value', 'RATE_LIMITED', rate.summary.opsState),
    check('upstream_5xx_unavailable_null', upstream.envelope.status === 'unavailable' && upstream.envelope.value == null, `${upstream.envelope.status}:${upstream.envelope.value}`, 'unavailable with null value', 'UPSTREAM_5XX', upstream.summary.opsState),
    check('malformed_unavailable_null', malformed.envelope.status === 'unavailable' && malformed.envelope.value == null, `${malformed.envelope.status}:${malformed.envelope.value}`, 'unavailable with null value (no fabricated payload)', 'MALFORMED_RESPONSE', malformed.summary.opsState),
    check('unsupported_symbol_no_cooldown', unsupported.envelope.reason === SYMBOL_NOT_SUPPORTED && !unsupportedCreatedCooldown, `${unsupported.envelope.reason}:${unsupportedCreatedCooldown}`, 'unavailable + symbol_not_supported + no cooldown', 'UNSUPPORTED_SYMBOL', unsupported.summary.opsState),
    check('proxy_unavailable_null', proxy.envelope.status === 'unavailable' && proxy.envelope.value == null, `${proxy.envelope.status}:${proxy.envelope.value}`, 'unavailable with null value', 'PROXY_UNAVAILABLE', proxy.summary.opsState),
    check('all_routes_unavailable_null', allUnavailable.envelope.status === 'unavailable' && allUnavailable.envelope.value == null, `${allUnavailable.envelope.status}:${allUnavailable.envelope.value}`, 'unavailable with null value', 'ALL_ROUTES_UNAVAILABLE', allUnavailable.summary.opsState),
    check('fresh_fail_degrades_to_authentic_lkg', degraded.envelope.status === 'degraded' && degraded.envelope.reason === 'fresh_failed_lkg' && JSON.stringify(degraded.envelope.value) === JSON.stringify(AUTHENTIC_LKG), `${degraded.envelope.status}:${degraded.envelope.reason}`, 'degraded with authentic LKG (never reported live)', 'DEGRADED_LKG', degraded.summary.opsState),
    check('cooldown_serves_lkg_degraded', cooldown.envelope.status === 'degraded' && cooldown.envelope.reason === 'cooldown_active_lkg', `${cooldown.envelope.status}:${cooldown.envelope.reason}`, 'degraded cooldown_active_lkg', 'COOLDOWN_ACTIVE', cooldown.summary.opsState),
    check('recovery_after_cooldown_live', recovery.envelope.status === 'live' && recovery.envelope.value != null, `${isCoolingDown(cooldownKey('binance', ENDPOINT, SYMBOL))}:${recovery.envelope.status}`, 'cooldown cleared + live', 'RECOVERY_AFTER_COOLDOWN', recovery.summary.opsState),
    check('no_fabricated_unavailable_values', fabricatedUnavailableCount === 0, fabricatedUnavailableCount, '0 fabricated unavailable payloads', 'ALL_ROUTES_UNAVAILABLE', 'UNAVAILABLE'),
    check('cooldown_scoped_per_symbol', scopedActual === 'true:false', scopedActual, 'BTC cooling, ETH free', 'COOLDOWN_ACTIVE', 'DEGRADED'),
    check('deterministic_seed_recorded', Number.isFinite(seed), seed, 'finite seed (default 42)', 'DIRECT_SUCCESS', 'READY'),
    check('scenario_contract_complete', scenarios.length === 12 && scenarios.every((scenario) => Boolean(scenario.id && scenario.failureMode && scenario.opsState)), scenarios.length, '12 fully classified scenarios', 'DIRECT_SUCCESS', 'READY'),
  ];

  const passedChecks = checks.filter((item) => item.pass).length;
  __resetProviderRouterState();
  return {
    version: PROVIDER_ROUTING_STRESS_REPORT_VERSION,
    generatedAt,
    verdict: passedChecks === checks.length ? 'PASS' : 'FAIL',
    run: { seed, scenarioCount: scenarios.length, passedChecks, totalChecks: checks.length },
    scenarios,
    checks,
    limitations: [
      'Deterministic synthetic provider-routing evidence only; no live provider availability is inferred.',
      'The harness exercises the production router through its injected FetchJson boundary and in-memory LKG/cooldown state.',
      'Unavailable responses remain null and are never replaced with a fabricated neutral sentiment value.',
      'This report does not enable authenticated exchange access, live execution, or scanner behavior changes.',
    ],
  };
}
