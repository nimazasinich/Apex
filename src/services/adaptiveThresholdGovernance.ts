import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readDurableJsonFileSync, writeDurableJsonFileSync } from './durableJsonFile';
import { resolvePrivateDataDir } from './privateConfigFile';
import type { ScannerConfig, SignalDecisionLog } from '../types';
import {
  deriveAdaptiveScannerConfig,
  type AdaptiveExperienceProfile,
  type AdaptiveThresholdAuditLog,
} from './adaptiveThresholdEngine';
import { normalizeEffectiveScannerConfig } from './scannerConfigPolicy';

export const ADAPTIVE_GOVERNANCE_VERSION = 'adaptive_governance_v1';

export type AdaptiveProposalStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED' | 'ROLLED_BACK';

export interface AdaptivePromotionPolicy {
  minSamples: number;
  minResolvedOutcomes: number;
  minAdjustmentConfidence: number;
  maxRelativeFieldChange: number;
  requireGuardrailsMode: boolean;
}

export interface AdaptiveProposal {
  id: string;
  createdAt: number;
  createdAtIso: string;
  status: AdaptiveProposalStatus;
  policyVersion: string;
  baseRevision: number;
  proposedRevision: number;
  profile: AdaptiveExperienceProfile;
  audit: AdaptiveThresholdAuditLog;
  configured: ScannerConfig;
  effective: ScannerConfig;
  eligibleForReview: boolean;
  blockers: string[];
  approvedAt?: number;
  approvedAtIso?: string;
  rejectedAt?: number;
  rejectedAtIso?: string;
  rejectionReason?: string;
  rolledBackAt?: number;
  rolledBackAtIso?: string;
}

export interface AdaptiveConfigRevision {
  revision: number;
  effectiveAt: number;
  effectiveAtIso: string;
  source: 'BASELINE' | 'MANUAL_PROMOTION' | 'ROLLBACK';
  proposalId?: string;
  config: ScannerConfig;
  previousRevision?: number;
}

interface AdaptiveGovernanceState {
  version: 1;
  policyVersion: string;
  updatedAt: string;
  activeRevision: number;
  revisions: AdaptiveConfigRevision[];
  proposals: AdaptiveProposal[];
}

export interface AdaptiveGovernanceSnapshot {
  version: string;
  active: AdaptiveConfigRevision;
  policy: AdaptivePromotionPolicy;
  pending: AdaptiveProposal[];
  history: AdaptiveConfigRevision[];
  proposals: AdaptiveProposal[];
  automaticPromotionEnabled: false;
}

export const DEFAULT_POLICY: AdaptivePromotionPolicy = {
  minSamples: 96,
  minResolvedOutcomes: 48,
  minAdjustmentConfidence: 0.72,
  maxRelativeFieldChange: 0.20,
  requireGuardrailsMode: true,
};

function cloneConfig(config: ScannerConfig): ScannerConfig {
  return { ...config, scoreWeights: { ...config.scoreWeights } };
}

function safePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function safeUnit(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

function buildPolicyFromEnv(): AdaptivePromotionPolicy {
  return {
    minSamples: safePositiveInteger(process.env.APEX_ADAPTIVE_MIN_PROMOTION_SAMPLES, DEFAULT_POLICY.minSamples),
    minResolvedOutcomes: safePositiveInteger(process.env.APEX_ADAPTIVE_MIN_RESOLVED_OUTCOMES, DEFAULT_POLICY.minResolvedOutcomes),
    minAdjustmentConfidence: safeUnit(process.env.APEX_ADAPTIVE_MIN_ADJUSTMENT_CONFIDENCE, DEFAULT_POLICY.minAdjustmentConfidence),
    maxRelativeFieldChange: safeUnit(process.env.APEX_ADAPTIVE_MAX_RELATIVE_FIELD_CHANGE, DEFAULT_POLICY.maxRelativeFieldChange),
    requireGuardrailsMode: String(process.env.APEX_ADAPTIVE_REQUIRE_GUARDRAILS || 'true').toLowerCase() !== 'false',
  };
}

function revisionNow(revision: number, config: ScannerConfig, source: AdaptiveConfigRevision['source'], previousRevision?: number, proposalId?: string): AdaptiveConfigRevision {
  const now = Date.now();
  return {
    revision,
    effectiveAt: now,
    effectiveAtIso: new Date(now).toISOString(),
    source,
    proposalId,
    previousRevision,
    config: cloneConfig(normalizeEffectiveScannerConfig(config, 'live').effective),
  };
}

function cleanState(value: unknown, baseline: ScannerConfig): AdaptiveGovernanceState {
  const fallbackRevision = revisionNow(1, baseline, 'BASELINE');
  if (!value || typeof value !== 'object') {
    return {
      version: 1,
      policyVersion: ADAPTIVE_GOVERNANCE_VERSION,
      updatedAt: new Date().toISOString(),
      activeRevision: 1,
      revisions: [fallbackRevision],
      proposals: [],
    };
  }
  const raw = value as Partial<AdaptiveGovernanceState>;
  const revisions = Array.isArray(raw.revisions)
    ? raw.revisions.filter((row): row is AdaptiveConfigRevision => Boolean(
      row && typeof row === 'object' && Number.isFinite((row as AdaptiveConfigRevision).revision) && (row as AdaptiveConfigRevision).config,
    )).map((row) => ({ ...row, config: cloneConfig(normalizeEffectiveScannerConfig(row.config, 'live').effective) }))
    : [];
  if (!revisions.length) revisions.push(fallbackRevision);
  const activeRevision = revisions.some((row) => row.revision === raw.activeRevision)
    ? Number(raw.activeRevision)
    : revisions[revisions.length - 1].revision;
  const proposals = Array.isArray(raw.proposals)
    ? raw.proposals.filter((row): row is AdaptiveProposal => Boolean(row && typeof row === 'object' && typeof (row as AdaptiveProposal).id === 'string'))
    : [];
  return {
    version: 1,
    policyVersion: ADAPTIVE_GOVERNANCE_VERSION,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    activeRevision,
    revisions: revisions.sort((a, b) => a.revision - b.revision).slice(-100),
    proposals: proposals.sort((a, b) => b.createdAt - a.createdAt).slice(0, 200),
  };
}

function resolvedOutcomeCount(profile: AdaptiveExperienceProfile): number {
  return profile.resolvedAccepted + profile.missedWinners + profile.savedLosses;
}

export function relativeChange(before: number, after: number): number {
  const denominator = Math.max(Math.abs(before), 1e-9);
  return Math.abs(after - before) / denominator;
}

export function evaluateProposalBlockers(
  configured: ScannerConfig,
  effective: ScannerConfig,
  profile: AdaptiveExperienceProfile,
  audit: AdaptiveThresholdAuditLog,
  policy: AdaptivePromotionPolicy,
): string[] {
  const blockers: string[] = [];
  if (profile.sampleSize < policy.minSamples) blockers.push(`sample_size_below_${policy.minSamples}`);
  if (resolvedOutcomeCount(profile) < policy.minResolvedOutcomes) blockers.push(`resolved_outcomes_below_${policy.minResolvedOutcomes}`);
  if (profile.adjustmentConfidence < policy.minAdjustmentConfidence) blockers.push(`adjustment_confidence_below_${policy.minAdjustmentConfidence}`);
  if (policy.requireGuardrailsMode && configured.thresholdMode !== 'ADAPTIVE_GUARDRAILS') blockers.push('guardrails_mode_required');
  if (!audit.changes.length) blockers.push('no_effective_change');
  for (const change of audit.changes) {
    // scoreWeights.* fields are fractions of a ~1.0 normalized weighting budget, not
    // independent thresholds. A field starting near zero (e.g. liquidity: 0.05) can
    // swing well past 100% relative-to-self during routine renormalization even
    // though its effect on the overall score is small. Judge those fields against
    // the shared weighting budget (denominator 1) instead of their own small base,
    // so normalization noise cannot masquerade as a disproportionate change while
    // genuinely large weight shifts are still caught.
    const isScoreWeightField = change.field.startsWith('scoreWeights.');
    const changeMagnitude = isScoreWeightField
      ? Math.abs(change.after - change.before)
      : relativeChange(change.before, change.after);
    if (changeMagnitude > policy.maxRelativeFieldChange) {
      blockers.push(`field_change_exceeds_limit:${change.field}`);
    }
  }
  if (effective.directionBias !== configured.directionBias) blockers.push('direction_bias_change_not_allowed');
  if (effective.thresholdMode !== configured.thresholdMode) blockers.push('threshold_mode_change_not_allowed');
  return [...new Set(blockers)];
}

function proposalId(now = Date.now()): string {
  return `adaptive-${now}-${Math.random().toString(36).slice(2, 10)}`;
}

export class AdaptiveThresholdGovernanceStore {
  private readonly filePath: string;
  private readonly policy: AdaptivePromotionPolicy;
  private state: AdaptiveGovernanceState;

  constructor(baseline: ScannerConfig, filePath?: string, policy: AdaptivePromotionPolicy = buildPolicyFromEnv()) {
    this.filePath = resolve(filePath || process.env.APEX_ADAPTIVE_GOVERNANCE_PATH || join(resolvePrivateDataDir(), 'governance', 'adaptive-threshold-governance.json'));
    this.policy = { ...policy };
    this.state = this.load(baseline);
  }

  private load(baseline: ScannerConfig): AdaptiveGovernanceState {
    if (!existsSync(this.filePath)) return cleanState(null, baseline);
    try {
      return cleanState(readDurableJsonFileSync(this.filePath), baseline);
    } catch {
      throw new Error('adaptive_governance_store_corrupt');
    }
  }

  private persist(): void {
    this.state.updatedAt = new Date().toISOString();
    writeDurableJsonFileSync(this.filePath, this.state);
  }

  getActiveRevision(): AdaptiveConfigRevision {
    const active = this.state.revisions.find((row) => row.revision === this.state.activeRevision)
      ?? this.state.revisions[this.state.revisions.length - 1];
    return { ...active, config: cloneConfig(active.config) };
  }

  getActiveConfig(): ScannerConfig {
    return cloneConfig(this.getActiveRevision().config);
  }

  snapshot(): AdaptiveGovernanceSnapshot {
    return {
      version: ADAPTIVE_GOVERNANCE_VERSION,
      active: this.getActiveRevision(),
      policy: { ...this.policy },
      pending: this.state.proposals.filter((proposal) => proposal.status === 'PENDING_REVIEW').map((proposal) => ({ ...proposal })),
      history: this.state.revisions.map((revision) => ({ ...revision, config: cloneConfig(revision.config) })),
      proposals: this.state.proposals.map((proposal) => ({ ...proposal })),
      automaticPromotionEnabled: false,
    };
  }

  propose(logs: SignalDecisionLog[]): AdaptiveProposal {
    const base = this.getActiveRevision();
    const result = deriveAdaptiveScannerConfig(base.config, logs);
    if (!result.profile || !result.audit) throw new Error('adaptive_proposal_insufficient_or_no_change');
    const effective = normalizeEffectiveScannerConfig(result.nextConfig, 'live').effective;
    const blockers = evaluateProposalBlockers(base.config, effective, result.profile, result.audit, this.policy);
    const now = Date.now();
    const proposal: AdaptiveProposal = {
      id: proposalId(now),
      createdAt: now,
      createdAtIso: new Date(now).toISOString(),
      status: 'PENDING_REVIEW',
      policyVersion: ADAPTIVE_GOVERNANCE_VERSION,
      baseRevision: base.revision,
      proposedRevision: Math.max(...this.state.revisions.map((row) => row.revision), 0) + 1,
      profile: result.profile,
      audit: result.audit,
      configured: cloneConfig(result.nextConfig),
      effective: cloneConfig(effective),
      eligibleForReview: blockers.length === 0,
      blockers,
    };
    this.state.proposals = [proposal, ...this.state.proposals].slice(0, 200);
    this.persist();
    return { ...proposal };
  }

  approve(proposalIdValue: string): AdaptiveConfigRevision {
    const proposal = this.state.proposals.find((row) => row.id === proposalIdValue);
    if (!proposal) throw new Error('adaptive_proposal_not_found');
    if (proposal.status !== 'PENDING_REVIEW') throw new Error('adaptive_proposal_not_pending');
    if (!proposal.eligibleForReview || proposal.blockers.length) throw new Error(`adaptive_proposal_blocked:${proposal.blockers.join(',')}`);
    if (proposal.baseRevision !== this.state.activeRevision) throw new Error('adaptive_proposal_base_revision_stale');

    const previous = this.getActiveRevision();
    for (const row of this.state.proposals) {
      if (row.status === 'PENDING_REVIEW' && row.id !== proposal.id && row.baseRevision === proposal.baseRevision) row.status = 'SUPERSEDED';
    }
    const revision = revisionNow(proposal.proposedRevision, proposal.effective, 'MANUAL_PROMOTION', previous.revision, proposal.id);
    this.state.revisions.push(revision);
    this.state.revisions = this.state.revisions.sort((a, b) => a.revision - b.revision).slice(-100);
    this.state.activeRevision = revision.revision;
    proposal.status = 'APPROVED';
    proposal.approvedAt = revision.effectiveAt;
    proposal.approvedAtIso = revision.effectiveAtIso;
    this.persist();
    return { ...revision, config: cloneConfig(revision.config) };
  }

  reject(proposalIdValue: string, reason: string): AdaptiveProposal {
    const proposal = this.state.proposals.find((row) => row.id === proposalIdValue);
    if (!proposal) throw new Error('adaptive_proposal_not_found');
    if (proposal.status !== 'PENDING_REVIEW') throw new Error('adaptive_proposal_not_pending');
    const now = Date.now();
    proposal.status = 'REJECTED';
    proposal.rejectedAt = now;
    proposal.rejectedAtIso = new Date(now).toISOString();
    proposal.rejectionReason = String(reason || 'operator_rejected').slice(0, 500);
    this.persist();
    return { ...proposal };
  }

  rollback(targetRevision?: number): AdaptiveConfigRevision {
    const current = this.getActiveRevision();
    const candidates = this.state.revisions.filter((row) => row.revision < current.revision);
    const target = targetRevision === undefined
      ? candidates[candidates.length - 1]
      : candidates.find((row) => row.revision === targetRevision);
    if (!target) throw new Error('adaptive_rollback_target_not_found');
    const nextRevision = Math.max(...this.state.revisions.map((row) => row.revision), 0) + 1;
    const revision = revisionNow(nextRevision, target.config, 'ROLLBACK', current.revision, current.proposalId);
    this.state.revisions.push(revision);
    this.state.activeRevision = revision.revision;
    const approved = current.proposalId ? this.state.proposals.find((row) => row.id === current.proposalId) : undefined;
    if (approved && approved.status === 'APPROVED') {
      approved.status = 'ROLLED_BACK';
      approved.rolledBackAt = revision.effectiveAt;
      approved.rolledBackAtIso = revision.effectiveAtIso;
    }
    this.persist();
    return { ...revision, config: cloneConfig(revision.config) };
  }
}
