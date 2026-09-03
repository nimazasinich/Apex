import { describe, expect, it } from 'vitest';
import { academyActionPlan, academyRecommendationDigest, academySystemicPatterns, buildAcademyIntelligence } from '../pages/academy/academyIntelligence';
import type { StrategyDefinition } from '../types';

function strategy(overrides: Partial<StrategyDefinition>): StrategyDefinition {
  return {
    strategyId: 'strategy-a',
    version: 1,
    name: 'Strategy A',
    status: 'active',
    categories: ['Momentum'],
    supportedIntervals: ['1h'],
    dataRequirements: [],
    ...overrides,
  } as StrategyDefinition;
}

describe('academyRecommendationDigest', () => {
  it('is empty when no strategy is supplied', () => {
    expect(academyRecommendationDigest([])).toEqual([]);
  });

  it('groups the same recommendation id across strategies and counts every occurrence', () => {
    const a = buildAcademyIntelligence(strategy({ strategyId: 'strat-a', name: 'Strat A' }));
    const b = buildAcademyIntelligence(strategy({ strategyId: 'strat-b', name: 'Strat B' }));
    // Neither strategy has a latestSnapshot bound, so both fire the same
    // real 'run-validation' recommendation rule.
    const digest = academyRecommendationDigest([a, b]);
    const runValidation = digest.find((entry) => entry.id === 'run-validation');
    expect(runValidation).toBeDefined();
    expect(runValidation?.count).toBe(2);
    expect(runValidation?.strategyIds.sort()).toEqual(['strat-a', 'strat-b']);
  });

  it('sorts by descending count and never invents a headline that no row produced', () => {
    const blocked = buildAcademyIntelligence(strategy({ strategyId: 'blocked-1', status: 'blocked' }));
    const noEvidenceA = buildAcademyIntelligence(strategy({ strategyId: 'no-ev-a' }));
    const noEvidenceB = buildAcademyIntelligence(strategy({ strategyId: 'no-ev-b' }));
    const digest = academyRecommendationDigest([blocked, noEvidenceA, noEvidenceB]);
    expect(digest[0].id).toBe('run-validation');
    expect(digest[0].count).toBe(2);
    const knownHeadlines = new Set([blocked, noEvidenceA, noEvidenceB].flatMap((row) => row.recommendations.map((rec) => rec.headline)));
    for (const entry of digest) {
      expect(knownHeadlines.has(entry.representativeHeadline)).toBe(true);
    }
  });

  it('assigns a fixed severity per rule id and a family breakdown that sums to count', () => {
    const blocked = buildAcademyIntelligence(strategy({ strategyId: 'blocked-1', status: 'blocked', categories: ['Momentum'] }));
    const noEvidenceA = buildAcademyIntelligence(strategy({ strategyId: 'no-ev-a', categories: ['Momentum'] }));
    const noEvidenceB = buildAcademyIntelligence(strategy({ strategyId: 'no-ev-b', categories: ['Funding'] }));
    const digest = academyRecommendationDigest([blocked, noEvidenceA, noEvidenceB]);

    const retire = digest.find((entry) => entry.id === 'retire');
    expect(retire?.severity).toBe('critical');

    const runValidation = digest.find((entry) => entry.id === 'run-validation');
    expect(runValidation?.severity).toBe('medium');
    expect(runValidation?.familyBreakdown.reduce((sum, entry) => sum + entry.count, 0)).toBe(runValidation?.count);
    expect(runValidation?.familyBreakdown).toEqual(
      expect.arrayContaining([
        { family: 'Momentum', count: 1 },
        { family: 'Funding', count: 1 },
      ]),
    );
  });

  it('keeps the original count-first sort order when severities differ', () => {
    // 'retire' is critical severity but fires for only one strategy here,
    // while 'run-validation' is medium severity but fires for two — count
    // must still win the sort, exactly as the original contract specified.
    const blocked = buildAcademyIntelligence(strategy({ strategyId: 'blocked-1', status: 'blocked' }));
    const noEvidenceA = buildAcademyIntelligence(strategy({ strategyId: 'no-ev-a' }));
    const noEvidenceB = buildAcademyIntelligence(strategy({ strategyId: 'no-ev-b' }));
    const digest = academyRecommendationDigest([blocked, noEvidenceA, noEvidenceB]);
    expect(digest[0].id).toBe('run-validation');
    expect(digest[0].severity).toBe('medium');
  });
});

describe('academySystemicPatterns', () => {
  it('is empty when no family has a majority affected', () => {
    const a = buildAcademyIntelligence(strategy({ strategyId: 'strat-a', categories: ['Momentum'] }));
    const b = buildAcademyIntelligence(strategy({ strategyId: 'strat-b', categories: ['Funding'] }));
    // One strategy per family: familySize 1 is excluded by the >=2 rule.
    expect(academySystemicPatterns([a, b])).toEqual([]);
  });

  it('flags a recommendation that fires for a majority of one family', () => {
    const a = buildAcademyIntelligence(strategy({ strategyId: 'mom-a', categories: ['Momentum'] }));
    const b = buildAcademyIntelligence(strategy({ strategyId: 'mom-b', categories: ['Momentum'] }));
    const c = buildAcademyIntelligence(strategy({ strategyId: 'mom-c', categories: ['Momentum'] }));
    // All three lack a snapshot, so all three fire 'run-validation':
    // 3 of 3 in the Momentum family clears the >half threshold.
    const patterns = academySystemicPatterns([a, b, c]);
    const runValidationPattern = patterns.find((pattern) => pattern.recommendationId === 'run-validation' && pattern.family === 'Momentum');
    expect(runValidationPattern).toBeDefined();
    expect(runValidationPattern?.affected).toBe(3);
    expect(runValidationPattern?.familySize).toBe(3);
  });
});

describe('academyActionPlan', () => {
  it('is empty when no strategy is supplied', () => {
    expect(academyActionPlan([])).toEqual([]);
  });

  it('never invents a recommendation and copies because verbatim', () => {
    const blocked = buildAcademyIntelligence(strategy({ strategyId: 'blocked-1', status: 'blocked' }));
    const noEvidence = buildAcademyIntelligence(strategy({ strategyId: 'no-ev-a' }));
    const plan = academyActionPlan([blocked, noEvidence]);
    expect(plan.length).toBe(2);
    for (const item of plan) {
      const row = [blocked, noEvidence].find((candidate) => candidate.strategyId === item.strategyId)!;
      const source = row.recommendations.find((rec) => rec.id === item.recommendationId);
      expect(source).toBeDefined();
      expect(item.because).toEqual(source?.because);
      expect(item.headline).toBe(source?.headline);
    }
  });

  it('orders critical severity ahead of medium and assigns sequential priority', () => {
    const blocked = buildAcademyIntelligence(strategy({ strategyId: 'blocked-1', status: 'blocked' }));
    const noEvidence = buildAcademyIntelligence(strategy({ strategyId: 'no-ev-a' }));
    const plan = academyActionPlan([blocked, noEvidence]);
    expect(plan[0].recommendationId).toBe('retire');
    expect(plan[0].severity).toBe('critical');
    expect(plan[0].priority).toBe(1);
    expect(plan[1].priority).toBe(2);
  });
});
