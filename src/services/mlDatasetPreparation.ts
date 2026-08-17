import { createHash } from 'node:crypto';
import type { SignalDecisionLog } from '../types';
import { ML_FEATURE_NAMES, ML_FEATURE_VERSION, extractFeaturesWithCompleteness, isLeakageExcludedFeature, type MlFeatureName } from './mlFeatureExtractor';

export const ML_DATASET_VERSION = 1;
export const ML_MIN_LABELED_ROWS = 300;
export const ML_MIN_MINORITY_CLASS = 30;

export type MlDatasetSplit = 'train' | 'validation' | 'test';
export type MlDatasetExclusionReason =
  | 'not_accepted'
  | 'outcome_not_binary'
  | 'missing_features';

export interface PreparedMlRow {
  id: string;
  cycleId: string;
  timestamp: number;
  isoTime: string;
  ticker: string;
  direction: SignalDecisionLog['direction'];
  label: 0 | 1;
  labelName: 'LOSS' | 'WIN';
  split: MlDatasetSplit;
  features: Record<MlFeatureName, number>;
  values: number[];
  provenance: {
    decisionId: string;
    featureVersion: typeof ML_FEATURE_VERSION;
    decisionTimestamp: number;
    marketDataSource: string | null;
  };
}

export interface PreparedMlDataset {
  version: number;
  featureVersion: typeof ML_FEATURE_VERSION;
  generatedAt: string;
  sourcePath: string | null;
  featureNames: readonly MlFeatureName[];
  gate: {
    status: 'PASSED' | 'INSUFFICIENT_DATA';
    minLabeledRows: number;
    minMinorityClass: number;
    rows: number;
    winRows: number;
    lossRows: number;
    minorityClassRows: number;
  };
  inputRows: number;
  labelEligibleRows: number;
  exclusions: Array<{ reason: MlDatasetExclusionReason; count: number }>;
  featureMissingCounts: Partial<Record<MlFeatureName, number>>;
  integrity: {
    algorithm: 'sha256';
    rowsSha256: string;
    validated: boolean;
    errors: string[];
  };
  rows: PreparedMlRow[];
}

export interface MlDatasetValidationResult {
  valid: boolean;
  errors: string[];
}

