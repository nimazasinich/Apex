import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  ANALYSIS_VERSION,
  MIN_LABELED_ROWS,
  MIN_MINORITY_CLASS,
  analyzeDirectionDivergenceRows,
  type DirectionDivergenceAnalysisResult,
} from '../../src/services/directionDivergenceAnalysis.ts';
import type { SignalDecisionLog } from '../../src/types.ts';

const ROOT = process.cwd();
const OUT_DIR = path.resolve(ROOT, 'Doc/automation/direction_divergence');
const DEFAULT_INPUTS = [
  path.resolve(ROOT, 'Doc/automation/ml_dataset/decision_memory_export_v1.json'),
  path.resolve(ROOT, 'temp/decision-memory-v1.json'),
];

function timestampSuffix(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function backupExistingFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  mkdirSync(path.resolve(ROOT, 'temp'), { recursive: true });
  const backupPath = path.resolve(
    ROOT,
    'temp',
    `${path.basename(filePath, path.extname(filePath))}_${timestampSuffix()}${path.extname(filePath)}`,
  );
  renameSync(filePath, backupPath);
  console.log(`Moved existing file to ${path.relative(ROOT, backupPath)}`);
}

function loadRawDecisionLogs(): { rows: SignalDecisionLog[]; sourcePath: string | null; note: string } {
  const explicit = process.env.APEX_DECISION_MEMORY_EXPORT?.trim();
  const candidates = explicit ? [path.resolve(ROOT, explicit)] : DEFAULT_INPUTS;
  const sourcePath = candidates.find((candidate) => existsSync(candidate)) ?? null;
  if (!sourcePath) {
    return {
      rows: [],
      sourcePath: null,
      note: `No Decision Memory export was found. Put a JSON export at ${path.relative(ROOT, DEFAULT_INPUTS[0])}, ${path.relative(ROOT, DEFAULT_INPUTS[1])}, or set APEX_DECISION_MEMORY_EXPORT.`,
    };
  }

  const parsed = JSON.parse(readFileSync(sourcePath, 'utf8'));
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.rows)
      ? parsed.rows
      : Array.isArray(parsed?.decisionLogs)
        ? parsed.decisionLogs
        : [];

  return {
    rows: rows as SignalDecisionLog[],
    sourcePath,
    note: `Loaded ${rows.length} raw decision rows from ${path.relative(ROOT, sourcePath)}.`,
  };
}

function iso(ts: number | null | undefined): string {
  return typeof ts === 'number' && Number.isFinite(ts) ? new Date(ts).toISOString() : 'n/a';
}

function fmt(value: number | null): string {
  return value === null || !Number.isFinite(value) ? 'n/a' : Number(value.toFixed(6)).toString();
}

function markdownReport(result: DirectionDivergenceAnalysisResult, note: string): string {
  const exclusionLines = result.exclusions.length
    ? result.exclusions.map((entry) => `- ${entry.reason}: ${entry.count}`).join('\n')
    : '- none';

  const categoryLines = result.categorySummaries
    .map((summary) => [
      `### ${summary.category}`,
      '',
      '| Metric | Value |',
      '|---|---:|',
      `| Sample count | ${summary.sampleCount} |`,
      `| WIN | ${summary.winCount} |`,
      `| LOSS | ${summary.lossCount} |`,
      `| BREAKEVEN | ${summary.breakevenCount} |`,
      `| Win rate | ${fmt(summary.winRate)} |`,
      `| Average PnL | ${fmt(summary.avgPnl)} |`,
      `| Average alignment score | ${fmt(summary.avgAlignmentScore)} |`,
      `| Average trend strength | ${fmt(summary.avgTrendStrength)} |`,
      `| Average timeframe agreement | ${fmt(summary.avgTimeframeAgreement)} |`,
      '',
    ].join('\n'))
    .join('\n');

  const splitLines = result.chronologicalSplits
    .map((summary) => [
      `### ${summary.split}`,
      '',
      '| Metric | Value |',
      '|---|---:|',
      `| Rows | ${summary.rowCount} |`,
      `| WIN | ${summary.winCount} |`,
      `| LOSS | ${summary.lossCount} |`,
      `| BREAKEVEN | ${summary.breakevenCount} |`,
      `| Start | ${iso(summary.startTimestamp)} |`,
      `| End | ${iso(summary.endTimestamp)} |`,
      `| WITH_TREND | ${summary.categoryCounts.WITH_TREND} |`,
      `| RANGE | ${summary.categoryCounts.RANGE} |`,
      `| COUNTER_TREND | ${summary.categoryCounts.COUNTER_TREND} |`,
      '',
    ].join('\n'))
    .join('\n');

  const limitationLines = result.limitations.map((item) => `- ${item}`).join('\n');

  return `# APEX Direction-Divergence Outcome Analysis v${ANALYSIS_VERSION}

Generated: ${result.generatedAt}

## Gate Verdict

${result.gate.status === 'INSUFFICIENT_DATA'
    ? '**INSUFFICIENT_DATA — category-level conclusions remain descriptive only.**'
    : '**DATA GATE PASSED — chronological category analysis may be reviewed for shadow risk suggestions.**'}

Minimum sample-size gate:
- Required resolved accepted rows: >= ${MIN_LABELED_ROWS}
- Required minority class rows (min WIN, LOSS): >= ${MIN_MINORITY_CLASS}
- Actual resolved accepted rows: ${result.gate.resolvedRows}
- Actual minority class rows: ${result.gate.minorityClassRows}

## Source

- Source file: ${result.sourcePath ?? 'not found'}
- Loader note: ${note}
- Node cannot read browser IndexedDB directly. Export Decision Memory from the UI and save the JSON at \`Doc/automation/ml_dataset/decision_memory_export_v1.json\`, or set \`APEX_DECISION_MEMORY_EXPORT\`.

## Row Counts

| Stage | Rows |
|---|---:|
| Total rows loaded | ${result.totals.rowsLoaded} |
| Rows with valid direction-divergence classification | ${result.totals.rowsWithValidClassification} |
| Resolved accepted rows used for analysis | ${result.totals.resolvedAcceptedRows} |
| Excluded rows | ${result.totals.excludedRows} |

## Excluded Rows

${exclusionLines}

## Outcome Totals

| Outcome | Count |
|---|---:|
| WIN | ${result.gate.winCount} |
| LOSS | ${result.gate.lossCount} |
| BREAKEVEN | ${result.gate.breakevenCount} |

## Category Summaries

${categoryLines || '_No resolved rows were available for category aggregation._'}

## Chronological Splits

Random splitting is not used. Rows are sorted by \`timestamp\`: first 70% train, next 15% validation, most recent 15% test.

${splitLines || '_No resolved rows were available for chronological splitting._'}

## Data Completeness

| Metric | Value |
|---|---:|
| Average | ${fmt(result.dataCompleteness.avg)} |
| Minimum | ${fmt(result.dataCompleteness.min)} |
| Maximum | ${fmt(result.dataCompleteness.max)} |

## Known Limitations

${limitationLines}
`;
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const { rows, sourcePath, note } = loadRawDecisionLogs();
  const generatedAt = new Date().toISOString();
  const result = analyzeDirectionDivergenceRows(rows, {
    sourcePath: sourcePath ? path.relative(ROOT, sourcePath) : null,
    generatedAt,
  });

  const jsonPath = path.join(OUT_DIR, `DIRECTION_DIVERGENCE_ANALYSIS_v${ANALYSIS_VERSION}.json`);
  const mdPath = path.join(OUT_DIR, `DIRECTION_DIVERGENCE_ANALYSIS_v${ANALYSIS_VERSION}.md`);
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
