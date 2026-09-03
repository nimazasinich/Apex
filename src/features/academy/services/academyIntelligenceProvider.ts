import type {
  AcademyConsumer,
  AcademyEngineStatus,
  AcademyIntelligenceResolution,
  AcademyRegime,
  AcademyStrategyRecord,
} from '../types.ts';
import { buildAcademyConsumerIntelligence } from '../api/strategyIntelligence.ts';
import type { StrategyKnowledgeBase } from '../knowledge/strategyKnowledgeBase.ts';
import type { AcademyEngine } from '../engine/academyEngine.ts';

export interface AcademyResolveInput {
  strategyId: string;
  strategyVersion: number;
  consumer: AcademyConsumer;
  regime?: AcademyRegime | null;
  now?: number;
}

export interface AcademyIntelligenceProvider {
  resolve(input: AcademyResolveInput): AcademyIntelligenceResolution;
  getExact(strategyId: string, strategyVersion: number): AcademyStrategyRecord | null;
  status(): AcademyEngineStatus;
  isEnabled(): boolean;
}

export class DefaultAcademyIntelligenceProvider implements AcademyIntelligenceProvider {
  constructor(
    private readonly knowledgeBase: StrategyKnowledgeBase,
    private readonly engine?: AcademyEngine | null,
  ) {}

  status(): AcademyEngineStatus {
    if (this.engine) {
      return this.engine.status();
    }
    return this.knowledgeBase.status();
  }

  isEnabled(): boolean {
    return this.status().enabled;
  }

  getExact(strategyId: string, strategyVersion: number): AcademyStrategyRecord | null {
    if (!strategyId || typeof strategyVersion !== 'number' || !Number.isInteger(strategyVersion) || strategyVersion < 1) {
      return null;
    }
    return this.knowledgeBase.getExact(strategyId, strategyVersion);
  }

  resolve(input: AcademyResolveInput): AcademyIntelligenceResolution {
    const { strategyId, strategyVersion, consumer, regime = null, now = Date.now() } = input;
    const recordId = `${strategyId}@${strategyVersion}`;

    if (!strategyId || typeof strategyVersion !== 'number' || !Number.isInteger(strategyVersion) || strategyVersion < 1) {
      return {
        status: 'VERSION_MISMATCH',
        strategyId: strategyId || '',
        strategyVersion: strategyVersion || 0,
        recordId,
        intelligence: null,
        detail: `Invalid strategy identity requested: id=${strategyId}, version=${strategyVersion}. Exact positive integer version is required.`,
      };
    }

    const currentStatus = this.status();
    if (!currentStatus.enabled) {
      return {
        status: 'ACADEMY_DISABLED',
        strategyId,
        strategyVersion,
        recordId,
        intelligence: null,
        detail: `Academy engine is currently disabled (phase=${currentStatus.phase}). Advisory intelligence unavailable.`,
      };
    }

    const exactRecord = this.knowledgeBase.getExact(strategyId, strategyVersion);
    if (!exactRecord) {
      // Check if the strategy exists in other versions to provide high-clarity diagnostics
      const anyVersionRecord = this.knowledgeBase.get(strategyId);
      if (anyVersionRecord && anyVersionRecord.version !== strategyVersion) {
        return {
          status: 'VERSION_MISMATCH',
          strategyId,
          strategyVersion,
          recordId,
          intelligence: null,
          detail: `Strategy '${strategyId}' exists at version ${anyVersionRecord.version}, but exact version ${strategyVersion} was requested and is not found in knowledge base.`,
        };
      }

      return {
        status: 'STRATEGY_NOT_FOUND',
        strategyId,
        strategyVersion,
        recordId,
        intelligence: null,
        detail: `Strategy record '${recordId}' not found in Academy knowledge base.`,
      };
    }

    const intelligence = buildAcademyConsumerIntelligence(exactRecord, consumer, regime, now);

    let resolutionStatus: AcademyIntelligenceResolution['status'] = 'RESOLVED';
    if (intelligence.state === 'NOT_EVALUATED') {
      resolutionStatus = 'NOT_EVALUATED';
    } else if (intelligence.state === 'INSUFFICIENT_DATA') {
      resolutionStatus = 'INSUFFICIENT_DATA';
    }

    return {
      status: resolutionStatus,
      strategyId,
      strategyVersion,
      recordId,
      intelligence,
      detail: `Academy exact record '${recordId}' resolved with state '${intelligence.state}' for consumer '${consumer}'.`,
    };
  }
}

let globalProviderInstance: AcademyIntelligenceProvider | null = null;

export function setGlobalAcademyIntelligenceProvider(provider: AcademyIntelligenceProvider | null): void {
  globalProviderInstance = provider;
}

export function getGlobalAcademyIntelligenceProvider(): AcademyIntelligenceProvider | null {
  return globalProviderInstance;
}
