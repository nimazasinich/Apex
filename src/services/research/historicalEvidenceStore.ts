import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const HISTORICAL_EVIDENCE_STORE_VERSION = 'historical_evidence_store_v1' as const;

export type HistoricalEvidenceKind =
  | 'CLOSED_CANDLE'
  | 'FUNDING'
  | 'OPEN_INTEREST'
  | 'ORDERBOOK_L2'
  | 'EXECUTED_TRADE'
  | 'NEWS'
  | 'SENTIMENT'
  | 'ONCHAIN_WHALE'
  | 'CROSS_VENUE';

export interface HistoricalEvidenceRecord<T = unknown> {
  id: string;
  kind: HistoricalEvidenceKind;
  provider: string;
  venue: string | null;
  instrument: string;
  /** Upstream event/observation time. Never fetch/render time. */
  sourceObservedAt: number;
  receivedAt: number;
  schemaVersion: string;
  adapterVersion: string;
  lineageId: string;
  parentLineageIds: string[];
  payload: T;
}

export interface HistoricalEvidenceManifest {
  version: typeof HISTORICAL_EVIDENCE_STORE_VERSION;
  sha256: string;
  bytes: number;
  recordCount: number;
  providers: string[];
  venues: string[];
  instruments: string[];
  sourceTimeRange: { from: number; to: number } | null;
  schemaVersions: string[];
  adapterVersions: string[];
  capabilityCoverage: Record<HistoricalEvidenceKind, number>;
  continuityDiagnostics: {
    monotonic: boolean;
    duplicateIds: string[];
    invalidObservationTimes: string[];
    gapAssessment: 'NOT_EVALUATED_WITHOUT_EXPECTED_CADENCE';
  };
}

export interface FinalizedHistoricalEvidenceDataset {
  manifest: HistoricalEvidenceManifest;
  records: HistoricalEvidenceRecord[];
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, stable(child)]));
  }
  return value;
}

