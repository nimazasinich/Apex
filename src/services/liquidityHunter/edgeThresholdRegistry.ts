import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { EdgeEvidence, EdgeId } from '../../contracts/realtime/edgeEvidence';
import type { EdgeSymbolClass, EdgeThresholdProfile } from '../../contracts/realtime/edgeThreshold';
import { validateEdgeThresholdProfile } from '../../contracts/realtime/edgeThreshold';
import { readDurableJsonFileSync, writeDurableJsonFileSync } from '../durableJsonFile';
import { resolvePrivateDataDir } from '../privateConfigFile';
import type { EdgeThresholdOptimizationReport } from './edgeThresholdOptimizer';

export const EDGE_THRESHOLD_GOVERNANCE_VERSION = 'lh_edge_threshold_governance_v1';

export interface EdgeThresholdScope {
  edgeId: EdgeId;
  symbolClass: EdgeSymbolClass;
  timeframe: string;
  regime: string;
}

export interface EdgeThresholdPromotionEvidence {
  version: 'lh_edge_threshold_promotion_evidence_v1';
  sourceSet: string[];
  featureVersion: string;
  validationFingerprintSha256: string;
  reproducibility: { passed: boolean; fingerprintSha256: string };
  costLatencyStress: { passed: boolean; fingerprintSha256: string };
  qualityConcentration: { passed: boolean; fingerprintSha256: string };
  paperCanary: { resolved: number; fingerprintSha256: string };
  dataSourceStable: boolean;
  riskGovernorCompatible: boolean;
}

export interface EdgeThresholdProposal {
  id: string;
  createdAt: number;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED' | 'ROLLED_BACK';
  profile: EdgeThresholdProfile;
  optimizationFingerprint: string;
  validationContext: EdgeThresholdOptimizationReport['validationContext'];
  promotionEvidence?: EdgeThresholdPromotionEvidence;
  blockers: string[];
  eligibleForManualReview: boolean;
  approvedBy?: string;
  approvedAt?: number;
  rejectionReason?: string;
}

export interface EdgeThresholdRevision {
  revision: number;
  effectiveAt: number;
  source: 'BASELINE' | 'MANUAL_PROMOTION' | 'ROLLBACK';
  approver: string | null;
  previousRevision: number | null;
  rollbackTargetRevision?: number | null;
  changedProfileBefore?: EdgeThresholdProfile | null;
  changedProfileAfter?: EdgeThresholdProfile | null;
  promotionEvidence?: EdgeThresholdPromotionEvidence | null;
  profiles: EdgeThresholdProfile[];
}

interface PersistedState {
  version: 1;
  policyVersion: string;
  activeRevision: number;
  revisions: EdgeThresholdRevision[];
  proposals: EdgeThresholdProposal[];
}

export interface EdgeThresholdGovernanceSnapshot {
  version: typeof EDGE_THRESHOLD_GOVERNANCE_VERSION;
  activeRevision: number;
  activeProfiles: EdgeThresholdProfile[];
  proposals: EdgeThresholdProposal[];
  history: EdgeThresholdRevision[];
  automaticPromotionEnabled: false;
}

const EDGE_IDS: EdgeId[] = [
  'LIQUIDATION_TOPOLOGY', 'WHALE_POSITIONING', 'ICEBERG_ABSORPTION', 'OPTIONS_GAMMA', 'MULTI_EXCHANGE_CVD',
  'SESSION_LIQUIDITY', 'FUNDING_OI', 'SENTIMENT_VELOCITY', 'META_MODEL', 'CONTRARIAN_WALLETS',
];

export function classifyEdgeSymbolClass(symbol: string): EdgeSymbolClass {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.startsWith('BTC')) return 'BTC';
  if (normalized.startsWith('ETH')) return 'ETH';
  const large = ['SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT', 'TRX'];
  if (large.some((prefix) => normalized.startsWith(prefix))) return 'LARGE_CAP';
  return 'MID_CAP';
}

