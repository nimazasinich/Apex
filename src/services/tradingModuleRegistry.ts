export type TradingModuleRole = 'LIVE' | 'SHADOW' | 'REPLAY' | 'SHARED' | 'OFFLINE_ANALYTICS' | 'STRESS_ONLY' | 'PLANNED' | 'DEPRECATED';

export interface TradingModuleRegistration {
  module: string;
  roles: TradingModuleRole[];
  consumers: string[];
  inputs: string[];
  authoritative: boolean;
  notes: string;
}

/**
 * Explicit operational classification. Presence in the repository must never
 * be presented as proof that a capability is active in live trading.
 */
export const TRADING_MODULE_REGISTRY: readonly TradingModuleRegistration[] = [
  {
    module: 'src/lib/scoring.ts', roles: ['LIVE', 'REPLAY'], consumers: ['canonicalDecisionAdapter'],
    inputs: ['1h candles', 'independent 15m candles', 'ticker', 'order-book summary'], authoritative: true,
    notes: 'Current baseline ranking and guard engine. Missing/estimated evidence is quality-weighted and never silently neutral.',
  },
  {
    module: 'src/services/scannerCore.ts', roles: ['SHADOW', 'REPLAY'], consumers: ['canonicalDecisionAdapter'],
    inputs: ['OBI', 'signed volume delta', 'QStruct', 'ATR', 'spread', 'micro-price', 'funding', 'OI', 'SMC'], authoritative: false,
    notes: 'Advanced ATLAS-style evaluation. It remains shadow-only for live decisions until an audited promotion is approved.',
  },
  {
    module: 'src/services/canonicalDecisionAdapter.ts', roles: ['LIVE', 'REPLAY', 'SHARED'], consumers: ['market routes', 'proxy replay', 'production-input replay'],
    inputs: ['baseline scoring context', 'advanced recorded/live context'], authoritative: true,
    notes: 'Single normalized decision entry point. Baseline remains the live authority; advanced output is retained for parity analysis.',
  },
  {
    module: 'src/services/smartMoneyContextAdapter.ts', roles: ['SHADOW', 'REPLAY', 'SHARED'], consumers: ['canonicalDecisionAdapter'],
    inputs: ['1m', '5m', '15m', '4h closed candles'], authoritative: false,
    notes: 'Explicit availability states prevent missing SMC from appearing as neutral evidence.',
  },
  {
    module: 'src/services/directionDivergenceAnalysis.ts', roles: ['OFFLINE_ANALYTICS'], consumers: ['analysis utilities/tests'],
    inputs: ['persisted decision logs'], authoritative: false,
    notes: 'Not connected to live or replay execution gates.',
  },
  {
    module: 'src/services/adaptiveThresholdEngine.ts', roles: ['STRESS_ONLY', 'OFFLINE_ANALYTICS'], consumers: ['adaptive learning stress utility'],
    inputs: ['persisted resolved decision outcomes'], authoritative: false,
    notes: 'Produces bounded proposals and audit records; it does not silently alter live thresholds.',
  },
  {
    module: 'src/services/adaptiveThresholdGovernance.ts', roles: ['LIVE', 'OFFLINE_ANALYTICS', 'SHARED'], consumers: ['market route scanner-config provider', 'operations API'],
    inputs: ['active scanner revision', 'adaptive proposal', 'resolved decision outcomes'], authoritative: true,
    notes: 'Only authenticated manual promotion can activate an evidence-eligible proposal; all revisions are persistent and rollback-capable.',
  },
  {
    module: 'MathEngine.detectStructuralZones', roles: ['PLANNED'], consumers: [],
    inputs: ['candlestick history'], authoritative: false,
    notes: 'Implemented utility with no operational consumer. It is not advertised as an active live capability.',
  },
  {
    module: 'src/services/mlFeatureExtractor.ts', roles: ['SHADOW', 'OFFLINE_ANALYTICS'], consumers: ['dataset export', 'shadow training', 'ML governance'],
    inputs: ['versioned SignalDecisionLog'], authoritative: false,
    notes: 'Frozen feature contract with completeness and leakage checks. ML cannot directly authorize a trade.',
  },
  {
    module: 'src/services/tradePlan.ts', roles: ['LIVE', 'REPLAY', 'SHARED'], consumers: ['symbol detail', 'order ticket', 'Risk Governor', 'demo/live execution preview', 'canonical replay'],
    inputs: ['canonical decision reference', 'levels', 'sizing', 'cost-quality inputs'], authoritative: true,
    notes: 'The same validated object is displayed, risk-reviewed and submitted.',
  },
  {
    module: 'src/services/riskGovernor.ts', roles: ['LIVE', 'SHARED'], consumers: ['demo', 'live exchange', 'manual testnet', 'canonical replay'],
    inputs: ['order intent', 'account', 'portfolio', 'market/reconciliation state', 'Trade Plan'], authoritative: true,
    notes: 'Central fail-closed policy for critical data and explicit kill switches.',
  },
] as const;

export function getTradingModuleRegistry(): readonly TradingModuleRegistration[] {
  return TRADING_MODULE_REGISTRY;
}
