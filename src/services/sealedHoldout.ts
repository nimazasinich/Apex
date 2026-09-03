import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { BacktestCandle } from './backtesting';
import { readDurableJsonFileSync, writeDurableJsonFileSync } from './durableJsonFile';
import { resolvePrivateDataDir } from './privateConfigFile';

export const SEALED_HOLDOUT_PROTOCOL_VERSION = 'sealed_holdout_protocol_v2' as const;
const LEGACY_SEALED_HOLDOUT_PROTOCOL_VERSION = 'sealed_holdout_protocol_v1' as const;

export interface FrozenCandidateManifest {
  strategyId: string;
  strategyVersion: number;
  parameters: Record<string, number | string>;
  scannerConfig: unknown;
  transactionCostProfileFingerprint: string;
  validationPolicyFingerprint: string;
  searchObjectiveFingerprint: string;
  developmentDatasetFingerprint: string;
  featureVersions: string[];
  authorityConfiguration: unknown;
}

export interface HoldoutUseRecord {
  key: string;
  candidateFingerprint: string;
  datasetFingerprint: string;
  openedAt: number;
  purpose: 'FINAL_GOVERNANCE';
  status: 'OPENED' | 'PASSED' | 'FAILED_RETIRED';
  completedAt: number | null;
}

interface HoldoutLedgerFile {
  version: typeof SEALED_HOLDOUT_PROTOCOL_VERSION;
  records: HoldoutUseRecord[];
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
}

const canonicalHash = (value: unknown): string => createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');

export function fingerprintGovernanceConfiguration(prefix: string, value: unknown): string {
  return `${prefix}:${canonicalHash(value)}`;
}

export function fingerprintDataset(candles: readonly BacktestCandle[]): string {
  return `dataset:${canonicalHash(candles.map((row) => [row.time, row.open, row.high, row.low, row.close, row.volume]))}`;
}

export function fingerprintFrozenCandidate(manifest: FrozenCandidateManifest): string {
  const normalized: FrozenCandidateManifest = {
    ...manifest,
    parameters: Object.fromEntries(Object.entries(manifest.parameters).sort(([left], [right]) => left.localeCompare(right))),
    featureVersions: [...manifest.featureVersions].sort(),
  };
  return `candidate:${canonicalHash(normalized)}`;
}

export class HoldoutUseLedger {
  private records = new Map<string, HoldoutUseRecord>();
  private readonly filePath?: string;

  constructor(filePath?: string) {
    this.filePath = filePath;
    if (!filePath) return;
    const raw = readDurableJsonFileSync(filePath) as Partial<HoldoutLedgerFile> | null;
    if (!raw) return;
    if (!Array.isArray(raw.records)) throw new Error('sealed_holdout_ledger_corrupt');
    if (raw.version !== SEALED_HOLDOUT_PROTOCOL_VERSION && raw.version !== LEGACY_SEALED_HOLDOUT_PROTOCOL_VERSION) {
      throw new Error('sealed_holdout_ledger_corrupt');
    }
    for (const record of raw.records) this.records.set(record.key, { ...record });
  }

  open(candidateFingerprint: string, datasetFingerprint: string, now = Date.now()): HoldoutUseRecord {
    const key = `${candidateFingerprint}:${datasetFingerprint}`;
    if (this.records.has(key)) throw new Error('sealed_holdout_reuse_blocked');
    const priorDatasetUse = [...this.records.values()].find((record) => record.datasetFingerprint === datasetFingerprint);
    if (priorDatasetUse) throw new Error('sealed_holdout_dataset_already_consumed');
    const retiredCandidateUse = [...this.records.values()].find(
      (record) => record.candidateFingerprint === candidateFingerprint && record.status === 'FAILED_RETIRED',
    );
    if (retiredCandidateUse) throw new Error('sealed_holdout_retired_candidate_reuse_blocked');
    const record: HoldoutUseRecord = {
      key, candidateFingerprint, datasetFingerprint, openedAt: now,
      purpose: 'FINAL_GOVERNANCE', status: 'OPENED', completedAt: null,
    };
    this.records.set(key, record);
    this.persist();
    return { ...record };
  }

