import type { LiquidityHunterOperationsSnapshot } from './liquidityHunter/foundationRuntime';
import type { OperationsProviderSummary } from './operationsStatus';

export type DependencyReadinessState =
  | 'READY'
  | 'DEGRADED'
  | 'NOT_READY'
  | 'NOT_CONFIGURED'
  | 'NOT_VERIFIED'
  | 'DISABLED';

export interface DependencyReadinessItem {
  state: DependencyReadinessState;
  required: boolean;
  reason: string | null;
  lastVerifiedAt: string | null;
}

export interface ProductionReadinessSnapshot {
  schemaVersion: 1;
  state: 'READY' | 'DEGRADED' | 'NOT_READY';
  generatedAt: string;
  dependencies: {
    httpServer: DependencyReadinessItem;
    primaryMarketData: DependencyReadinessItem;
    executionConnectivity: DependencyReadinessItem;
    accountFreshness: DependencyReadinessItem;
    persistence: DependencyReadinessItem;
    liquidityHunter: DependencyReadinessItem;
    supplementalProviders: DependencyReadinessItem;
  };
}

export interface ProductionReadinessInput {
  now?: number;
  acceptingRequests: boolean;
  providerProbe?: {
    checkedAt: number;
    kucoin: 'READY' | 'DEGRADED' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
    binance: 'READY' | 'DEGRADED' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
  } | null;
  maxProviderProbeAgeMs?: number;
  exchange: {
    activeSessions: number;
    executionArmedSessions: number;
    newestVerifiedAt: number | null;
    newestVerifiedAgeMs: number | null;
  };
  maxAccountAgeMs?: number;
  persistence: {
    decisionMemoryAvailable: boolean;
    adaptiveGovernanceAvailable: boolean;
  };
  liquidityHunter: LiquidityHunterOperationsSnapshot;
  supplementalSummary: OperationsProviderSummary;
}

const iso = (timestamp: number | null | undefined): string | null =>
  Number.isFinite(timestamp as number) ? new Date(Number(timestamp)).toISOString() : null;

export function buildProductionReadiness(input: ProductionReadinessInput): ProductionReadinessSnapshot {
  const now = input.now ?? Date.now();
  const providerAgeLimit = input.maxProviderProbeAgeMs ?? 60_000;
  const accountAgeLimit = input.maxAccountAgeMs ?? 60_000;

  const httpServer: DependencyReadinessItem = input.acceptingRequests
    ? { state: 'READY', required: true, reason: null, lastVerifiedAt: iso(now) }
    : { state: 'NOT_READY', required: true, reason: 'server_draining', lastVerifiedAt: iso(now) };

  let primaryMarketData: DependencyReadinessItem;
  if (!input.providerProbe) {
    primaryMarketData = { state: 'NOT_VERIFIED', required: true, reason: 'provider_health_probe_not_run', lastVerifiedAt: null };
  } else {
    const age = Math.max(0, now - input.providerProbe.checkedAt);
    if (age > providerAgeLimit) {
      primaryMarketData = { state: 'DEGRADED', required: true, reason: 'provider_health_probe_stale', lastVerifiedAt: iso(input.providerProbe.checkedAt) };
    } else if (input.providerProbe.kucoin === 'READY' || input.providerProbe.binance === 'READY') {
      const bothReady = input.providerProbe.kucoin === 'READY' && input.providerProbe.binance === 'READY';
      primaryMarketData = {
        state: bothReady ? 'READY' : 'DEGRADED',
        required: true,
        reason: bothReady ? null : 'only_one_primary_market_provider_ready',
        lastVerifiedAt: iso(input.providerProbe.checkedAt),
      };
    } else {
      primaryMarketData = { state: 'NOT_READY', required: true, reason: 'no_primary_market_provider_ready', lastVerifiedAt: iso(input.providerProbe.checkedAt) };
    }
  }

  const executionConnectivity: DependencyReadinessItem = input.exchange.activeSessions === 0
    ? { state: 'NOT_CONFIGURED', required: false, reason: 'no_live_exchange_session', lastVerifiedAt: null }
    : { state: 'READY', required: false, reason: null, lastVerifiedAt: iso(input.exchange.newestVerifiedAt) };

  let accountFreshness: DependencyReadinessItem;
  if (input.exchange.activeSessions === 0) {
    accountFreshness = { state: 'NOT_CONFIGURED', required: false, reason: 'no_live_exchange_session', lastVerifiedAt: null };
  } else if (input.exchange.newestVerifiedAgeMs === null || input.exchange.newestVerifiedAgeMs > accountAgeLimit) {
    accountFreshness = { state: 'DEGRADED', required: false, reason: 'account_verification_stale', lastVerifiedAt: iso(input.exchange.newestVerifiedAt) };
  } else {
    accountFreshness = { state: 'READY', required: false, reason: null, lastVerifiedAt: iso(input.exchange.newestVerifiedAt) };
  }

  const persistenceReady = input.persistence.decisionMemoryAvailable && input.persistence.adaptiveGovernanceAvailable;
  const persistence: DependencyReadinessItem = persistenceReady
    ? { state: 'READY', required: true, reason: null, lastVerifiedAt: iso(now) }
    : { state: 'NOT_READY', required: true, reason: [
        !input.persistence.decisionMemoryAvailable ? 'decision_memory_unavailable' : null,
        !input.persistence.adaptiveGovernanceAvailable ? 'adaptive_governance_unavailable' : null,
      ].filter(Boolean).join(';'), lastVerifiedAt: iso(now) };

  const liquidityHunter: DependencyReadinessItem = input.liquidityHunter.status === 'DISABLED'
    ? { state: 'DISABLED', required: false, reason: 'liquidity_hunter_disabled', lastVerifiedAt: iso(now) }
    : input.liquidityHunter.status === 'CORE_READY'
      ? { state: 'READY', required: false, reason: null, lastVerifiedAt: iso(now) }
      : { state: 'DEGRADED', required: false, reason: input.liquidityHunter.reasons.join(';') || 'liquidity_hunter_degraded', lastVerifiedAt: iso(now) };

  const configuredSupplemental = input.supplementalSummary.configuredProviders;
  const unhealthySupplemental = input.supplementalSummary.configuredUnhealthyProviders;
  const supplementalProviders: DependencyReadinessItem = configuredSupplemental === 0
    ? { state: 'NOT_CONFIGURED', required: false, reason: 'no_optional_supplemental_provider_configured', lastVerifiedAt: null }
    : unhealthySupplemental > 0
      ? { state: 'DEGRADED', required: false, reason: 'configured_supplemental_provider_unhealthy', lastVerifiedAt: iso(now) }
      : { state: 'READY', required: false, reason: null, lastVerifiedAt: iso(now) };

  const dependencies = {
    httpServer,
    primaryMarketData,
    executionConnectivity,
    accountFreshness,
    persistence,
    liquidityHunter,
    supplementalProviders,
  };
  const required = Object.values(dependencies).filter((item) => item.required);
  const state = required.some((item) => item.state === 'NOT_READY')
    ? 'NOT_READY'
    : required.some((item) => item.state !== 'READY')
      ? 'DEGRADED'
      : 'READY';

  return {
    schemaVersion: 1,
    state,
    generatedAt: new Date(now).toISOString(),
    dependencies,
  };
}
