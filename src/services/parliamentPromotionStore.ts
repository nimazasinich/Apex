import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolvePrivateConfigPath, writePrivateJsonFileSync } from './privateConfigFile';
import {
  PARLIAMENT_PROMOTION_POLICY,
  PARLIAMENT_SCANNER_VERSION,
  type ParliamentScannerMode,
} from './parliamentScannerContributor';
import {
  evaluateParliamentPromotion,
  type ParliamentPromotionStage,
  type ParliamentValidationEvidence,
} from './parliamentPromotionGate';

export const PARLIAMENT_PROMOTION_STATE_VERSION = 'parliament_promotion_state_v1' as const;
export const PARLIAMENT_SIGNAL_CONFIRMATION = 'PROMOTE_PARLIAMENT_SIGNAL_CONTRIBUTOR' as const;
export const PARLIAMENT_DEMOTION_CONFIRMATION = 'DEMOTE_PARLIAMENT_TO_SHADOW' as const;

const CANDIDATE_IDENTITY = {
  scannerVersion: PARLIAMENT_SCANNER_VERSION,
  promotableStreams: [
    'momentum', 'price_action', 'liquidity', 'whale', 'smart_money',
    'funding_oi', 'news', 'sentiment', 'volatility',
  ],
  signalCategories: ['ON_CHAIN', 'TECHNICAL', 'SENTIMENT_NEWS', 'AI_ML'],
  policy: PARLIAMENT_PROMOTION_POLICY,
};

export const PARLIAMENT_CANDIDATE_FINGERPRINT = createHash('sha256')
  .update(JSON.stringify(CANDIDATE_IDENTITY))
  .digest('hex');

export interface ParliamentPromotionState {
  version: typeof PARLIAMENT_PROMOTION_STATE_VERSION;
  candidateFingerprint: string;
  stage: ParliamentPromotionStage;
  signalPromotionReady: boolean;
  signalDeliveryOptIn: boolean;
  humanApprovedAt: number | null;
  updatedAt: number;
  lastEvidence: ParliamentValidationEvidence | null;
  lastBlockers: string[];
  lastTransitionReason: string;
  autonomousLiveExecutionEnabled: false;
}

function initialState(reason = 'initial_shadow_default'): ParliamentPromotionState {
  return {
    version: PARLIAMENT_PROMOTION_STATE_VERSION,
    candidateFingerprint: PARLIAMENT_CANDIDATE_FINGERPRINT,
    stage: 'SHADOW',
    signalPromotionReady: false,
    signalDeliveryOptIn: false,
    humanApprovedAt: null,
    updatedAt: Date.now(),
    lastEvidence: null,
    lastBlockers: [],
    lastTransitionReason: reason,
    autonomousLiveExecutionEnabled: false,
  };
}

function isEvidence(value: unknown): value is ParliamentValidationEvidence {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<ParliamentValidationEvidence>;
  return Number.isFinite(row.resolvedSamples)
    && Number.isFinite(row.paperForwardSamples)
    && Number.isFinite(row.walkForwardFolds)
    && Number.isFinite(row.profitableWalkForwardFolds)
    && Array.isArray(row.walkForwardResults)
    && row.walkForwardResults.every((fold) => fold && typeof fold.label === 'string' && Number.isFinite(fold.trades) && Number.isFinite(fold.netReturnPct) && Number.isFinite(fold.profitFactor) && Number.isFinite(fold.maxDrawdownPct))
    && Number.isFinite(row.netReturnPct)
    && Number.isFinite(row.profitFactor)
    && Number.isFinite(row.maxDrawdownPct)
    && typeof row.costStressPassed === 'boolean'
    && Number.isFinite(row.sealedHoldoutUsesForCandidate)
    && Number.isFinite(row.materialVetoCount)
    && Boolean(row.regimes && typeof row.regimes === 'object');
}

function parseState(value: unknown): ParliamentPromotionState | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<ParliamentPromotionState>;
  if (row.version !== PARLIAMENT_PROMOTION_STATE_VERSION) return null;
  if (row.candidateFingerprint !== PARLIAMENT_CANDIDATE_FINGERPRINT) return null;
  if (row.stage !== 'SHADOW' && row.stage !== 'PAPER_FORWARD' && row.stage !== 'SIGNAL_ELIGIBLE') return null;
  if (row.autonomousLiveExecutionEnabled !== false) return null;
  return {
    ...initialState('loaded'),
    ...row,
    candidateFingerprint: PARLIAMENT_CANDIDATE_FINGERPRINT,
    lastEvidence: row.lastEvidence && isEvidence(row.lastEvidence) ? row.lastEvidence : null,
    lastBlockers: Array.isArray(row.lastBlockers) ? row.lastBlockers.map(String) : [],
    autonomousLiveExecutionEnabled: false,
  };
}

export class ParliamentPromotionStore {
  private state: ParliamentPromotionState;