  complete(candidateFingerprint: string, datasetFingerprint: string, passed: boolean, now = Date.now()): HoldoutUseRecord {
    const key = `${candidateFingerprint}:${datasetFingerprint}`;
    const record = this.records.get(key);
    if (!record || record.status !== 'OPENED') throw new Error('sealed_holdout_not_open_or_already_consumed');
    const completed: HoldoutUseRecord = { ...record, status: passed ? 'PASSED' : 'FAILED_RETIRED', completedAt: now };
    this.records.set(key, completed);
    this.persist();
    return { ...completed };
  }

  get(candidateFingerprint: string, datasetFingerprint: string): HoldoutUseRecord | null {
    const row = this.records.get(`${candidateFingerprint}:${datasetFingerprint}`);
    return row ? { ...row } : null;
  }

  recordsSnapshot(): HoldoutUseRecord[] {
    return [...this.records.values()].map((record) => ({ ...record }));
  }

  private persist(): void {
    if (!this.filePath) return;
    writeDurableJsonFileSync(filePathOrThrow(this.filePath), {
      version: SEALED_HOLDOUT_PROTOCOL_VERSION,
      records: [...this.records.values()],
    } satisfies HoldoutLedgerFile);
  }
}

function filePathOrThrow(filePath: string): string {
  if (!filePath.trim()) throw new Error('sealed_holdout_ledger_path_required');
  return filePath;
}

const SEALED_DATASET_CONSTRUCTOR = Symbol('APEX_SEALED_HOLDOUT_DATASET');
const AUTHORIZED_ACCESS_CONSTRUCTOR = Symbol('APEX_AUTHORIZED_HOLDOUT_ACCESS');

export interface SealedHoldoutMetadata {
  datasetFingerprint: string;
  rowCount: number;
  from: number;
  to: number;
}

export class SealedHoldoutDataset {
  readonly #candles: readonly BacktestCandle[];
  readonly metadata: SealedHoldoutMetadata;

  constructor(secret: symbol, candles: readonly BacktestCandle[]) {
    if (secret !== SEALED_DATASET_CONSTRUCTOR) throw new Error('sealed_holdout_direct_construction_blocked');
    if (!candles.length) throw new Error('sealed_holdout_empty_dataset');
    const copy = candles.map((row) => Object.freeze({ ...row }));
    this.#candles = Object.freeze(copy);
    this.metadata = Object.freeze({
      datasetFingerprint: fingerprintDataset(copy),
      rowCount: copy.length,
      from: Date.parse(copy[0].time),
      to: Date.parse(copy.at(-1)?.time || copy[0].time),
    });
  }

  _consume(secret: symbol): BacktestCandle[] {
    if (secret !== AUTHORIZED_ACCESS_CONSTRUCTOR) throw new Error('sealed_holdout_unauthorized_access');
    return this.#candles.map((row) => ({ ...row }));
  }
}

export function sealFinalHoldout(candles: readonly BacktestCandle[]): SealedHoldoutDataset {
  return new SealedHoldoutDataset(SEALED_DATASET_CONSTRUCTOR, candles);
}

export class AuthorizedFinalHoldoutAccess {
  readonly candidateFingerprint: string;
  readonly datasetFingerprint: string;
  readonly openedUse: HoldoutUseRecord;
  readonly #dataset: SealedHoldoutDataset;
  readonly #ledger: HoldoutUseLedger;
  #consumed = false;
  #completed = false;

