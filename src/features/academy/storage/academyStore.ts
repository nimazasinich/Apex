import { readDurableJsonFileSync, writeDurableJsonFileSync } from '../../../services/durableJsonFile.ts';
import {
  ACADEMY_ENGINE_VERSION,
  ACADEMY_SCHEMA_VERSION,
  type AcademyDatabase,
  type AcademyEngineStatus,
} from '../types.ts';

export function emptyAcademyEngineStatus(intervalMs: number): AcademyEngineStatus {
  return {
    engineVersion: ACADEMY_ENGINE_VERSION,
    enabled: false,
    phase: 'OFF',
    strategiesAnalyzed: 0,
    newDiscoveries: 0,
    totalStrategies: 0,
    cycleCount: 0,
    lastUpdateAt: null,
    lastCycleId: null,
    lastError: null,
    intervalMs,
    safety: {
      researchOnly: true,
      executionAuthorized: false,
      autonomousLiveExecutionEnabled: false,
      automaticPromotionEnabled: false,
    },
  };
}

export function emptyAcademyDatabase(intervalMs: number): AcademyDatabase {
  return {
    schemaVersion: ACADEMY_SCHEMA_VERSION,
    revision: 0,
    records: {},
    cycles: [],
    engine: emptyAcademyEngineStatus(intervalMs),
    updatedAt: 0,
  };
}

function isAcademyDatabase(value: unknown): value is AcademyDatabase {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AcademyDatabase>;
  return candidate.schemaVersion === ACADEMY_SCHEMA_VERSION
    && typeof candidate.revision === 'number'
    && Number.isInteger(candidate.revision)
    && Boolean(candidate.records && typeof candidate.records === 'object' && !Array.isArray(candidate.records))
    && Array.isArray(candidate.cycles)
    && Boolean(candidate.engine && typeof candidate.engine === 'object');
}

export class AcademyStore {
  constructor(private readonly filePath: string, private readonly intervalMs: number) {}

  load(): AcademyDatabase {
    const parsed = readDurableJsonFileSync(this.filePath);
    if (parsed == null) return emptyAcademyDatabase(this.intervalMs);
    if (!isAcademyDatabase(parsed)) throw new Error('academy_store_schema_invalid');
    return {
      ...parsed,
      engine: {
        ...parsed.engine,
        enabled: false,
        phase: 'OFF',
        intervalMs: this.intervalMs,
        safety: emptyAcademyEngineStatus(this.intervalMs).safety,
      },
    };
  }

  save(database: AcademyDatabase): void {
    if (!isAcademyDatabase(database)) throw new Error('academy_store_schema_invalid');
    for (const record of Object.values(database.records)) {
      if (!record.evidenceHistory.length) throw new Error(`academy_strategy_evidence_required:${record.recordId}`);
    }
    writeDurableJsonFileSync(this.filePath, database, { maxBytes: 64 * 1024 * 1024 });
  }
}
