import { AcademyStore } from '../storage/academyStore.ts';
import type {
  AcademyCycleReport,
  AcademyDatabase,
  AcademyEngineStatus,
  AcademyStrategyRecord,
} from '../types.ts';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class StrategyKnowledgeBase {
  private database: AcademyDatabase;

  constructor(private readonly store: AcademyStore) {
    this.database = store.load();
  }

  all(): AcademyStrategyRecord[] {
    return Object.values(this.database.records).map(clone);
  }

  /**
   * Non-authoritative convenience lookup for UI/browsing only.
   * Silently resolves latest version if only strategyId is provided.
   * MUST NOT be used for production gating or safety authority.
   */
  get(recordOrStrategyId: string): AcademyStrategyRecord | null {
    const direct = this.database.records[recordOrStrategyId];
    if (direct) return clone(direct);
    const matches = Object.values(this.database.records)
      .filter((record) => record.strategyId === recordOrStrategyId)
      .sort((left, right) => right.version - left.version);
    return matches[0] ? clone(matches[0]) : null;
  }

  /**
   * Mandatory exact-identity resolver for production safety, scanner gating,
   * trade plans, and risk governance. Never silently substitutes another version.
   */
  getExact(strategyId: string, strategyVersion: number): AcademyStrategyRecord | null {
    const exactRecordId = `${strategyId}@${strategyVersion}`;
    const direct = this.database.records[exactRecordId];
    if (direct) return clone(direct);
    const match = Object.values(this.database.records)
      .find((record) => record.strategyId === strategyId && record.version === strategyVersion);
    return match ? clone(match) : null;
  }

  has(recordId: string): boolean {
    return Boolean(this.database.records[recordId]);
  }

  hasExact(strategyId: string, strategyVersion: number): boolean {
    return Boolean(this.getExact(strategyId, strategyVersion));
  }

  putExact(strategyId: string, strategyVersion: number, record: AcademyStrategyRecord): void {
    const exactRecordId = `${strategyId}@${strategyVersion}`;
    this.database = {
      ...this.database,
      revision: this.database.revision + 1,
      records: { ...this.database.records, [exactRecordId]: clone(record) },
      updatedAt: Date.now(),
    };
    this.store.save(this.database);
  }

  status(): AcademyEngineStatus {
    return clone(this.database.engine);
  }

  commit(records: AcademyStrategyRecord[], report: AcademyCycleReport, status: AcademyEngineStatus): void {
    const nextRecords = { ...this.database.records };
    for (const record of records) {
      if (!record.evidenceHistory.length) throw new Error(`academy_strategy_evidence_required:${record.recordId}`);
      nextRecords[record.recordId] = clone(record);
    }
    this.database = {
      ...this.database,
      revision: this.database.revision + 1,
      records: nextRecords,
      cycles: [...this.database.cycles, clone(report)].slice(-200),
      engine: clone(status),
      updatedAt: report.completedAt,
    };
    this.store.save(this.database);
  }

  upsert(record: AcademyStrategyRecord, status?: AcademyEngineStatus): void {
    if (!record.evidenceHistory.length) throw new Error(`academy_strategy_evidence_required:${record.recordId}`);
    this.database = {
      ...this.database,
      revision: this.database.revision + 1,
      records: { ...this.database.records, [record.recordId]: clone(record) },
      engine: clone(status ?? this.database.engine),
      updatedAt: record.updatedAt,
    };
    this.store.save(this.database);
  }

  replaceAll(records: AcademyStrategyRecord[], status: AcademyEngineStatus, updatedAt: number): void {
    const nextRecords: Record<string, AcademyStrategyRecord> = {};
    for (const record of records) {
      if (!record.evidenceHistory.length) throw new Error(`academy_strategy_evidence_required:${record.recordId}`);
      nextRecords[record.recordId] = clone(record);
    }
    this.database = {
      ...this.database,
      revision: this.database.revision + 1,
      records: nextRecords,
      engine: clone(status),
      updatedAt,
    };
    this.store.save(this.database);
  }

  persistStatus(status: AcademyEngineStatus): void {
    this.database = { ...this.database, revision: this.database.revision + 1, engine: clone(status), updatedAt: Date.now() };
    this.store.save(this.database);
  }

  snapshot(): AcademyDatabase {
    return clone(this.database);
  }
}
