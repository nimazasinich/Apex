import { describe, expect, it } from 'vitest';
import { buildProductionReadiness } from '../services/productionReadiness';
import type { LiquidityHunterOperationsSnapshot } from '../services/liquidityHunter/foundationRuntime';

const lh = (status: LiquidityHunterOperationsSnapshot['status'] = 'DISABLED'): LiquidityHunterOperationsSnapshot => ({
  status,
  shadowOnly: true,
  executionDependency: false,
  autonomousLiveExecutionEnabled: false,
  flags: {} as any,
  edgeCatalog: { total: 0 } as any,
  realtime: {} as any,
  thresholdGovernance: {} as any,
  policy: {
    version: 'test',
    automaticPromotionEnabled: false,
    majorityVoteAllowed: false,
    layer4MayRescueDeterministicFailure: false,
  },
  reasons: status === 'DEGRADED' ? ['test_degraded'] : [],
});

const supplemental = {
  configuredProviders: 0,
  configuredHealthyProviders: 0,
  configuredUnhealthyProviders: 0,
  unconfiguredProviders: 3,
  rateLimitedProviders: [],
  unhealthyProviders: [],
};

describe('production readiness dependency truth', () => {
  it('keeps HTTP readiness separate from unverified market-data readiness', () => {
    const snapshot = buildProductionReadiness({
      now: 10_000,
      acceptingRequests: true,
      providerProbe: null,
      exchange: { activeSessions: 0, executionArmedSessions: 0, newestVerifiedAt: null, newestVerifiedAgeMs: null },
      persistence: { decisionMemoryAvailable: true, adaptiveGovernanceAvailable: true },
      liquidityHunter: lh(),
      supplementalSummary: supplemental,
    });
    expect(snapshot.dependencies.httpServer.state).toBe('READY');
    expect(snapshot.dependencies.primaryMarketData.state).toBe('NOT_VERIFIED');
    expect(snapshot.state).toBe('DEGRADED');
    expect(snapshot.dependencies.executionConnectivity.required).toBe(false);
    expect(snapshot.dependencies.liquidityHunter.state).toBe('DISABLED');
  });

  it('reports ready only when required dependency criteria are actually verified', () => {
    const snapshot = buildProductionReadiness({
      now: 10_000,
      acceptingRequests: true,
      providerProbe: { checkedAt: 9_500, kucoin: 'READY', binance: 'READY' },
      exchange: { activeSessions: 1, executionArmedSessions: 0, newestVerifiedAt: 9_000, newestVerifiedAgeMs: 1_000 },
      persistence: { decisionMemoryAvailable: true, adaptiveGovernanceAvailable: true },
      liquidityHunter: lh('CORE_READY'),
      supplementalSummary: { ...supplemental, configuredProviders: 1, configuredHealthyProviders: 1, unconfiguredProviders: 2 },
    });
    expect(snapshot.state).toBe('READY');
    expect(snapshot.dependencies.primaryMarketData.state).toBe('READY');
    expect(snapshot.dependencies.accountFreshness.state).toBe('READY');
  });

  it('fails required persistence closed without making optional provider state fatal', () => {
    const snapshot = buildProductionReadiness({
      now: 10_000,
      acceptingRequests: true,
      providerProbe: { checkedAt: 9_500, kucoin: 'READY', binance: 'DEGRADED' },
      exchange: { activeSessions: 0, executionArmedSessions: 0, newestVerifiedAt: null, newestVerifiedAgeMs: null },
      persistence: { decisionMemoryAvailable: false, adaptiveGovernanceAvailable: true },
      liquidityHunter: lh('DEGRADED'),
      supplementalSummary: { ...supplemental, configuredProviders: 1, configuredHealthyProviders: 0, configuredUnhealthyProviders: 1 },
    });
    expect(snapshot.state).toBe('NOT_READY');
    expect(snapshot.dependencies.persistence.reason).toContain('decision_memory_unavailable');
    expect(snapshot.dependencies.supplementalProviders.required).toBe(false);
  });

  it('fails persistence readiness when the mirror exists but its last durable write failed', () => {
    const snapshot = buildProductionReadiness({
      now: 10_000,
      acceptingRequests: true,
      providerProbe: { checkedAt: 9_500, kucoin: 'READY', binance: 'READY' },
      exchange: { activeSessions: 0, executionArmedSessions: 0, newestVerifiedAt: null, newestVerifiedAgeMs: null },
      persistence: { decisionMemoryAvailable: true, decisionMemoryWritable: false, adaptiveGovernanceAvailable: true },
      liquidityHunter: lh(),
      supplementalSummary: supplemental,
    });
    expect(snapshot.state).toBe('NOT_READY');
    expect(snapshot.dependencies.persistence.reason).toBe('decision_memory_not_writable');
  });
});
