import type { TradeDirection } from '../types';
import type { CommanderEvidenceFamily, CommanderEvidenceV1 } from '../contracts/commander/commanderEvidence';
import type { NativeParliamentSnapshotV1 } from './strategyCommander/parliamentShadow';
import type { LiveMarketRegime, LiveMarketRegimeSnapshot } from './liveMarketRegime';

export type ParliamentSignalCategory = 'ON_CHAIN' | 'TECHNICAL' | 'SENTIMENT_NEWS' | 'AI_ML';
export type ParliamentScannerMode = 'SHADOW' | 'PAPER_PROMOTED' | 'SIGNAL_PROMOTED';

export const PARLIAMENT_SCANNER_VERSION = 'parliament_scanner_contributor_v1' as const;
export const PARLIAMENT_PROMOTION_POLICY = Object.freeze({
  minimumResolvedSamples: 250,
  minimumSamplesPerRegime: 40,
  minimumWalkForwardFolds: 5,
  minimumTradesPerWalkForwardFold: 30,
  minimumProfitableFoldFraction: 0.6,
  minimumProfitableRegimes: 3,
  minimumPaperForwardSamples: 100,
  minimumCategoryConfluence: 2,
  minimumProfitFactor: 1.05,
  maximumDrawdownPct: 15,
  requirePositiveNetReturn: true,
  requireCostStressPass: true,
  requireNoMaterialVetoes: true,
  requireHumanSignalPromotion: true,
  sealedHoldoutUsesPerCandidate: 1,
});

export const PARLIAMENT_FIRST_PROMOTABLE_STREAMS = [
  'MOMENTUM', 'PRICE_ACTION', 'SMART_MONEY', 'LIQUIDITY', 'VOLATILITY', 'FUNDING_OI',
  'NEWS', 'SENTIMENT', 'WHALE',
] as const satisfies readonly CommanderEvidenceFamily[];

const FIRST_PROMOTABLE = new Set<CommanderEvidenceFamily>(PARLIAMENT_FIRST_PROMOTABLE_STREAMS);

const CATEGORY_BY_FAMILY: Partial<Record<CommanderEvidenceFamily, ParliamentSignalCategory>> = {
  MOMENTUM: 'TECHNICAL', PRICE_ACTION: 'TECHNICAL', SMART_MONEY: 'TECHNICAL', LIQUIDITY: 'TECHNICAL',
  VOLATILITY: 'TECHNICAL', FUNDING_OI: 'TECHNICAL', NEWS: 'SENTIMENT_NEWS', SENTIMENT: 'SENTIMENT_NEWS', WHALE: 'ON_CHAIN',
};

export interface ParliamentCategoryScore {
  category: ParliamentSignalCategory;
  support: number;
  opposition: number;
  availableEvidence: number;
  supportingEvidenceIds: string[];
  opposingEvidenceIds: string[];
}

