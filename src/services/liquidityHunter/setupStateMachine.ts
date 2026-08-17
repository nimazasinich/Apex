import { randomUUID } from 'node:crypto';
import type { LayerDecision, LiquidityHunterSetupState, LiquidityHunterSetupTransition, ShadowValidationDecision } from '../../contracts/realtime/liquidityHunterState';
import { LIQUIDITY_HUNTER_CORE_FUSION_POLICY } from './fusionPolicy';
import type { AppendOnlyEventLog, DurableSetupTransitionRecord } from '../realtime/appendOnlyEventLog';

interface ActiveSetup {
  setupId: string;
  symbol: string;
  state: LiquidityHunterSetupState;
  expiresAt: number;
  transitions: LiquidityHunterSetupTransition[];
}

const TERMINAL = new Set<LiquidityHunterSetupState>(['EXPIRED', 'REJECTED']);

function evidenceIds(layers: LayerDecision[]): string[] {
  return [...new Set(layers.flatMap((layer) => [...layer.supporting, ...layer.conflicting, ...layer.missing]
    .map((edge) => `${edge.edgeId}:${edge.observedAt}:${edge.sourceVersion}`)))];
}

export interface SetupStateMachineResult {
  setupId: string | null;
  state: LiquidityHunterSetupState;
  expiresAt: number;
  transitions: LiquidityHunterSetupTransition[];
}

export type LiquidityHunterIdFactory = () => string;

export class LiquidityHunterSetupStateMachine {
  private readonly setups = new Map<string, ActiveSetup>();
  private readonly history = new Map<string, ActiveSetup>();
  private readonly idFactory: LiquidityHunterIdFactory;
  private readonly eventLog: AppendOnlyEventLog | null;

  constructor(idFactory: LiquidityHunterIdFactory = randomUUID, eventLog: AppendOnlyEventLog | null = null) {
    this.idFactory = idFactory;
    this.eventLog = eventLog;
    this.restore();
  }

  async update(symbol: string, layers: LayerDecision[], shadowDecision: ShadowValidationDecision, now = Date.now()): Promise<SetupStateMachineResult> {
    const layer1 = layers.find((row) => row.layer === 1);
    const layer2 = layers.find((row) => row.layer === 2);
    const layer3 = layers.find((row) => row.layer === 3);
    const layer4 = layers.find((row) => row.layer === 4);
    let current = this.setups.get(symbol);

    if (current && current.expiresAt <= now) {
      await this.transition(current, 'EXPIRED', layers, now, ['setup_evidence_expired']);
    }
    if (current && TERMINAL.has(current.state)) current = undefined;

    if (!current && layer1?.status === 'PASSED') {
      current = {
        setupId: this.idFactory(),
        symbol,
        state: 'IDLE',
        expiresAt: layer1.expiresAt,
        transitions: [],
      };
      this.setups.set(symbol, current);
      this.history.set(current.setupId, current);
      const created: LiquidityHunterSetupTransition = {
        transitionId: this.idFactory(), setupId: current.setupId, previousState: 'IDLE', nextState: 'IDLE',
        evidenceIds: evidenceIds(layers), policyVersion: LIQUIDITY_HUNTER_CORE_FUSION_POLICY.version,
        occurredAt: now, expiresAt: current.expiresAt, reasons: ['setup_created'],
      };
      try { await this.persist(symbol, created); }
      catch (error) { this.setups.delete(symbol); this.history.delete(current.setupId); throw error; }
      current.transitions.push(created);
    }

    if (!current) return { setupId: null, state: 'IDLE', expiresAt: now, transitions: [] };

    if (layer1?.status !== 'PASSED') {
      if (current.state !== 'IDLE') await this.transition(current, 'REJECTED', layers, now, ['macro_layer_lost']);
      return this.snapshot(current);
    }

    await this.ensureState(current, 'MACRO_ELIGIBLE', layers, now, ['macro_layer_passed'], layer1.expiresAt);

    if (layer2?.status === 'EXPIRED') {
      await this.transition(current, 'EXPIRED', layers, now, ['target_expired']);
      return this.snapshot(current);
    }
    if (layer2?.status !== 'PASSED') return this.snapshot(current);

    await this.ensureState(current, 'TARGET_MAPPED', layers, now, ['target_layer_passed'], layer2.expiresAt);
    await this.ensureState(current, 'ARMED', layers, now, ['target_valid_and_armed'], layer2.expiresAt);

    if (layer3?.status === 'EXPIRED') {
      await this.transition(current, 'EXPIRED', layers, now, ['microstructure_target_expired']);
      return this.snapshot(current);
    }
    if (layer3?.status !== 'PASSED') return this.snapshot(current);

    await this.ensureState(current, 'MICRO_TRIGGERED', layers, now, ['microstructure_trigger_passed'], layer3.expiresAt);
    await this.ensureState(current, 'SHADOW_VALIDATING', layers, now, ['shadow_validation_started'], layer3.expiresAt);

    if (shadowDecision === 'REJECT') {
      await this.transition(current, 'REJECTED', layers, now, ['layer4_shadow_rejected']);
      return this.snapshot(current);
    }
    if (layer4?.status === 'PASSED' && (shadowDecision === 'CONFIRM' || shadowDecision === 'CONFIRM_WITH_REDUCED_SIZE')) {
      await this.ensureState(current, 'READY_FOR_CONFIRMATION', layers, now, [`layer4:${shadowDecision.toLowerCase()}`], layer4.expiresAt);
    }
    return this.snapshot(current);
  }

