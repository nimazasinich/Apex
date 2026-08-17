import { randomUUID } from 'node:crypto';
import { createUnavailableEdgeEvidence, type EdgeEvidence, type EdgeId } from '../../contracts/realtime/edgeEvidence';
import type { LiquidityHunterEvaluation } from '../../contracts/realtime/liquidityHunterState';
import type { MetaModelEvaluationPayload } from '../../contracts/realtime/marketPayloads';
import type { SmartMoneyContext } from '../../types';
import type { LiquidityHunterFeatureFlags } from './featureFlags';
import type { WorldStateStore } from '../realtime/worldStateStore';
import type { RealtimeSeriesStore } from '../realtime/realtimeSeriesStore';
import type { OrderBookRebuilder } from '../realtime/orderBookRebuilder';
import { evaluateFundingOiEdge } from './edges/fundingOiEdge';
import { evaluateOptionsGammaEdge } from './edges/optionsGammaEdge';
import { evaluateSentimentVelocityEdge } from './edges/sentimentVelocityEdge';
import { evaluateLiquidationTopologyEdge } from './edges/liquidationTopologyEdge';
import { evaluateSessionLiquidityEdge } from './edges/sessionLiquidityEdge';
import { evaluateMultiExchangeCvdEdge } from './edges/multiExchangeCvdEdge';
import { evaluateIcebergAbsorptionEdge } from './edges/icebergAbsorptionEdge';
import { evaluateWhalePositioningEdge } from './edges/whalePositioningEdge';
import { evaluateContrarianWalletEdge } from './edges/contrarianWalletEdge';
import { evaluateMetaModelEdge } from './edges/metaModelEdge';
import type { LiquidityHunterEdgeContext, LiquidityHunterEdgeEvaluator } from './edgeRuntime';
import { clamp01 } from './edgeRuntime';
import { evaluateLayer1Macro } from './layer1MacroEvaluator';
import { evaluateLayer2Target } from './layer2TargetEvaluator';
import { evaluateLayer3Microstructure } from './layer3MicrostructureEvaluator';
import { evaluateLayer4Shadow } from './layer4ShadowValidator';
import { LIQUIDITY_HUNTER_CORE_FUSION_POLICY } from './fusionPolicy';
import { LiquidityHunterSetupStateMachine, type LiquidityHunterIdFactory } from './setupStateMachine';
import type { LiquidityHunterMetaModelEvaluator } from './historicalSimilarityMetaModel';
import type { EdgeThresholdProfile } from '../../contracts/realtime/edgeThreshold';
import { applyEdgeThresholdGate } from './edgeThresholdRegistry';
import type { AppendOnlyEventLog } from '../realtime/appendOnlyEventLog';

export interface LiquidityHunterCoreDependencies {
  flags: LiquidityHunterFeatureFlags;
  worldState: WorldStateStore;
  seriesStore: RealtimeSeriesStore;
  orderBook: OrderBookRebuilder;
  idFactory?: LiquidityHunterIdFactory;
  metaModel?: LiquidityHunterMetaModelEvaluator | null;
  edgeThresholdResolver?: (edgeId: EdgeId, symbol: string, timeframe?: string, regime?: string) => EdgeThresholdProfile;
  setupEventLog?: AppendOnlyEventLog | null;
}

export interface LiquidityHunterEvaluateInput {
  symbol: string;
  now?: number;
  smartMoneyContext?: SmartMoneyContext | null;
  metaModelEvaluation?: MetaModelEvaluationPayload | null;
  currentPrice?: number | null;
}

interface EdgeTask {
  edgeId: EdgeId;
  enabled: boolean;
  disabledReason: string;
  evaluator: LiquidityHunterEdgeEvaluator;
}

function enforceEvidenceFreshness(row: EdgeEvidence, now: number): EdgeEvidence {
  if ((row.status === 'PASS' || row.status === 'FAIL') && row.expiresAt <= now) {
    return {
      ...row,
      status: 'STALE',
      direction: null,
      score: null,
      dataQuality: 0,
      conflictingReasons: [...row.conflictingReasons, 'evidence_expired_before_layer_evaluation'],
    };
  }
  return row;
}

function layerScore(evidence: EdgeEvidence[]): number {
  const useful = evidence.filter((row) => row.status === 'PASS');
  if (!useful.length) return 0;
  return useful.reduce((sum, row) => sum + (row.score ?? 0) * row.dataQuality, 0) / useful.length;
}

