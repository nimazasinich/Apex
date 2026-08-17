import { describe, expect, it } from 'vitest';
import {
  buildOperationsStatus,
  classifyProviderHealthReason,
  normalizeProviderRow,
} from '../services/operationsStatus';
import type { ProviderHealth } from '../services/providers/supplementalTypes';

const provider = (overrides: Partial<ProviderHealth> = {}): ProviderHealth => ({
  name: 'Example',
  category: 'market',
  isConfigured: true,
  isHealthy: false,
  lastCheckTime: 1,
  failureCount: 1,
  ...overrides,
});

describe('operations provider reason-code hardening', () => {
  it('distinguishes configuration, disablement, rate limit, network, schema, stale and circuit states', () => {
    const now = 10_000;
    expect(classifyProviderHealthReason(provider({ isConfigured: false }), now)).toBe('NOT_CONFIGURED');
    expect(classifyProviderHealthReason(provider({ isEnabled: false }), now)).toBe('DISABLED');
    expect(classifyProviderHealthReason(provider({ rateLimitedUntil: now + 1_000 }), now)).toBe('RATE_LIMITED');
    expect(classifyProviderHealthReason(provider({ reason: 'request timed out: ECONNRESET' }), now)).toBe('DNS_NETWORK_UNAVAILABLE');
    expect(classifyProviderHealthReason(provider({ reason: 'schema invalid_payload' }), now)).toBe('SCHEMA_INVALID');
    expect(classifyProviderHealthReason(provider({ reason: 'freshness stale' }), now)).toBe('STALE');
    expect(classifyProviderHealthReason(provider({ reason: 'circuit breaker open' }), now)).toBe('CIRCUIT_OPEN');
    expect(classifyProviderHealthReason(provider({ reason: 'HTTP status 403 rejected' }), now)).toBe('HTTP_REJECTED');
    expect(classifyProviderHealthReason(provider({ isHealthy: true, failureCount: 0, reason: undefined }), now)).toBe('HEALTHY');
  });

  it('exposes the machine-readable reason code without changing secret-safe diagnostics', () => {
    const row = normalizeProviderRow(provider({ reason: 'schema_invalid_response' }), 10_000);
    expect(row.status).toBe('UNHEALTHY');
    expect(row.reasonCode).toBe('SCHEMA_INVALID');
    expect(row.reason).toBe('schema_invalid_response');
  });
});

describe('durable adaptive governance operations status', () => {
  it('reports durable revision/proposal counts instead of session-local audit state', () => {
    const status = buildOperationsStatus({
      providerHealth: [],
      decisionMemoryMirrorEnabled: false,
      decisionMemoryStats: null,
      mlShadowDir: '/missing/ml',
      adaptiveStressDir: '/missing/adaptive',
      providerRoutingDir: '/missing/provider',
      loadMatrix100Dir: '/missing/load100',
      loadMatrixFastDir: '/missing/loadfast',
      readFile: () => null,
      fileExists: () => false,
      adaptiveThresholdGovernance: {
        activeRevision: 4,
        revisionCount: 4,
        proposalCount: 7,
        pendingProposalCount: 2,
      },
    });

    expect(status.adaptiveThresholdAudit).toMatchObject({
      status: 'AUDITED',
      source: 'SERVER_DURABLE',
      activeRevision: 4,
      revisionCount: 4,
      proposalCount: 7,
      pendingProposalCount: 2,
      reason: null,
    });
  });
});
