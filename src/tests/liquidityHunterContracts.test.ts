import { describe, expect, it } from 'vitest';
import { validateEvidenceValue } from '../contracts/realtime/evidenceValue';
import { validateMarketEvent } from '../contracts/realtime/marketEvent';
import { getEdgeCatalog } from '../services/liquidityHunter/edgeCatalog';
import { readLiquidityHunterFeatureFlags } from '../services/liquidityHunter/featureFlags';
import { LIQUIDITY_HUNTER_FOUNDATION_FUSION_POLICY } from '../services/liquidityHunter/fusionPolicy';

const event = {
  eventId: 'binance:trade:1',
  type: 'TRADE' as const,
  source: 'binance-usdm',
  symbol: 'BTC-USDT',
  exchangeTimestamp: 1_000,
  receivedAt: 1_001,
  sequence: 1,
  schemaVersion: 1,
  payload: { price: 100, size: 2 },
};

describe('liquidity hunter foundation contracts', () => {
  it('defaults every capability off while enforcing shadow-only safety', () => {
    const flags = readLiquidityHunterFeatureFlags({});
    expect(flags.liquidityHunterEnabled).toBe(false);
    expect(flags.realtimeEventRecordingEnabled).toBe(false);
    expect(flags.testnetCanaryEnabled).toBe(false);
    expect(flags.shadowOnly).toBe(true);
    expect(flags.autonomousLiveExecutionEnabled).toBe(false);
  });

  it('rejects an attempt to disable shadow-only in the core release', () => {
    expect(() => readLiquidityHunterFeatureFlags({ APEX_LIQUIDITY_HUNTER_SHADOW_ONLY: 'false' }))
      .toThrow('liquidity_hunter_shadow_only_cannot_be_disabled_in_core_release');
  });

  it('registers ten evidence-only edges with explicit dependencies and TTLs', () => {
    const catalog = getEdgeCatalog();
    expect(catalog).toHaveLength(10);
    expect(new Set(catalog.map((edge) => edge.edgeId)).size).toBe(10);
    expect(catalog.every((edge) => edge.evidenceOnly && edge.dependencies.length > 0 && edge.ttlMs > 0)).toBe(true);
  });

  it('rejects non-finite event payloads', () => {
    expect(validateMarketEvent({ ...event, payload: { price: Number.NaN } }).reasons)
      .toContain('non_finite_payload');
  });

  it('requires unavailable evidence qualities to carry null values', () => {
    const result = validateEvidenceValue({
      value: 0,
      observedAt: 1,
      receivedAt: 1,
      expiresAt: 2,
      source: 'test',
      sourceVersion: 'v1',
      quality: 'MISSING',
      reasons: ['missing'],
    });
    expect(result.reasons).toContain('unavailable_quality_requires_null');
  });

  it('keeps fusion shadow-only and manually governed', () => {
    expect(LIQUIDITY_HUNTER_FOUNDATION_FUSION_POLICY.authoritative).toBe(false);
    expect(LIQUIDITY_HUNTER_FOUNDATION_FUSION_POLICY.automaticPromotionEnabled).toBe(false);
    expect(LIQUIDITY_HUNTER_FOUNDATION_FUSION_POLICY.majorityVoteAllowed).toBe(false);
    expect(LIQUIDITY_HUNTER_FOUNDATION_FUSION_POLICY.layer4MayRescueDeterministicFailure).toBe(false);
  });
});
