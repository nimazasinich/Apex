/**
 * ML Feature Extractor (v1, 100-feature contract)
 *
 * Auditable, deterministic extraction for shadow-only modelling. Feature names
 * are frozen to the historical dataset contract. Missing numeric/boolean inputs
 * are reported and the row is excluded rather than silently imputed.
 */
import type {
  ScannerConfig,
  SignalDecisionLog,
  SmartMoneyContext,
  SmartMoneyControlSide,
  SmartMoneySetupModel,
} from '../types';

export const ML_FEATURE_VERSION = 'ml_features_v1' as const;

export const ML_FEATURE_NAMES = [
  'log.confidence',
  'log.rawScore',
  'log.qStructDirectional',
  'log.squeezeRiskScore',
  'log.evidenceAgreementScore',
  'log.liquidityQualityScore',
  'log.microPriceSkewScore',
  'log.fundingBiasScore',
  'log.oiChangePercent',
  'log.atrExpansionScore',
  'log.smcDirectionalScore',
  'log.smcContextScore',
  'scoringBreakdown.obi',
  'scoringBreakdown.qStruct',
  'scoringBreakdown.volume',
  'scoringBreakdown.funding',
  'scoringBreakdown.openInterest',
  'scoringBreakdown.atr',
  'scoringBreakdown.microstructure',
  'scoringBreakdown.liquidity',
  'scoringBreakdown.smc',
  'scoringBreakdown.weightedSum',
  'scoringBreakdown.totalWeight',
  'smartMoneyContext.smcDirectionalScore',
  'smartMoneyContext.smcContextScore',
  'smartMoneyContext.smartMoneyBiasScore',
  'smartMoneyContext.flipSetupScore',
  'smartMoneyContext.chochSetupScore',
  'smartMoneyContext.continuationScore',
  'smartMoneyContext.ifcQualityScore',
  'smartMoneyContext.liquiditySweepScore',
  'smartMoneyContext.zoneFreshnessScore',
  'smartMoneyContext.unmitigatedZoneProximity',
  'smartMoneyContext.htfSupplyInControl',
  'smartMoneyContext.htfDemandInControl',
  'smartMoneyContext.setupModel.FLIP',
  'smartMoneyContext.setupModel.CHOCH',
  'smartMoneyContext.setupModel.CONTINUATION',
  'smartMoneyContext.setupModel.LIQUIDITY_SWEEP_REVERSAL',
  'smartMoneyContext.setupModel.NONE',
  'smartMoneyContext.controlSide.SUPPLY',
  'smartMoneyContext.controlSide.DEMAND',
  'smartMoneyContext.controlSide.NEUTRAL',
  'gatesSnapshot.shortObi',
  'gatesSnapshot.shortVolume',
  'gatesSnapshot.shortQStruct',
  'gatesSnapshot.longObi',
  'gatesSnapshot.longVolume',
  'gatesSnapshot.longQStruct',
  'gatesSnapshot.obiThreshold',
  'gatesSnapshot.volumeThreshold',
  'gatesSnapshot.qStructThreshold',
  'gatesSnapshot.smoothedObi',
  'gatesSnapshot.smoothedVolDelta',
  'gatesSnapshot.qStructDirectional',
  'configSnapshot.intervalMs',
  'configSnapshot.obiThreshold',
  'configSnapshot.volumeThreshold',
  'configSnapshot.qStructThreshold',
  'configSnapshot.fundingThreshold',
  'configSnapshot.oiExpansionThresholdPct',
  'configSnapshot.atrExpansionThreshold',
  'configSnapshot.maxSqueezeRisk',
  'configSnapshot.minEvidenceAgreement',
  'configSnapshot.minSmartMoneyScore',
  'configSnapshot.smcHardRejectThreshold',
  'configSnapshot.adaptiveLearningRate',
  'configSnapshot.adaptiveMinSamples',
  'configSnapshot.minConfidence',
  'configSnapshot.topRankSkip',
  'configSnapshot.minVolume24hUsd',
  'configSnapshot.scoreWeights.obi',
  'configSnapshot.scoreWeights.qStruct',
  'configSnapshot.scoreWeights.volume',
  'configSnapshot.scoreWeights.funding',
  'configSnapshot.scoreWeights.openInterest',
  'configSnapshot.scoreWeights.atr',
  'configSnapshot.scoreWeights.microstructure',
  'configSnapshot.scoreWeights.liquidity',
  'configSnapshot.scoreWeights.smc',
  'configSnapshot.thresholdMode.MANUAL',
  'configSnapshot.thresholdMode.ADAPTIVE',
  'configSnapshot.thresholdMode.ADAPTIVE_GUARDRAILS',
  'configSnapshot.directionBias.SHORT_ONLY',
  'configSnapshot.directionBias.BOTH',
  'configSnapshot.scorePreset.ATLAS_PROPOSAL',
  'configSnapshot.scorePreset.ATLAS_PLUS_V2',
  'configSnapshot.scorePreset.CUSTOM',
  'marketSnapshotSummary.price',
  'marketSnapshotSummary.obi',
  'marketSnapshotSummary.netVolumeDelta',
  'marketSnapshotSummary.fundingRate',
  'marketSnapshotSummary.longShortRatio',
  'marketSnapshotSummary.takerBuySellRatio',
  'marketSnapshotSummary.spread',
  'marketSnapshotSummary.atr',
  'marketSnapshotSummary.dataSource.kucoin_live',
  'marketSnapshotSummary.dataSource.kucoin_plus_binance_live',
  'marketSnapshotSummary.dataSource.kucoin_live_binance_unavailable',
  'marketSnapshotSummary.dataSource.unavailable',
] as const;