function stableRowsSha256(rows: PreparedMlRow[]): string {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

export function validatePreparedMlDataset(dataset: Omit<PreparedMlDataset, 'integrity'> | PreparedMlDataset): MlDatasetValidationResult {
  const errors: string[] = [];
  if (dataset.version !== ML_DATASET_VERSION) errors.push('unsupported_dataset_version');
  if (dataset.featureVersion !== ML_FEATURE_VERSION) errors.push('feature_version_mismatch');
  if (dataset.featureNames.length !== ML_FEATURE_NAMES.length || dataset.featureNames.some((name, index) => name !== ML_FEATURE_NAMES[index])) {
    errors.push('feature_schema_mismatch');
  }
  if (dataset.featureNames.some((name) => isLeakageExcludedFeature(name))) errors.push('label_leakage_feature_present');
  const ids = new Set<string>();
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  let phase = 0;
  const phaseFor = (split: MlDatasetSplit) => split === 'train' ? 0 : split === 'validation' ? 1 : 2;
  for (const row of dataset.rows) {
    if (!row.id || ids.has(row.id)) errors.push('duplicate_or_missing_row_id');
    ids.add(row.id);
    if (!Number.isFinite(row.timestamp) || row.timestamp < previousTimestamp) errors.push('rows_not_chronological');
    previousTimestamp = row.timestamp;
    const rowPhase = phaseFor(row.split);
    if (rowPhase < phase) errors.push('split_order_violation');
    phase = Math.max(phase, rowPhase);
    if (row.values.length !== ML_FEATURE_NAMES.length || row.values.some((value) => !Number.isFinite(value))) errors.push('invalid_feature_vector');
    if (row.label !== 0 && row.label !== 1) errors.push('invalid_label');
    if (row.provenance?.decisionId !== row.id || row.provenance?.featureVersion !== ML_FEATURE_VERSION || row.provenance?.decisionTimestamp !== row.timestamp) {
      errors.push('feature_provenance_mismatch');
    }
  }
  const winRows = dataset.rows.filter((row) => row.label === 1).length;
  const lossRows = dataset.rows.length - winRows;
  if (dataset.gate.rows !== dataset.rows.length || dataset.gate.winRows !== winRows || dataset.gate.lossRows !== lossRows || dataset.gate.minorityClassRows !== Math.min(winRows, lossRows)) {
    errors.push('gate_count_mismatch');
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

function bump<K extends string>(map: Map<K, number>, key: K): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export function assignChronologicalSplits(rows: Omit<PreparedMlRow, 'split'>[]): PreparedMlRow[] {
  const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  const trainEnd = Math.floor(sorted.length * 0.70);
  const validationEnd = Math.floor(sorted.length * 0.85);
  return sorted.map((row, index) => ({
    ...row,
    split: index < trainEnd ? 'train' : index < validationEnd ? 'validation' : 'test',
  }));
}

export function prepareMlDataset(
  logs: SignalDecisionLog[],
  ctx: { sourcePath: string | null; generatedAt: string },
): PreparedMlDataset {
  const exclusions = new Map<MlDatasetExclusionReason, number>();
  const missingCounts = new Map<MlFeatureName, number>();
  const eligible: Omit<PreparedMlRow, 'split'>[] = [];
  let labelEligibleRows = 0;

  for (const log of logs) {
    if (log.decision !== 'ACCEPTED') {
      bump(exclusions, 'not_accepted');
      continue;
    }
    if (log.laterOutcome !== 'WIN' && log.laterOutcome !== 'LOSS') {
      bump(exclusions, 'outcome_not_binary');
      continue;
    }
    labelEligibleRows += 1;
    const { completeness, vector } = extractFeaturesWithCompleteness(log);
    for (const name of completeness.missing) missingCounts.set(name, (missingCounts.get(name) ?? 0) + 1);
    if (!vector) {
      bump(exclusions, 'missing_features');
      continue;
    }
    const label = log.laterOutcome === 'WIN' ? 1 : 0;
    eligible.push({
      id: log.id,
      cycleId: log.cycleId,
      timestamp: log.timestamp,
      isoTime: log.isoTime,
      ticker: log.ticker,
      direction: log.direction,
      label,
      labelName: label ? 'WIN' : 'LOSS',
      features: vector.features,
      values: vector.values,
      provenance: {
        decisionId: log.id,
        featureVersion: ML_FEATURE_VERSION,
        decisionTimestamp: log.timestamp,
        marketDataSource: typeof log.marketSnapshotSummary?.dataSource === 'string' ? log.marketSnapshotSummary.dataSource : null,
      },
    });
  }

  const rows = assignChronologicalSplits(eligible);
  const winRows = rows.filter((row) => row.label === 1).length;
  const lossRows = rows.length - winRows;
  const minorityClassRows = Math.min(winRows, lossRows);
  const status: PreparedMlDataset['gate']['status'] = rows.length >= ML_MIN_LABELED_ROWS && minorityClassRows >= ML_MIN_MINORITY_CLASS
    ? 'PASSED'
    : 'INSUFFICIENT_DATA';

  const base: Omit<PreparedMlDataset, 'integrity'> = {
    version: ML_DATASET_VERSION,
    featureVersion: ML_FEATURE_VERSION,
    generatedAt: ctx.generatedAt,
    sourcePath: ctx.sourcePath,
    featureNames: ML_FEATURE_NAMES,
    gate: {
      status,
      minLabeledRows: ML_MIN_LABELED_ROWS,
      minMinorityClass: ML_MIN_MINORITY_CLASS,
      rows: rows.length,
      winRows,
      lossRows,
      minorityClassRows,
    },
    inputRows: logs.length,
    labelEligibleRows,
    exclusions: [...exclusions.entries()].map(([reason, count]) => ({ reason, count })),
    featureMissingCounts: Object.fromEntries(missingCounts) as Partial<Record<MlFeatureName, number>>,
    rows,
  };
  const validation = validatePreparedMlDataset(base);
  return {
    ...base,
    integrity: { algorithm: 'sha256', rowsSha256: stableRowsSha256(rows), validated: validation.valid, errors: validation.errors },
  };
}
