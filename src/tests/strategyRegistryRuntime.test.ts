import { describe, expect, it } from 'vitest';
import { bespokeStrategyRunners } from '../services/strategyEngine';
import { clientSafeStrategy, listStrategyDefinitions } from '../services/strategyRegistry';

describe('strategy registry runtime contract', () => {
  it('binds every executable bespoke candidate to a real runner', () => {
    const definitions = listStrategyDefinitions({ includeBaseline: true });
    const executableBespoke = definitions.filter((definition) => definition.engine === 'bespoke' && definition.status !== 'blocked' && definition.status !== 'deprecated');
    expect(executableBespoke.length).toBeGreaterThan(0);
    for (const definition of executableBespoke) {
      expect(definition.runFn, definition.strategyId).toBeTruthy();
      expect(typeof bespokeStrategyRunners[definition.runFn!], definition.strategyId).toBe('function');
    }
  });

  it('keeps blocked infrastructure models blocked and strips server runner identities from client output', () => {
    const definitions = listStrategyDefinitions({ includeBaseline: true });
    const blocked = definitions.filter((definition) => definition.status === 'blocked');
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked.every((definition) => Boolean(definition.blockedReason))).toBe(true);
    for (const definition of definitions) {
      expect(clientSafeStrategy(definition).runFn).toBeUndefined();
    }
  });
});
