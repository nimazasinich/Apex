/**
 * APEX Research Agent — single sanctioned sealed-holdout opener.
 *
 * Fail-closed rules:
 * - interactive TTY only; no --yes/--force/non-interactive mode
 * - candidate id must resolve from study-queue.json
 * - study must stay under scripts/research/*.mts and explicitly gate sealed data
 *   behind process.argv.includes('--evaluate-sealed')
 * - exact current study SHA-256 must match BOTH the latest successful development
 *   run record and promotion-ledger.json approvedStudySha256
 * - any prior OPENING/COMPLETED record for the candidate OR exact study hash blocks
 *   a second open; there is no reopen escape hatch
 * - an OPENING record is appended BEFORE the child process starts, so a crash or
 *   terminal kill still consumes the one-shot holdout attempt in the audit trail
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process, { stdin as input, stdout as output } from 'node:process';
import readline from 'node:readline/promises';
import {
  assertCandidateId,
  resolveLocalTsxCli,
  resolveResearchStudyPath,
  sha256File,
  studySupportsSealedEvaluation,
} from './lib/researchAgentSafety.mts';

const root = path.resolve(import.meta.dirname, '../..');
const agentDir = path.join(root, 'scripts/research-agent');
const ledgerPath = path.join(agentDir, 'promotion-ledger.json');
const queuePath = path.join(agentDir, 'study-queue.json');
const recordsDir = path.join(agentDir, 'run-records');
const holdoutHistoryPath = path.join(agentDir, 'holdout-open-history.json');

interface LedgerEntry {
  id: string;
  ready: boolean;
  reason?: string;
  approvedBy?: string;
  approvedAt?: string;
  approvedStudySha256?: string;
}

interface QueueEntry {
  id: string;
  script: string;
}

interface RunRecord {
  id: string;
  script: string;
  studySha256?: string;
  ranAt: string;
  exitCode: number | null;
  timedOut?: boolean;
  spawnError?: string | null;
  developmentRunSucceeded?: boolean;
}

interface HoldoutOpenRecord {
  attemptId?: string;
  id: string;
  study: string;
  studySha256?: string;
  status?: 'OPENING' | 'COMPLETED';
  openedAt?: string;
  completedAt?: string;
  exitCode?: number | null;
}

function parseArgs(): { id: string | null; studyAssertion: string | null } {
  const args = process.argv.slice(2);
  let id: string | null = null;
  let studyAssertion: string | null = null;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--id') id = args[++i] ?? null;
    else if (arg === '--study') studyAssertion = args[++i] ?? null;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm run research:open-holdout -- --id <candidate-id> [--study <exact-queue-path>]');
      process.exit(0);
    } else {
      throw new Error(`Unrecognized argument: ${arg}. There is intentionally no force/yes/non-interactive option.`);
    }
  }
  return { id, studyAssertion };
}

function readJsonObject(filePath: string, label: string): Record<string, unknown> {
  if (!existsSync(filePath)) throw new Error(`${label} not found at ${filePath}`);
  const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} must contain a JSON object`);
  return parsed as Record<string, unknown>;
}

function loadLedger(): LedgerEntry[] {
  const raw = readJsonObject(ledgerPath, 'promotion-ledger.json');
  if (!Array.isArray(raw.candidates)) throw new Error('promotion-ledger.json must have a candidates array');
  return raw.candidates as LedgerEntry[];
}

function loadQueue(): QueueEntry[] {
  const raw = readJsonObject(queuePath, 'study-queue.json');
  if (!Array.isArray(raw.studies)) throw new Error('study-queue.json must have a studies array');
  return raw.studies as QueueEntry[];
}

function loadRunRecords(): RunRecord[] {
  if (!existsSync(recordsDir)) return [];
  const records: RunRecord[] = [];
  for (const fileName of readdirSync(recordsDir).filter((name) => name.endsWith('.json'))) {
    const filePath = path.join(recordsDir, fileName);
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as RunRecord;
      if (parsed && typeof parsed.id === 'string' && typeof parsed.script === 'string') records.push(parsed);
    } catch {
      throw new Error(`Malformed run record: ${path.relative(root, filePath)}. Refusing to open the holdout with incomplete audit state.`);
    }
  }
  return records;
}

function loadHoldoutHistory(): HoldoutOpenRecord[] {
  if (!existsSync(holdoutHistoryPath)) return [];
  const parsed = JSON.parse(readFileSync(holdoutHistoryPath, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('holdout-open-history.json must contain a JSON array');
  return parsed as HoldoutOpenRecord[];
}

function appendHoldoutHistory(record: HoldoutOpenRecord): void {
  const history = loadHoldoutHistory();
  history.push(record);
  writeFileSync(holdoutHistoryPath, JSON.stringify(history, null, 2) + '\n', 'utf8');
}

function latestSuccessfulDevelopmentRun(id: string, script: string, studySha256: string): RunRecord | null {
  return loadRunRecords()
    .filter((record) =>
      record.id === id &&
      record.script === script &&
      record.studySha256 === studySha256 &&
      record.exitCode === 0 &&
      record.timedOut !== true &&
      !record.spawnError &&
      record.developmentRunSucceeded !== false,
    )
    .sort((left, right) => left.ranAt.localeCompare(right.ranAt))
    .at(-1) ?? null;
}

function requireApprovalFields(entry: LedgerEntry): void {
  if (entry.ready !== true) throw new Error(`[BLOCKED] Ledger entry for "${entry.id}" is not ready:true.`);
  if (!entry.reason?.trim()) throw new Error(`[BLOCKED] Ledger entry for "${entry.id}" needs a non-empty reason.`);
  if (!entry.approvedBy?.trim()) throw new Error(`[BLOCKED] Ledger entry for "${entry.id}" needs approvedBy.`);
  if (!entry.approvedAt?.trim()) throw new Error(`[BLOCKED] Ledger entry for "${entry.id}" needs approvedAt.`);
  if (!/^[a-f0-9]{64}$/.test(entry.approvedStudySha256 ?? '')) {
    throw new Error(`[BLOCKED] Ledger entry for "${entry.id}" needs approvedStudySha256 copied from the exact successful development run.`);
  }
}

async function main(): Promise<void> {
  const { id, studyAssertion } = parseArgs();
  if (!id) throw new Error('Missing --id <candidate-id>.');
  assertCandidateId(id);

  if (!input.isTTY || !output.isTTY) {
    throw new Error('[BLOCKED] Sealed holdout opening requires an interactive TTY. Piped/scripted confirmation is not accepted.');
  }

  const matches = loadQueue().filter((entry) => entry.id === id);
  if (matches.length !== 1) {
    throw new Error(`[BLOCKED] Candidate "${id}" must have exactly one study-queue.json entry; found ${matches.length}.`);
  }
  const study = matches[0].script;
  if (studyAssertion && studyAssertion !== study) {
    throw new Error(`[BLOCKED] --study assertion does not match the queue mapping. queue=${study} supplied=${studyAssertion}`);
  }

  const studyAbsPath = resolveResearchStudyPath(root, study, true);
  if (!studySupportsSealedEvaluation(studyAbsPath)) {
    throw new Error(`[BLOCKED] ${study} does not explicitly gate sealed evaluation with process.argv.includes('--evaluate-sealed').`);
  }
  const studySha256 = sha256File(studyAbsPath);

  const ledgerMatches = loadLedger().filter((entry) => entry.id === id);
  if (ledgerMatches.length !== 1) {
    throw new Error(`[BLOCKED] Candidate "${id}" must have exactly one promotion-ledger entry; found ${ledgerMatches.length}.`);
  }
  const approval = ledgerMatches[0];
  requireApprovalFields(approval);
  if (approval.approvedStudySha256 !== studySha256) {
    throw new Error(
      `[BLOCKED] Study changed after approval. ledger=${approval.approvedStudySha256} current=${studySha256}. ` +
      'Re-run development on the new code and create a fresh approval deliberately.',
    );
  }

  const devRun = latestSuccessfulDevelopmentRun(id, study, studySha256);
  if (!devRun) {
    throw new Error(
      `[BLOCKED] No successful development run record exists for candidate=${id}, script=${study}, sha256=${studySha256}. ` +
      'Run the exact code through runQueuedStudies.mts first.',
    );
  }

  const prior = loadHoldoutHistory();
  const priorById = prior.filter((record) => record.id === id);
  const priorByHash = prior.filter((record) => record.studySha256 === studySha256);
  if (priorById.length > 0 || priorByHash.length > 0) {
    throw new Error(
      `[BLOCKED] One-shot holdout already consumed for ${priorById.length > 0 ? `candidate "${id}"` : `study hash ${studySha256}`}. ` +
      'There is no reopen flag. Create a genuinely new candidate and preserve the old evidence instead of reusing the sealed set.',
    );
  }

  // Preflight local execution tooling before the irreversible one-shot audit record.
  const tsxCli = resolveLocalTsxCli(root);

  console.log('=== APEX sealed-holdout promotion request ===');
  console.log(`Candidate:          ${id}`);
  console.log(`Study:              ${study}`);
  console.log(`Study SHA-256:      ${studySha256}`);
  console.log(`Development run:    ${devRun.ranAt}`);
  console.log(`Approval reason:    ${approval.reason}`);
  console.log(`Approved by/at:     ${approval.approvedBy} / ${approval.approvedAt}`);
  console.log('');
  console.log('This is a one-shot sealed-holdout open. Any started attempt is recorded before execution and cannot be retried through this tool.');
  console.log('');

  const hashPrefix = studySha256.slice(0, 12);
  const expected = `OPEN HOLDOUT ${id} ${hashPrefix}`;
  const rl = readline.createInterface({ input, output });
  const typed = await rl.question(`Type exactly "${expected}" to proceed: `);
  rl.close();
  if (typed !== expected) {
    console.log('[ABORTED] Confirmation did not match. No holdout process was started and no history record was written.');
    process.exit(1);
  }

  const attemptId = `${id}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const openedAt = new Date().toISOString();
  appendHoldoutHistory({
    attemptId,
    id,
    study,
    studySha256,
    status: 'OPENING',
    openedAt,
    exitCode: null,
  });

  console.log(`\n[research-agent] HOLDOUT OPENING recorded. Running exact approved hash with --evaluate-sealed...\n`);
  const result = spawnSync(process.execPath, [tsxCli, study, '--evaluate-sealed'], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });

  appendHoldoutHistory({
    attemptId,
    id,
    study,
    studySha256,
    status: 'COMPLETED',
    openedAt,
    completedAt: new Date().toISOString(),
    exitCode: result.status,
  });

  if (result.error) {
    console.error(`[research-agent] Holdout child process failed to spawn: ${result.error.message}`);
    process.exit(1);
  }
  console.log(`\n[research-agent] Holdout attempt completed with exit ${result.status}. The one-shot open remains consumed regardless of exit status.`);
  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error('[research-agent] openHoldout failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