export function createBaselineEdgeThresholdProfile(scope: EdgeThresholdScope): EdgeThresholdProfile {
  return {
    id: `${scope.edgeId}:${scope.symbolClass}:${scope.timeframe}:${scope.regime}`,
    edgeId: scope.edgeId,
    symbolClass: scope.symbolClass,
    timeframe: scope.timeframe,
    regime: scope.regime,
    // Zero is deliberately semantics-preserving: existing edge PASS/FAIL logic
    // remains authoritative until a separately validated threshold is manually promoted.
    baseline: 0,
    candidate: null,
    min: 0,
    max: 1,
    step: 0.025,
    sampleCount: 0,
    minimumSamples: 96,
    minimumRegimes: 3,
    promotionState: 'BASELINE',
  };
}

function cloneProfile(profile: EdgeThresholdProfile): EdgeThresholdProfile {
  return { ...profile };
}

function cloneRevision(revision: EdgeThresholdRevision): EdgeThresholdRevision {
  return {
    ...revision,
    profiles: revision.profiles.map(cloneProfile),
    changedProfileBefore: revision.changedProfileBefore ? cloneProfile(revision.changedProfileBefore) : revision.changedProfileBefore ?? null,
    changedProfileAfter: revision.changedProfileAfter ? cloneProfile(revision.changedProfileAfter) : revision.changedProfileAfter ?? null,
    promotionEvidence: revision.promotionEvidence ? structuredClone(revision.promotionEvidence) : revision.promotionEvidence ?? null,
  };
}

function baselineRevision(): EdgeThresholdRevision {
  return {
    revision: 1, effectiveAt: Date.now(), source: 'BASELINE', approver: null, previousRevision: null,
    rollbackTargetRevision: null, changedProfileBefore: null, changedProfileAfter: null, promotionEvidence: null, profiles: [],
  };
}

function sanitizeState(value: unknown): PersistedState {
  const fallback = baselineRevision();
  if (!value || typeof value !== 'object') return { version: 1, policyVersion: EDGE_THRESHOLD_GOVERNANCE_VERSION, activeRevision: 1, revisions: [fallback], proposals: [] };
  const raw = value as Partial<PersistedState>;
  const revisions = Array.isArray(raw.revisions)
    ? raw.revisions.filter((row): row is EdgeThresholdRevision => Boolean(row && Number.isFinite((row as EdgeThresholdRevision).revision)))
      .map((row) => ({ ...row, profiles: Array.isArray(row.profiles) ? row.profiles.filter((profile) => validateEdgeThresholdProfile(profile).length === 0).map(cloneProfile) : [] }))
      .sort((a, b) => a.revision - b.revision)
      .slice(-100)
    : [];
  if (!revisions.length) revisions.push(fallback);
  const activeRevision = revisions.some((row) => row.revision === raw.activeRevision) ? Number(raw.activeRevision) : revisions.at(-1)!.revision;
  const proposals = Array.isArray(raw.proposals)
    ? raw.proposals.filter((row): row is EdgeThresholdProposal => Boolean(row && typeof (row as EdgeThresholdProposal).id === 'string')).slice(-500)
    : [];
  return { version: 1, policyVersion: EDGE_THRESHOLD_GOVERNANCE_VERSION, activeRevision, revisions, proposals };
}

function scopeMatches(profile: EdgeThresholdProfile, scope: EdgeThresholdScope): boolean {
  return profile.edgeId === scope.edgeId
    && profile.symbolClass === scope.symbolClass
    && profile.timeframe === scope.timeframe
    && profile.regime === scope.regime;
}

function canonicalSources(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].sort();
}

function validSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(String(value || ''));
}