  constructor(private readonly filePath = resolvePrivateConfigPath('parliament-promotion-state.json')) {
    this.state = this.load();
  }

  private load(): ParliamentPromotionState {
    try {
      if (!existsSync(this.filePath)) return initialState();
      const parsed = parseState(JSON.parse(readFileSync(this.filePath, 'utf8')));
      if (parsed) return parsed;
      return initialState('state_identity_changed_reset_to_shadow');
    } catch {
      return initialState('state_unreadable_reset_to_shadow');
    }
  }

  private persist(next: ParliamentPromotionState): ParliamentPromotionState {
    this.state = { ...next, autonomousLiveExecutionEnabled: false };
    writePrivateJsonFileSync(this.filePath, this.state);
    return this.snapshot();
  }

  snapshot(): ParliamentPromotionState {
    return {
      ...this.state,
      lastEvidence: this.state.lastEvidence ? {
        ...this.state.lastEvidence,
        regimes: Object.fromEntries(Object.entries(this.state.lastEvidence.regimes).map(([key, value]) => [key, { ...value }])),
      } : null,
      lastBlockers: [...this.state.lastBlockers],
      autonomousLiveExecutionEnabled: false,
    };
  }

  scannerMode(): ParliamentScannerMode {
    if (this.state.stage === 'SIGNAL_ELIGIBLE' && this.state.signalDeliveryOptIn && this.state.humanApprovedAt) {
      return 'SIGNAL_PROMOTED';
    }
    if (this.state.stage === 'PAPER_FORWARD') return 'PAPER_PROMOTED';
    return 'SHADOW';
  }

  evaluateEvidence(evidence: ParliamentValidationEvidence): ParliamentPromotionState {
    if (!isEvidence(evidence)) throw new Error('invalid_parliament_validation_evidence');
    const decision = evaluateParliamentPromotion({ stage: this.state.stage, evidence });
    let nextStage = this.state.stage;
    let signalPromotionReady = this.state.signalPromotionReady;
    let transitionReason: string = decision.action;

    if (this.state.stage === 'SHADOW' && decision.action === 'AUTO_PROMOTE_PAPER' && decision.authorized) {
      nextStage = 'PAPER_FORWARD';
      signalPromotionReady = false;
      transitionReason = 'auto_promoted_shadow_to_paper_forward';
    } else if (this.state.stage === 'PAPER_FORWARD' && decision.action === 'REQUIRE_HUMAN_SIGNAL_PROMOTION' && decision.authorized) {
      signalPromotionReady = true;
      transitionReason = 'paper_forward_gate_passed_waiting_for_human_signal_promotion';
    }

    return this.persist({
      ...this.state,
      stage: nextStage,
      signalPromotionReady,
      signalDeliveryOptIn: nextStage === 'SIGNAL_ELIGIBLE' ? this.state.signalDeliveryOptIn : false,
      humanApprovedAt: nextStage === 'SIGNAL_ELIGIBLE' ? this.state.humanApprovedAt : null,
      lastEvidence: evidence,
      lastBlockers: decision.blockers,
      lastTransitionReason: transitionReason,
      updatedAt: Date.now(),
      autonomousLiveExecutionEnabled: false,
    });
  }

  approveSignalPromotion(input: { confirmation: string; signalDeliveryOptIn: boolean }): ParliamentPromotionState {
    if (input.confirmation !== PARLIAMENT_SIGNAL_CONFIRMATION) throw new Error('parliament_signal_confirmation_mismatch');
    if (input.signalDeliveryOptIn !== true) throw new Error('parliament_signal_delivery_opt_in_required');
    if (this.state.stage !== 'PAPER_FORWARD' || !this.state.signalPromotionReady) throw new Error('parliament_signal_promotion_not_ready');
    return this.persist({
      ...this.state,
      stage: 'SIGNAL_ELIGIBLE',
      signalPromotionReady: true,
      signalDeliveryOptIn: true,
      humanApprovedAt: Date.now(),
      updatedAt: Date.now(),
      lastTransitionReason: 'human_approved_signal_contribution',
      autonomousLiveExecutionEnabled: false,
    });
  }

  demoteToShadow(input: { confirmation: string; reason?: string }): ParliamentPromotionState {
    if (input.confirmation !== PARLIAMENT_DEMOTION_CONFIRMATION) throw new Error('parliament_demotion_confirmation_mismatch');
    return this.persist({
      ...initialState(input.reason?.trim() || 'operator_demoted_to_shadow'),
      lastEvidence: this.state.lastEvidence,
      lastBlockers: [...this.state.lastBlockers],
      updatedAt: Date.now(),
    });
  }
}

let singleton: ParliamentPromotionStore | null = null;
export function getParliamentPromotionStore(): ParliamentPromotionStore {
  singleton ??= new ParliamentPromotionStore();
  return singleton;
}
