import { describe, expect, it } from 'vitest';
import { reviewOrderActionLabel, submitOrderActionLabel } from '../components/trading/orderActionLabels';

describe('order action labels', () => {
  it('includes side and environment before review', () => {
    expect(reviewOrderActionLabel('buy', 'demo')).toBe('Review BUY demo order');
    expect(reviewOrderActionLabel('sell', 'live')).toBe('Review SELL live order');
  });

  it('includes side and environment on final submission', () => {
    expect(submitOrderActionLabel('buy', 'demo')).toBe('Execute demo BUY order');
    expect(submitOrderActionLabel('sell', 'live')).toBe('Submit live SELL order');
  });
});