function validatePromotionEvidence(proposal: EdgeThresholdProposal, evidence: EdgeThresholdPromotionEvidence): string[] {
  const blockers: string[] = [];
  const context = proposal.validationContext;
  const sources = canonicalSources(evidence.sourceSet);
  if (evidence.version !== 'lh_edge_threshold_promotion_evidence_v1') blockers.push('promotion_evidence_version_invalid');
  if (!context) blockers.push('proposal_validation_context_missing');
  if (!sources.length) blockers.push('promotion_source_set_missing');
  if (!evidence.featureVersion.trim()) blockers.push('promotion_feature_version_missing');
  if (!validSha256(evidence.validationFingerprintSha256)) blockers.push('promotion_validation_fingerprint_invalid');
  if (!evidence.reproducibility.passed || !validSha256(evidence.reproducibility.fingerprintSha256)) blockers.push('reproducibility_evidence_missing_or_failed');
  if (!evidence.costLatencyStress.passed || !validSha256(evidence.costLatencyStress.fingerprintSha256)) blockers.push('cost_latency_stress_missing_or_failed');
  if (!evidence.qualityConcentration.passed || !validSha256(evidence.qualityConcentration.fingerprintSha256)) blockers.push('quality_concentration_missing_or_failed');
  if (!Number.isSafeInteger(evidence.paperCanary.resolved) || evidence.paperCanary.resolved < 1 || !validSha256(evidence.paperCanary.fingerprintSha256)) blockers.push('paper_canary_evidence_missing');
  if (!evidence.dataSourceStable) blockers.push('data_source_not_stable');
  if (!evidence.riskGovernorCompatible) blockers.push('risk_governor_compatibility_not_confirmed');
  if (context) {
    if (JSON.stringify(canonicalSources(context.sourceSet)) !== JSON.stringify(sources)) blockers.push('promotion_source_set_mismatch');
    if (context.featureVersion !== evidence.featureVersion) blockers.push('promotion_feature_version_mismatch');
    if (context.datasetFingerprintSha256 !== evidence.validationFingerprintSha256) blockers.push('promotion_validation_fingerprint_mismatch');
    if (context.validationProtocol !== 'PURGED_WALK_FORWARD_HOLDOUT') blockers.push('promotion_validation_protocol_invalid');
  }
  return [...new Set(blockers)];
}

export class EdgeThresholdGovernanceStore {
  private readonly filePath: string;
  private state: PersistedState;

  constructor(filePath = process.env.APEX_LIQUIDITY_HUNTER_EDGE_THRESHOLD_PATH || join(resolvePrivateDataDir(), 'governance', 'liquidity-hunter-edge-thresholds.json')) {
    this.filePath = resolve(filePath);
    this.state = this.load();
  }

  private load(): PersistedState {
    if (!existsSync(this.filePath)) return sanitizeState(null);
    try { return sanitizeState(readDurableJsonFileSync(this.filePath)); }
    catch { throw new Error('edge_threshold_governance_store_corrupt'); }
  }

  private persist(): void {
    writeDurableJsonFileSync(this.filePath, this.state);
  }

  private activeRevision(): EdgeThresholdRevision {
    return this.state.revisions.find((row) => row.revision === this.state.activeRevision) ?? this.state.revisions.at(-1)!;
  }

  resolve(scope: EdgeThresholdScope): EdgeThresholdProfile {
    const active = this.activeRevision();
    const exact = active.profiles.find((profile) => scopeMatches(profile, scope));
    if (exact) return cloneProfile(exact);
    const regimeFallback = active.profiles.find((profile) => profile.edgeId === scope.edgeId
      && profile.symbolClass === scope.symbolClass && profile.timeframe === scope.timeframe && profile.regime === 'ANY');
    return regimeFallback ? cloneProfile(regimeFallback) : createBaselineEdgeThresholdProfile(scope);
  }

  resolveForRuntime(edgeId: EdgeId, symbol: string, timeframe = 'REALTIME', regime = 'ANY'): EdgeThresholdProfile {
    return this.resolve({ edgeId, symbolClass: classifyEdgeSymbolClass(symbol), timeframe, regime });
  }

