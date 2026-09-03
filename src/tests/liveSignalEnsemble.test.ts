import { describe, expect, it } from 'vitest';
import { evaluateLiveSignalEnsemble } from '../services/liveSignalEnsemble';

const t0 = 1_700_000_000_000;
const candles = Array.from({ length: 60 }, (_, i) => {
  const base = 80_000 + i * 220;
  return { timestamp: t0 + i * 3_600_000, open: base, high: base + 180, low: base - 120, close: base + 150, volume: 1_200 + i * 15 };
});

function advanced(reasonCode = 'GATE_QSTRUCT_FAILED', status: 'ACCEPTED' | 'REJECTED' = 'REJECTED') {
  return {
    status,
    direction: status === 'ACCEPTED' ? 'LONG' as const : 'LONG' as const,
    reasonCode: reasonCode as any,
    reasonText: reasonCode,
    confidence: status === 'ACCEPTED' ? 0.82 : 0.55,
    rawScore: 0.6,
    smcAvailability: 'AVAILABLE' as const,
    engineVersion: 'fixture',
    qStructDirectional: reasonCode === 'GATE_QSTRUCT_FAILED' ? -0.1 : 0.6,
    gatesSnapshot: { smoothedObi: 0.05 } as any,
  };
}

describe('liveSignalEnsemble', () => {
  it('does not double-count correlated candle models as independent rescue support', () => {
    const result = evaluateLiveSignalEnsemble({ direction: 'LONG', candles1h: candles, candles15m: candles, advanced: advanced() as any });
    expect(result.regime.regime).toBe('TREND_UP');
    expect(result.effectiveIndependentSupport).toBeLessThanOrEqual(1);
    expect(result.rescuedAdvancedGate).toBe(false);
    expect(result.status).toBe('REJECTED');
    expect(result.reasonCode).toBe('ENSEMBLE_CONFLICT');
  });

  it('cannot override a microstructure/liquidity hard rejection', () => {
    const result = evaluateLiveSignalEnsemble({ direction: 'LONG', candles1h: candles, candles15m: candles, advanced: advanced('LOW_LIQUIDITY_QUALITY') as any });
    expect(result.status).toBe('REJECTED');
    expect(result.reasonCode).toBe('ADVANCED_HARD_REJECT');
    expect(result.hardRejectReason).toBe('LOW_LIQUIDITY_QUALITY');
  });

  it('keeps score as evidence strength rather than claiming it is a probability', () => {
    const result = evaluateLiveSignalEnsemble({ direction: 'LONG', candles1h: candles, candles15m: candles, advanced: advanced('ACCEPTED_BEST_CANDIDATE', 'ACCEPTED') as any });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
