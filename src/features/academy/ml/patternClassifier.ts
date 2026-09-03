import type { AcademyPatternClassification, DiscoveredAcademyStrategy } from '../types.ts';

const RULES: Array<{ pattern: AcademyPatternClassification['pattern']; terms: string[] }> = [
  { pattern: 'TREND_FOLLOWING', terms: ['trend', 'momentum', 'ema', 'rotation'] },
  { pattern: 'MEAN_REVERSION', terms: ['mean reversion', 'reversion', 'range', 'fade'] },
  { pattern: 'BREAKOUT', terms: ['breakout', 'expansion', 'squeeze', 'orb'] },
  { pattern: 'CARRY', terms: ['funding', 'basis', 'carry'] },
  { pattern: 'LIQUIDITY', terms: ['liquidity', 'order flow', 'market making', 'imbalance'] },
  { pattern: 'EVENT_DRIVEN', terms: ['news', 'event', 'sentiment', 'whale'] },
];

export function classifyStrategyPatterns(strategy: DiscoveredAcademyStrategy): AcademyPatternClassification[] {
  const corpus = [
    strategy.name,
    strategy.logic.summary,
    ...strategy.logic.setupRules,
    ...strategy.logic.triggerRules,
    ...strategy.marketConditions,
    ...strategy.categories,
  ].join(' ').toLowerCase();
  const matches = RULES.map((rule) => ({
    pattern: rule.pattern,
    basis: 'RULE_BASED_METADATA' as const,
    matchedTerms: rule.terms.filter((term) => corpus.includes(term)),
  })).filter((result) => result.matchedTerms.length > 0);
  return matches.length ? matches : [{ pattern: 'UNCLASSIFIED', basis: 'RULE_BASED_METADATA', matchedTerms: [] }];
}
