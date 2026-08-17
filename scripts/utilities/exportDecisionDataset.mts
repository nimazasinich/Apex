import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  ML_FEATURE_NAMES,
  extractFeatures,
  inspectMlFeatureCompleteness,
} from '../../src/services/mlFeatureExtractor.ts';
import type { AdaptiveMarketRegime, SignalDecisionLog } from '../../src/types.ts';
import { loadRawDecisionLogs } from '../lib/decisionMemoryLoader.mts';
import { DECISION_MEMORY_EXPORT_REL_PATH } from '../../src/constants/decisionMemoryPaths.ts';

const VERSION = 1;
const MIN_LABELED_ROWS = 300;
const MIN_MINORITY_CLASS = 30;
const ROOT = process.cwd();
const OUT_DIR = path.resolve(ROOT, 'Doc/automation/ml_dataset');

type LabelPolicy = {
  includeBreakeven: boolean;
};

interface DatasetRow {
  id: string;
  cycleId: string;
  timestamp: number;
  isoTime: string;
  ticker: string;
  direction: string;
  label: 0 | 1;
  labelName: 'LOSS' | 'WIN';
  split: 'train' | 'validation' | 'test' | 'excluded';
  features: Record<string, number>;
}

const labelPolicy: LabelPolicy = {
  includeBreakeven: false,
};

function isLabelEligible(log: SignalDecisionLog): boolean {
  if (log.decision !== 'ACCEPTED') return false;
  if (log.laterOutcome === 'WIN' || log.laterOutcome === 'LOSS') return true;
  if (labelPolicy.includeBreakeven && log.laterOutcome === 'BREAKEVEN') return true;
  return false;
}

function labelFor(log: SignalDecisionLog): 0 | 1 | null {
  if (log.laterOutcome === 'WIN') return 1;
  if (log.laterOutcome === 'LOSS') return 0;
  return null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fmtNum(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'n/a' : Number(value.toFixed(6)).toString();
}

function iso(ts: number | undefined): string {
  return typeof ts === 'number' && Number.isFinite(ts) ? new Date(ts).toISOString() : 'n/a';
}

function splitRows(rows: DatasetRow[]): DatasetRow[] {
  const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);
  const n = sorted.length;
  const trainEnd = Math.floor(n * 0.7);
  const validationEnd = Math.floor(n * 0.85);
  return sorted.map((row, idx) => ({
    ...row,
    split: idx < trainEnd ? 'train' : idx < validationEnd ? 'validation' : 'test',
  }));
}

