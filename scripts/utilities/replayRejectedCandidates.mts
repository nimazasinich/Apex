import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  batchResolveRejectedReplays,
  summarizeReplayEligibility,
  type PriceObservation,
} from '../../src/services/rejectedCandidateReplay.ts';
import type { SignalDecisionLog } from '../../src/types.ts';

const ROOT = process.cwd();
const OUT_DIR = path.resolve(ROOT, 'Doc/automation/rejected_replay');
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

function loadObservations(): Record<string, PriceObservation[]> {
  const explicit = process.env.APEX_REPLAY_OBSERVATIONS?.trim();
  if (!explicit) return {};

  const filePath = path.resolve(ROOT, explicit);
  if (!existsSync(filePath)) {
    console.warn(`APEX_REPLAY_OBSERVATIONS file not found: ${path.relative(ROOT, filePath)}`);
    return {};
  }

  const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  if (Array.isArray(parsed)) {
    const grouped: Record<string, PriceObservation[]> = {};
    for (const row of parsed) {
      if (!row?.ticker || !Number.isFinite(row.timestamp) || !Number.isFinite(row.price)) continue;
      grouped[row.ticker] = grouped[row.ticker] ?? [];
      grouped[row.ticker].push({ timestamp: row.timestamp, price: row.price });
    }
    return grouped;
  }

  if (parsed && typeof parsed === 'object') {
    const grouped: Record<string, PriceObservation[]> = {};
    for (const [ticker, observations] of Object.entries(parsed)) {
      if (!Array.isArray(observations)) continue;
      grouped[ticker] = observations
        .filter(o => Number.isFinite(o.timestamp) && Number.isFinite(o.price))
        .map(o => ({ timestamp: o.timestamp, price: o.price }));
    }
    return grouped;
  }

  return {};
}

function markdownReport(input: {
  note: string;
  sourcePath: string | null;
  summary: ReturnType<typeof summarizeReplayEligibility>;
  resolvedCount: number;
  hasObservations: boolean;
}): string {
  const reasonLines = Object.entries(input.summary.byReason)
    .map(([reason, count]) => `- ${reason}: ${count}`)
    .join('\n') || '- none';

  return `# APEX Rejected Candidate Replay Report v1

Generated: ${new Date().toISOString()}

## Gate Verdict

**${input.summary.total === 0 ? 'NO_REJECTED_ROWS' : input.resolvedCount > 0 ? 'REPLAY_RESOLVED' : input.summary.eligible > 0 && !input.hasObservations ? 'ELIGIBLE_PENDING_OBSERVATIONS' : 'NO_REPLAY_RESOLUTIONS'}**

This report is shadow-only. Replay outcomes label rejected candidates for counterfactual analysis and adaptive threshold learning. They are not mixed into supervised ML v1 labels.

## Source

- Source file: ${input.sourcePath ? path.relative(ROOT, input.sourcePath) : 'not found'}
- Loader note: ${input.note}
- Observations file: ${process.env.APEX_REPLAY_OBSERVATIONS?.trim() || 'none (live browser replay fills these during runtime)'}
- Node cannot read browser IndexedDB directly. Export Decision Memory from the UI for offline replay.

## Rejected Row Summary

| Metric | Count |
|---|---:|
| Total rejected rows | ${input.summary.total} |
| Replay-eligible (unknown outcome) | ${input.summary.eligible} |
| Already resolved | ${input.summary.alreadyResolved} |
| Ineligible | ${input.summary.ineligible} |
| Resolved in this run | ${input.resolvedCount} |

## Ineligibility Reasons

${reasonLines}

## Notes

- Live runtime replay uses the same TP/SL geometry as accepted signals via \`MathEngine.buildLevels\`.
- Rejected replay outcomes remain separate from accepted lifecycle outcomes and ML v1 supervised labels.
- Provide \`APEX_REPLAY_OBSERVATIONS=path/to/observations.json\` for offline batch resolution.
`;
}

function main(): void {
  const { rows, sourcePath, note } = loadRawDecisionLogs();
  const observationsByTicker = loadObservations();
  const hasObservations = Object.keys(observationsByTicker).length > 0;
  const summary = summarizeReplayEligibility(rows);
  const batch = hasObservations
    ? batchResolveRejectedReplays(rows, observationsByTicker)
    : { logs: rows, resolvedCount: 0 };

  mkdirSync(OUT_DIR, { recursive: true });
  const mdPath = path.join(OUT_DIR, 'REJECTED_REPLAY_REPORT_v1.md');
  const jsonPath = path.join(OUT_DIR, 'REJECTED_REPLAY_REPORT_v1.json');
  backupExistingFile(mdPath);
  backupExistingFile(jsonPath);

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourcePath: sourcePath ? path.relative(ROOT, sourcePath) : null,
    note,
    hasObservations,
    summary,
    resolvedCount: batch.resolvedCount,
    rows: batch.logs,
  };

  writeFileSync(mdPath, markdownReport({
    note,
    sourcePath,
    summary,
    resolvedCount: batch.resolvedCount,
    hasObservations,
  }));
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));

  console.log(note);
  console.log(`Rejected replay report written to ${path.relative(ROOT, mdPath)}`);
  console.log(`Resolved ${batch.resolvedCount} rejected rows${hasObservations ? '' : ' (no observations file supplied)'}`);
}

main();
