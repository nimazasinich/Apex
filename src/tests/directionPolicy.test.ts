import { describe, expect, it } from 'vitest';
import { allowedDirectionsForBias } from '../pages/strategies/directionPolicy';

describe('strategy direction policy', () => {
  it('restricts LONG_ONLY strategies', () => expect(allowedDirectionsForBias('LONG_ONLY')).toEqual(['LONG']));
  it('restricts SHORT_ONLY strategies', () => expect(allowedDirectionsForBias('SHORT_ONLY')).toEqual(['SHORT']));
  it('allows both directions for BOTH or missing bias', () => {
    expect(allowedDirectionsForBias('BOTH')).toEqual(['LONG', 'SHORT']);
    expect(allowedDirectionsForBias(undefined)).toEqual(['LONG', 'SHORT']);
  });
});