function canonicalBytes(records: HistoricalEvidenceRecord[]): Buffer {
  const canonical = records
    .map((row) => stable({ ...row, parentLineageIds: [...new Set(row.parentLineageIds)].sort() }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return Buffer.from(JSON.stringify(canonical));
}

function validateRecord(record: HistoricalEvidenceRecord): void {
  if (!record.id || !record.kind || !record.provider || !record.instrument || !record.schemaVersion || !record.adapterVersion || !record.lineageId) {
    throw new Error('historical_evidence_identity_missing');
  }
  if (!Number.isFinite(record.sourceObservedAt) || record.sourceObservedAt <= 0) throw new Error('historical_evidence_source_time_invalid');
  if (!Number.isFinite(record.receivedAt) || record.receivedAt <= 0) throw new Error('historical_evidence_received_time_invalid');
  if (record.sourceObservedAt > record.receivedAt + 5_000) throw new Error('historical_evidence_future_source_time');
}

export function finalizeHistoricalEvidenceDataset(recordsInput: HistoricalEvidenceRecord[]): FinalizedHistoricalEvidenceDataset {
  const records = recordsInput.map((row) => structuredClone(row));
  records.forEach(validateRecord);
  const duplicateIds = [...new Set(records.filter((row, index) => records.findIndex((candidate) => candidate.id === row.id) !== index).map((row) => row.id))].sort();
  if (duplicateIds.length) throw new Error(`historical_evidence_duplicate_id:${duplicateIds.join(',')}`);
  const byTime = [...records].sort((a, b) => a.sourceObservedAt - b.sourceObservedAt || a.id.localeCompare(b.id));
  const bytes = canonicalBytes(records);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const coverage = Object.fromEntries(([
    'CLOSED_CANDLE','FUNDING','OPEN_INTEREST','ORDERBOOK_L2','EXECUTED_TRADE','NEWS','SENTIMENT','ONCHAIN_WHALE','CROSS_VENUE',
  ] as HistoricalEvidenceKind[]).map((kind) => [kind, records.filter((row) => row.kind === kind).length])) as Record<HistoricalEvidenceKind, number>;
  const manifest: HistoricalEvidenceManifest = {
    version: HISTORICAL_EVIDENCE_STORE_VERSION,
    sha256,
    bytes: bytes.length,
    recordCount: records.length,
    providers: [...new Set(records.map((row) => row.provider))].sort(),
    venues: [...new Set(records.map((row) => row.venue).filter((row): row is string => Boolean(row)))].sort(),
    instruments: [...new Set(records.map((row) => row.instrument))].sort(),
    sourceTimeRange: byTime.length ? { from: byTime[0].sourceObservedAt, to: byTime.at(-1)!.sourceObservedAt } : null,
    schemaVersions: [...new Set(records.map((row) => row.schemaVersion))].sort(),
    adapterVersions: [...new Set(records.map((row) => row.adapterVersion))].sort(),
    capabilityCoverage: coverage,
    continuityDiagnostics: {
      monotonic: true,
      duplicateIds: [],
      invalidObservationTimes: [],
      gapAssessment: 'NOT_EVALUATED_WITHOUT_EXPECTED_CADENCE',
    },
  };
  return { manifest, records: byTime };
}

/** Persist bytes under their digest. Existing datasets are never overwritten. */
export function persistHistoricalEvidenceDataset(directory: string, dataset: FinalizedHistoricalEvidenceDataset): { dataPath: string; manifestPath: string } {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const dataPath = path.join(directory, `${dataset.manifest.sha256}.json`);
  const manifestPath = path.join(directory, `${dataset.manifest.sha256}.manifest.json`);
  const payload = JSON.stringify(dataset.records);
  const digest = createHash('sha256').update(canonicalBytes(dataset.records)).digest('hex');
  if (digest !== dataset.manifest.sha256) throw new Error('historical_evidence_manifest_digest_mismatch');
  if (!existsSync(dataPath)) writeFileSync(dataPath, payload, { flag: 'wx', mode: 0o600 });
  if (!existsSync(manifestPath)) writeFileSync(manifestPath, JSON.stringify(dataset.manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { dataPath, manifestPath };
}

export function loadHistoricalEvidenceDataset(dataPath: string, manifestPath: string): FinalizedHistoricalEvidenceDataset {
  const records = JSON.parse(readFileSync(dataPath, 'utf8')) as HistoricalEvidenceRecord[];
  const declared = JSON.parse(readFileSync(manifestPath, 'utf8')) as HistoricalEvidenceManifest;
  const finalized = finalizeHistoricalEvidenceDataset(records);
  if (declared.sha256 !== finalized.manifest.sha256) throw new Error('historical_evidence_dataset_tampered');
  return finalized;
}

/** Historical consumers may only see evidence already observed at the requested instant. */
export function evidenceAvailableAsOf(
  dataset: FinalizedHistoricalEvidenceDataset,
  asOf: number,
  options: { kind?: HistoricalEvidenceKind; instrument?: string; venue?: string } = {},
): HistoricalEvidenceRecord[] {
  if (!Number.isFinite(asOf) || asOf <= 0) return [];
  return dataset.records.filter((row) => row.sourceObservedAt <= asOf
    && (!options.kind || row.kind === options.kind)
    && (!options.instrument || row.instrument === options.instrument)
    && (!options.venue || row.venue === options.venue));
}

export function requireHistoricalEvidenceCoverage(
  dataset: FinalizedHistoricalEvidenceDataset,
  requiredKinds: readonly HistoricalEvidenceKind[],
  range?: { from: number; to: number },
): { ok: true } | { ok: false; state: 'BLOCKED'; reason: 'REQUIRED_DATASET_NOT_PRESENT'; missing: HistoricalEvidenceKind[] } {
  const rows = range
    ? dataset.records.filter((row) => row.sourceObservedAt >= range.from && row.sourceObservedAt <= range.to)
    : dataset.records;
  const present = new Set(rows.map((row) => row.kind));
  const missing = [...new Set(requiredKinds)].filter((kind) => !present.has(kind));
  return missing.length ? { ok: false, state: 'BLOCKED', reason: 'REQUIRED_DATASET_NOT_PRESENT', missing } : { ok: true };
}
