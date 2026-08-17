import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { prepareMlDataset } from '../../src/services/mlDatasetPreparation.ts';
import {
  SHADOW_ML_TRAINING_VERSION,
  trainShadowMlModel,
  type ShadowMlTrainingResult,
} from '../../src/services/shadowMlTraining.ts';
import { loadRawDecisionLogs, backupPathFor } from '../lib/decisionMemoryLoader.mts';

const ROOT = process.cwd();
const OUT_DIR = path.resolve(ROOT, 'Doc/automation/ml_shadow');
const MODEL_PATH = path.join(OUT_DIR, 'model_v1.json');

function backupExistingFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  mkdirSync(path.resolve(ROOT, 'temp'), { recursive: true });
  const backup = backupPathFor(filePath);
  renameSync(filePath, backup);
  console.log(`Moved existing file to ${path.relative(ROOT, backup)}`);
}

function fmt(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'n/a' : Number(value.toFixed(6)).toString();
}

function iso(ts: number | null | undefined): string {
  return typeof ts === 'number' && Number.isFinite(ts) ? new Date(ts).toISOString() : 'n/a';
}

function markdownReport(result: ShadowMlTrainingResult, note: string): string {
  const gateLine = result.gate.status === 'TRAINED'
    ? '**TRAINING COMPLETE — shadow model file written; remain shadow-only.**'
    : '**INSUFFICIENT_DATA — training skipped; shadow model file not updated.**';

  const splitLines = result.splitMetrics.map((entry) => [
    `### ${entry.split}`,
    '',
    '| Metric | Value |',
    '|---|---:|',
    `| Rows | ${entry.rowCount} |`,
    `| Accuracy | ${fmt(entry.metrics.accuracy)} |`,
    `| Precision | ${fmt(entry.metrics.precision)} |`,
    `| Recall | ${fmt(entry.metrics.recall)} |`,
    `| F1 | ${fmt(entry.metrics.f1)} |`,
    `| Brier score | ${fmt(entry.metrics.brierScore)} |`,
    '',
  ].join('\n')).join('\n');

  const walkForwardLines = result.walkForwardMetrics.length
    ? result.walkForwardMetrics.map((entry) => [
      `### Fold ${entry.fold}`,
      '',
      '| Metric | Value |',
      '|---|---:|',
      `| Train rows | ${entry.trainRows} |`,
      `| Validation rows | ${entry.validationRows} |`,
      `| Train start | ${iso(entry.trainStartTimestamp)} |`,
      `| Train end | ${iso(entry.trainEndTimestamp)} |`,
      `| Validation start | ${iso(entry.validationStartTimestamp)} |`,
      `| Validation end | ${iso(entry.validationEndTimestamp)} |`,
      `| Accuracy | ${fmt(entry.metrics.accuracy)} |`,
      `| Brier score | ${fmt(entry.metrics.brierScore)} |`,
      '',
    ].join('\n')).join('\n')
    : '_Walk-forward folds were not produced because the dataset was too small or training was skipped._';

  const limitationLines = result.limitations.map((item) => `- ${item}`).join('\n');

  return `# APEX Shadow ML Training Report v${SHADOW_ML_TRAINING_VERSION}

Generated: ${result.generatedAt}

## Gate Verdict

${gateLine}

Dataset gate:
- Required complete labeled rows: >= ${result.gate.minLabeledRows}
- Required minority class rows: >= ${result.gate.minMinorityClass}
- Actual complete rows: ${result.gate.completeRows}
- Actual minority class rows: ${result.gate.minorityClassRows}
- Dataset gate status: ${result.gate.datasetGateStatus}
- Training status: ${result.gate.status}

## Source

- Source file: ${result.sourcePath ?? 'not found'}
- Loader note: ${note}
- Model file: ${result.model ? path.relative(ROOT, MODEL_PATH) : 'not written'}

## Rule Baseline

| Metric | Value |
|---|---:|
| Sample count | ${result.ruleBaseline.sampleCount} |
| Win rate | ${fmt(result.ruleBaseline.winRate)} |
| Always-accept accuracy | ${fmt(result.ruleBaseline.alwaysAcceptAccuracy)} |

## Chronological Split Metrics

${splitLines || '_No split metrics because training was skipped._'}

## Walk-Forward Validation

${walkForwardLines}

## Known Limitations

${limitationLines}
`;
}

function loadExistingModel(): unknown | null {
  if (!existsSync(MODEL_PATH)) return null;
  return JSON.parse(readFileSync(MODEL_PATH, 'utf8'));
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const { rows, sourcePath, note } = loadRawDecisionLogs();
  const generatedAt = new Date().toISOString();
  const dataset = prepareMlDataset(rows, { sourcePath, generatedAt });
  const result = trainShadowMlModel(dataset, { generatedAt });

  const jsonPath = path.join(OUT_DIR, `SHADOW_ML_TRAINING_REPORT_v${SHADOW_ML_TRAINING_VERSION}.json`);
  const mdPath = path.join(OUT_DIR, `SHADOW_ML_TRAINING_REPORT_v${SHADOW_ML_TRAINING_VERSION}.md`);
  backupExistingFile(jsonPath);
  backupExistingFile(mdPath);

  if (result.model) {
    backupExistingFile(MODEL_PATH);
    writeFileSync(MODEL_PATH, JSON.stringify(result.model, null, 2), 'utf8');
    console.log(`Wrote ${path.relative(ROOT, MODEL_PATH)}`);
  } else {
    const existing = loadExistingModel();
    if (existing) {
      console.log(`Kept existing model file at ${path.relative(ROOT, MODEL_PATH)} because training was skipped.`);
    } else {
      console.log('No model file written because the data gate did not pass.');
    }
  }

  writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf8');
  const report = markdownReport(result, note);
  writeFileSync(mdPath, report, 'utf8');

  console.log(report);
  console.log(`Wrote ${path.relative(ROOT, jsonPath)}`);
  console.log(`Wrote ${path.relative(ROOT, mdPath)}`);
}

main();
