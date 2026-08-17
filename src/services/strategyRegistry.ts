import type {
  StrategyDefinition,
  StrategyFusionBlueprint,
  StrategyFusionComponentKey,
  StrategyParameterDefinition,
  StrategyLiquidityHunterEdgeBinding,
  StrategyExecutionCapability,
} from '../types';

export const DEFAULT_STRATEGY_ID = 'apex-composite-scanner-v1';
export const CORE_STRATEGY_COUNT = 10;

export function strategyExecutionCapability(definition: Pick<StrategyDefinition, 'strategyId' | 'status'>): StrategyExecutionCapability {
  if (definition.status === 'blocked' || definition.status === 'deprecated') {
    return {
      roles: ['BLOCKED'], primary: 'BLOCKED', independentlyLiveDispatched: false,
      reason: 'Required strategy infrastructure is unavailable; execution remains blocked.',
    };
  }
  if (definition.strategyId === DEFAULT_STRATEGY_ID) {
    return {
      roles: ['LIVE', 'REPLAY', 'PAPER'], primary: 'LIVE', independentlyLiveDispatched: true,
      reason: 'The canonical baseline is the current LIVE candidate and replay authority.',
    };
  }
  return {
    roles: ['REPLAY', 'PAPER'], primary: 'REPLAY', independentlyLiveDispatched: false,
    reason: 'Research/replay and paper capability only; the LIVE candidate route remains canonical and does not independently dispatch this strategy.',
  };
}

const FUSION_COMPONENTS: Record<StrategyFusionComponentKey, Omit<StrategyFusionBlueprint['components'][number], 'weight' | 'required'>> = {
  technical: { key: 'technical', label: 'Technical structure', role: 'DIRECTIONAL', minWeight: 0.02, maxWeight: 0.35, dataMode: 'NATIVE', reason: 'Trend, momentum, volatility and price-structure evidence.' },
  smartMoney: { key: 'smartMoney', label: 'Smart-money structure', role: 'DIRECTIONAL', minWeight: 0.02, maxWeight: 0.35, dataMode: 'PROXY', reason: 'Liquidity sweeps, CHoCH/BOS, displacement and zone-control evidence.' },
  orderFlow: { key: 'orderFlow', label: 'Order flow / scalp layer', role: 'DIRECTIONAL', minWeight: 0.01, maxWeight: 0.30, dataMode: 'PROXY', reason: 'Signed flow and microstructure confirmation; candle proxy until historical L2 exists.' },
  liquidity: { key: 'liquidity', label: 'Liquidity quality', role: 'QUALITY', minWeight: 0.02, maxWeight: 0.25, dataMode: 'PROXY', reason: 'Rejects thin, unstable or operationally expensive conditions.' },
  funding: { key: 'funding', label: 'Funding and crowding', role: 'DIRECTIONAL', minWeight: 0, maxWeight: 0.30, dataMode: 'LIVE_ONLY', reason: 'Perpetual funding pressure and crowding state.' },
  openInterest: { key: 'openInterest', label: 'Open-interest state', role: 'DIRECTIONAL', minWeight: 0, maxWeight: 0.25, dataMode: 'LIVE_ONLY', reason: 'Position build-up, contraction and squeeze-risk confirmation.' },
  sentiment: { key: 'sentiment', label: 'Market sentiment', role: 'DIRECTIONAL', minWeight: 0, maxWeight: 0.25, dataMode: 'LIVE_ONLY', reason: 'Model-scored market emotion with explicit confidence and provenance.' },
  news: { key: 'news', label: 'News event context', role: 'DIRECTIONAL', minWeight: 0, maxWeight: 0.25, dataMode: 'LIVE_ONLY', reason: 'Recency-weighted event direction; never treated as verified when unavailable.' },
  whaleFlow: { key: 'whaleFlow', label: 'Whale exchange flow', role: 'DIRECTIONAL', minWeight: 0, maxWeight: 0.30, dataMode: 'LIVE_ONLY', reason: 'Exchange deposits as distribution risk and withdrawals as accumulation evidence.' },
  regime: { key: 'regime', label: 'Market regime', role: 'DIRECTIONAL', minWeight: 0.02, maxWeight: 0.30, dataMode: 'NATIVE', reason: 'Routes the strategy through trending, compressed, stressed and reversal conditions.' },
};

function fusionBlueprint(
  weights: Record<StrategyFusionComponentKey, number>,
  required: StrategyFusionComponentKey[],
  minCompleteness = 0.60,
  minAgreement = 0.58,
): StrategyFusionBlueprint {
  const requiredSet = new Set(required);
  return {
    components: (Object.keys(FUSION_COMPONENTS) as StrategyFusionComponentKey[]).map((key) => ({
      ...FUSION_COMPONENTS[key],
      weight: weights[key],
      required: requiredSet.has(key),
    })),
    minCompleteness,
    minAgreement,
    manualTuning: true,
    evolution: {
      mode: 'BOUNDED_AUTO',
      maxWeightStep: 0.025,
      minHoldoutImprovement: 0.01,
      maxOverfitGap: 0.32,
      requireCostStress: true,
      requireNeighborStability: true,
      retainRollbackRevisions: 12,
      liveOnlyWeightsManualUntilHistoricalData: true,
    },
  };
}

function scannerWeightParameter(key: string, label: string, value: number, reason: string): StrategyParameterDefinition {
  return { key: `weight.${key}`, label, default: value, min: 0.02, max: 0.45, step: 0.01, reason, optimization: 'enabled' };
}

function liveFusionParameter(key: StrategyFusionComponentKey, label: string, value: number, reason: string): StrategyParameterDefinition {
  return { key: `fusion.${key}`, label, default: value, min: 0, max: 0.30, step: 0.01, reason, optimization: 'manual-only' };
}

export const baselineStrategyDefinition: StrategyDefinition = {
  strategyId: DEFAULT_STRATEGY_ID,
  version: 1,
  name: 'APEX Composite Scanner',
  summary: 'The production-aligned APEX scanner replay, preserved as the non-breaking baseline and comparison control.',
  evidenceTier: ['B'],
  wave: 'wave1-mvp',
  status: 'candidate',
  longShort: 'BOTH',
  supportedIntervals: ['15m', '1h', '4h', '1d'],
  dataRequirements: ['Verified closed candles', 'Candle-derived proxy microstructure'],
  engine: 'scanner-preset',
  scoreWeights: {},
  scannerConfigOverrides: {},
  regimeRules: ['Use the active scanner regime and adaptive guardrail policy.'],
  setupRules: ['Use the canonical APEX composite-scoring setup.'],
  triggerRules: ['Enter only when the canonical decision adapter accepts the candidate.'],
  riskRules: ['Use the canonical trade-plan and risk-governor path.'],
  exitRules: ['Use the canonical stop, target and maximum-hold logic.'],
  noTradeRules: ['Do not trade when canonical gates reject the candidate or required data is unavailable.'],
  parameters: [],
  sourceReferences: ['APEX production scanner'],
  knownFailureModes: ['Proxy replay can estimate unavailable microstructure inputs from candles.'],
  categories: ['Composite', 'Baseline'],
  componentCount: 9,
};

