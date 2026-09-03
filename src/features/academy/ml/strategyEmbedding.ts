import { createHash } from 'node:crypto';
import type { DiscoveredAcademyStrategy } from '../types.ts';

const EMBEDDING_DIMENSIONS = 48;

function tokens(strategy: DiscoveredAcademyStrategy): string[] {
  return [
    strategy.name,
    strategy.logic.summary,
    ...strategy.logic.setupRules,
    ...strategy.logic.triggerRules,
    ...strategy.logic.riskRules,
    ...strategy.logic.exitRules,
    ...strategy.logic.noTradeRules,
    ...strategy.marketConditions,
    ...strategy.categories,
    ...strategy.parameters.map((parameter) => `${parameter.key} ${parameter.label}`),
  ].join(' ').toLowerCase().match(/[a-z0-9_]{3,}/g) ?? [];
}

export function buildStrategyEmbedding(strategy: DiscoveredAcademyStrategy): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const token of tokens(strategy)) {
    const digest = createHash('sha256').update(token).digest();
    const index = digest.readUInt16BE(0) % EMBEDDING_DIMENSIONS;
    vector[index] += digest[2] % 2 === 0 ? 1 : -1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? vector : vector.map((value) => Number((value / norm).toFixed(8)));
}
