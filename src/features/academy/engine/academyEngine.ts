import { randomUUID } from 'node:crypto';
import { StrategyCollector } from '../discovery/strategyCollector.ts';
import { AutomatedEvaluationPipeline } from '../evaluation/evaluationPipeline.ts';
import { StrategyKnowledgeBase } from '../knowledge/strategyKnowledgeBase.ts';
import { buildEvolutionSuggestions } from '../ml/evolutionEngine.ts';
import { assignSimilarityClusters } from '../ml/similarityEngine.ts';
import { rankAcademyStrategies } from '../ml/strategyRanker.ts';
import type {
  AcademyCycleReport,
  AcademyEnginePhase,
  AcademyEngineStatus,
  AcademyStrategyRecord,
  DiscoveredAcademyStrategy,
} from '../types.ts';

export class AcademyEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private cycleInFlight = false;
  private nextRunAt: number | null = null;
  private currentStatus: AcademyEngineStatus;

  constructor(
    private readonly collector: StrategyCollector,
    private readonly pipeline: AutomatedEvaluationPipeline,
    private readonly knowledgeBase: StrategyKnowledgeBase,
    private readonly now: () => number = Date.now,
  ) {
    this.currentStatus = knowledgeBase.status();
  }

  status(): AcademyEngineStatus {
    const s = JSON.parse(JSON.stringify(this.currentStatus)) as AcademyEngineStatus;
    return { ...s, nextRunAt: this.nextRunAt };
  }

  autopilotStatus() {
    return {
      enabled: this.currentStatus.enabled,
      phase: this.currentStatus.phase,
      intervalMs: this.currentStatus.intervalMs,
      lastRunAt: this.currentStatus.lastUpdateAt,
      nextRunAt: this.nextRunAt,
      cycleCount: this.currentStatus.cycleCount,
      strategiesAnalyzed: this.currentStatus.strategiesAnalyzed,
      newDiscoveries: this.currentStatus.newDiscoveries,
      totalStrategies: this.currentStatus.totalStrategies,
      lastError: this.currentStatus.lastError,
      separateFromProgramAutopilot: true as const,
      safety: {
        researchOnly: true as const,
        executionAuthorized: false as const,
        autonomousLiveExecutionEnabled: false as const,
        automaticPromotionEnabled: false as const,
      },
    };
  }

  setIntervalMs(intervalMs: number): void {
    const valid = Math.max(10_000, Math.min(24 * 60 * 60_000, Number(intervalMs) || 60_000));
    this.currentStatus = { ...this.currentStatus, intervalMs: valid };
    this.knowledgeBase.persistStatus(this.currentStatus);
    if (this.timer) {
      clearInterval(this.timer);
      this.nextRunAt = this.now() + valid;
      this.timer = setInterval(() => {
        try {
          this.runOnce();
        } catch { /* Status and error detail recorded by runOnce */ }
        this.nextRunAt = this.now() + this.currentStatus.intervalMs;
      }, valid);
      this.timer.unref?.();
    }
  }

  private phase(phase: AcademyEnginePhase): void {
    this.currentStatus = { ...this.currentStatus, phase };
  }

  private improve(records: AcademyStrategyRecord[], updatedAt: number): AcademyStrategyRecord[] {
    const clusters = assignSimilarityClusters(records);
    const ranks = rankAcademyStrategies(records);
    return records.map((record) => {
      const next = {
        ...record,
        similarityClusterId: clusters.get(record.recordId) ?? null,
        knowledgeRank: ranks.get(record.recordId) ?? null,
        updatedAt,
      };
      return { ...next, evolutionSuggestions: buildEvolutionSuggestions(next) };
    });
  }

  runOnce(): AcademyCycleReport {
    if (this.cycleInFlight) throw new Error('academy_cycle_in_flight');
    this.cycleInFlight = true;
    const startedAt = this.now();
    const cycleId = `academy-cycle-${randomUUID()}`;
    try {
      this.phase('LEARNING');
      const collection = this.collector.collect();
      const existingRecords = this.knowledgeBase.all();
      const existingById = new Map(existingRecords.map((record) => [record.recordId, record]));
      const newDiscoveries = collection.strategies.filter((strategy) => !existingById.has(strategy.recordId)).length;

      this.phase('EVALUATING');
      const evaluated = collection.strategies.map((strategy) => this.pipeline.evaluate(strategy, existingById.get(strategy.recordId), this.now()));
      const merged = new Map(existingRecords.map((record) => [record.recordId, record]));
      for (const record of evaluated) merged.set(record.recordId, record);

      this.phase('IMPROVING');
      const completedAt = this.now();
      const improved = this.improve([...merged.values()], completedAt);
      const report: AcademyCycleReport = {
        cycleId,
        startedAt,
        completedAt,
        discovered: collection.strategies.length,
        newDiscoveries,
        evaluated: evaluated.length,
        stored: improved.length,
        issues: collection.issues,
      };
      this.currentStatus = {
        ...this.currentStatus,
        phase: 'STORING',
        strategiesAnalyzed: this.currentStatus.strategiesAnalyzed + evaluated.length,
        newDiscoveries,
        totalStrategies: improved.length,
        cycleCount: this.currentStatus.cycleCount + 1,
        lastUpdateAt: completedAt,
        lastCycleId: cycleId,
        lastError: collection.issues.length ? collection.issues.join(' | ') : null,
      };
      this.currentStatus = { ...this.currentStatus, phase: this.currentStatus.enabled ? 'IDLE' : 'OFF' };
      this.knowledgeBase.commit(improved, report, this.currentStatus);
      return report;
    } catch (error) {
      this.currentStatus = { ...this.currentStatus, phase: 'FAILED', lastError: error instanceof Error ? error.message : 'academy_cycle_failed' };
      this.knowledgeBase.persistStatus(this.currentStatus);
      throw error;
    } finally {
      this.cycleInFlight = false;
    }
  }

  ingest(strategy: DiscoveredAcademyStrategy): AcademyStrategyRecord {
    if (!strategy.evidenceHistory.length) throw new Error(`academy_strategy_evidence_required:${strategy.recordId}`);
    const previous = this.knowledgeBase.get(strategy.recordId);
    const evaluated = this.pipeline.evaluate(strategy, previous ?? undefined, this.now());
    const existing = this.knowledgeBase.all().filter((record) => record.recordId !== evaluated.recordId);
    const updatedAt = this.now();
    const improved = this.improve([...existing, evaluated], updatedAt);
    const stored = improved.find((record) => record.recordId === evaluated.recordId)!;
    this.currentStatus = { ...this.currentStatus, totalStrategies: improved.length, newDiscoveries: previous ? 0 : 1 };
    this.knowledgeBase.replaceAll(improved, this.currentStatus, updatedAt);
    return stored;
  }

  start(intervalMs?: number): AcademyCycleReport {
    if (intervalMs) {
      const valid = Math.max(10_000, Math.min(24 * 60 * 60_000, Number(intervalMs) || 60_000));
      this.currentStatus = { ...this.currentStatus, intervalMs: valid };
    }
    if (this.currentStatus.enabled) throw new Error('academy_engine_already_enabled');
    this.currentStatus = { ...this.currentStatus, enabled: true, phase: 'LEARNING', lastError: null };
    let report: AcademyCycleReport;
    try {
      report = this.runOnce();
    } catch (error) {
      this.currentStatus = { ...this.currentStatus, enabled: false, phase: 'FAILED' };
      this.knowledgeBase.persistStatus(this.currentStatus);
      throw error;
    }
    this.nextRunAt = this.now() + this.currentStatus.intervalMs;
    this.timer = setInterval(() => {
      try {
        this.runOnce();
      } catch { /* Status and durable error detail are recorded by runOnce. */ }
      this.nextRunAt = this.now() + this.currentStatus.intervalMs;
    }, this.currentStatus.intervalMs);
    this.timer.unref?.();
    return report;
  }

  stop(): AcademyEngineStatus {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.nextRunAt = null;
    this.currentStatus = { ...this.currentStatus, enabled: false, phase: 'OFF' };
    this.knowledgeBase.persistStatus(this.currentStatus);
    return this.status();
  }
}