function countDuplicateValues(rows: SignalDecisionLog[], key: 'id' | 'cycleId'): number {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = String(row[key] ?? '');
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

function classifyRegime(log: SignalDecisionLog): AdaptiveMarketRegime {
  const squeeze = log.squeezeRiskScore ?? null;
  const liquidity = log.liquidityQualityScore ?? null;
  const evidence = log.evidenceAgreementScore ?? null;
  const q = log.qStructDirectional ?? null;
  if (typeof squeeze === 'number' && squeeze > 0.58) return 'SQUEEZE_RISK';
  if (typeof liquidity === 'number' && liquidity < 0.48) return 'THIN_BOOK';
  if (typeof q === 'number' && q > 0.32 && typeof evidence === 'number' && evidence > 0.54) return 'TREND_UP';
  if (typeof q === 'number' && q < -0.32 && typeof evidence === 'number' && evidence > 0.54) return 'TREND_DOWN';
  if (typeof evidence === 'number' && evidence < 0.42) return 'CHOP';
  return 'MIXED';
}

function markdownReport(params: {
  sourcePath: string | null;
  note: string;
  rawRows: SignalDecisionLog[];
  labelEligible: SignalDecisionLog[];
  completeRows: DatasetRow[];
  missingCounts: Map<string, number>;
  insufficient: boolean;
  winCount: number;
  lossCount: number;
}): string {
  const { rawRows, labelEligible, completeRows, missingCounts, insufficient, winCount, lossCount } = params;
  const sorted = [...completeRows].sort((a, b) => a.timestamp - b.timestamp);
  const train = completeRows.filter((r) => r.split === 'train');
  const validation = completeRows.filter((r) => r.split === 'validation');
  const test = completeRows.filter((r) => r.split === 'test');
  const minority = Math.min(winCount, lossCount);
  const regimeCounts = new Map<AdaptiveMarketRegime, number>();
  for (const row of labelEligible) {
    const regime = classifyRegime(row);
    regimeCounts.set(regime, (regimeCounts.get(regime) ?? 0) + 1);
  }
  const featureRows = ML_FEATURE_NAMES.map((name) => {
    const values = completeRows.map((r) => r.features[name]).filter((v) => typeof v === 'number' && Number.isFinite(v));
    const missing = missingCounts.get(name) ?? 0;
    const missRate = labelEligible.length ? `${((missing / labelEligible.length) * 100).toFixed(2)}%` : 'n/a';
    return `| ${name} | ${missing} | ${missRate} | ${fmtNum(values.length ? Math.min(...values) : null)} | ${fmtNum(median(values))} | ${fmtNum(values.length ? Math.max(...values) : null)} |`;
  }).join('\n');

  const splitLine = (name: string, rows: DatasetRow[]) =>
    `| ${name} | ${rows.length} | ${iso(rows[0]?.timestamp)} | ${iso(rows[rows.length - 1]?.timestamp)} |`;

  const labelNotes = [
    '- Positive label: `laterOutcome === "WIN"`.',
    '- Negative label: `laterOutcome === "LOSS"`.',
    '- `BREAKEVEN`: excluded by default because it is neither a clear win nor a clear loss for binary v1 training.',
    '- `EXPIRED`: excluded by default because it is unresolved, not a realized failure.',
    '- `UNKNOWN`: excluded; labels are never imputed.',
    '- Rejected rows are excluded from supervised v1 training because they have no realized accepted-trade outcome.',
  ].join('\n');

  const regimeLine = [...regimeCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([regime, count]) => `- ${regime}: ${count}`)
    .join('\n') || '- n/a';

  return `# APEX ML Signal Model - Phase 0 Validation Report v${VERSION}

Generated: ${new Date().toISOString()}

## Gate Verdict

${insufficient ? '**INSUFFICIENT DATA - do not proceed to Phase 1.**' : '**DATA GATE PASSED - Phase 1 may be reviewed for approval.**'}

Minimum sample-size gate:
- Required labeled rows after feature completeness: >= ${MIN_LABELED_ROWS}
- Required minority class rows: >= ${MIN_MINORITY_CLASS}
- Actual complete rows: ${completeRows.length}
- Actual minority class rows: ${minority}

## Source

- Source file: ${params.sourcePath ? path.relative(ROOT, params.sourcePath) : 'not found'}
- Loader note: ${params.note}
- Node cannot read browser IndexedDB directly. Export from the UI, run \`npm run export:decision-memory\` after mirror sync, or set \`APEX_DECISION_MEMORY_EXPORT\`. Canonical path: \`${DECISION_MEMORY_EXPORT_REL_PATH}\`.

## Label Methodology

${labelNotes}

## Row Counts

| Stage | Rows |
|---|---:|
| Total rows in | ${rawRows.length} |
| Rows after label filter | ${labelEligible.length} |
| Rows after feature-completeness filter | ${completeRows.length} |
| Dropped for missing features | ${Math.max(0, labelEligible.length - completeRows.length)} |

## Class Balance

| Label | Count |
|---|---:|
| WIN | ${winCount} |
| LOSS | ${lossCount} |
| WIN:LOSS ratio | ${lossCount ? (winCount / lossCount).toFixed(3) : 'n/a'} |

## Duplicate Checks

| Field | Duplicate value count |
|---|---:|
| id | ${countDuplicateValues(rawRows, 'id')} |
| cycleId | ${countDuplicateValues(rawRows, 'cycleId')} |

## Time Range

- Complete dataset start: ${iso(sorted[0]?.timestamp)}
- Complete dataset end: ${iso(sorted[sorted.length - 1]?.timestamp)}

## Chronological Split

Random splitting is not used. Rows are sorted by \`timestamp\`: first 70% train, next 15% validation, most recent 15% test.

| Split | Rows | Start | End |
|---|---:|---|---|
${splitLine('train', train)}
${splitLine('validation', validation)}
${splitLine('test', test)}

## AdaptiveMarketRegime Counts

${regimeLine}

## Feature Missing Rates and Distribution Summary

| Feature | Missing | Missing rate | Min | Median | Max |
|---|---:|---:|---:|---:|---:|
${featureRows || '| n/a | n/a | n/a | n/a | n/a | n/a |'}

## Phase 4 Walk-Forward Strategy Note

Future retraining should use walk-forward windows only: train on an older contiguous window, validate on the next chronological segment, test on the newest untouched segment, then advance the window. Model versions should be frozen as \`model_v{N}.json\`, and every retrain/swap should create an audit log comparable to \`AdaptiveThresholdAuditLog\`.
`;
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const { rows: rawRows, sourcePath, note } = loadRawDecisionLogs();
  const labelEligible = rawRows.filter(isLabelEligible);
  const missingCounts = new Map<string, number>();
  for (const name of ML_FEATURE_NAMES) missingCounts.set(name, 0);

  const datasetRows: DatasetRow[] = [];
  for (const log of labelEligible) {
    const missing = inspectMlFeatureCompleteness(log).missing;
    for (const name of missing) missingCounts.set(name, (missingCounts.get(name) ?? 0) + 1);
    const vector = extractFeatures(log);
    const label = labelFor(log);
    if (!vector || label === null) continue;
    datasetRows.push({
      id: log.id,
      cycleId: log.cycleId,
      timestamp: log.timestamp,
      isoTime: log.isoTime,
      ticker: log.ticker,
      direction: log.direction,
      label,
      labelName: label === 1 ? 'WIN' : 'LOSS',
      split: 'excluded',
      features: vector.features,
    });
  }

  const splitDataset = splitRows(datasetRows);
  const winCount = splitDataset.filter((r) => r.label === 1).length;
  const lossCount = splitDataset.filter((r) => r.label === 0).length;
  const insufficient = splitDataset.length < MIN_LABELED_ROWS || Math.min(winCount, lossCount) < MIN_MINORITY_CLASS;

  const dataset = {
    version: VERSION,
    featureVersion: 'ml_features_v1',
    generatedAt: new Date().toISOString(),
    sourcePath: sourcePath ? path.relative(ROOT, sourcePath) : null,
    gate: {
      status: insufficient ? 'INSUFFICIENT_DATA' : 'PASSED',
      minLabeledRows: MIN_LABELED_ROWS,
      minMinorityClass: MIN_MINORITY_CLASS,
      rows: splitDataset.length,
      minorityClassRows: Math.min(winCount, lossCount),
    },
    featureNames: ML_FEATURE_NAMES,
    rows: splitDataset,
  };

  writeFileSync(path.join(OUT_DIR, `decision_dataset_v${VERSION}.json`), JSON.stringify(dataset, null, 2), 'utf8');
  const report = markdownReport({
    sourcePath,
    note,
    rawRows,
    labelEligible,
    completeRows: splitDataset,
    missingCounts,
    insufficient,
    winCount,
    lossCount,
  });
  writeFileSync(path.join(OUT_DIR, `VALIDATION_REPORT_v${VERSION}.md`), report, 'utf8');

  console.log(report);
}

main();
