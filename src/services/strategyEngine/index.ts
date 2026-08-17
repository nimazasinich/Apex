import type { StrategyRunFn } from './replayHarness';
import { runAdaptiveTrendPortfolio } from './adaptiveTrendPortfolio';
import { runOrbVwapBreakout } from './orbVwapBreakout';
import { runVolatilitySqueezeExpansion } from './volatilitySqueezeExpansion';
import { runVwapPullbackReacceleration } from './vwapPullbackReacceleration';
import { runRegimeRoutedComposite } from './regimeRoutedComposite';

export const bespokeStrategyRunners: Record<string, StrategyRunFn> = {
  adaptiveTrendPortfolio: runAdaptiveTrendPortfolio,
  orbVwapBreakout: runOrbVwapBreakout,
  volatilitySqueezeExpansion: runVolatilitySqueezeExpansion,
  vwapPullbackReacceleration: runVwapPullbackReacceleration,
  regimeRoutedComposite: runRegimeRoutedComposite,
};
