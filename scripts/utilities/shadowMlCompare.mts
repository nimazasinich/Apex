import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  SHADOW_ML_COMPARISON_VERSION,
  compareShadowMlRows,
  type ShadowMlComparisonResult,
} from '../../src/services/shadowMlComparison.ts';
import { parseShadowMlModelFile, type ShadowMlModelFile } from '../../src/services/shadowMlModel.ts';
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

function loadModel(): ShadowMlModelFile | null {
  if (!existsSync(MODEL_PATH)) return null;
  return parseShadowMlModelFile(JSON.parse(readFileSync(MODEL_PATH, 'utf8')));
}

function fmt(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'n/a' : Number(value.toFixed(6)).toString();
}

function markdownReport(result: ShadowMlComparisonResult, note: string): string {
  const gateLine =
    result.gate.status === 'COMPARED'
      ? '**SHADOW COMPARISON COMPLETE — disagreements logged for audit only.**'
      : result.gate.status === 'NO_MODEL'
        ? '**NO_MODEL — comparison skipped until a valid shadow model file exists.**'
        : '**INSUFFICIENT_DATA — no resolved accepted WIN/LOSS rows were available.**';

  const disagreementPreview = result.disagreements.slice(0, 25).map((row) =>
    `- ${row.id} | ${row.ticker} | rule=${row.ruleDecision} ml=${row.mlDecision} | p(win)=${fmt(row.probabilityWin)} | confidence=${fmt(row.confidence)} | outcome=${row.laterOutcome ?? 'n/a'}`,
  ).join('\n');

  const limitationLines = result.limitations.map((item) => `- ${item}`).join('\n');
  const validationErrors = result.gate.modelValidationErrors.length
    ? result.gate.modelValidationErrors.map((item) => `- ${item}`).join('\n')
    : '- none';

  return `# APEX Shadow ML Comparison Report v${SHADOW_ML_COMPARISON_VERSION}

Generated: ${result.generatedAt}

## Gate Verdict

${gateLine}

- Comparison status: ${result.gate.status}
- Complete labeled rows in export: ${result.gate.completeLabeledRows}
- Model id: ${result.modelId ?? 'n/a'}

## Source

- Source file: ${result.sourcePath ?? 'not found'}
- Loader note: ${note}
- Model file: ${existsSync(MODEL_PATH) ? path.relative(ROOT, MODEL_PATH) : 'not found'}

## Model Validation

${validationErrors}

## Summary

| Metric | Value |
|---|---:|
| Rows scored | ${result.summary.rowsScored} |
| Rows skipped (incomplete features) | ${result.summary.rowsSkipped} |
| Agreement count | ${result.summary.agreementCount} |
| Disagreement count | ${result.summary.disagreementCount} |
| ML reject / rule accept | ${result.summary.mlRejectRuleAcceptCount} |
| ML accept / rule reject | ${result.summary.mlAcceptRuleRejectCount} |
| Disagreements with LOSS outcome | ${result.summary.disagreementsWithLossOutcome} |
| Disagreements with WIN outcome | ${result.summary.disagreementsWithWinOutcome} |
| Average confidence on disagreements | ${fmt(result.summary.avgConfidenceOnDisagreements)} |

## Disagreement Preview

${disagreementPreview || '_No disagreements were logged._'}

## Known Limitations

${limitationLines}
`;
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const { rows, sourcePath, note } = loadRawDecisionLogs();
  const generatedAt = new Date().toISOString();
  const model = loadModel();
  const result = compareShadowMlRows(rows, model, { sourcePath, generatedAt });

  const jsonPath = path.join(OUT_DIR, `SHADOW_ML_COMPARISON_REPORT_v${SHADOW_ML_COMPARISON_VERSION}.json`);
  const mdPath = path.join(OUT_DIR, `SHADOW_ML_COMPARISON_REPORT_v${SHADOW_ML_COMPARISON_VERSION}.md`);
  backupExistingFile(jsonPath);
  backupExistingFile(mdPath);

  writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf8');
  const report = markdownReport(result, note);
  writeFileSync(mdPath, report, 'utf8');

  console.log(report);
  console.log(`Wrote ${path.relative(ROOT, jsonPath)}`);
  console.log(`Wrote ${path.relative(ROOT, mdPath)}`);
}

main();
