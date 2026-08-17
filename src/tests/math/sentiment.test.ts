import { describe, expect, it } from 'vitest';
import { calculateSentimentComposite, getSentimentZone } from '../../lib/sentiment';

describe('Market Sentiment Composite (REQ-012, 030, 031)', () => {
  it('assigns correct sentiment zone for score ranges (REQ-012)', () => {
    expect(getSentimentZone(15)).toBe('Extreme Fear');
    expect(getSentimentZone(35)).toBe('Fear');
    expect(getSentimentZone(50)).toBe('Neutral');
    expect(getSentimentZone(75)).toBe('Greed');
    expect(getSentimentZone(90)).toBe('Extreme Greed');
  });

  it('computes composite score from live inputs without zeroing (REQ-030)', () => {
    const result = calculateSentimentComposite({
      fundingRateSkewPct: 0.01,
      fundingState: 'live',
      longShortRatio: 1.05,
      longShortState: 'live',
      headlineToneScore: 60,
      headlineState: 'live',
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.dataState).toBe('live');
    expect(result.inputs.length).toBe(3);
  });

  it('skips missing inputs from weighted blend rather than zeroing (REQ-031)', () => {
    const result = calculateSentimentComposite({
      fundingRateSkewPct: 0.015,
      fundingState: 'live',
      longShortRatio: undefined,
      longShortState: 'unavailable',
      headlineToneScore: undefined,
      headlineState: 'not_configured',
    });
    // With only funding live, composite score equals funding sub-score, NOT dragged to 0
    expect(result.dataState).toBe('degraded');
    expect(result.score).toBeGreaterThan(40);
  });

  it('returns unavailable dataState if no inputs are valid', () => {
    const result = calculateSentimentComposite({
      fundingState: 'unavailable',
      longShortState: 'unavailable',
      headlineState: 'not_configured',
    });
    expect(result.dataState).toBe('unavailable');
  });
});
