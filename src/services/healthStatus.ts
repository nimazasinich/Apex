/* Copied from apex-trading-engine/src/services/healthStatus.ts */

export type HealthStatus = 'READY' | 'DEGRADED' | 'UNAVAILABLE' | 'NOT_CONFIGURED';

export interface HealthProbeResult {
  ok: boolean;
}

export interface SupplementalHealthSummary {
  configuredProviders: number;
  configuredHealthyProviders?: number;
  configuredUnhealthyProviders?: number;
}

export interface ProxyPoolHealth {
  poolSize: number;
  healthy: number;
}

export function deriveProbeStatus(results: readonly HealthProbeResult[]): HealthStatus {
  if (results.length === 0) return 'UNAVAILABLE';
  const passed = results.filter((result) => result.ok).length;
  if (passed === results.length) return 'READY';
  if (passed > 0) return 'DEGRADED';
  return 'UNAVAILABLE';
}

export function deriveSupplementalStatus(summary: SupplementalHealthSummary): HealthStatus {
  const configured = Math.max(0, summary.configuredProviders || 0);
  const healthy = Math.max(
    0,
    summary.configuredHealthyProviders ??
      Math.max(0, configured - (summary.configuredUnhealthyProviders || 0)),
  );

  if (configured === 0) return 'NOT_CONFIGURED';
  if (healthy >= configured) return 'READY';
  if (healthy > 0) return 'DEGRADED';
  return 'UNAVAILABLE';
}

export function deriveProxyPoolStatus(pool: ProxyPoolHealth): HealthStatus {
  const poolSize = Math.max(0, pool.poolSize || 0);
  const healthy = Math.max(0, pool.healthy || 0);
  if (healthy > 0) return 'READY';
  if (poolSize > 0) return 'DEGRADED';
  return 'NOT_CONFIGURED';
}