export type MlFeatureName = (typeof ML_FEATURE_NAMES)[number];

export interface MlFeatureVector {
  version: typeof ML_FEATURE_VERSION;
  names: readonly MlFeatureName[];
  values: number[];
  features: Record<MlFeatureName, number>;
}

export interface MlFeatureCompleteness {
  complete: boolean;
  missing: MlFeatureName[];
  presentCount: number;
  totalCount: number;
  completenessRatio: number;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function bool(value: unknown): number | undefined {
  return typeof value === 'boolean' ? (value ? 1 : 0) : undefined;
}

function oneHot<T extends string>(
  value: unknown,
  expected: T,
  allowed: readonly T[],
): number | undefined {
  if (typeof value !== 'string' || !allowed.includes(value as T)) return undefined;
  return value === expected ? 1 : 0;
}

const SMC_SETUP_MODELS = ['FLIP', 'CHOCH', 'CONTINUATION', 'LIQUIDITY_SWEEP_REVERSAL', 'NONE'] as const satisfies readonly SmartMoneySetupModel[];
const SMC_CONTROL_SIDES = ['SUPPLY', 'DEMAND', 'NEUTRAL'] as const satisfies readonly SmartMoneyControlSide[];
const THRESHOLD_MODES = ['MANUAL', 'ADAPTIVE', 'ADAPTIVE_GUARDRAILS'] as const satisfies readonly ScannerConfig['thresholdMode'][];
const DIRECTION_BIASES = ['SHORT_ONLY', 'LONG_ONLY', 'BOTH'] as const satisfies readonly ScannerConfig['directionBias'][];
const SCORE_PRESETS = ['ATLAS_PROPOSAL', 'ATLAS_PLUS_V2', 'CUSTOM'] as const satisfies readonly NonNullable<ScannerConfig['scorePreset']>[];
const MARKET_DATA_SOURCES = [
  'kucoin_live',
  'kucoin_plus_binance_live',
  'kucoin_live_binance_unavailable',
  'unavailable',
] as const;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function numericField(source: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = source?.[key];
  return finite(value) ? value : undefined;
}

interface FeatureReadContext {
  scoring: Record<string, unknown> | undefined;
  smc: SmartMoneyContext | undefined;
  gates: Record<string, unknown> | undefined;
  cfg: ScannerConfig | undefined;
  weights: ScannerConfig['scoreWeights'] | undefined;
  market: Record<string, unknown> | undefined;
  topLevel: Partial<Record<MlFeatureName, unknown>>;
}

function createFeatureReadContext(log: SignalDecisionLog): FeatureReadContext {
  const cfg = log.configSnapshot as ScannerConfig | undefined;
  return {
    scoring: record(log.scoringBreakdown),
    smc: log.smartMoneyContext as SmartMoneyContext | undefined,
    gates: record(log.gatesSnapshot),
    cfg,
    weights: cfg?.scoreWeights,
    market: record(log.marketSnapshotSummary),
    topLevel: {
      'log.confidence': log.confidence,
      'log.rawScore': log.rawScore,
      'log.qStructDirectional': log.qStructDirectional,
      'log.squeezeRiskScore': log.squeezeRiskScore,
      'log.evidenceAgreementScore': log.evidenceAgreementScore,
      'log.liquidityQualityScore': log.liquidityQualityScore,
      'log.microPriceSkewScore': log.microPriceSkewScore,
      'log.fundingBiasScore': log.fundingBiasScore,
      'log.oiChangePercent': log.oiChangePercent,
      'log.atrExpansionScore': log.atrExpansionScore,
      'log.smcDirectionalScore': log.smcDirectionalScore,
      'log.smcContextScore': log.smcContextScore,
    },
  };
}

function featureValue(name: MlFeatureName, context: FeatureReadContext): number | undefined {
  const { scoring, smc, gates, cfg, weights, market, topLevel } = context;
  if (name in topLevel) {
    const value = topLevel[name];
    return finite(value) ? value : undefined;
  }

  if (name.startsWith('scoringBreakdown.')) {
    return numericField(scoring, name.slice('scoringBreakdown.'.length));
  }

  if (name.startsWith('smartMoneyContext.setupModel.')) {
    const expected = name.slice('smartMoneyContext.setupModel.'.length) as SmartMoneySetupModel;
    return oneHot(smc?.setupModel, expected, SMC_SETUP_MODELS);
  }
  if (name.startsWith('smartMoneyContext.controlSide.')) {
    const expected = name.slice('smartMoneyContext.controlSide.'.length) as SmartMoneyControlSide;
    return oneHot(smc?.controlSide, expected, SMC_CONTROL_SIDES);
  }
  if (name === 'smartMoneyContext.htfSupplyInControl') return bool(smc?.htfSupplyInControl);
  if (name === 'smartMoneyContext.htfDemandInControl') return bool(smc?.htfDemandInControl);
  if (name.startsWith('smartMoneyContext.')) {
    const key = name.slice('smartMoneyContext.'.length) as keyof SmartMoneyContext;
    const value = smc?.[key];
    return finite(value) ? value : undefined;
  }

  if (name.startsWith('gatesSnapshot.')) {
    const key = name.slice('gatesSnapshot.'.length);
    const value = gates?.[key];
    return typeof value === 'boolean' ? (value ? 1 : 0) : finite(value) ? value : undefined;
  }

  if (name.startsWith('configSnapshot.thresholdMode.')) {
    const expected = name.slice('configSnapshot.thresholdMode.'.length) as ScannerConfig['thresholdMode'];
    return oneHot(cfg?.thresholdMode, expected, THRESHOLD_MODES);
  }
  if (name.startsWith('configSnapshot.directionBias.')) {
    const expected = name.slice('configSnapshot.directionBias.'.length) as ScannerConfig['directionBias'];
    return oneHot(cfg?.directionBias, expected, DIRECTION_BIASES);
  }
  if (name.startsWith('configSnapshot.scorePreset.')) {
    const expected = name.slice('configSnapshot.scorePreset.'.length) as NonNullable<ScannerConfig['scorePreset']>;
    const actual = cfg ? (cfg.scorePreset ?? 'CUSTOM') : undefined;
    return oneHot(actual, expected, SCORE_PRESETS);
  }
  if (name.startsWith('configSnapshot.scoreWeights.')) {
    const key = name.slice('configSnapshot.scoreWeights.'.length) as keyof NonNullable<ScannerConfig['scoreWeights']>;
    const value = weights?.[key];
    return finite(value) ? value : undefined;
  }
  if (name.startsWith('configSnapshot.')) {
    const key = name.slice('configSnapshot.'.length) as keyof ScannerConfig;
    const value = cfg?.[key];
    return finite(value) ? value : undefined;
  }

  if (name.startsWith('marketSnapshotSummary.dataSource.')) {
    const expected = name.slice('marketSnapshotSummary.dataSource.'.length);
    const source = market?.dataSource;
    if (typeof source !== 'string' || !MARKET_DATA_SOURCES.includes(source as typeof MARKET_DATA_SOURCES[number])) return undefined;
    return source === expected ? 1 : 0;
  }
  if (name.startsWith('marketSnapshotSummary.')) {
    return numericField(market, name.slice('marketSnapshotSummary.'.length));
  }

  return undefined;
}

export interface FeatureScanResult {
  completeness: MlFeatureCompleteness;
  vector: MlFeatureVector | null;
}

function scanFeatures(log: SignalDecisionLog, buildVector: boolean): FeatureScanResult {
  const context = createFeatureReadContext(log);
  const missing: MlFeatureName[] = [];
  const values: number[] = [];
  const features = buildVector ? {} as Record<MlFeatureName, number> : null;
  for (const name of ML_FEATURE_NAMES) {
    const value = featureValue(name, context);
    if (value === undefined) {
      missing.push(name);
      continue;
    }
    if (buildVector) {
      features![name] = value;
      values.push(value);
    }
  }
  const presentCount = ML_FEATURE_NAMES.length - missing.length;
  const completeness: MlFeatureCompleteness = {
    complete: missing.length === 0,
    missing,
    presentCount,
    totalCount: ML_FEATURE_NAMES.length,
    completenessRatio: presentCount / ML_FEATURE_NAMES.length,
  };
  return {
    completeness,
    vector: buildVector && completeness.complete
      ? { version: ML_FEATURE_VERSION, names: ML_FEATURE_NAMES, values, features: features! }
      : null,
  };
}

export function inspectMlFeatureCompleteness(log: SignalDecisionLog): MlFeatureCompleteness {
  return scanFeatures(log, false).completeness;
}

export function extractFeatures(log: SignalDecisionLog): MlFeatureVector | null {
  return scanFeatures(log, true).vector;
}

export function extractFeaturesWithCompleteness(log: SignalDecisionLog): FeatureScanResult {
  return scanFeatures(log, true);
}

/** Exposed for diagnostics/tests; never use labels or decision outputs as features. */
export function isLeakageExcludedFeature(name: string): boolean {
  return ['laterOutcome', 'laterPnl', 'decision', 'reasonCode', 'reasonText', 'id', 'cycleId']
    .some((blocked) => name === blocked || name.endsWith(`.${blocked}`));
}


export interface SmcFeatureDuplicationAudit {
  state: 'MATCH' | 'DIVERGENT' | 'MISSING';
  logValue: number | null;
  contextValue: number | null;
  absoluteDifference: number | null;
  interpretation: string;
}

/**
 * The historical schema contains SMC direction through both the log and the
 * context path. Keep both for compatibility, but make their relationship
 * explicit so drift or accidental duplication is auditable.
 */
export function auditSmcFeatureDuplication(log: SignalDecisionLog): SmcFeatureDuplicationAudit {
  const logValue = finite(log.smcDirectionalScore) ? log.smcDirectionalScore : null;
  const contextValue = finite(log.smartMoneyContext?.smcDirectionalScore)
    ? log.smartMoneyContext!.smcDirectionalScore
    : null;
  if (logValue == null || contextValue == null) {
    return { state: 'MISSING', logValue, contextValue, absoluteDifference: null, interpretation: 'One or both SMC paths are unavailable.' };
  }
  const absoluteDifference = Math.abs(logValue - contextValue);
  return {
    state: absoluteDifference <= 1e-9 ? 'MATCH' : 'DIVERGENT',
    logValue,
    contextValue,
    absoluteDifference,
    interpretation: absoluteDifference <= 1e-9
      ? 'Both schema fields currently represent the same derived SMC directional score.'
      : 'The log and context SMC paths differ and must not be treated as interchangeable.',
  };
}