  reset(symbol?: string): void {
    if (symbol) this.setups.delete(symbol);
    else this.setups.clear();
  }

  private async ensureState(
    setup: ActiveSetup,
    next: LiquidityHunterSetupState,
    layers: LayerDecision[],
    now: number,
    reasons: string[],
    expiresAt: number,
  ): Promise<void> {
    if (setup.state === next) {
      setup.expiresAt = Math.min(setup.expiresAt, expiresAt);
      return;
    }
    const order: LiquidityHunterSetupState[] = [
      'IDLE', 'MACRO_ELIGIBLE', 'TARGET_MAPPED', 'ARMED', 'MICRO_TRIGGERED', 'SHADOW_VALIDATING', 'READY_FOR_CONFIRMATION',
    ];
    const currentIndex = order.indexOf(setup.state);
    const nextIndex = order.indexOf(next);
    if (currentIndex < 0 || nextIndex < 0 || nextIndex !== currentIndex + 1) return;
    await this.transition(setup, next, layers, now, reasons, expiresAt);
  }

  private async transition(
    setup: ActiveSetup,
    nextState: LiquidityHunterSetupState,
    layers: LayerDecision[],
    now: number,
    reasons: string[],
    expiresAt = now,
  ): Promise<void> {
    const previousState = setup.state;
    const nextExpiresAt = nextState === 'READY_FOR_CONFIRMATION'
      ? Math.max(now, expiresAt)
      : Math.max(now, Math.min(setup.expiresAt || expiresAt, expiresAt || setup.expiresAt));
    const transition: LiquidityHunterSetupTransition = {
      transitionId: this.idFactory(),
      setupId: setup.setupId,
      previousState,
      nextState,
      evidenceIds: evidenceIds(layers),
      policyVersion: LIQUIDITY_HUNTER_CORE_FUSION_POLICY.version,
      occurredAt: now,
      expiresAt: nextExpiresAt,
      reasons: [...reasons],
    };
    await this.persist(setup.symbol, transition);
    setup.state = nextState;
    setup.expiresAt = nextExpiresAt;
    setup.transitions.push(transition);
    if (setup.transitions.length > 200) setup.transitions.splice(0, setup.transitions.length - 200);
  }

  private async persist(symbol: string, transition: LiquidityHunterSetupTransition): Promise<void> {
    if (!this.eventLog) return;
    const record: DurableSetupTransitionRecord = {
      recordType: 'LIQUIDITY_HUNTER_SETUP_TRANSITION', schemaVersion: 1, symbol, transition,
    };
    await this.eventLog.appendSetupTransition(record);
  }

  private restore(): void {
    if (!this.eventLog) return;
    const { records, corruptLines } = this.eventLog.readSetupTransitions();
    if (corruptLines > 0) throw new Error('setup_transition_log_corrupt');
    for (const { symbol, transition } of records) {
      let setup = this.history.get(transition.setupId);
      if (!setup) {
        setup = { setupId: transition.setupId, symbol, state: transition.previousState, expiresAt: transition.expiresAt, transitions: [] };
        this.history.set(transition.setupId, setup);
      }
      if (setup.state !== transition.previousState && !(transition.previousState === 'IDLE' && transition.nextState === 'IDLE')) {
        throw new Error('setup_transition_log_sequence_invalid');
      }
      setup.state = transition.nextState;
      setup.expiresAt = transition.expiresAt;
      setup.transitions.push(structuredClone(transition));
      if (setup.transitions.length > 200) setup.transitions.splice(0, setup.transitions.length - 200);
      this.setups.set(symbol, setup);
    }
  }

  list(): SetupStateMachineResult[] {
    return [...this.history.values()].map((setup) => this.snapshot(setup));
  }

  private snapshot(setup: ActiveSetup): SetupStateMachineResult {
    return {
      setupId: setup.setupId,
      state: setup.state,
      expiresAt: setup.expiresAt,
      transitions: setup.transitions.map((row) => ({ ...row, evidenceIds: [...row.evidenceIds], reasons: [...row.reasons] })),
    };
  }
}