  stage(report: EdgeThresholdOptimizationReport, scope: Omit<EdgeThresholdScope, 'edgeId'>): EdgeThresholdProposal {
    if (report.automaticPromotionEnabled !== false || report.shadowOnly !== true) throw new Error('edge_threshold_report_safety_contract_invalid');
    const active = this.resolve({ edgeId: report.edgeId, ...scope });
    const candidate = report.candidateThreshold;
    const profile: EdgeThresholdProfile = {
      ...active,
      candidate,
      sampleCount: report.development.sampleCount + report.holdout.sampleCount,
      promotionState: candidate === null ? 'SHADOW' : 'CANDIDATE',
    };
    const issues = validateEdgeThresholdProfile(profile);
    const blockers = [...new Set([...report.blockers, ...issues])];
    const proposal: EdgeThresholdProposal = {
      id: `lh-edge-proposal:${Date.now()}:${report.edgeId.toLowerCase()}`,
      createdAt: Date.now(),
      status: 'PENDING_REVIEW',
      profile,
      optimizationFingerprint: report.fingerprintSha256,
      validationContext: report.validationContext ? structuredClone(report.validationContext) : null,
      blockers,
      eligibleForManualReview: report.eligibleForManualReview && blockers.length === 0 && candidate !== null,
    };
    this.state.proposals.push(proposal);
    this.state.proposals = this.state.proposals.slice(-500);
    this.persist();
    return structuredClone(proposal);
  }

  markPaperCanaryReady(proposalId: string, evidence: EdgeThresholdPromotionEvidence): EdgeThresholdProposal {
    const proposal = this.state.proposals.find((row) => row.id === proposalId);
    if (!proposal) throw new Error('edge_threshold_proposal_not_found');
    if (proposal.status !== 'PENDING_REVIEW') throw new Error('edge_threshold_proposal_not_pending');
    if (!proposal.eligibleForManualReview || proposal.blockers.length || proposal.profile.candidate === null) throw new Error('edge_threshold_proposal_blocked');
    const blockers = validatePromotionEvidence(proposal, evidence);
    if (blockers.length) throw new Error(`edge_threshold_promotion_evidence_blocked:${blockers.join(',')}`);
    proposal.promotionEvidence = structuredClone({ ...evidence, sourceSet: canonicalSources(evidence.sourceSet) });
    proposal.profile = { ...proposal.profile, promotionState: 'PAPER_CANARY' };
    this.persist();
    return structuredClone(proposal);
  }

  approve(proposalId: string, approver: string): EdgeThresholdRevision {
    const operator = String(approver || '').trim();
    if (operator.length < 2) throw new Error('edge_threshold_manual_approver_required');
    const proposal = this.state.proposals.find((row) => row.id === proposalId);
    if (!proposal) throw new Error('edge_threshold_proposal_not_found');
    if (proposal.status !== 'PENDING_REVIEW') throw new Error('edge_threshold_proposal_not_pending');
    if (!proposal.eligibleForManualReview || proposal.blockers.length || proposal.profile.candidate === null) throw new Error('edge_threshold_proposal_blocked');
    if (proposal.profile.promotionState !== 'PAPER_CANARY' || !proposal.promotionEvidence) throw new Error('edge_threshold_paper_canary_evidence_required');
    const evidenceBlockers = validatePromotionEvidence(proposal, proposal.promotionEvidence);
    if (evidenceBlockers.length) throw new Error(`edge_threshold_promotion_evidence_blocked:${evidenceBlockers.join(',')}`);
    const previous = this.activeRevision();
    const changedProfileBefore = previous.profiles.find((profile) => profile.id === proposal.profile.id) ?? createBaselineEdgeThresholdProfile({
      edgeId: proposal.profile.edgeId, symbolClass: proposal.profile.symbolClass, timeframe: proposal.profile.timeframe, regime: proposal.profile.regime,
    });
    const changedProfileAfter: EdgeThresholdProfile = { ...proposal.profile, baseline: proposal.profile.candidate, candidate: null, promotionState: 'MANUALLY_PROMOTED' };
    const profiles = previous.profiles.map(cloneProfile).filter((profile) => profile.id !== proposal.profile.id);
    profiles.push(changedProfileAfter);
    const revision: EdgeThresholdRevision = {
      revision: Math.max(...this.state.revisions.map((row) => row.revision), 0) + 1,
      effectiveAt: Date.now(),
      source: 'MANUAL_PROMOTION',
      approver: operator,
      previousRevision: previous.revision,
      rollbackTargetRevision: previous.revision,
      changedProfileBefore: cloneProfile(changedProfileBefore),
      changedProfileAfter: cloneProfile(changedProfileAfter),
      promotionEvidence: structuredClone(proposal.promotionEvidence),
      profiles,
    };
    proposal.status = 'APPROVED';
    proposal.approvedBy = operator;
    proposal.approvedAt = revision.effectiveAt;
    this.state.revisions.push(revision);
    this.state.activeRevision = revision.revision;
    for (const row of this.state.proposals) {
      if (row.status === 'PENDING_REVIEW' && row.id !== proposal.id && row.profile.id === proposal.profile.id) row.status = 'SUPERSEDED';
    }
    this.persist();
    return cloneRevision(revision);
  }

