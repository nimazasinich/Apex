import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildDecisionMemoryExportPayload } from '../../src/utils/decisionMemoryExport.ts';
import { DECISION_MEMORY_EXPORT_REL_PATH } from '../../src/constants/decisionMemoryPaths.ts';
import type { SignalDecisionLog } from '../../src/types.ts';
import {
  backupPathFor,
  loadMirrorDecisionLogs,
  loadRawDecisionLogs,
} from '../lib/decisionMemoryLoader.mts';

const ROOT = process.cwd();
const OUT_PATH = path.resolve(ROOT, DECISION_MEMORY_EXPORT_REL_PATH);

async function fetchFromServer(baseUrl: string): Promise<{ rows: SignalDecisionLog[]; source: string } | null> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/decision-memory/export`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const body = await response.json() as { rows?: SignalDecisionLog[] };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return null;
    return { rows, source: `APEX DecisionMemoryMirror server export (${baseUrl})` };
  } catch {
    return null;
  }
}

async function resolveRows(): Promise<{ rows: SignalDecisionLog[]; source: string; note: string }> {
  const mirror = loadMirrorDecisionLogs();
  if (mirror.rows.length) {
    return {
      rows: mirror.rows,
      source: `APEX DecisionMemoryMirror file export (${mirror.sourcePath})`,
      note: mirror.note,
    };
  }

  const baseUrl = process.env.APEX_BASE_URL?.trim()
    || `http://127.0.0.1:${process.env.PORT || process.env.APEX_OPS_AUDIT_PORT || 3000}`;
  const remote = await fetchFromServer(baseUrl);
  if (remote) {
    return {
      rows: remote.rows,
      source: remote.source,
      note: `Loaded ${remote.rows.length} rows from ${baseUrl}/api/decision-memory/export.`,
    };
  }

  const fallback = loadRawDecisionLogs();
  if (fallback.rows.length && fallback.sourcePath) {
    return {
      rows: fallback.rows,
      source: `Existing export (${fallback.sourcePath})`,
      note: `${fallback.note} No fresh mirror/server source was found; re-used existing export.`,
    };
  }

  return {
    rows: [],
    source: '',
    note: [
      'No Decision Memory rows were found.',
      `1) Run the scanner so the browser mirror syncs to temp/decision-memory-v1.json, or`,
      `2) Start the dev server and call GET /api/decision-memory/export, or`,
      `3) Export JSON from the Decision memory page and save manually to ${DECISION_MEMORY_EXPORT_REL_PATH}.`,
    ].join(' '),
  };
}

function writeExport(rows: SignalDecisionLog[], source: string): void {
  if (existsSync(OUT_PATH)) {
    const backup = backupPathFor(OUT_PATH);
    mkdirSync(path.dirname(backup), { recursive: true });
    writeFileSync(backup, readFileSync(OUT_PATH, 'utf8'), 'utf8');
    console.log(`Backed up existing export to ${path.relative(ROOT, backup)}`);
  }

  mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  const payload = buildDecisionMemoryExportPayload(rows, source);
  writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const resolved = await resolveRows();
  if (!resolved.rows.length) {
    console.error(resolved.note);
    process.exit(1);
  }

  writeExport(resolved.rows, resolved.source);
  console.log(resolved.note);
  console.log(`Wrote ${resolved.rows.length} rows to ${DECISION_MEMORY_EXPORT_REL_PATH}`);
  console.log('Next: npm run validate:decision-export');
}

void main();