export interface ParliamentScannerContribution {
  version: typeof PARLIAMENT_SCANNER_VERSION;
  mode: ParliamentScannerMode;
  shadowOnly: boolean;
  killSwitchActive: boolean;
  direction: TradeDirection;
  adaptiveThreshold: number;
  categoryConfluence: number;
  requiredCategoryConfluence: number;
  categoryScores: ParliamentCategoryScore[];
  score: number;
  confidence: number;
  consensusAligned: boolean;
  materialVetoes: string[];
  crowdingRegime: boolean;
  contributionEnabled: boolean;
  /** True when all evidence gates pass even if the current mode keeps the stream shadow/paper-only. */
  eligibleIfPromoted: boolean;
  actionable: boolean;
  reasonCode:
    | 'KILL_SWITCH'
    | 'SHADOW_ONLY'
    | 'INSUFFICIENT_CATEGORY_CONFLUENCE'
    | 'CONSENSUS_MISMATCH'
    | 'MATERIAL_VETO'
    | 'INSUFFICIENT_EVIDENCE_QUALITY'
    | 'CONTRIBUTION_ACCEPTED';
  reasons: string[];
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

function evidenceQualityMultiplier(row: CommanderEvidenceV1): number {
  if (row.valueQuality === 'VALID') return 1;
  if (row.valueQuality === 'ESTIMATED') return 0.62;
  if (row.valueQuality === 'STALE') return 0.25;
  return 0;
}

function sessionThresholdAdjustment(timestamp: number): number {
  const hour = new Date(timestamp).getUTCHours();
  // Europe/US overlap has the deepest crypto-futures liquidity. Overnight UTC
  // needs stronger evidence before a research signal is considered actionable.
  if (hour >= 13 && hour < 18) return -0.03;
  if (hour >= 7 && hour < 13) return -0.015;
  if (hour >= 18 && hour < 22) return 0.01;
  return 0.035;
}

function regimeThreshold(regime: LiveMarketRegime): number {
  if (regime === 'TREND_UP' || regime === 'TREND_DOWN') return 0.52;
  if (regime === 'HIGH_VOLATILITY') return 0.62;
  if (regime === 'RANGE') return 0.59;
  if (regime === 'TRANSITION') return 0.58;
  return 0.64;
}

function evidenceWeight(row: CommanderEvidenceV1, crowdingRegime: boolean): number {
  let weight = row.confidence * evidenceQualityMultiplier(row);
  if (row.family === 'WHALE') weight *= crowdingRegime ? 1.8 : 1.25;
  if (row.family === 'FUNDING_OI') weight *= crowdingRegime ? 1.65 : 1.2;
  if (row.family === 'LIQUIDITY' || row.family === 'SMART_MONEY') weight *= 1.1;
  return weight;
}

function isSupportingDirection(row: CommanderEvidenceV1, direction: TradeDirection): boolean {
  return row.direction === direction;
}

function isOpposingDirection(row: CommanderEvidenceV1, direction: TradeDirection): boolean {
  return row.direction === (direction === 'LONG' ? 'SHORT' : 'LONG');
}

export function resolveParliamentScannerMode(env: NodeJS.ProcessEnv = process.env): ParliamentScannerMode {
  // Environment configuration may only force a safer mode. Promotion into
  // signal authority is stateful and evidence-gated via ParliamentPromotionStore;
  // accepting SIGNAL_PROMOTED directly from an env var would bypass that gate.
  const raw = String(env.APEX_PARLIAMENT_SCANNER_MODE || 'SHADOW').trim().toUpperCase();
  return raw === 'PAPER_PROMOTED' ? 'PAPER_PROMOTED' : 'SHADOW';
}

export function parliamentScannerKillSwitch(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(1|true|yes|on)$/i.test(String(env.APEX_PARLIAMENT_SCANNER_KILL_SWITCH || 'false'));
}

export function evaluateParliamentScannerContribution(input: {
  snapshot?: NativeParliamentSnapshotV1;
  direction: TradeDirection;
  regime: LiveMarketRegimeSnapshot;
  coreModelSupport: number;
  timestamp: number;
  fundingRate?: number | null;
  oiChangePercent?: number | null;
  mode?: ParliamentScannerMode;
  killSwitchActive?: boolean;
}): ParliamentScannerContribution {
  const mode = input.mode ?? resolveParliamentScannerMode();
  const killSwitchActive = input.killSwitchActive ?? parliamentScannerKillSwitch();
  const crowdingRegime = Math.abs(input.fundingRate ?? 0) >= 0.00075 && Math.abs(input.oiChangePercent ?? 0) >= 1.5;
  const adaptiveThreshold = clamp01(regimeThreshold(input.regime.regime) + sessionThresholdAdjustment(input.timestamp));
  const emptyCategory = (category: ParliamentSignalCategory): ParliamentCategoryScore => ({ category, support: 0, opposition: 0, availableEvidence: 0, supportingEvidenceIds: [], opposingEvidenceIds: [] });
  const scores = new Map<ParliamentSignalCategory, ParliamentCategoryScore>([
    ['ON_CHAIN', emptyCategory('ON_CHAIN')], ['TECHNICAL', emptyCategory('TECHNICAL')],
    ['SENTIMENT_NEWS', emptyCategory('SENTIMENT_NEWS')], ['AI_ML', emptyCategory('AI_ML')],
  ]);

  const core = scores.get('AI_ML')!;
  core.availableEvidence = 1;
  core.support = clamp01(input.coreModelSupport);
  if (core.support >= 0.5) core.supportingEvidenceIds.push('core:regime_ensemble');

  const evidence = input.snapshot?.evidence ?? [];
  for (const row of evidence) {
    if (!FIRST_PROMOTABLE.has(row.family)) continue;
    const category = CATEGORY_BY_FAMILY[row.family];
    if (!category) continue;
    const bucket = scores.get(category)!;
    const weight = evidenceWeight(row, crowdingRegime);
    if (!(weight > 0)) continue;
    bucket.availableEvidence += 1;
    if (isSupportingDirection(row, input.direction)) {
      bucket.support += weight * clamp01(Math.abs(row.score));
      bucket.supportingEvidenceIds.push(row.evidenceId);
    } else if (isOpposingDirection(row, input.direction)) {
      bucket.opposition += weight * clamp01(Math.abs(row.score));
      bucket.opposingEvidenceIds.push(row.evidenceId);
    }
  }

  for (const bucket of scores.values()) {
    const denom = Math.max(1, bucket.availableEvidence);
    bucket.support = clamp01(bucket.support / denom);
    bucket.opposition = clamp01(bucket.opposition / denom);
  }

  const categoryScores = [...scores.values()];
  const categoryConfluence = categoryScores.filter((row) => row.support >= 0.46 && row.support > row.opposition + 0.08).length;
  const consensus = input.snapshot?.consensus;
  const consensusAligned = Boolean(consensus && consensus.leadingDirection === input.direction && consensus.consensus >= adaptiveThreshold);
  const materialVetoes = consensus?.materialVetoes ?? [];
  const qualityPass = Boolean(consensus && consensus.evidenceCompleteness >= 0.62 && consensus.evidenceQuality >= 0.62 && consensus.contextualTrust >= 0.55);
  const weightedCategories = categoryScores.filter((row) => row.availableEvidence > 0);
  const score = weightedCategories.length
    ? clamp01(weightedCategories.reduce((sum, row) => sum + Math.max(0, row.support - row.opposition * 0.75), 0) / weightedCategories.length)
    : 0;
  const confidence = clamp01(score * 0.55 + (consensus?.consensus ?? 0) * 0.25 + input.regime.confidence * 0.20);
  const contributionEnabled = mode === 'SIGNAL_PROMOTED' && !killSwitchActive;
  const reasons = [
    `mode:${mode}`,
    `regime:${input.regime.regime}`,
    `adaptive_threshold:${adaptiveThreshold.toFixed(3)}`,
    `category_confluence:${categoryConfluence}/${PARLIAMENT_PROMOTION_POLICY.minimumCategoryConfluence}`,
    `crowding_regime:${crowdingRegime}`,
  ];

  const base = {
    version: PARLIAMENT_SCANNER_VERSION, mode, killSwitchActive, direction: input.direction, adaptiveThreshold,
    categoryConfluence, requiredCategoryConfluence: PARLIAMENT_PROMOTION_POLICY.minimumCategoryConfluence,
    categoryScores, score, confidence, consensusAligned, materialVetoes, crowdingRegime, reasons,
  };
  if (killSwitchActive) return { ...base, shadowOnly: true, contributionEnabled: false, eligibleIfPromoted: false, actionable: false, reasonCode: 'KILL_SWITCH' as const };
  if (materialVetoes.length) return { ...base, shadowOnly: mode !== 'SIGNAL_PROMOTED', contributionEnabled, eligibleIfPromoted: false, actionable: false, reasonCode: 'MATERIAL_VETO' as const };
  if (!qualityPass) return { ...base, shadowOnly: mode !== 'SIGNAL_PROMOTED', contributionEnabled, eligibleIfPromoted: false, actionable: false, reasonCode: 'INSUFFICIENT_EVIDENCE_QUALITY' as const };
  if (!consensusAligned) return { ...base, shadowOnly: mode !== 'SIGNAL_PROMOTED', contributionEnabled, eligibleIfPromoted: false, actionable: false, reasonCode: 'CONSENSUS_MISMATCH' as const };
  if (categoryConfluence < PARLIAMENT_PROMOTION_POLICY.minimumCategoryConfluence) return { ...base, shadowOnly: mode !== 'SIGNAL_PROMOTED', contributionEnabled, eligibleIfPromoted: false, actionable: false, reasonCode: 'INSUFFICIENT_CATEGORY_CONFLUENCE' as const };
  if (!contributionEnabled) return { ...base, shadowOnly: true, contributionEnabled: false, eligibleIfPromoted: true, actionable: false, reasonCode: 'SHADOW_ONLY' as const };
  return { ...base, shadowOnly: false, contributionEnabled: true, eligibleIfPromoted: true, actionable: true, reasonCode: 'CONTRIBUTION_ACCEPTED' as const };
}
