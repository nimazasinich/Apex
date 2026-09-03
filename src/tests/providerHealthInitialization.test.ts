import { describe, expect, it } from 'vitest';
import { ProviderHealthTracker } from '../services/providerHealth';
import { classifyProviderHealthReason } from '../services/operationsStatus';

describe('provider health initialization', () => {
  it('starts never-probed providers fail-closed instead of optimistic healthy', () => {
    const tracker = new ProviderHealthTracker();
    const row = tracker.getHealth('HuggingFace');
    expect(row).toBeDefined();
    expect(row?.isHealthy).toBe(false);
    expect(row?.lastSuccessTime).toBeUndefined();
    expect(row?.reasonCode).toBe('NEVER_PROBED');
  });

  it('becomes healthy only after an actual successful probe', () => {
    const tracker = new ProviderHealthTracker();
    tracker.markConfigured('HuggingFace');
    const before = tracker.getHealth('HuggingFace')!;
    expect(classifyProviderHealthReason(before)).toBe('NEVER_PROBED');
    tracker.recordSuccess('HuggingFace');
    const after = tracker.getHealth('HuggingFace')!;
    expect(after.isHealthy).toBe(true);
    expect(after.lastSuccessTime).toBeTypeOf('number');
    expect(classifyProviderHealthReason(after)).toBe('HEALTHY');
  });
});