export const strategyDefinitions: StrategyDefinition[] = [
  {
    strategyId: 'crypto-multi-alpha-ls-v1', version: 2, isCore: true, coreRank: 1,
    name: 'APEX Multi-Alpha Fusion Long/Short',
    summary: 'A balanced ten-layer composite combining price structure, SMC, order flow, liquidity, derivatives positioning, sentiment, news, whale flow and regime.',
    realisticExpectation: 'The primary diversified candidate; it must beat the baseline out of sample rather than rely on a single high-return backtest.',
    evidenceTier: ['A', 'B'], wave: 'wave1-mvp', status: 'candidate', longShort: 'BOTH', supportedIntervals: ['15m', '1h', '4h'],
    dataRequirements: ['Verified closed candles', 'Funding and open-interest snapshots', 'Supplemental news/sentiment/on-chain feeds for full fusion'],
    engine: 'scanner-preset',
    scoreWeights: { obi: 1.30, qStruct: 1.30, volume: 1.00, funding: 1.15, openInterest: 1.00, atr: 0.80, microstructure: 1.20, liquidity: 1.10, smc: 1.30 },
    scannerConfigOverrides: { minEvidenceAgreement: 0.68, minConfidence: 0.79, maxSqueezeRisk: 0.43, directionBias: 'BOTH' },
    fusion: fusionBlueprint(
      { technical: 0.15, smartMoney: 0.14, orderFlow: 0.13, liquidity: 0.10, funding: 0.09, openInterest: 0.08, sentiment: 0.08, news: 0.06, whaleFlow: 0.09, regime: 0.08 },
      ['technical', 'smartMoney', 'orderFlow', 'liquidity', 'regime'], 0.62, 0.60,
    ),
    regimeRules: ['Trade only when volatility and liquidity remain inside adaptive guardrails.', 'Allow long and short only when the fused evidence agrees.'],
    setupRules: ['Require independent participation from structure, flow and regime layers.', 'Alternative data may strengthen or veto but cannot bypass hard risk gates.'],
    triggerRules: ['Enter only after canonical confidence, evidence agreement and fusion completeness gates pass.'],
    riskRules: ['Risk remains bounded by the canonical governor.', 'Reduce size when feature completeness or liquidity quality degrades.'],
    exitRules: ['Use canonical stop/target geometry and maximum hold.'],
    noTradeRules: ['Reject correlated false confidence.', 'Reject stale or missing required inputs.', 'Reject excessive squeeze risk.'],
    parameters: [
      { key: 'minEvidenceAgreement', label: 'Evidence Agreement', default: 0.68, min: 0.55, max: 0.85, step: 0.01, reason: 'Prevents one component from dominating.', optimization: 'enabled' },
      { key: 'minConfidence', label: 'Minimum Confidence', default: 0.79, min: 0.65, max: 0.92, step: 0.01, reason: 'Keeps the stack selective after costs.', optimization: 'enabled' },
      scannerWeightParameter('smc', 'SMC Scanner Weight', 1.30, 'Tunes candle-derived smart-money evidence inside the canonical scanner.'),
      scannerWeightParameter('microstructure', 'Order-Flow Weight', 1.20, 'Tunes executable order-flow confirmation.'),
      liveFusionParameter('sentiment', 'Live Sentiment Weight', 0.08, 'Manual until timestamp-aligned sentiment history exists.'),
      liveFusionParameter('whaleFlow', 'Whale-Flow Weight', 0.09, 'Manual until historical exchange-flow snapshots exist.'),
    ],
    sourceReferences: ['CORE-R1', 'CORE-R2', 'CORE-R3', 'CORE-R4'],
    knownFailureModes: ['Correlated inputs can create false confidence.', 'Alternative data can be stale, revised or unavailable.', 'A broad model may underperform specialized models in narrow regimes.'],
    categories: ['Core 10', 'High Conviction', 'Composite', 'Long/Short'], componentCount: 10,
  },
  {
    strategyId: 'adaptive-long-short-trend-portfolio-v1', version: 2, isCore: true, coreRank: 2,
    name: 'Adaptive Cross-Asset Trend and Regime Rotation',
    summary: 'Ranks a liquid crypto universe, rotates into the strongest risk-adjusted trend and uses sentiment, whale flow and regime context as bounded overlays.',
    realisticExpectation: 'Multi-symbol evidence is mandatory for promotion; a single-symbol replay is diagnostic only.',
    evidenceTier: ['A', 'B'], wave: 'wave1-mvp', status: 'candidate', longShort: 'BOTH', supportedIntervals: ['1h', '4h', '1d'],
    dataRequirements: ['Synchronized multi-symbol candles', 'Verified liquidity universe', 'Optional sentiment and whale-flow overlays'],
    engine: 'bespoke', runFn: 'adaptiveTrendPortfolio',
    fusion: fusionBlueprint(
      { technical: 0.22, smartMoney: 0.07, orderFlow: 0.05, liquidity: 0.10, funding: 0.07, openInterest: 0.07, sentiment: 0.08, news: 0.04, whaleFlow: 0.08, regime: 0.22 },
      ['technical', 'liquidity', 'regime'], 0.55, 0.58,
    ),
    regimeRules: ['Rank the universe by rolling momentum and risk-adjusted trend.', 'Require EMA alignment and a stable trend regime.'],
    setupRules: ['Select the highest absolute eligible momentum candidate at each rebalance.'],
    triggerRules: ['Enter at the next eligible rebalance after trend and regime alignment.'],
    riskRules: ['ATR-scaled stop and portfolio exposure cap.', 'One selected trend position in v1.'],
    exitRules: ['ATR target/stop, maximum hold or next rebalance.'],
    noTradeRules: ['No trade with insufficient synchronized history.', 'No trade when trend and momentum disagree.'],
    parameters: [
      { key: 'rebalanceBars', label: 'Rebalance Bars', default: 24, min: 6, max: 96, step: 1, reason: 'Controls turnover and regime rotation.', optimization: 'enabled' },
      { key: 'atrStopMultiplier', label: 'ATR Stop', default: 1.4, min: 0.8, max: 3, step: 0.1, reason: 'Normalizes risk across assets.', optimization: 'enabled' },
      { key: 'rewardRisk', label: 'Reward / Risk', default: 2.2, min: 1, max: 4, step: 0.1, reason: 'Trend systems rely on payoff asymmetry.', optimization: 'enabled' },
      liveFusionParameter('sentiment', 'Sentiment Overlay', 0.08, 'Changes ranking confidence, never the hard trend rule.'),
      liveFusionParameter('whaleFlow', 'Whale Rotation Overlay', 0.08, 'Penalizes exchange-deposit distribution risk.'),
    ],
    sourceReferences: ['CORE-R4', 'CORE-R5'],
    knownFailureModes: ['Universe-selection bias.', 'Trend whipsaws.', 'Timestamp gaps across symbols.', 'Correlation spikes during market stress.'],
    categories: ['Core 10', 'Portfolio', 'Trending', 'Long/Short'], componentCount: 10,
  },
  {
    strategyId: 'funding-basis-carry-v1', version: 2, isCore: true, coreRank: 3,
    name: 'Funding, Basis and Crowding Carry Fusion',
    summary: 'Trades funding opportunities only when carry clears costs and liquidity, open-interest, regime, news and whale-flow risk filters agree.',
    realisticExpectation: 'Carry is evaluated net of costs and basis risk; no annualized return is promised.',
    evidenceTier: ['A', 'B'], wave: 'wave1-mvp', status: 'candidate', longShort: 'BOTH', supportedIntervals: ['1h', '4h', '1d'],
    dataRequirements: ['Funding history', 'Open interest', 'Verified candles', 'Liquidity/spread estimate'],
    engine: 'scanner-preset',
    scoreWeights: { obi: 0.65, qStruct: 0.75, volume: 0.65, funding: 2.40, openInterest: 1.35, atr: 0.50, microstructure: 0.75, liquidity: 1.50, smc: 0.55 },
    scannerConfigOverrides: { fundingThreshold: 0.00018, minEvidenceAgreement: 0.58, minConfidence: 0.72, minVolume24hUsd: 15_000_000, directionBias: 'BOTH' },
    fusion: fusionBlueprint(
      { technical: 0.07, smartMoney: 0.05, orderFlow: 0.06, liquidity: 0.16, funding: 0.25, openInterest: 0.15, sentiment: 0.05, news: 0.05, whaleFlow: 0.08, regime: 0.08 },
      ['liquidity', 'funding', 'openInterest'], 0.64, 0.55,
    ),
    regimeRules: ['Expected carry must remain positive after fees, spread, slippage and basis risk.', 'Liquidity must exceed the strategy minimum.'],
    setupRules: ['Funding and open interest identify a tradable crowding imbalance.'],
    triggerRules: ['Enter only after carry and canonical confidence gates pass.'],
    riskRules: ['Cap leverage when funding is unstable.', 'Reject thin books and crowded liquidation zones.'],
    exitRules: ['Exit when funding normalizes, basis closes or risk stop is hit.'],
    noTradeRules: ['No trade without verified funding, open interest and liquidity.', 'No trade when net carry is non-positive.'],
    parameters: [
      { key: 'fundingThreshold', label: 'Funding Threshold', default: 0.00018, min: 0.00005, max: 0.001, step: 0.00001, reason: 'Requires a cost-clearing funding opportunity.', optimization: 'enabled' },
      { key: 'minVolume24hUsd', label: 'Minimum 24h Volume', default: 15000000, min: 5000000, max: 100000000, step: 1000000, reason: 'Reduces spread and basis-exit risk.', optimization: 'enabled' },
      scannerWeightParameter('funding', 'Funding Scanner Weight', 2.40, 'Keeps funding dominant while bounded.'),
      scannerWeightParameter('openInterest', 'Open-Interest Weight', 1.35, 'Confirms whether crowding is building or unwinding.'),
      liveFusionParameter('whaleFlow', 'Whale Exit-Risk Weight', 0.08, 'Exchange deposits can veto fragile carry setups.'),
    ],
    sourceReferences: ['CORE-R4', 'CORE-R6'],
    knownFailureModes: ['Funding can reverse before settlement.', 'Single-venue carry is not fully delta neutral.', 'Liquidations can overwhelm expected carry.'],
    categories: ['Core 10', 'Carry', 'Derivatives', 'Liquidity Models'], componentCount: 10,
  },
  {
    strategyId: 'opening-range-vwap-rvol-breakout-v1', version: 2, isCore: true, coreRank: 4,
    name: 'Event-Aware Opening Range Breakout',
    summary: 'Combines UTC opening range, VWAP slope, relative volume, order flow, news direction and whale accumulation/distribution context.',
    realisticExpectation: 'Edge must come from payoff asymmetry and event filtering, not an inflated hit-rate claim.',
    evidenceTier: ['B', 'C'], wave: 'wave1-mvp', status: 'candidate', longShort: 'BOTH', supportedIntervals: ['5m', '15m', '1h'],
    dataRequirements: ['Verified intraday candles', 'UTC session boundary', 'Volume', 'Optional current news and whale-flow context'],
    engine: 'bespoke', runFn: 'orbVwapBreakout',
    fusion: fusionBlueprint(
      { technical: 0.18, smartMoney: 0.09, orderFlow: 0.14, liquidity: 0.10, funding: 0.04, openInterest: 0.07, sentiment: 0.08, news: 0.12, whaleFlow: 0.08, regime: 0.10 },
      ['technical', 'orderFlow', 'liquidity', 'regime'], 0.58, 0.60,
    ),
    regimeRules: ['Trade after the deterministic UTC range is complete.', 'Require VWAP slope and regime to agree.'],
    setupRules: ['Opening range must be meaningful relative to ATR.', 'Relative volume must exceed the threshold.'],
    triggerRules: ['Close breaks the range after the prior close was inside.', 'News and whale layers may veto event-risk conflict.'],
    riskRules: ['ATR stop beyond the broken boundary.', 'One active setup per session direction.'],
    exitRules: ['Reward/risk target, stop or maximum hold.'],
    noTradeRules: ['No trade before range completion.', 'No trade on low relative volume, flat VWAP or conflicting event evidence.'],
    parameters: [
      { key: 'openingRangeBars', label: 'Opening Range Bars', default: 6, min: 3, max: 24, step: 1, reason: 'Defines a deterministic 24/7 session range.', optimization: 'enabled' },
      { key: 'relativeVolumeThreshold', label: 'Relative Volume', default: 1.35, min: 1, max: 3, step: 0.05, reason: 'Requires participation behind the breakout.', optimization: 'enabled' },
      { key: 'atrStopMultiplier', label: 'ATR Stop', default: 1.1, min: 0.6, max: 2.5, step: 0.1, reason: 'Preserves the original volatility-scaled risk control.', optimization: 'enabled' },
      { key: 'rewardRisk', label: 'Reward / Risk', default: 2, min: 1, max: 4, step: 0.1, reason: 'Maintains payoff asymmetry.', optimization: 'enabled' },
      liveFusionParameter('news', 'News Event Weight', 0.12, 'Manual until historical headline snapshots are available.'),
      liveFusionParameter('whaleFlow', 'Whale Confirmation Weight', 0.08, 'Uses exchange-flow direction as a bounded confirmation.'),
    ],
    sourceReferences: ['CORE-R3', 'CORE-R7'],
    knownFailureModes: ['False breakouts in thin sessions.', 'News latency.', 'Range definitions can overfit exchange-specific activity.'],
    categories: ['Core 10', 'Breakout', 'Event Driven', 'Long/Short'], componentCount: 10,
  },
  {
    strategyId: 'volatility-squeeze-trend-volume-expansion-v1', version: 2, isCore: true, coreRank: 5,
    name: 'Volatility Squeeze, OI and Sentiment Expansion',
    summary: 'Detects compression and enters expansion only when trend, volume, open interest, order flow and sentiment support the same direction.',
    realisticExpectation: 'Compression alone is not an edge; full validation must prove expansion filters survive costs.',
    evidenceTier: ['A', 'B'], wave: 'wave1-mvp', status: 'candidate', longShort: 'BOTH', supportedIntervals: ['15m', '1h', '4h'],
    dataRequirements: ['Verified candles', 'Volume', 'Optional open-interest and sentiment history'],
    engine: 'bespoke', runFn: 'volatilitySqueezeExpansion',
    fusion: fusionBlueprint(
      { technical: 0.20, smartMoney: 0.07, orderFlow: 0.13, liquidity: 0.09, funding: 0.06, openInterest: 0.14, sentiment: 0.08, news: 0.05, whaleFlow: 0.06, regime: 0.12 },
      ['technical', 'orderFlow', 'liquidity', 'regime'], 0.58, 0.62,
    ),
    regimeRules: ['Require a bounded compression phase followed by volatility expansion.', 'Trade only in an aligned trend regime.'],
    setupRules: ['Bollinger/Keltner-style compression and low normalized ATR.'],
    triggerRules: ['Expansion close with volume and flow confirmation.'],
    riskRules: ['ATR stop and capped exposure around squeeze releases.'],
    exitRules: ['Reward/risk target, stop or volatility failure.'],
    noTradeRules: ['No trade without expansion confirmation.', 'No trade when OI and price imply a fragile squeeze against the direction.'],
    parameters: [
      { key: 'widthLookback', legacyKeys: ['squeezeLookback'], label: 'Squeeze Width Lookback', default: 80, min: 40, max: 240, step: 10, reason: 'Preserves the original rolling compression-percentile control while accepting the newer squeezeLookback alias.', optimization: 'enabled' },
      { key: 'volumeExpansion', label: 'Volume Expansion', default: 1.35, min: 1, max: 3, step: 0.05, reason: 'Requires real participation.', optimization: 'enabled' },
      { key: 'atrStopMultiplier', label: 'ATR Stop', default: 1.25, min: 0.7, max: 3, step: 0.1, reason: 'Preserves volatility-normalized breakout risk.', optimization: 'enabled' },
      { key: 'rewardRisk', label: 'Reward / Risk', default: 2.1, min: 1, max: 4, step: 0.1, reason: 'Balances breakout failure rate.', optimization: 'enabled' },
      liveFusionParameter('openInterest', 'Open-Interest Weight', 0.14, 'Manual until historical OI is aligned with candles.'),
      liveFusionParameter('sentiment', 'Sentiment Expansion Weight', 0.08, 'Avoids chasing expansion against dominant sentiment.'),
    ],
    sourceReferences: ['CORE-R4', 'CORE-R8'],
    knownFailureModes: ['Repeated false releases.', 'OI can rise for hedging rather than directional conviction.', 'Late sentiment can chase price.'],
    categories: ['Core 10', 'Volatility', 'Breakout', 'Long/Short'], componentCount: 10,
  },
  {
    strategyId: 'multi-timeframe-vwap-pullback-reacceleration-v1', version: 2, isCore: true, coreRank: 6,
    name: 'Multi-Timeframe VWAP and SMC Pullback',
    summary: 'Trades trend pullbacks into VWAP only when multi-timeframe structure, SMC zones, reacceleration flow and regime remain aligned.',
    realisticExpectation: 'A continuation model that must demonstrate robustness in choppy and transition regimes.',
    evidenceTier: ['A', 'B'], wave: 'wave1-mvp', status: 'candidate', longShort: 'BOTH', supportedIntervals: ['5m', '15m', '1h'],
    dataRequirements: ['Verified candles', 'Volume', 'Multi-timeframe candle alignment'],
    engine: 'bespoke', runFn: 'vwapPullbackReacceleration',
    fusion: fusionBlueprint(
      { technical: 0.20, smartMoney: 0.16, orderFlow: 0.13, liquidity: 0.09, funding: 0.04, openInterest: 0.05, sentiment: 0.06, news: 0.03, whaleFlow: 0.08, regime: 0.16 },
      ['technical', 'smartMoney', 'orderFlow', 'liquidity', 'regime'], 0.60, 0.62,
    ),
    regimeRules: ['Require EMA alignment and a rising/falling VWAP consistent with direction.', 'SMC control side must not oppose the trade.'],
    setupRules: ['Previous bar pulls back into the VWAP/SMC tolerance zone without breaking trend.'],
    triggerRules: ['Current bar breaks the pullback extreme with reacceleration volume.'],
    riskRules: ['ATR-scaled stop and cost-sensitive size.'],
    exitRules: ['Reward/risk target, stop or bounded timeout.'],
    noTradeRules: ['No trade in mixed EMA alignment.', 'No trade with weak flow, flat VWAP or opposing SMC control.'],
    parameters: [
      { key: 'vwapLength', label: 'VWAP Window', default: 48, min: 20, max: 200, step: 4, reason: 'Balances responsiveness and noise.', optimization: 'enabled' },
      { key: 'pullbackAtrTolerance', label: 'Pullback ATR Tolerance', default: 0.35, min: 0.1, max: 1, step: 0.05, reason: 'Defines a numeric pullback zone.', optimization: 'enabled' },
      { key: 'reaccelerationVolume', label: 'Reacceleration Volume', default: 1.15, min: 1, max: 2.5, step: 0.05, reason: 'Confirms participation after the pullback.', optimization: 'enabled' },
      { key: 'atrStopMultiplier', label: 'ATR Stop', default: 1.15, min: 0.7, max: 3, step: 0.1, reason: 'Normalizes continuation risk to current volatility.', optimization: 'enabled' },
      { key: 'rewardRisk', label: 'Reward / Risk', default: 1.9, min: 1, max: 4, step: 0.1, reason: 'Controls continuation payoff asymmetry.', optimization: 'enabled' },
      liveFusionParameter('whaleFlow', 'Whale Trend Weight', 0.08, 'Penalizes pullbacks against exchange-flow distribution.'),
    ],
    sourceReferences: ['CORE-R3', 'CORE-R8'],
    knownFailureModes: ['EMA/VWAP lag.', 'Frequent losses in choppy trends.', 'SMC proxy can be ambiguous without lower-timeframe data.'],
    categories: ['Core 10', 'Trending', 'Pullback', 'Smart Money'], componentCount: 10,
  },
  {
    strategyId: 'liquidity-sweep-fvg-reversal-v1', version: 2, isCore: true, coreRank: 7,
    name: 'Liquidity Sweep, FVG and Whale Reversal',
    summary: 'A deterministic reversal stack using liquidity sweep, displacement, structure shift, SMC imbalance, whale exchange flow and sentiment exhaustion.',
    realisticExpectation: 'Vendor-style 70–80% win-rate claims are explicitly excluded; promotion requires APEX holdout evidence.',
    evidenceTier: ['B', 'D'], wave: 'wave2-formalized', status: 'candidate', longShort: 'BOTH', supportedIntervals: ['5m', '15m', '1h'],
    dataRequirements: ['Verified candles', 'Versioned sweep/FVG rules', 'Optional whale and sentiment feeds'],
    engine: 'scanner-preset',
    scoreWeights: { obi: 1.05, qStruct: 1.40, volume: 0.85, funding: 0.55, openInterest: 0.75, atr: 0.85, microstructure: 1.15, liquidity: 1.15, smc: 1.75 },
    scannerConfigOverrides: { minSmartMoneyScore: 0.58, smcHardRejectThreshold: 0.30, minEvidenceAgreement: 0.66, minConfidence: 0.78, directionBias: 'BOTH' },
    fusion: fusionBlueprint(
      { technical: 0.10, smartMoney: 0.24, orderFlow: 0.13, liquidity: 0.11, funding: 0.04, openInterest: 0.06, sentiment: 0.09, news: 0.04, whaleFlow: 0.12, regime: 0.07 },
      ['smartMoney', 'orderFlow', 'liquidity'], 0.60, 0.64,
    ),
    regimeRules: ['Prefer stressed, range-edge or exhaustion regimes.', 'Reject continuation regimes without a genuine structure shift.'],
    setupRules: ['Require a numeric liquidity sweep, displacement and SMC shift.', 'Whale/sentiment exhaustion may confirm but cannot manufacture the setup.'],
    triggerRules: ['Enter only after rejection and evidence agreement.', 'Use the canonical decision adapter for direction and risk.'],
    riskRules: ['Stop beyond the swept extreme with ATR cap.', 'Reduce size if whale or news evidence is missing.'],
    exitRules: ['Target opposing liquidity, stop or bounded timeout.'],
    noTradeRules: ['No subjective visual-only FVG.', 'No trade without a measurable sweep.', 'No trade when regime remains strongly directional against the reversal.'],
    parameters: [
      { key: 'minSmartMoneyScore', label: 'Minimum SMC Score', default: 0.58, min: 0.35, max: 0.82, step: 0.01, reason: 'Requires a strong structure-shift model.', optimization: 'enabled' },
      { key: 'smcHardRejectThreshold', label: 'SMC Reject Threshold', default: 0.30, min: 0.10, max: 0.45, step: 0.01, reason: 'Blocks weak or opposing SMC context.', optimization: 'enabled' },
      scannerWeightParameter('smc', 'SMC Scanner Weight', 1.75, 'Makes SMC dominant without bypassing other gates.'),
      liveFusionParameter('whaleFlow', 'Whale Exhaustion Weight', 0.12, 'Exchange flows confirm accumulation/distribution.'),
      liveFusionParameter('sentiment', 'Sentiment Exhaustion Weight', 0.09, 'Contrarian layer remains bounded.'),
    ],
    sourceReferences: ['CORE-R2', 'CORE-R9'],
    knownFailureModes: ['Hindsight bias in structure labels.', 'Reversals fail in persistent trends.', 'On-chain flows can precede price by variable horizons.'],
    categories: ['Core 10', 'Smart Money', 'Mean Reversion', 'Whale Flow'], componentCount: 10,
  },
  {
    strategyId: 'whale-flow-sentiment-reversal-v1', version: 1, isCore: true, coreRank: 8,
    name: 'Whale Flow and Sentiment Capitulation Reversal',
    summary: 'Looks for panic/euphoria exhaustion where exchange whale flows, sentiment, liquidity sweeps, volume and regime indicate a bounded reversal opportunity.',
    realisticExpectation: 'This is an alternative-data candidate; full validation is impossible until historical flow and sentiment snapshots are timestamp-aligned.',
    evidenceTier: ['B', 'E'], wave: 'wave2-formalized', status: 'candidate', longShort: 'BOTH', supportedIntervals: ['15m', '1h', '4h'],
    dataRequirements: ['Verified candles', 'Exchange-classified whale transfers', 'Sentiment history for full validation'],
    engine: 'scanner-preset',
    scoreWeights: { obi: 0.95, qStruct: 1.20, volume: 1.10, funding: 0.70, openInterest: 0.80, atr: 1.00, microstructure: 1.00, liquidity: 1.15, smc: 1.35 },
    scannerConfigOverrides: { minEvidenceAgreement: 0.64, minConfidence: 0.77, maxSqueezeRisk: 0.60, directionBias: 'BOTH' },
    fusion: fusionBlueprint(
      { technical: 0.08, smartMoney: 0.15, orderFlow: 0.09, liquidity: 0.11, funding: 0.06, openInterest: 0.06, sentiment: 0.16, news: 0.07, whaleFlow: 0.17, regime: 0.05 },
      ['smartMoney', 'liquidity', 'sentiment', 'whaleFlow'], 0.70, 0.62,
    ),
    regimeRules: ['Operate only near statistically stressed or exhausted regimes.', 'Avoid fading a healthy trend without sweep/structure evidence.'],
    setupRules: ['Whale exchange flows and sentiment must show accumulation/distribution asymmetry.', 'SMC or volume exhaustion must confirm.'],
    triggerRules: ['Enter only after price rejection and canonical evidence agreement.'],
    riskRules: ['Small initial size, ATR-bounded stop and strict loss cap.', 'Missing alternative data makes the fusion incomplete.'],
    exitRules: ['Exit at mean reversion, opposing liquidity or timeout.'],
    noTradeRules: ['No trade from a whale transfer alone.', 'No trade when sentiment source confidence is low or stale.'],
    parameters: [
      { key: 'minEvidenceAgreement', label: 'Evidence Agreement', default: 0.64, min: 0.55, max: 0.84, step: 0.01, reason: 'Requires multiple independent exhaustion layers.', optimization: 'enabled' },
      scannerWeightParameter('smc', 'SMC Reversal Weight', 1.35, 'Backtestable structural layer.'),
      liveFusionParameter('whaleFlow', 'Whale Flow Weight', 0.17, 'Primary live-only exchange-flow layer.'),
      liveFusionParameter('sentiment', 'Sentiment Weight', 0.16, 'Primary live-only emotion layer.'),
      liveFusionParameter('news', 'News Shock Weight', 0.07, 'Reduces entries against unresolved event risk.'),
    ],
    sourceReferences: ['CORE-R1', 'CORE-R2', 'CORE-R10'],
    knownFailureModes: ['Address/entity classification errors.', 'Whale transfers may be operational rather than directional.', 'Capitulation can continue longer than expected.'],
    categories: ['Core 10', 'Alternative Data', 'Whale Flow', 'Mean Reversion'], componentCount: 10,
  },
  {
    strategyId: 'news-sentiment-momentum-breakout-v1', version: 1, isCore: true, coreRank: 9,
    name: 'News, Sentiment and Momentum Event Breakout',
    summary: 'Combines recency-weighted news, model sentiment, price momentum, relative volume, whale confirmation and regime filters for event-driven continuation.',
    realisticExpectation: 'Event speed and data latency are primary risks; headline direction never bypasses price/liquidity confirmation.',
    evidenceTier: ['B', 'E'], wave: 'wave2-formalized', status: 'candidate', longShort: 'BOTH', supportedIntervals: ['5m', '15m', '1h'],
    dataRequirements: ['Verified intraday candles', 'Timestamped news', 'Sentiment model provenance', 'Volume and liquidity'],
    engine: 'scanner-preset',
    scoreWeights: { obi: 1.05, qStruct: 1.10, volume: 1.30, funding: 0.65, openInterest: 0.80, atr: 1.05, microstructure: 1.15, liquidity: 1.20, smc: 0.85 },
    scannerConfigOverrides: { minEvidenceAgreement: 0.66, minConfidence: 0.80, atrExpansionThreshold: 0.006, directionBias: 'BOTH' },
    fusion: fusionBlueprint(
      { technical: 0.14, smartMoney: 0.07, orderFlow: 0.13, liquidity: 0.11, funding: 0.04, openInterest: 0.07, sentiment: 0.14, news: 0.18, whaleFlow: 0.05, regime: 0.07 },
      ['technical', 'orderFlow', 'liquidity', 'sentiment', 'news'], 0.72, 0.64,
    ),
    regimeRules: ['Use only in expanding volatility with sufficient liquidity.', 'Reject late events after abnormal price displacement.'],
    setupRules: ['News and sentiment agree with price/volume direction.', 'Order flow confirms participation.'],
    triggerRules: ['Enter after a bounded breakout/retest, not on the headline alone.'],
    riskRules: ['Event-specific size reduction and tight maximum hold.', 'No leverage escalation from sentiment confidence.'],
    exitRules: ['Exit on momentum failure, opposing flow, stop or timeout.'],
    noTradeRules: ['No trade on stale or duplicate news.', 'No trade with conflicting sentiment and price.', 'No trade in thin liquidity.'],
    parameters: [
      { key: 'minConfidence', label: 'Minimum Confidence', default: 0.80, min: 0.68, max: 0.93, step: 0.01, reason: 'Event strategies require stronger confirmation.', optimization: 'enabled' },
      scannerWeightParameter('volume', 'Volume Scanner Weight', 1.30, 'Backtestable participation layer.'),
      scannerWeightParameter('microstructure', 'Flow Scanner Weight', 1.15, 'Backtestable/proxy flow confirmation.'),
      liveFusionParameter('news', 'News Weight', 0.18, 'Primary live-only event layer.'),
      liveFusionParameter('sentiment', 'Sentiment Weight', 0.14, 'Model sentiment remains bounded by price confirmation.'),
    ],
    sourceReferences: ['CORE-R3', 'CORE-R7', 'CORE-R10'],
    knownFailureModes: ['Headline latency and revisions.', 'Narrative overreaction.', 'Source duplication.', 'Adverse selection immediately after events.'],
    categories: ['Core 10', 'Event Driven', 'Sentiment', 'Breakout'], componentCount: 10,
  },
  {
    strategyId: 'regime-routed-ai-ensemble-v1', version: 2, isCore: true, coreRank: 10,
    name: 'Regime-Routed Deterministic AI Ensemble',
    summary: 'A bounded router chooses among trend, squeeze, breakout and pullback agents, while live sentiment/news/whale layers alter confidence but cannot invent trades.',
    realisticExpectation: 'The router is a research candidate, not an autonomous profit guarantee; each child agent remains independently auditable.',
    evidenceTier: ['A', 'B', 'E'], wave: 'wave4-ai-research', status: 'candidate', longShort: 'BOTH', supportedIntervals: ['15m', '1h', '4h', '1d'],
    dataRequirements: ['Verified candles', 'At least four deterministic child agents', 'Alternative-data provenance for full fusion'],
    engine: 'bespoke', runFn: 'regimeRoutedComposite',
    fusion: fusionBlueprint(
      { technical: 0.14, smartMoney: 0.10, orderFlow: 0.10, liquidity: 0.10, funding: 0.07, openInterest: 0.07, sentiment: 0.10, news: 0.07, whaleFlow: 0.10, regime: 0.15 },
      ['technical', 'liquidity', 'regime'], 0.58, 0.58,
    ),
    regimeRules: ['Route trending regimes to trend/pullback agents.', 'Route compression to squeeze expansion.', 'Route high-participation session breaks to ORB.', 'Use reversal only when structure and exhaustion agree.'],
    setupRules: ['Child agents remain deterministic and independently testable.', 'Router weights are bounded and versioned.'],
    triggerRules: ['The router may select or abstain; it cannot create a signal outside child-agent rules.'],
    riskRules: ['Canonical governor remains authoritative.', 'One child position at a time.', 'Automatic promotion requires untouched holdout and neighbor stability.'],
    exitRules: ['Delegated to the selected deterministic child agent.'],
    noTradeRules: ['No route when regime confidence is weak.', 'No route to a child lacking required data.', 'No AI override of risk/no-trade rules.', 'No AI-derived overlay is promoted without independently bound verification evidence.'],
    parameters: [
      { key: 'trendWeight', label: 'Trend Agent Weight', default: 1, min: 0.4, max: 2, step: 0.05, reason: 'Bounds trend-agent preference.', optimization: 'enabled' },
      { key: 'squeezeWeight', label: 'Squeeze Agent Weight', default: 1, min: 0.4, max: 2, step: 0.05, reason: 'Bounds compression-agent preference.', optimization: 'enabled' },
      { key: 'breakoutWeight', label: 'Breakout Agent Weight', default: 1, min: 0.4, max: 2, step: 0.05, reason: 'Bounds event/session breakout preference.', optimization: 'enabled' },
      { key: 'pullbackWeight', label: 'Pullback Agent Weight', default: 1, min: 0.4, max: 2, step: 0.05, reason: 'Bounds continuation-agent preference.', optimization: 'enabled' },
      liveFusionParameter('sentiment', 'Sentiment Router Weight', 0.10, 'A live confidence overlay, not a child strategy.'),
      liveFusionParameter('whaleFlow', 'Whale Router Weight', 0.10, 'A live confidence overlay with provenance.'),
    ],
    sourceReferences: ['CORE-R3', 'CORE-R4', 'CORE-R11'],
    knownFailureModes: ['Regime misclassification.', 'Router overfitting.', 'Child-agent correlation.', 'Alternative-data leakage.'],
    categories: ['Core 10', 'AI Research', 'Composite', 'Regime'], componentCount: 10,
  },

  // Preserved research models. They remain outside the fixed Core 10 until their
  // data/execution prerequisites exist; no candle proxy is allowed to make them
  // look production-ready.
  {
    strategyId: 'dynamic-cointegration-basket-v1', version: 1,
    name: 'Dynamic Cointegration Basket', summary: 'Builds a market-neutral basket from rolling cointegration, OU half-life, z-score and execution filters.',
    evidenceTier: ['A', 'B'], wave: 'wave2-formalized', status: 'blocked', longShort: 'BOTH', supportedIntervals: ['1h', '4h', '1d'],
    dataRequirements: ['Synchronized multi-symbol candles', 'Level-1 bid/ask'], engine: 'bespoke', runFn: 'dynamicCointegrationBasket',
    regimeRules: ['Only trade stable rolling cointegration.'], setupRules: ['Require bounded half-life and executable spread.'], triggerRules: ['Enter on z-score threshold.'], riskRules: ['Basket-neutral exposure and leg-risk limit.'], exitRules: ['Mean-reversion exit or cointegration break.'], noTradeRules: ['No trade without bid/ask data.'], parameters: [],
    sourceReferences: ['R17', 'R18'], knownFailureModes: ['Cointegration breakdown.', 'Legging and fill risk.', 'Universe selection bias.'], categories: ['Research', 'Mean Reversion'], componentCount: 5, blockedReason: 'Level-1 bid/ask history is not currently available in the backtest data contract.',
  },
  {
    strategyId: 'l2-liquidity-state-scalper-v1', version: 1,
    name: 'L2 Order-Flow Liquidity-State Scalper', summary: 'Uses full-depth order-book state and trade prints for short-horizon liquidity decisions.',
    evidenceTier: ['A', 'B'], wave: 'wave3-microstructure', status: 'blocked', longShort: 'BOTH', supportedIntervals: ['1m', '3m', '5m'],
    dataRequirements: ['Full L2 order book', 'Trade prints', 'Latency stamps'], engine: 'bespoke', runFn: 'l2LiquidityStateScalper',
    regimeRules: ['Requires live L2 state.'], setupRules: ['Pending historical L2 infrastructure.'], triggerRules: ['Pending historical L2 infrastructure.'], riskRules: ['Latency-aware inventory cap.'], exitRules: ['Microstructure exit.'], noTradeRules: ['Never proxy L2 with candles.'], parameters: [],
    sourceReferences: ['CORE-R11'], knownFailureModes: ['Queue-position uncertainty.', 'Latency and adverse selection.'], categories: ['Research', 'Microstructure', 'Scalping'], componentCount: 6, blockedReason: 'Blocked until APEX has a full L2 historical data source.',
  },
  {
    strategyId: 'cross-exchange-market-making-v1', version: 1,
    name: 'Cross-Exchange Market Making', summary: 'Quotes on one venue and hedges inventory on another under strict execution safety.',
    evidenceTier: ['A', 'B'], wave: 'wave3-microstructure', status: 'blocked', longShort: 'BOTH', supportedIntervals: ['1m'],
    dataRequirements: ['Two live exchanges', 'Order acknowledgements', 'Fill and latency simulator'], engine: 'bespoke', runFn: 'crossExchangeMarketMaking',
    regimeRules: ['Operational strategy, not candle-only.'], setupRules: ['Pending infrastructure.'], triggerRules: ['Pending infrastructure.'], riskRules: ['Hard inventory and venue caps.'], exitRules: ['Immediate hedge or cancel.'], noTradeRules: ['No quoting without a verified hedge path.'], parameters: [],
    sourceReferences: ['R20'], knownFailureModes: ['Venue outage.', 'Hedge slippage.', 'Inventory accumulation.'], categories: ['Research', 'Market Making'], componentCount: 7, blockedReason: 'Requires two verified live exchange connections and fill/latency simulation.',
  },
  {
    strategyId: 'funding-aware-avellaneda-mm-v1', version: 1,
    name: 'Funding-Aware Avellaneda Market Maker', summary: 'Extends inventory-aware market making with funding and basis state.',
    evidenceTier: ['A', 'B'], wave: 'wave3-microstructure', status: 'blocked', longShort: 'BOTH', supportedIntervals: ['1m'],
    dataRequirements: ['Order book', 'Fill model', 'Funding stream'], engine: 'bespoke', runFn: 'fundingAwareAvellaneda',
    regimeRules: ['Pending market-making infrastructure.'], setupRules: ['Pending infrastructure.'], triggerRules: ['Pending infrastructure.'], riskRules: ['Inventory, funding and venue caps.'], exitRules: ['Quote skew and hedge.'], noTradeRules: ['No simulation with candles alone.'], parameters: [],
    sourceReferences: ['R21'], knownFailureModes: ['Model misspecification.', 'Queue and fill uncertainty.', 'Funding jumps.'], categories: ['Research', 'Market Making'], componentCount: 7, blockedReason: 'Requires production-grade order-book and fill simulation.',
  },
];

