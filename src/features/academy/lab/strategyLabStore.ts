/**
 * strategyLabStore.ts — the strategy lab's SQL persistence (Task 1, stage 3).
 *
 * WHY SQLITE AND NOT THE EXISTING DURABLE-JSON STORE
 * The task specification requires that the stored candidates be dumpable with
 * `sqlite3 <db> "select * from strategy_candidates"` as proof that they are
 * really persisted, and requires real foreign keys between candidates, their
 * evaluation runs, and their fusions. A JSON document store cannot satisfy
 * either requirement, so this is a genuine relational store.
 *
 * WHY `node:sqlite` AND NOT `better-sqlite3`
 * `node:sqlite` ships inside Node 24 and needs no native compilation step. The
 * repository is pinned to Windows-only prebuilt binaries for esbuild/rollup and
 * installing native modules for another platform is forbidden, so a driver that
 * must be compiled was not an option. The API surface was verified against this
 * machine's Node before this file was written: foreign keys enforce, CHECK
 * constraints enforce, transactions roll back, and the produced file carries the
 * real `SQLite format 3` header.
 *
 * `node:sqlite` is flagged experimental by Node. It is used only for this
 * research-side lab, never on an execution path, and every read is validated at
 * the boundary below rather than trusted.
 *
 * THIS STORE IS INDEPENDENT OF `academyStore.ts`
 * It does not read, write, migrate, or validate the academy durable-JSON
 * database, and it carries its own `STRATEGY_LAB_SCHEMA_VERSION`.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  STRATEGY_LAB_SCHEMA_VERSION,
  isStrategyCandidateSourceType,
  isStrategyCandidateStatus,
  isStrategyFusionMethod,
  type StrategyCandidateRow,
  type StrategyCandidateStatus,
  type StrategyComparisonRow,
  type StrategyEvaluationRunRow,
  type StrategyFusionRow,
} from './strategyLabTypes.ts';

/**
 * The four required tables, plus a meta table holding this store's own schema
 * version. `parse_confidence` is range-checked in SQL as well as in TypeScript
 * so a bad write fails at the database rather than being silently stored.
 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS strategy_lab_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS strategy_candidates (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('DISCOVERED','COMBINED','HOUSE')),
  source_url TEXT,
  source_citation TEXT,
  discovered_at_utc TEXT NOT NULL,
  raw_content_hash TEXT NOT NULL,
  parsed_rules_json TEXT NOT NULL,
  parse_confidence REAL NOT NULL CHECK (parse_confidence >= 0.0 AND parse_confidence <= 1.0),
  parent_candidate_ids TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('INGESTED','QUEUED_FOR_TEST','TESTING','TESTED','IMPROVING','VALIDATED','REJECTED')),
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS strategy_evaluation_runs (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES strategy_candidates(id) ON DELETE RESTRICT,
  dataset_fingerprint TEXT,
  run_id TEXT,
  holdout_protocol_status TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  created_at_utc TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS strategy_comparisons (
  id TEXT PRIMARY KEY,
  candidate_ids TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  created_at_utc TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS strategy_fusions (
  id TEXT PRIMARY KEY,
  parent_candidate_ids TEXT NOT NULL,
  fusion_method TEXT NOT NULL CHECK (fusion_method IN ('WEIGHTED_ENSEMBLE','SEQUENTIAL_FILTER')),
  resulting_candidate_id TEXT NOT NULL REFERENCES strategy_candidates(id) ON DELETE RESTRICT,
  created_at_utc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_strategy_evaluation_runs_candidate
  ON strategy_evaluation_runs(candidate_id);
CREATE INDEX IF NOT EXISTS idx_strategy_candidates_status
  ON strategy_candidates(status);
`;

type SqlRow = Record<string, unknown>;

function text(row: SqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') throw new Error(`strategy_lab_row_invalid:${column}`);
  return value;
}

function nullableText(row: SqlRow, column: string): string | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`strategy_lab_row_invalid:${column}`);
  return value;
}

function idList(row: SqlRow, column: string): string[] {
  const parsed: unknown = JSON.parse(text(row, column));
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
    throw new Error(`strategy_lab_row_invalid:${column}`);
  }
  return parsed as string[];
}

function mapCandidate(row: SqlRow): StrategyCandidateRow {
  const sourceType = row.source_type;
  const status = row.status;
  if (!isStrategyCandidateSourceType(sourceType)) throw new Error('strategy_lab_row_invalid:source_type');
  if (!isStrategyCandidateStatus(status)) throw new Error('strategy_lab_row_invalid:status');
  const parseConfidence = Number(row.parse_confidence);
  if (!Number.isFinite(parseConfidence) || parseConfidence < 0 || parseConfidence > 1) {
    throw new Error('strategy_lab_row_invalid:parse_confidence');
  }
  return {
    id: text(row, 'id'),
    sourceType,
    sourceUrl: nullableText(row, 'source_url'),
    sourceCitation: nullableText(row, 'source_citation'),
    discoveredAtUtc: text(row, 'discovered_at_utc'),
    rawContentHash: text(row, 'raw_content_hash'),
    parsedRulesJson: text(row, 'parsed_rules_json'),
    parseConfidence,
    parentCandidateIds: idList(row, 'parent_candidate_ids'),
    status,
    createdAtUtc: text(row, 'created_at_utc'),
    updatedAtUtc: text(row, 'updated_at_utc'),
  };
}

function mapEvaluationRun(row: SqlRow): StrategyEvaluationRunRow {
  return {
    id: text(row, 'id'),
    candidateId: text(row, 'candidate_id'),
    datasetFingerprint: nullableText(row, 'dataset_fingerprint'),
    runId: nullableText(row, 'run_id'),
    holdoutProtocolStatus: text(row, 'holdout_protocol_status'),
    metricsJson: text(row, 'metrics_json'),
    createdAtUtc: text(row, 'created_at_utc'),
  };
}

function mapComparison(row: SqlRow): StrategyComparisonRow {
  return {
    id: text(row, 'id'),
    candidateIds: idList(row, 'candidate_ids'),
    metricsJson: text(row, 'metrics_json'),
    createdAtUtc: text(row, 'created_at_utc'),
  };
}

function mapFusion(row: SqlRow): StrategyFusionRow {
  const fusionMethod = row.fusion_method;
  if (!isStrategyFusionMethod(fusionMethod)) throw new Error('strategy_lab_row_invalid:fusion_method');
  return {
    id: text(row, 'id'),
    parentCandidateIds: idList(row, 'parent_candidate_ids'),
    fusionMethod,
    resultingCandidateId: text(row, 'resulting_candidate_id'),
    createdAtUtc: text(row, 'created_at_utc'),
  };
}

export class StrategyLabStore {
  private readonly db: DatabaseSync;
  readonly filePath: string;

  constructor(filePath: string) {
    if (!filePath.trim()) throw new Error('strategy_lab_path_required');
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);

    // SQLite defaults foreign_keys to OFF for backwards compatibility, so the
    // REFERENCES clauses above would be inert decoration without this. It is
    // asserted rather than assumed: a lab whose FKs are silently off would
    // accept orphan evaluation runs, which is exactly the failure this schema
    // exists to prevent.
    this.db.exec('PRAGMA foreign_keys = ON;');
    const pragma = this.db.prepare('PRAGMA foreign_keys;').get() as SqlRow | undefined;
    if (Number(Object.values(pragma ?? {})[0]) !== 1) throw new Error('strategy_lab_foreign_keys_unavailable');

    this.db.exec(SCHEMA_SQL);
    this.assertSchemaVersion();
  }

  private assertSchemaVersion(): void {
    const row = this.db.prepare('SELECT value FROM strategy_lab_meta WHERE key = ?').get('schema_version') as SqlRow | undefined;
    if (!row) {
      this.db.prepare('INSERT INTO strategy_lab_meta (key, value) VALUES (?, ?)')
        .run('schema_version', String(STRATEGY_LAB_SCHEMA_VERSION));
      return;
    }
    const recorded = Number(row.value);
    // Fail closed on an unknown version rather than writing into a shape this
    // build does not understand.
    if (recorded !== STRATEGY_LAB_SCHEMA_VERSION) {
      throw new Error(`strategy_lab_schema_version_unsupported:${String(row.value)}`);
    }
  }

  insertCandidate(candidate: StrategyCandidateRow): StrategyCandidateRow {
    this.db.prepare(`
      INSERT INTO strategy_candidates (
        id, source_type, source_url, source_citation, discovered_at_utc,
        raw_content_hash, parsed_rules_json, parse_confidence,
        parent_candidate_ids, status, created_at_utc, updated_at_utc
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      candidate.id,
      candidate.sourceType,
      candidate.sourceUrl,
      candidate.sourceCitation,
      candidate.discoveredAtUtc,
      candidate.rawContentHash,
      candidate.parsedRulesJson,
      candidate.parseConfidence,
      JSON.stringify(candidate.parentCandidateIds),
      candidate.status,
      candidate.createdAtUtc,
      candidate.updatedAtUtc,
    );
    return this.getCandidateOrThrow(candidate.id);
  }

  getCandidate(id: string): StrategyCandidateRow | null {
    const row = this.db.prepare('SELECT * FROM strategy_candidates WHERE id = ?').get(id) as SqlRow | undefined;
    return row ? mapCandidate(row) : null;
  }

  getCandidateOrThrow(id: string): StrategyCandidateRow {
    const candidate = this.getCandidate(id);
    if (!candidate) throw new Error(`strategy_lab_candidate_not_found:${id}`);
    return candidate;
  }

  listCandidates(): StrategyCandidateRow[] {
    const rows = this.db.prepare('SELECT * FROM strategy_candidates ORDER BY created_at_utc ASC, id ASC').all() as SqlRow[];
    return rows.map(mapCandidate);
  }

  updateCandidateStatus(id: string, status: StrategyCandidateStatus, updatedAtUtc: string): StrategyCandidateRow {
    const result = this.db.prepare('UPDATE strategy_candidates SET status = ?, updated_at_utc = ? WHERE id = ?')
      .run(status, updatedAtUtc, id);
    if (Number(result.changes) !== 1) throw new Error(`strategy_lab_candidate_not_found:${id}`);
    return this.getCandidateOrThrow(id);
  }

  insertEvaluationRun(run: StrategyEvaluationRunRow): StrategyEvaluationRunRow {
    this.db.prepare(`
      INSERT INTO strategy_evaluation_runs (
        id, candidate_id, dataset_fingerprint, run_id,
        holdout_protocol_status, metrics_json, created_at_utc
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.id, run.candidateId, run.datasetFingerprint, run.runId,
      run.holdoutProtocolStatus, run.metricsJson, run.createdAtUtc,
    );
    const row = this.db.prepare('SELECT * FROM strategy_evaluation_runs WHERE id = ?').get(run.id) as SqlRow | undefined;
    if (!row) throw new Error(`strategy_lab_evaluation_run_not_found:${run.id}`);
    return mapEvaluationRun(row);
  }

  listEvaluationRuns(candidateId: string): StrategyEvaluationRunRow[] {
    const rows = this.db
      .prepare('SELECT * FROM strategy_evaluation_runs WHERE candidate_id = ? ORDER BY created_at_utc ASC, id ASC')
      .all(candidateId) as SqlRow[];
    return rows.map(mapEvaluationRun);
  }

  latestEvaluationRun(candidateId: string): StrategyEvaluationRunRow | null {
    const runs = this.listEvaluationRuns(candidateId);
    return runs.length ? runs[runs.length - 1] : null;
  }

  insertComparison(comparison: StrategyComparisonRow): StrategyComparisonRow {
    this.db.prepare('INSERT INTO strategy_comparisons (id, candidate_ids, metrics_json, created_at_utc) VALUES (?, ?, ?, ?)')
      .run(comparison.id, JSON.stringify(comparison.candidateIds), comparison.metricsJson, comparison.createdAtUtc);
    const row = this.db.prepare('SELECT * FROM strategy_comparisons WHERE id = ?').get(comparison.id) as SqlRow | undefined;
    if (!row) throw new Error(`strategy_lab_comparison_not_found:${comparison.id}`);
    return mapComparison(row);
  }

  listComparisons(): StrategyComparisonRow[] {
    const rows = this.db.prepare('SELECT * FROM strategy_comparisons ORDER BY created_at_utc ASC, id ASC').all() as SqlRow[];
    return rows.map(mapComparison);
  }

  insertFusion(fusion: StrategyFusionRow): StrategyFusionRow {
    this.db.prepare(`
      INSERT INTO strategy_fusions (id, parent_candidate_ids, fusion_method, resulting_candidate_id, created_at_utc)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      fusion.id, JSON.stringify(fusion.parentCandidateIds), fusion.fusionMethod,
      fusion.resultingCandidateId, fusion.createdAtUtc,
    );
    const row = this.db.prepare('SELECT * FROM strategy_fusions WHERE id = ?').get(fusion.id) as SqlRow | undefined;
    if (!row) throw new Error(`strategy_lab_fusion_not_found:${fusion.id}`);
    return mapFusion(row);
  }

  listFusions(): StrategyFusionRow[] {
    const rows = this.db.prepare('SELECT * FROM strategy_fusions ORDER BY created_at_utc ASC, id ASC').all() as SqlRow[];
    return rows.map(mapFusion);
  }

  /** Table names actually present, used by the schema-proof test and QA dump. */
  tableNames(): string[] {
    const rows = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as SqlRow[];
    return rows.map((row) => text(row, 'name'));
  }

  /** Runs an arbitrary read-only SELECT for dump/inspection purposes only. */
  dump(table: string): SqlRow[] {
    if (!this.tableNames().includes(table)) throw new Error(`strategy_lab_unknown_table:${table}`);
    // The table name is validated against sqlite_master above, so it cannot be
    // attacker-controlled text; bound parameters are not usable for identifiers.
    return this.db.prepare(`SELECT * FROM ${table}`).all() as SqlRow[];
  }

  close(): void {
    this.db.close();
  }
}