  constructor(
    secret: symbol,
    dataset: SealedHoldoutDataset,
    ledger: HoldoutUseLedger,
    candidateFingerprint: string,
    openedUse: HoldoutUseRecord,
  ) {
    if (secret !== AUTHORIZED_ACCESS_CONSTRUCTOR) throw new Error('sealed_holdout_access_direct_construction_blocked');
    this.#dataset = dataset;
    this.#ledger = ledger;
    this.candidateFingerprint = candidateFingerprint;
    this.datasetFingerprint = dataset.metadata.datasetFingerprint;
    this.openedUse = { ...openedUse };
  }

  consumeForFinalGovernance(): BacktestCandle[] {
    if (this.#completed) throw new Error('sealed_holdout_access_already_completed');
    if (this.#consumed) throw new Error('sealed_holdout_access_already_consumed');
    this.#consumed = true;
    return this.#dataset._consume(AUTHORIZED_ACCESS_CONSTRUCTOR);
  }

  complete(passed: boolean, now = Date.now()): HoldoutUseRecord {
    if (this.#completed) throw new Error('sealed_holdout_access_already_completed');
    this.#completed = true;
    return this.#ledger.complete(this.candidateFingerprint, this.datasetFingerprint, passed, now);
  }
}

export function authorizeFinalHoldoutAccess(args: {
  dataset: SealedHoldoutDataset;
  candidate: FrozenCandidateManifest;
  ledger: HoldoutUseLedger;
  now?: number;
}): AuthorizedFinalHoldoutAccess {
  const candidateFingerprint = fingerprintFrozenCandidate(args.candidate);
  const datasetFingerprint = args.dataset.metadata.datasetFingerprint;
  const openedUse = args.ledger.open(candidateFingerprint, datasetFingerprint, args.now);
  return new AuthorizedFinalHoldoutAccess(
    AUTHORIZED_ACCESS_CONSTRUCTOR,
    args.dataset,
    args.ledger,
    candidateFingerprint,
    openedUse,
  );
}

export interface FiveWaySealedPartition {
  train: Array<{ label: string; candles: BacktestCandle[] }>;
  validation: { label: string; candles: BacktestCandle[] };
  holdout: SealedHoldoutDataset;
  developmentDatasetFingerprint: string;
}

export function partitionFiveWayWithSealedHoldout(
  candles: readonly BacktestCandle[],
  purgeBars: number,
  embargoBars: number,
  minimumWindowRows = 40,
): FiveWaySealedPartition {
  const sorted = [...candles].sort((left, right) => Date.parse(left.time) - Date.parse(right.time));
  const size = Math.floor(sorted.length / 5);
  if (size < 80) throw new Error('sealed_holdout_insufficient_history');

  const purge = Math.max(0, Math.floor(purgeBars));
  const embargo = Math.max(0, Math.floor(embargoBars));
  const boundaryGap = Math.max(purge, embargo);
  if (boundaryGap >= Math.floor(size / 2)) throw new Error('sealed_holdout_isolation_gap_too_large');

  const slice = (from: number, to: number): BacktestCandle[] => sorted.slice(Math.max(0, from), Math.min(sorted.length, to));
  const train = [
    { label: 'train-1', candles: slice(0, size) },
    { label: 'train-2', candles: slice(size, size * 2) },
    { label: 'train-3', candles: slice(size * 2, size * 3 - purge) },
  ];
  const validation = { label: 'validation', candles: slice(size * 3 + embargo, size * 4 - purge) };
  const holdoutRows = slice(size * 4 + embargo, sorted.length);
  if ([...train.map((window) => window.candles), validation.candles, holdoutRows].some((rows) => rows.length < minimumWindowRows)) {
    throw new Error('sealed_holdout_isolated_window_too_small');
  }
  const developmentRows = [...train.flatMap((window) => window.candles), ...validation.candles];
  return {
    train,
    validation,
    holdout: sealFinalHoldout(holdoutRows),
    developmentDatasetFingerprint: fingerprintDataset(developmentRows),
  };
}

export function createOperationalHoldoutLedger(): HoldoutUseLedger {
  return new HoldoutUseLedger(join(resolvePrivateDataDir(), 'governance', 'sealed-holdout-ledger.json'));
}
