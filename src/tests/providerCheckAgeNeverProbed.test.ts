import { describe, expect, it } from 'vitest';
import { formatCheckAge, providerCheckAgeMs } from '../components/overview/overviewModel';
import type { OperationsProviderRow } from '../services/operationsStatus';

const row = (overrides: Partial<OperationsProviderRow> = {}): OperationsProviderRow => ({
  name: 'Example',
  category: 'market',
  status: 'UNHEALTHY',
  isConfigured: true,
  isHealthy: false,
  failureCount: 0,
  lastCheckTime: null,
  lastSuccessTime: null,
  rateLimitedUntil: null,
  reason: 'never_probed',
  reasonCode: 'NEVER_PROBED',
  ...overrides,
});

describe('provider check-age never-probed sentinel', () => {
  it('treats lastCheckTime=0 (the never-probed sentinel) the same as null instead of a huge age', () => {
    expect(providerCheckAgeMs(row({ lastCheckTime: 0 }))).toBeNull();
    expect(providerCheckAgeMs(row({ lastCheckTime: null }))).toBeNull();
    expect(providerCheckAgeMs(row({ lastCheckTime: -1 }))).toBeNull();
    expect(providerCheckAgeMs(row({ lastCheckTime: Number.NaN }))).toBeNull();
  });

  it('formats the never-probed sentinel as "—", never as a multi-decade age', () => {
    const age = providerCheckAgeMs(row({ lastCheckTime: 0 }));
    const label = formatCheckAge(age);
    expect(label).toBe('—');
    expect(label).not.toMatch(/\d+d/);
  });

  it('still computes a real age for an actual past check time', () => {
    const now = Date.now();
    const age = providerCheckAgeMs(row({ lastCheckTime: now - 5000 }), now);
    expect(age).toBe(5000);
    expect(formatCheckAge(age)).toBe('5s');
  });
});
