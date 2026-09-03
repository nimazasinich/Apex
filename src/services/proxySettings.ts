import type { IntegrationHealthEntry, IntegrationHealthState } from './integrationHealthHistory';
import type { ProxyConfig } from './proxyConfig';
import { apiMutate } from './apiMutate';
import { fetchJsonWithTimeout } from './apiQuery';

export interface ProxyRouteHealth {
  address: string;
  transport: 'socks5' | 'http';
  healthy: boolean;
  failureCount: number;
  cooldownUntil: number;
  lastUsed: number | null;
}

export interface ProxyPoolHealth {
  mode: string;
  poolSize: number;
  healthy: number;
  maxConcurrency: number;
  smartDns: 'off' | 'auto' | 'always';
  smartProxyDiscovery: boolean;
  discoveryRoutes: number;
  configurationError: string | null;
  routes: ProxyRouteHealth[];
}

export interface ProxySettingsStatus {
  proxy: ProxyConfig;
  proxyHealth: ProxyPoolHealth;
  proxyProbeHistory: IntegrationHealthEntry[];
}

export interface ProxyProviderProbeResult {
  provider: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  route: 'direct' | 'proxy' | 'none';
  routeLabel: string;
  error: string | null;
}

export interface ProxyTestResult {
  ok: boolean;
  state: IntegrationHealthState;
  checkedAt: number;
  config?: ProxyConfig;
  results: ProxyProviderProbeResult[];
  history: IntegrationHealthEntry[];
  error?: string;
}

export async function fetchProxySettingsStatus(): Promise<ProxySettingsStatus> {
  const data = await fetchJsonWithTimeout<any>('/api/supplemental/config/status', { timeoutMs: 10_000 });
  if (!data?.proxy || !data?.proxyHealth) throw new Error('Proxy status unavailable.');
  return {
    proxy: data.proxy,
    proxyHealth: { ...data.proxyHealth, routes: Array.isArray(data.proxyHealth.routes) ? data.proxyHealth.routes : [] },
    proxyProbeHistory: Array.isArray(data.proxyProbeHistory) ? data.proxyProbeHistory : [],
  };
}

export async function saveProxySettings(proxy: ProxyConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await apiMutate('/api/supplemental/config', { body: JSON.stringify({ proxy }) });
    const result = await response.json().catch(() => ({}));
    return response.ok && result.ok ? { ok: true } : { ok: false, error: result.error || `http_${response.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'proxy_save_failed' };
  }
}

export async function testProxySettings(proxy: ProxyConfig): Promise<ProxyTestResult> {
  try {
    const response = await apiMutate('/api/supplemental/proxy/test', {
      body: JSON.stringify({ proxy }),
      signal: AbortSignal.timeout(45_000),
    });
    const result = await response.json().catch(() => ({}));
    return {
      ok: Boolean(result.ok),
      state: result.state || (response.ok ? 'DISCONNECTED' : 'MISCONFIGURED'),
      checkedAt: Number(result.checkedAt) || Date.now(),
      config: result.config,
      results: Array.isArray(result.results) ? result.results : [],
      history: Array.isArray(result.history) ? result.history : [],
      error: result.error,
    };
  } catch (error) {
    return {
      ok: false,
      state: 'DISCONNECTED',
      checkedAt: Date.now(),
      results: [],
      history: [],
      error: error instanceof Error ? error.message : 'proxy_probe_failed',
    };
  }
}
