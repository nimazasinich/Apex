import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { SignalDecisionLog } from '../../src/types.ts';

const ROOT = process.cwd();

export const DEFAULT_DECISION_MEMORY_INPUTS = [
  path.resolve(ROOT, 'Doc/automation/ml_dataset/decision_memory_export_v1.json'),
  path.resolve(ROOT, 'Doc/automation/ml_dataset/decision_memory_export.json'),
  path.resolve(ROOT, 'temp/decision-memory-v1.json'),
];

export function loadRawDecisionLogs(
  extraCandidates: string[] = [],
): { rows: SignalDecisionLog[]; sourcePath: string | null; note: string } {
  const explicit = process.env.APEX_DECISION_MEMORY_EXPORT?.trim();
  const candidates = explicit
    ? [path.resolve(ROOT, explicit), ...extraCandidates.map((candidate) => path.resolve(ROOT, candidate))]
    : [...DEFAULT_DECISION_MEMORY_INPUTS, ...extraCandidates.map((candidate) => path.resolve(ROOT, candidate))];
  const sourcePath = candidates.find((candidate) => existsSync(candidate)) ?? null;
  if (!sourcePath) {
    return {
      rows: [],
      sourcePath: null,
      note: `No Decision Memory export was found. Put a JSON export at ${path.relative(ROOT, DEFAULT_DECISION_MEMORY_INPUTS[0])} or set APEX_DECISION_MEMORY_EXPORT.`,
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
    sourcePath: path.relative(ROOT, sourcePath),
    note: `Loaded ${rows.length} raw decision rows from ${path.relative(ROOT, sourcePath)}.`,
  };
}

export function timestampSuffix(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export function backupPathFor(filePath: string): string {
  return path.resolve(
    ROOT,
    'temp',
    `${path.basename(filePath, path.extname(filePath))}_${timestampSuffix()}${path.extname(filePath)}`,
  );
}

const MIRROR_ONLY_INPUTS = [
  path.resolve(ROOT, 'temp/decision-memory-v1.json'),
];

/** Load rows from the backend mirror file only (not the canonical ML export). */
export function loadMirrorDecisionLogs(): { rows: SignalDecisionLog[]; sourcePath: string | null; note: string } {
  const explicit = process.env.APEX_DECISION_MEMORY_MIRROR_FILE?.trim();
  const candidates = explicit
    ? [path.resolve(ROOT, explicit)]
    : MIRROR_ONLY_INPUTS;
  const sourcePath = candidates.find((candidate) => existsSync(candidate)) ?? null;
  if (!sourcePath) {
    return {
      rows: [],
      sourcePath: null,
      note: `No backend mirror file was found at ${path.relative(ROOT, MIRROR_ONLY_INPUTS[0])}. Run the scanner with mirror enabled or set APEX_DECISION_MEMORY_MIRROR_FILE.`,
    };
  }

  const parsed = JSON.parse(readFileSync(sourcePath, 'utf8'));
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.rows)
      ? parsed.rows
      : [];

  return {
    rows: rows as SignalDecisionLog[],
    sourcePath: path.relative(ROOT, sourcePath),
    note: `Loaded ${rows.length} mirror rows from ${path.relative(ROOT, sourcePath)}.`,
  };
}
