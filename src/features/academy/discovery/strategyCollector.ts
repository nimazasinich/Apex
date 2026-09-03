import { createHash } from 'node:crypto';
import type { StrategyDefinition } from '../../../types.ts';
import type {
  AcademyEvidenceMetadata,
  AcademySourceKind,
  DiscoveredAcademyStrategy,
} from '../types.ts';

export interface AcademySourceAdapter {
  readonly id: string;
  readonly sourceKind: AcademySourceKind;
  collect(): DiscoveredAcademyStrategy[];
}

export interface AcademyCollectionResult {
  strategies: DiscoveredAcademyStrategy[];
  issues: string[];
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function evidenceForDefinition(definition: StrategyDefinition, now: number): AcademyEvidenceMetadata[] {
  const definitionFingerprint = stableHash({
    strategyId: definition.strategyId,
    version: definition.version,
    engine: definition.engine,
    rules: [definition.setupRules, definition.triggerRules, definition.riskRules, definition.exitRules, definition.noTradeRules],
    parameters: definition.parameters,
  });
  const discovery: AcademyEvidenceMetadata = {
    evidenceId: `academy-evidence-${definitionFingerprint.slice(0, 24)}`,
    kind: 'DISCOVERY',
    source: 'APEX strategy registry',
    sourceKind: 'INTERNAL_STRATEGY_ENGINE',
    verification: 'INTERNAL_RECORDED',
    observedAt: null,
    ingestedAt: now,
    fingerprint: definitionFingerprint,
    dataState: 'not_applicable',
    datasetFingerprint: null,
    runId: null,
    notes: ['Strategy definition recorded by the canonical APEX strategy registry.'],
  };
  if (!definition.latestSnapshot) return [discovery];

  const snapshot = definition.latestSnapshot;
  const evidenceFingerprint = stableHash({
    strategyId: definition.strategyId,
    version: definition.version,
    snapshot,
  });
  return [discovery, {
    evidenceId: `academy-evidence-${evidenceFingerprint.slice(0, 24)}`,
    kind: snapshot.source === 'validation' ? 'VALIDATION' : snapshot.source === 'paper' ? 'PAPER_FORWARD' : snapshot.source === 'live' ? 'LIVE_OUTCOME' : 'BACKTEST',
    source: snapshot.source ?? 'APEX recorded strategy evidence',
    sourceKind: 'BACKTEST_RESULT',
    verification: 'INTERNAL_RECORDED',
    observedAt: snapshot.lastBacktestAt ?? null,
    ingestedAt: now,
    fingerprint: evidenceFingerprint,
    dataState: snapshot.dataState === 'live' ? 'live' : snapshot.dataState === 'unavailable' ? 'unavailable' : 'degraded',
    datasetFingerprint: snapshot.datasetFingerprint ?? null,
    runId: snapshot.runId ?? null,
    notes: [...(snapshot.validationLimitations ?? []), ...(snapshot.warnings ?? [])],
  }];
}

export function discoveredStrategyFromDefinition(definition: StrategyDefinition, now = Date.now()): DiscoveredAcademyStrategy {
  const recordId = `${definition.strategyId}@${definition.version}`;
  return {
    recordId,
    strategyId: definition.strategyId,
    version: definition.version,
    name: definition.name,
    sourceKind: 'INTERNAL_STRATEGY_ENGINE',
    source: 'APEX strategy registry',
    metadata: {
      engine: definition.engine,
      longShort: definition.longShort,
      wave: definition.wave,
      evidenceTier: definition.evidenceTier,
      supportedIntervals: definition.supportedIntervals,
      componentCount: definition.componentCount,
    },
    logic: {
      summary: definition.summary,
      setupRules: [...definition.setupRules],
      triggerRules: [...definition.triggerRules],
      riskRules: [...definition.riskRules],
      exitRules: [...definition.exitRules],
      noTradeRules: [...definition.noTradeRules],
    },
    indicators: {
      state: 'UNAVAILABLE',
      values: [],
      detail: 'The canonical strategy contract does not expose a dedicated indicator list; Academy does not infer one from prose.',
    },
    parameters: definition.parameters.map((parameter) => ({ ...parameter, legacyKeys: parameter.legacyKeys ? [...parameter.legacyKeys] : undefined })),
    marketConditions: [...definition.regimeRules],
    sourceReferences: [...definition.sourceReferences],
    knownFailureModes: [...definition.knownFailureModes],
    categories: [...definition.categories],
    evidenceHistory: evidenceForDefinition(definition, now),
    latestSnapshot: definition.latestSnapshot ? JSON.parse(JSON.stringify(definition.latestSnapshot)) as StrategyDefinition['latestSnapshot'] : null,
    performanceEvidenceTrusted: true,
    registryStatus: definition.status,
  };
}

export class InternalStrategySourceAdapter implements AcademySourceAdapter {
  readonly id = 'apex-internal-strategy-registry';
  readonly sourceKind = 'INTERNAL_STRATEGY_ENGINE' as const;

  constructor(private readonly provider: () => StrategyDefinition[], private readonly now: () => number = Date.now) {}

  collect(): DiscoveredAcademyStrategy[] {
    return this.provider().map((definition) => discoveredStrategyFromDefinition(definition, this.now()));
  }
}

export class StrategyCollector {
  private readonly adapters = new Map<string, AcademySourceAdapter>();

  register(adapter: AcademySourceAdapter): void {
    if (!adapter.id.trim()) throw new Error('academy_source_adapter_id_required');
    if (this.adapters.has(adapter.id)) throw new Error(`academy_source_adapter_duplicate:${adapter.id}`);
    this.adapters.set(adapter.id, adapter);
  }

  collect(): AcademyCollectionResult {
    const byRecordId = new Map<string, DiscoveredAcademyStrategy>();
    const issues: string[] = [];
    for (const adapter of this.adapters.values()) {
      try {
        for (const strategy of adapter.collect()) {
          if (!strategy.recordId || !strategy.strategyId || !Number.isInteger(strategy.version) || strategy.version < 1) {
            issues.push(`${adapter.id}:invalid_strategy_identity`);
            continue;
          }
          if (!strategy.evidenceHistory.length) {
            issues.push(`${adapter.id}:${strategy.recordId}:missing_evidence_metadata`);
            continue;
          }
          const existing = byRecordId.get(strategy.recordId);
          if (!existing) {
            byRecordId.set(strategy.recordId, strategy);
            continue;
          }
          const evidence = new Map(existing.evidenceHistory.map((item) => [item.evidenceId, item]));
          for (const item of strategy.evidenceHistory) evidence.set(item.evidenceId, item);
          byRecordId.set(strategy.recordId, {
            ...existing,
            ...strategy,
            evidenceHistory: [...evidence.values()],
            performanceEvidenceTrusted: existing.performanceEvidenceTrusted || strategy.performanceEvidenceTrusted,
          });
        }
      } catch (error) {
        issues.push(`${adapter.id}:${error instanceof Error ? error.message : 'collection_failed'}`);
      }
    }
    return { strategies: [...byRecordId.values()], issues };
  }
}
