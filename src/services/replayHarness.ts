import type { StrategyRunContext, StrategyReplayResult } from '../types';

// Simple in-memory registry for bespoke strategy run functions.
const bespokeEngines: Record<string, (ctx: StrategyRunContext) => Promise<StrategyReplayResult> | StrategyReplayResult> = {};

export function registerBespokeEngine(key: string, runFn: (ctx: StrategyRunContext) => Promise<StrategyReplayResult> | StrategyReplayResult): void {
  bespokeEngines[key] = runFn;
}

export function hasBespokeEngine(key: string): boolean {
  return !!bespokeEngines[key];
}

export async function runBespokeEngine(key: string | undefined, ctx: StrategyRunContext): Promise<StrategyReplayResult> {
  if (!key) throw new Error('missing_engine_key');
  const fn = bespokeEngines[key];
  if (!fn) throw new Error(`bespoke_engine_not_registered:${key}`);
  const result = await Promise.resolve(fn(ctx));
  return result;
}