/**
 * Strategy-to-Liquidity-Hunter context policy. These bindings are metadata only:
 * every binding is optional and SHADOW_ONLY, so unavailable edge data cannot
 * disable or authorize any existing strategy. Edges remain evidence sources and
 * are never registered as executable strategies.
 */
export const STRATEGY_LIQUIDITY_HUNTER_EDGE_MAP: Readonly<Record<string, readonly StrategyLiquidityHunterEdgeBinding[]>> = {
  'crypto-multi-alpha-ls-v1': [
    { edgeId: 'FUNDING_OI', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds perpetual crowding context without replacing the scanner decision.' },
    { edgeId: 'SESSION_LIQUIDITY', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds kill-zone and liquidity-location context.' },
    { edgeId: 'SENTIMENT_VELOCITY', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds bounded sentiment acceleration context when configured.' },
    { edgeId: 'WHALE_POSITIONING', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds verified graded-wallet positioning context when available.' },
  ],
  'adaptive-long-short-trend-portfolio-v1': [
    { edgeId: 'OPTIONS_GAMMA', role: 'REGIME_FILTER', required: false, authority: 'SHADOW_ONLY', rationale: 'Gamma regime can contextualize trend amplification or pinning.' },
    { edgeId: 'FUNDING_OI', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds crowding and open-interest confirmation.' },
    { edgeId: 'SESSION_LIQUIDITY', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds session-aware liquidity context.' },
  ],
  'funding-basis-carry-v1': [
    { edgeId: 'FUNDING_OI', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Provides the native funding/crowding evidence layer for research comparison.' },
    { edgeId: 'SESSION_LIQUIDITY', role: 'EXECUTION_QUALITY_FILTER', required: false, authority: 'SHADOW_ONLY', rationale: 'Flags poor session liquidity without controlling execution.' },
  ],
  'opening-range-vwap-rvol-breakout-v1': [
    { edgeId: 'SESSION_LIQUIDITY', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Opening-range logic benefits from explicit session liquidity context.' },
    { edgeId: 'OPTIONS_GAMMA', role: 'REGIME_FILTER', required: false, authority: 'SHADOW_ONLY', rationale: 'Gamma regime contextualizes breakout expansion versus pinning risk.' },
    { edgeId: 'MULTI_EXCHANGE_CVD', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds real cross-venue aggression confirmation when available.' },
  ],
  'volatility-squeeze-trend-volume-expansion-v1': [
    { edgeId: 'OPTIONS_GAMMA', role: 'REGIME_FILTER', required: false, authority: 'SHADOW_ONLY', rationale: 'Gamma regime can distinguish expansion-friendly from pinning conditions.' },
    { edgeId: 'FUNDING_OI', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds crowding and participation expansion context.' },
    { edgeId: 'MULTI_EXCHANGE_CVD', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds cross-venue directional participation evidence.' },
  ],
  'multi-timeframe-vwap-pullback-reacceleration-v1': [
    { edgeId: 'SESSION_LIQUIDITY', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds session and liquidity-pool location context.' },
    { edgeId: 'MULTI_EXCHANGE_CVD', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds reacceleration confirmation from aggressive flow.' },
    { edgeId: 'ICEBERG_ABSORPTION', role: 'EXECUTION_QUALITY_FILTER', required: false, authority: 'SHADOW_ONLY', rationale: 'Flags absorption around pullback levels without controlling orders.' },
  ],
  'liquidity-sweep-fvg-reversal-v1': [
    { edgeId: 'LIQUIDATION_TOPOLOGY', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds liquidation-cluster context around sweep targets.' },
    { edgeId: 'SESSION_LIQUIDITY', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds deterministic liquidity-location and session context.' },
    { edgeId: 'MULTI_EXCHANGE_CVD', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds post-sweep aggression/reclaim confirmation.' },
    { edgeId: 'ICEBERG_ABSORPTION', role: 'EXECUTION_QUALITY_FILTER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds absorption evidence near the reversal location.' },
  ],
  'whale-flow-sentiment-reversal-v1': [
    { edgeId: 'WHALE_POSITIONING', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds internally graded wallet positioning when sufficient history exists.' },
    { edgeId: 'CONTRARIAN_WALLETS', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds statistically persistent contrarian-wallet context without asserting identity.' },
    { edgeId: 'SENTIMENT_VELOCITY', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds credibility-gated sentiment acceleration context.' },
    { edgeId: 'FUNDING_OI', role: 'REGIME_FILTER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds crowding context around capitulation/reversal conditions.' },
  ],
  'news-sentiment-momentum-breakout-v1': [
    { edgeId: 'SENTIMENT_VELOCITY', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds normalized sentiment acceleration alongside the existing event strategy inputs.' },
    { edgeId: 'MULTI_EXCHANGE_CVD', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds cross-venue participation confirmation after an event breakout.' },
    { edgeId: 'SESSION_LIQUIDITY', role: 'EXECUTION_QUALITY_FILTER', required: false, authority: 'SHADOW_ONLY', rationale: 'Flags thin or poorly timed liquidity conditions without controlling orders.' },
  ],
  'regime-routed-ai-ensemble-v1': [
    { edgeId: 'OPTIONS_GAMMA', role: 'REGIME_FILTER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds options-derived pin/amplification context to the deterministic router.' },
    { edgeId: 'FUNDING_OI', role: 'REGIME_FILTER', required: false, authority: 'SHADOW_ONLY', rationale: 'Adds derivatives crowding context to regime classification.' },
    { edgeId: 'META_MODEL', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Historical-similarity output remains a shadow validator and cannot create a child-agent signal.' },
  ],
  'l2-liquidity-state-scalper-v1': [
    { edgeId: 'MULTI_EXCHANGE_CVD', role: 'ENHANCER', required: false, authority: 'SHADOW_ONLY', rationale: 'Research-only cross-venue aggression context; strategy remains blocked until its historical L2 prerequisite exists.' },
    { edgeId: 'ICEBERG_ABSORPTION', role: 'EXECUTION_QUALITY_FILTER', required: false, authority: 'SHADOW_ONLY', rationale: 'Research-only absorption context; it does not unblock the strategy.' },
  ],
};

for (const definition of strategyDefinitions) {
  const bindings = STRATEGY_LIQUIDITY_HUNTER_EDGE_MAP[definition.strategyId];
  if (bindings?.length) definition.liquidityHunterEdges = bindings.map((binding) => ({ ...binding }));
}


const allDefinitions = [baselineStrategyDefinition, ...strategyDefinitions];
const byId = new Map(allDefinitions.map((definition) => [definition.strategyId, definition]));

export function getStrategyDefinition(strategyId: string): StrategyDefinition | undefined {
  return byId.get(strategyId);
}

export function listStrategyDefinitions(options: { includeBaseline?: boolean; coreOnly?: boolean } = {}): StrategyDefinition[] {
  const source = options.includeBaseline ? allDefinitions : strategyDefinitions;
  return source.filter((definition) => !options.coreOnly || definition.isCore === true).map(cloneDefinition);
}

export function listCoreStrategyDefinitions(): StrategyDefinition[] {
  return strategyDefinitions
    .filter((definition) => definition.isCore === true)
    .sort((left, right) => Number(left.coreRank || 999) - Number(right.coreRank || 999))
    .map(cloneDefinition);
}

export function clientSafeStrategy(definition: StrategyDefinition): StrategyDefinition {
  const copy = cloneDefinition(definition);
  delete copy.runFn;
  return copy;
}

export function listClientSafeStrategies(options: { includeBaseline?: boolean; coreOnly?: boolean } = {}): StrategyDefinition[] {
  return listStrategyDefinitions(options).map(clientSafeStrategy);
}

function cloneDefinition(definition: StrategyDefinition): StrategyDefinition {
  return JSON.parse(JSON.stringify(definition)) as StrategyDefinition;
}


export interface StrategyValidationCapability {
  scope: 'BASE_REPLAY' | 'FULL_STRATEGY';
  limitations: string[];
}

/**
 * Describes what the current historical validation suite can truthfully prove
 * for a strategy definition. This never changes execution or promotion logic;
 * it only prevents candle/proxy evidence from being labelled as full-strategy
 * validation when required semantics depend on unavailable historical inputs.
 */
export function strategyValidationCapability(definition: StrategyDefinition): StrategyValidationCapability {
  const limitations: string[] = [];
  if (definition.runFn === 'adaptiveTrendPortfolio') {
    limitations.push('Cross-asset promotion requires a versioned synchronized multi-symbol universe identity; the validation suite currently replays a pinned primary-symbol subject.');
  }
  const liveOnly = definition.fusion?.components
    .filter((component) => component.weight > 0 && component.dataMode === 'LIVE_ONLY')
    .map((component) => component.label) ?? [];
  if (liveOnly.length) {
    limitations.push(`Historical validation does not bind timestamp-aligned LIVE_ONLY fusion evidence: ${liveOnly.join(', ')}.`);
  }
  return {
    scope: limitations.length ? 'BASE_REPLAY' : 'FULL_STRATEGY',
    limitations,
  };
}
