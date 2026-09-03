/**
 * APEX Research Agent — read-only cross-candidate summary.
 *
 * Scans run-records/*.json (written by runQueuedStudies.mts), groups by
 * candidate id, and prints the latest run per id next to its
 * promotion-ledger.json status and holdout-open-history.json status — so
 * you don't have to open a dozen JSON files by hand to see where every
 * candidate currently stands.
 *
 * This script is purely a formatting/aggregation convenience. It makes NO
 * pass/fail judgment of its own: it only surfaces whatever numeric fields
 * (net return, profit factor, max drawdown, Sharpe, DSR, ...) the study
 * script itself already printed as JSON, verbatim. It never opens the
 * sealed holdout and never writes to promotion-ledger.json.
 *
 * Run with:
 *   npx tsx scripts/research-agent/summarizeRuns.mts
 *   npx tsx scripts/research-agent/summarizeRuns.mts --id candidate-6-anchored-reversal
 *   npx tsx scripts/research-agent/summarizeRuns.mts --json     (machine-readable dump)
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '../..');
const agentDir = path.join(root, 'scripts/research-agent');
const recordsDir = path.join(agentDir, 'run-records');
const ledgerPath = path.join(agentDir, 'promotion-ledger.json');
const holdoutHistoryPath = path.join(agentDir, 'holdout-open-history.json');

// Field names worth surfacing if a study's jsonExcerpt happens to contain
// them — heuristic only, display-only, never used to decide anything.
const METRIC_KEYS = [
  'net', 'netReturn', 'netReturnPct', 'pf', 'profitFactor', 'maxDD', 'maxDrawdown',
  'maxDrawdownPct', 'sharpe', 'dsr', 'calmar', 'trades', 'tradeCount', 'verdict', 'status', 'passed',
];

interface RunRecord {
  id: string;
  script: string;
  studySha256?: string;
  hypothesis?: string | null;
  ranAt: string;
  exitCode: number | null;
  timedOut?: boolean;
  logPath: string;
  jsonExcerpt?: Record<string, unknown> | null;
}

interface LedgerEntry {
  id: string;
  ready: boolean;
  approvedStudySha256?: string;
  reason?: string;
  approvedBy?: string;
  approvedAt?: string;
}

interface HoldoutOpenRecord {
  id: string;
  openedAt?: string;
  completedAt?: string;
  status?: 'OPENING' | 'COMPLETED';
  studySha256?: string;
  exitCode?: number | null;
}

function parseArgs(): { id: string | null; json: boolean } {
  const args = process.argv.slice(2);
  let id: string | null = null;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--id') id = args[i + 1] ?? null;
    if (args[i] === '--json') json = true;
  }
  return { id, json };
}

function loadAllRunRecords(): RunRecord[] {
  if (!existsSync(recordsDir)) return [];
  const files = readdirSync(recordsDir).filter((f) => f.endsWith('.json'));
  const records: RunRecord[] = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(readFileSync(path.join(recordsDir, f), 'utf8'));
      if (raw && typeof raw.id === 'string') records.push(raw as RunRecord);
    } catch {
      // Skip unparseable/corrupt record files rather than crashing the summary.
    }
  }
  return records;
}

function loadLedger(): LedgerEntry[] {
  if (!existsSync(ledgerPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    return Array.isArray(raw.candidates) ? raw.candidates : [];
  } catch {
    return [];
  }
}

function loadHoldoutHistory(): HoldoutOpenRecord[] {
  if (!existsSync(holdoutHistoryPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(holdoutHistoryPath, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function latestPerId(records: RunRecord[]): Map<string, { latest: RunRecord; runCount: number; crashCount: number }> {
  const byId = new Map<string, RunRecord[]>();
  for (const r of records) {
    const list = byId.get(r.id) ?? [];
    list.push(r);
    byId.set(r.id, list);
  }
  const out = new Map<string, { latest: RunRecord; runCount: number; crashCount: number }>();
  for (const [id, list] of byId) {
    list.sort((a, b) => a.ranAt.localeCompare(b.ranAt));
    const latest = list[list.length - 1];
    const crashCount = list.filter((r) => r.exitCode !== 0).length;
    out.set(id, { latest, runCount: list.length, crashCount });
  }
  return out;
}

function extractMetrics(excerpt: Record<string, unknown> | null | undefined): string {
  if (!excerpt || typeof excerpt !== 'object') return '(no JSON output captured)';
  const found: string[] = [];
  for (const key of METRIC_KEYS) {
    if (key in excerpt) found.push(`${key}=${JSON.stringify((excerpt as Record<string, unknown>)[key])}`);
  }
  return found.length > 0 ? found.join(' ') : '(no known metric fields in output — see log)';
}

function main(): void {
  const { id: filterId, json } = parseArgs();

  const records = loadAllRunRecords();
  const ledger = loadLedger();
  const holdoutHistory = loadHoldoutHistory();
  const summary = latestPerId(records);

  let ids = [...summary.keys()].sort();
  if (filterId) ids = ids.filter((id) => id === filterId);

  if (json) {
    const out = ids.map((id) => {
      const { latest, runCount, crashCount } = summary.get(id)!;
      const ledgerEntry = ledger.find((l) => l.id === id) ?? null;
      const opens = holdoutHistory.filter((h) => h.id === id);
      return { id, runCount, crashCount, latest, ledgerEntry, holdoutOpens: opens };
    });
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (ids.length === 0) {
    console.log('[research-agent] No run-records found yet. Run runQueuedStudies.mts first.');
    return;
  }

  console.log(`APEX Research Agent — candidate summary (${ids.length} candidate${ids.length === 1 ? '' : 's'})\n`);

  for (const id of ids) {
    const { latest, runCount, crashCount } = summary.get(id)!;
    const ledgerEntry = ledger.find((l) => l.id === id);
    const opens = holdoutHistory.filter((h) => h.id === id);

    console.log(`## ${id}`);
    console.log(`   runs: ${runCount} (${crashCount} crashed)   latest: ${latest.ranAt}   exit=${latest.exitCode}${latest.timedOut ? ' TIMED OUT' : ''}`);
    console.log(`   script: ${latest.script}`);
    console.log(`   study sha256: ${latest.studySha256 ?? '(legacy record: no hash)'}`);
    if (latest.hypothesis) console.log(`   hypothesis: ${latest.hypothesis}`);
    console.log(`   metrics: ${extractMetrics(latest.jsonExcerpt)}`);
    console.log(`   log: ${latest.logPath}`);
    if (ledgerEntry) {
      console.log(`   ledger: ready=${ledgerEntry.ready}${ledgerEntry.approvedStudySha256 ? ` approvedSha=${ledgerEntry.approvedStudySha256}` : ' approvedSha=(missing)'}${ledgerEntry.reason ? ` reason="${ledgerEntry.reason}"` : ''}${ledgerEntry.approvedBy ? ` approvedBy=${ledgerEntry.approvedBy}` : ''}`);
    } else {
      console.log('   ledger: (no entry — not promotable yet)');
    }
    if (opens.length > 0) {
      console.log(`   holdout history: ${opens.length} record(s) — ${opens.map((o) => `${o.status ?? 'legacy'} ${o.openedAt ?? o.completedAt ?? '(no time)'} exit=${o.exitCode ?? 'n/a'}${o.studySha256 ? ` sha=${o.studySha256.slice(0, 12)}` : ''}`).join('; ')}`);
    } else {
      console.log('   holdout: never opened');
    }
    console.log('');
  }
}

main();