export class LiquidityHunterDynamicFusionEngine {
  private readonly flags: LiquidityHunterFeatureFlags;
  private readonly worldState: WorldStateStore;
  private readonly seriesStore: RealtimeSeriesStore;
  private readonly orderBook: OrderBookRebuilder;
  private readonly stateMachine: LiquidityHunterSetupStateMachine;
  private readonly idFactory: LiquidityHunterIdFactory;
  private readonly metaModel: LiquidityHunterMetaModelEvaluator | null;
  private readonly edgeThresholdResolver: LiquidityHunterCoreDependencies['edgeThresholdResolver'];
  private readonly latest = new Map<string, LiquidityHunterEvaluation>();

  constructor(dependencies: LiquidityHunterCoreDependencies) {
    this.flags = dependencies.flags;
    this.worldState = dependencies.worldState;
    this.seriesStore = dependencies.seriesStore;
    this.orderBook = dependencies.orderBook;
    this.idFactory = dependencies.idFactory ?? randomUUID;
    this.metaModel = dependencies.metaModel ?? null;
    this.edgeThresholdResolver = dependencies.edgeThresholdResolver;
    this.stateMachine = new LiquidityHunterSetupStateMachine(this.idFactory, dependencies.setupEventLog ?? null);
  }

  private applyGovernedThreshold(row: EdgeEvidence, symbol: string): EdgeEvidence {
    if (!this.edgeThresholdResolver) return row;
    try {
      const profile = this.edgeThresholdResolver(row.edgeId, symbol, 'REALTIME', 'ANY');
      return applyEdgeThresholdGate(row, profile);
    } catch (error) {
      // Governance failures cannot manufacture execution authority. Preserve the
      // existing edge decision and surface the problem as research metadata.
      return {
        ...row,
        metadata: {
          ...(row.metadata ?? {}),
          edgeThresholdGovernanceError: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  async evaluate(input: LiquidityHunterEvaluateInput): Promise<LiquidityHunterEvaluation> {
    const now = input.now ?? Date.now();
    const symbol = input.symbol.toUpperCase();
    const context: LiquidityHunterEdgeContext = {
      symbol,
      now,
      worldState: this.worldState,
      seriesStore: this.seriesStore,
      orderBook: this.orderBook,
      smartMoneyContext: input.smartMoneyContext,
      metaModelEvaluation: input.metaModelEvaluation,
      currentPrice: input.currentPrice,
    };

    const tasks: EdgeTask[] = [
      { edgeId: 'FUNDING_OI', enabled: this.flags.liquidityHunterEnabled, disabledReason: 'liquidity_hunter_disabled', evaluator: evaluateFundingOiEdge },
      { edgeId: 'OPTIONS_GAMMA', enabled: this.flags.liquidityHunterEnabled && this.flags.optionsGexEnabled, disabledReason: 'options_gex_disabled_or_not_configured', evaluator: evaluateOptionsGammaEdge },
      { edgeId: 'SENTIMENT_VELOCITY', enabled: this.flags.liquidityHunterEnabled && this.flags.sentimentVelocityEnabled, disabledReason: 'sentiment_velocity_disabled', evaluator: evaluateSentimentVelocityEdge },
      { edgeId: 'LIQUIDATION_TOPOLOGY', enabled: this.flags.liquidityHunterEnabled, disabledReason: 'liquidity_hunter_disabled', evaluator: evaluateLiquidationTopologyEdge },
      { edgeId: 'SESSION_LIQUIDITY', enabled: this.flags.liquidityHunterEnabled, disabledReason: 'liquidity_hunter_disabled', evaluator: evaluateSessionLiquidityEdge },
      { edgeId: 'MULTI_EXCHANGE_CVD', enabled: this.flags.liquidityHunterEnabled, disabledReason: 'liquidity_hunter_disabled', evaluator: evaluateMultiExchangeCvdEdge },
      { edgeId: 'ICEBERG_ABSORPTION', enabled: this.flags.liquidityHunterEnabled && this.flags.realtimeL2Enabled, disabledReason: 'realtime_l2_disabled', evaluator: evaluateIcebergAbsorptionEdge },
      { edgeId: 'WHALE_POSITIONING', enabled: this.flags.liquidityHunterEnabled && this.flags.walletGradingEnabled, disabledReason: 'wallet_grading_disabled', evaluator: evaluateWhalePositioningEdge },
      { edgeId: 'CONTRARIAN_WALLETS', enabled: this.flags.liquidityHunterEnabled && this.flags.walletGradingEnabled, disabledReason: 'wallet_grading_disabled', evaluator: evaluateContrarianWalletEdge },
    ];

    // Independent evidence computations are intentionally launched together.
    // Layer ordering is applied only after all read-only edge tasks complete.
    // This gives bounded multitasking without allowing one edge to mutate
    // another edge's inputs or skip deterministic layer prerequisites.
    const settled = await Promise.allSettled(tasks.map(async (task) => {
      if (!task.enabled) return createUnavailableEdgeEvidence(task.edgeId, 'NOT_CONFIGURED', task.disabledReason, now);
      return task.evaluator(context);
    }));
    const evidence = settled.map((result, index): EdgeEvidence => enforceEvidenceFreshness(
      result.status === 'fulfilled'
        ? result.value
        : createUnavailableEdgeEvidence(tasks[index].edgeId, 'UNKNOWN', `edge_evaluation_failed:${result.reason instanceof Error ? result.reason.message : String(result.reason)}`, now),
      now,
    ));

    let metaEvidence: EdgeEvidence;
    if (!this.flags.liquidityHunterEnabled || !this.flags.metaModelEnabled) {
      metaEvidence = createUnavailableEdgeEvidence('META_MODEL', 'NOT_CONFIGURED', 'meta_model_disabled', now);
    } else {
      let metaModelEvaluation = input.metaModelEvaluation ?? null;
      if (!metaModelEvaluation && this.metaModel) {
        try {
          metaModelEvaluation = this.metaModel.evaluate(evidence, now);
        } catch (error) {
          metaEvidence = createUnavailableEdgeEvidence('META_MODEL', 'UNKNOWN', `meta_model_evaluation_failed:${error instanceof Error ? error.message : String(error)}`, now);
          evidence.push(metaEvidence);
          metaModelEvaluation = null;
        }
      }
      if (!evidence.some((row) => row.edgeId === 'META_MODEL')) {
        metaEvidence = enforceEvidenceFreshness(evaluateMetaModelEdge({ ...context, metaModelEvaluation }), now);
        evidence.push(metaEvidence);
      }
    }

    const governedEvidence = evidence.map((row) => this.applyGovernedThreshold(row, symbol));
    const layer1 = evaluateLayer1Macro(governedEvidence, now);
    const layer2 = evaluateLayer2Target(governedEvidence, layer1.macro, now);
    const layer3 = evaluateLayer3Microstructure(governedEvidence, layer1.macro, layer2.target, now);
    const layer4 = evaluateLayer4Shadow(governedEvidence, layer3.trigger, now);
    const layers = [layer1.layer, layer2.layer, layer3.layer, layer4.layer];
    const state = await this.stateMachine.update(symbol, layers, layer4.decision, now);

    const scores = {
      1: layerScore(layer1.layer.supporting),
      2: layerScore(layer2.layer.supporting),
      3: layerScore(layer3.layer.supporting),
      4: layerScore(layer4.layer.supporting),
    } as const;
    const weighted = ([1, 2, 3, 4] as const).reduce((sum, layer) => sum + scores[layer] * LIQUIDITY_HUNTER_CORE_FUSION_POLICY.layerWeights[layer], 0);
    const deterministicQuality = [...layer1.layer.supporting, ...layer2.layer.supporting, ...layer3.layer.supporting]
      .reduce((min, row) => Math.min(min, row.dataQuality), 1);
    const fusionScore = clamp01(weighted * deterministicQuality);
    const ready = state.state === 'READY_FOR_CONFIRMATION'
      && (layer4.decision === 'CONFIRM' || layer4.decision === 'CONFIRM_WITH_REDUCED_SIZE')
      && layer1.layer.status === 'PASSED'
      && layer2.layer.status === 'PASSED'
      && layer3.layer.status === 'PASSED'
      && fusionScore >= 0.45;

    const reasons = [
      `setup_state:${state.state}`,
      `layer4:${layer4.decision}`,
      `fusion_score:${fusionScore.toFixed(4)}`,
      ...(ready ? ['manual_confirmation_candidate_only'] : ['no_execution_authorization']),
    ];
    const evaluation: LiquidityHunterEvaluation = {
      evaluationId: this.idFactory(),
      symbol,
      generatedAt: now,
      setupId: state.setupId,
      setupState: state.state,
      transitions: state.transitions,
      layers,
      evidence: governedEvidence,
      macro: layer1.macro,
      target: layer2.target,
      trigger: layer3.trigger,
      shadowValidation: layer4.decision,
      fusionScore,
      eligibleForManualConfirmation: ready,
      shadowOnly: true,
      authoritative: false,
      reasons,
    };
    this.latest.set(symbol, structuredClone(evaluation));
    return evaluation;
  }

  latestEvaluation(symbol: string): LiquidityHunterEvaluation | null {
    const value = this.latest.get(symbol.toUpperCase());
    return value ? structuredClone(value) : null;
  }

  setupSnapshots() {
    return this.stateMachine.list();
  }

  reset(symbol?: string): void {
    this.stateMachine.reset(symbol?.toUpperCase());
    if (symbol) this.latest.delete(symbol.toUpperCase());
    else this.latest.clear();
  }
}
