import { describe, it, expect } from 'vitest';
import { markDeltaFor } from '../src/components/TrackingObservatoryPanel';

describe('markDeltaFor', () => {
  it('reports the raw price move, signed against entry', () => {
    expect(markDeltaFor(100, 101, 'SHORT').label).toBe('+1.00%');
    expect(markDeltaFor(100, 99, 'LONG').label).toBe('-1.00%');
  });

  it('treats a falling mark as favourable for a short and adverse for a long', () => {
    expect(markDeltaFor(100, 99, 'SHORT').tone).toBe('favor');
    expect(markDeltaFor(100, 99, 'LONG').tone).toBe('against');
  });

  it('treats a rising mark as adverse for a short and favourable for a long', () => {
    expect(markDeltaFor(100, 101, 'SHORT').tone).toBe('against');
    expect(markDeltaFor(100, 101, 'LONG').tone).toBe('favor');
  });

  it('stays flat when the mark has not meaningfully moved', () => {
    expect(markDeltaFor(100, 100, 'SHORT')).toEqual({ label: '0.00%', tone: 'flat' });
  });

  it('renders a dash instead of a fake zero when a leg is missing', () => {
    expect(markDeltaFor(0, 100, 'SHORT')).toEqual({ label: '—', tone: 'flat' });
    expect(markDeltaFor(100, Number.NaN, 'LONG')).toEqual({ label: '—', tone: 'flat' });
  });
});