  reject(proposalId: string, reason: string): EdgeThresholdProposal {
    const proposal = this.state.proposals.find((row) => row.id === proposalId);
    if (!proposal) throw new Error('edge_threshold_proposal_not_found');
    if (proposal.status !== 'PENDING_REVIEW') throw new Error('edge_threshold_proposal_not_pending');
    proposal.status = 'REJECTED';
    proposal.rejectionReason = String(reason || 'operator_rejected').slice(0, 500);
    this.persist();
    return structuredClone(proposal);
  }

  rollback(targetRevision: number, approver: string): EdgeThresholdRevision {
    const operator = String(approver || '').trim();
    if (operator.length < 2) throw new Error('edge_threshold_manual_approver_required');
    const current = this.activeRevision();
    const target = this.state.revisions.find((row) => row.revision === targetRevision && row.revision < current.revision);
    if (!target) throw new Error('edge_threshold_rollback_target_not_found');
    const revision: EdgeThresholdRevision = {
      revision: Math.max(...this.state.revisions.map((row) => row.revision), 0) + 1,
      effectiveAt: Date.now(),
      source: 'ROLLBACK',
      approver: operator,
      previousRevision: current.revision,
      rollbackTargetRevision: target.revision,
      changedProfileBefore: null,
      changedProfileAfter: null,
      promotionEvidence: null,
      profiles: target.profiles.map((profile) => ({ ...cloneProfile(profile), promotionState: 'ROLLED_BACK' })),
    };
    this.state.revisions.push(revision);
    this.state.activeRevision = revision.revision;
    this.persist();
    return cloneRevision(revision);
  }

  snapshot(): EdgeThresholdGovernanceSnapshot {
    const active = this.activeRevision();
    return {
      version: EDGE_THRESHOLD_GOVERNANCE_VERSION,
      activeRevision: active.revision,
      activeProfiles: active.profiles.map(cloneProfile),
      proposals: this.state.proposals.map((proposal) => structuredClone(proposal)),
      history: this.state.revisions.map(cloneRevision),
      automaticPromotionEnabled: false,
    };
  }
}

export function applyEdgeThresholdGate(evidence: EdgeEvidence, profile: EdgeThresholdProfile): EdgeEvidence {
  if (evidence.status !== 'PASS' || evidence.score === null || evidence.score >= profile.baseline) {
    return { ...evidence, metadata: { ...evidence.metadata, appliedScoreThreshold: profile.baseline, thresholdProfileId: profile.id } };
  }
  return {
    ...evidence,
    status: 'FAIL' as const,
    conflictingReasons: [...evidence.conflictingReasons, `score_below_manually_governed_threshold:${profile.baseline.toFixed(3)}`],
    metadata: { ...evidence.metadata, appliedScoreThreshold: profile.baseline, thresholdProfileId: profile.id },
  };
}

export function edgeThresholdUniverse(): EdgeId[] {
  return [...EDGE_IDS];
}
