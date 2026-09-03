import type { Express } from 'express';
import { dirname, join } from 'node:path';
import type { StrategyDefinition } from '../../types.ts';
import { AcademyStore } from './storage/academyStore.ts';
import { StrategyKnowledgeBase } from './knowledge/strategyKnowledgeBase.ts';
import { StrategyCollector, InternalStrategySourceAdapter } from './discovery/strategyCollector.ts';
import { AutomatedEvaluationPipeline } from './evaluation/evaluationPipeline.ts';
import { AcademyEngine } from './engine/academyEngine.ts';
import { StrategyLabStore } from './lab/strategyLabStore.ts';
import { StrategyLabService } from './lab/strategyLabService.ts';
import { registerAcademyRoutes, type AcademySubsystem } from './api/academyRoutes.ts';

import {
  DefaultAcademyIntelligenceProvider,
  setGlobalAcademyIntelligenceProvider,
  getGlobalAcademyIntelligenceProvider,
  type AcademyIntelligenceProvider,
} from './services/academyIntelligenceProvider.ts';

export interface CreateAcademySubsystemOptions {
  storagePath: string;
  strategyProvider: () => StrategyDefinition[];
  intervalMs?: number;
  now?: () => number;
  /**
   * SQLite path for the research strategy lab. Defaults to a sibling of the
   * academy store. The lab is opened lazily on first use, so a caller that never
   * touches the lab never creates the file or holds a database handle.
   */
  labStoragePath?: string;
}

export function createAcademySubsystem(options: CreateAcademySubsystemOptions): AcademySubsystem & { provider: AcademyIntelligenceProvider } {
  const requestedIntervalMs = options.intervalMs ?? 5 * 60_000;
  const intervalMs = Number.isFinite(requestedIntervalMs)
    ? Math.max(30_000, Math.min(24 * 60 * 60_000, requestedIntervalMs))
    : 5 * 60_000;
  const store = new AcademyStore(options.storagePath, intervalMs);
  const knowledgeBase = new StrategyKnowledgeBase(store);
  const collector = new StrategyCollector();
  collector.register(new InternalStrategySourceAdapter(options.strategyProvider, options.now));
  // One pipeline instance, shared by the engine and the research lab, so a lab
  // candidate is evaluated by literally the same evaluator as a house strategy.
  const pipeline = new AutomatedEvaluationPipeline();
  const engine = new AcademyEngine(collector, pipeline, knowledgeBase, options.now);
  const provider = new DefaultAcademyIntelligenceProvider(knowledgeBase, engine);
  setGlobalAcademyIntelligenceProvider(provider);

  const labStoragePath = options.labStoragePath ?? join(dirname(options.storagePath), 'strategy-lab-v1.db');
  let labInstance: StrategyLabService | null = null;
  const lab = (): StrategyLabService => {
    if (!labInstance) {
      labInstance = new StrategyLabService(new StrategyLabStore(labStoragePath), pipeline, options.now);
    }
    return labInstance;
  };

  return { engine, knowledgeBase, provider, lab };
}

export function registerAcademySubsystem(app: Express, subsystem: AcademySubsystem): void {
  registerAcademyRoutes(app, subsystem);
}

export * from './types.ts';
export * from './api/strategyIntelligence.ts';
export * from './services/academyIntelligenceProvider.ts';
export * from './knowledge/strategyKnowledgeBase.ts';
export * from './engine/academyEngine.ts';
export * from './discovery/strategyCollector.ts';
export * from './evaluation/evaluationPipeline.ts';
export * from './evaluation/lifecycle.ts';
export * from './engine/strategyIntelligenceEngine.ts';
export * from './lab/strategyLabTypes.ts';
export * from './lab/strategyLabStore.ts';
export * from './lab/strategyLabService.ts';
