/**
 * APEX Research Agent — unattended DEVELOPMENT-ONLY queue runner.
 *
 * This runner never passes --evaluate-sealed. It executes only reviewed
 * scripts/research/*.mts paths from study-queue.json, captures immutable-ish
 * evidence records, and leaves every strategy promotion decision to a human.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  assertCandidateId,
  assertSafeHypothesisText,
  resolveLocalTsxCli,
  resolveResearchStudyPath,
  sha256File,
} from './lib/researchAgentSafety.mts';

const root = path.resolve(import.meta.dirname, '../..');
const agentDir = path.join(root, 'scripts/research-agent');
const queuePath = path.join(agentDir, 'study-queue.json');
const historyPath = path.join(agentDir, 'run-history.json');
const logsDir = path.join(agentDir, 'logs');
const recordsDir = path.join(agentDir, 'run-records');
const CRASH_STREAK_WARNING_THRESHOLD = 3;

interface StudyEntry {
  id: string;
  script: string;
  hypothesis?: string;
  status: 'queued' | 'ran' | 'failed' | 'skipped' | 'draft';
  dependsOn?: string[];
  priority?: number;
}

interface QueueFile {
  studies: StudyEntry[];
}

interface CliOptions {
  only: Set<string> | null;
  concurrency: number;
  timeoutMs: number;
  retries: number;
  dryRun: boolean;
  watch: boolean;
  watchIntervalMs: number;
}

interface AttemptResult {
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  spawnError: string | null;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const opts: CliOptions = {
    only: null,
    concurrency: 1,
    timeoutMs: 3_600_000,
    retries: 0,
    dryRun: false,
    watch: false,
    watchIntervalMs: 20_000,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--only') {
      const value = args[++i] ?? '';
      const ids = value.split(',').map((id) => id.trim()).filter(Boolean);
      ids.forEach(assertCandidateId);
      opts.only = new Set(ids);
    } else if (arg === '--concurrency') {
      const value = Number(args[++i]);
      if (!Number.isInteger(value) || value < 1) throw new Error('--concurrency must be a positive integer');
      opts.concurrency = value;
    } else if (arg === '--timeout') {
      const value = Number(args[++i]);
      if (!Number.isFinite(value) || value <= 0) throw new Error('--timeout must be a positive number of seconds');
      opts.timeoutMs = Math.floor(value * 1000);
    } else if (arg === '--retries') {
      const value = Number(args[++i]);
      if (!Number.isInteger(value) || value < 0) throw new Error('--retries must be a non-negative integer');
      opts.retries = value;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--watch') {
      opts.watch = true;
    } else if (arg === '--watch-interval') {
      const value = Number(args[++i]);
      if (!Number.isFinite(value) || value <= 0) throw new Error('--watch-interval must be a positive number of seconds');
      opts.watchIntervalMs = Math.floor(value * 1000);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unrecognized argument: ${arg}`);
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`Usage: npm run research:queue -- [options]

  --only <id>[,<id>...]  Run only selected queued candidate ids
  --concurrency <n>      Maximum concurrent studies (default 1)
  --timeout <seconds>    Per-study timeout (default 3600)
  --retries <n>          Retry crashed studies n additional times (default 0)
  --watch                Poll for newly queued development studies
  --watch-interval <sec> Poll interval for --watch (default 20)
  --dry-run              Validate and print the execution plan without writes/runs
  --help                 Show this help
`);
}

function nowStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function readJsonArrayOrThrow(filePath: string, label: string): unknown[] {
  if (!existsSync(filePath)) return [];
  const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${label} must contain a JSON array; refusing to overwrite malformed audit state.`);
  return parsed;
}

function appendHistory(record: Record<string, unknown>): void {
  const history = readJsonArrayOrThrow(historyPath, 'run-history.json');
  history.push(record);
  writeFileSync(historyPath, JSON.stringify(history, null, 2) + '\n', 'utf8');
}

function assertNoDependencyCycle(studies: StudyEntry[]): void {
  const byId = new Map(studies.map((study) => [study.id, study]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`study-queue.json contains a dependsOn cycle involving "${id}"`);
    visiting.add(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) visit(dep);
    visiting.delete(id);
    visited.add(id);
  };

  for (const study of studies) visit(study.id);
}

function loadQueue(): QueueFile {
  if (!existsSync(queuePath)) throw new Error(`study-queue.json not found at ${queuePath}`);
  const raw = JSON.parse(readFileSync(queuePath, 'utf8'));
  if (!Array.isArray(raw.studies)) throw new Error('study-queue.json must have a "studies" array');

  const studies = raw.studies as StudyEntry[];
  const seen = new Set<string>();
  const knownIds = new Set<string>();

  for (const [index, study] of studies.entries()) {
    if (!study || typeof study !== 'object') throw new Error(`study-queue.json: studies[${index}] must be an object`);
    assertCandidateId(study.id);
    if (seen.has(study.id)) throw new Error(`study-queue.json: duplicate id "${study.id}" is not allowed`);
    seen.add(study.id);
    knownIds.add(study.id);

    if (!['queued', 'ran', 'failed', 'skipped', 'draft'].includes(study.status)) {
      throw new Error(`study-queue.json: "${study.id}" has invalid status "${study.status}"`);
    }
    assertSafeHypothesisText(study.hypothesis);
    resolveResearchStudyPath(root, study.script, false);
    if (study.priority !== undefined && !Number.isFinite(study.priority)) {
      throw new Error(`study-queue.json: "${study.id}" has non-numeric priority`);
    }
    if (study.dependsOn !== undefined && (!Array.isArray(study.dependsOn) || !study.dependsOn.every((dep) => typeof dep === 'string'))) {
      throw new Error(`study-queue.json: "${study.id}" dependsOn must be an array of ids`);
    }
  }

  for (const study of studies) {
    for (const dep of study.dependsOn ?? []) {
      assertCandidateId(dep);
      if (dep === study.id) throw new Error(`study-queue.json: "${study.id}" cannot depend on itself`);
      if (!knownIds.has(dep)) throw new Error(`study-queue.json: "${study.id}" depends on unknown id "${dep}"`);
    }
  }
  assertNoDependencyCycle(studies);
  return { studies };
}

function saveQueue(queue: QueueFile): void {
  const existing = JSON.parse(readFileSync(queuePath, 'utf8'));
  writeFileSync(queuePath, JSON.stringify({ ...existing, studies: queue.studies }, null, 2) + '\n', 'utf8');
}

/** Best-effort extraction of the last complete JSON object/array from stdout. */
function extractTrailingJson(text: string): unknown {
  for (let end = text.length; end > 0; end -= 1) {
    const close = text[end - 1];
    if (close !== '}' && close !== ']') continue;
    const open = close === '}' ? '{' : '[';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let start = end - 1; start >= 0; start -= 1) {
      const char = text[start];
      if (char === '"' && !escaped) inString = !inString;
      escaped = char === '\\' && !escaped;
      if (inString) continue;
      if (char === close) depth += 1;
      else if (char === open) {
        depth -= 1;
        if (depth === 0) {
          try { return JSON.parse(text.slice(start, end)); } catch { break; }
        }
      }
    }
  }
  return null;
}

function spawnWithTimeout(script: string, timeoutMs: number): Promise<AttemptResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    let tsxCli: string;
    try {
      tsxCli = resolveLocalTsxCli(root);
    } catch (error) {
      resolve({ exitCode: null, timedOut: false, durationMs: Date.now() - started, stdout: '', stderr: '', spawnError: error instanceof Error ? error.message : String(error) });
      return;
    }
    const child = spawn(process.execPath, [tsxCli, script], { cwd: root, shell: false });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let spawnError: string | null = null;

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch { /* already exited */ }
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already exited */ }
      }, 5000).unref();
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => { spawnError = error.message; });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        timedOut,
        durationMs: Date.now() - started,
        stdout,
        stderr,
        spawnError,
      });
    });
  });
}

let consecutiveCrashes = 0;

async function runOne(entry: StudyEntry, opts: CliOptions): Promise<void> {
  const scriptAbsPath = resolveResearchStudyPath(root, entry.script, true);
  const studySha256 = sha256File(scriptAbsPath);
  const maxAttempts = 1 + opts.retries;
  let finalSucceeded = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(`[research-agent] RUN ${entry.id} (attempt ${attempt}/${maxAttempts}) -> ${entry.script}`);
    const result = await spawnWithTimeout(entry.script, opts.timeoutMs);
    const stamp = nowStamp();
    const suffix = attempt > 1 ? `-attempt${attempt}` : '';
    const logPath = path.join(logsDir, `${entry.id}-${stamp}${suffix}.log`);
    const recordPath = path.join(recordsDir, `${entry.id}-${stamp}${suffix}.json`);

    const combinedLog = [
      `# study: ${entry.id}`,
      `# script: ${entry.script}`,
      `# studySha256: ${studySha256}`,
      `# attempt: ${attempt}/${maxAttempts}`,
      `# ranAt: ${new Date().toISOString()}`,
      `# durationMs: ${result.durationMs}`,
      `# timedOut: ${result.timedOut}`,
      `# exitCode: ${result.exitCode}`,
      `# spawnError: ${result.spawnError ?? ''}`,
      `# node: ${process.version} platform: ${os.platform()} arch: ${os.arch()}`,
      '',
      '--- stdout ---',
      result.stdout,
      '',
      '--- stderr ---',
      result.stderr,
    ].join('\n');

    mkdirSync(logsDir, { recursive: true });
    mkdirSync(recordsDir, { recursive: true });
    writeFileSync(logPath, combinedLog, 'utf8');

    const jsonExcerpt = extractTrailingJson(result.stdout);
    const succeeded = result.exitCode === 0 && !result.timedOut && result.spawnError === null;
    writeFileSync(recordPath, JSON.stringify({
      id: entry.id,
      script: entry.script,
      studySha256,
      hypothesis: entry.hypothesis ?? null,
      attempt,
      maxAttempts,
      ranAt: new Date().toISOString(),
      durationMs: result.durationMs,
      timedOut: result.timedOut,
      exitCode: result.exitCode,
      spawnError: result.spawnError,
      node: process.version,
      platform: os.platform(),
      logPath: path.relative(root, logPath),
      jsonExcerpt,
      developmentRunSucceeded: succeeded,
      note: 'A successful process means the development study completed. It is not a promotion verdict and does not open the sealed holdout.',
    }, null, 2) + '\n', 'utf8');

    appendHistory({
      id: entry.id,
      script: entry.script,
      studySha256,
      attempt,
      maxAttempts,
      ranAt: new Date().toISOString(),
      durationMs: result.durationMs,
      timedOut: result.timedOut,
      exitCode: result.exitCode,
      spawnError: result.spawnError,
      logPath: path.relative(root, logPath),
      recordPath: path.relative(root, recordPath),
      developmentRunSucceeded: succeeded,
    });

    console.log(
      `[research-agent] ${succeeded ? 'DONE' : 'CRASHED'} ${entry.id} attempt ${attempt}/${maxAttempts} ` +
      `(exit ${result.exitCode}${result.timedOut ? ', TIMED OUT' : ''}${result.spawnError ? `, spawn=${result.spawnError}` : ''}, ${(result.durationMs / 1000).toFixed(1)}s)`,
    );

    if (succeeded) {
      consecutiveCrashes = 0;
      finalSucceeded = true;
      break;
    }

    consecutiveCrashes += 1;
    if (consecutiveCrashes === CRASH_STREAK_WARNING_THRESHOLD) {
      console.warn('[research-agent] WARNING: three consecutive process failures; check environment/dependencies before continuing unattended research.');
    }
    if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  entry.status = finalSucceeded ? 'ran' : 'failed';
}

function isReady(entry: StudyEntry, byId: Map<string, StudyEntry>): boolean {
  return (entry.dependsOn ?? []).every((depId) => byId.get(depId)?.status === 'ran');
}

async function runScheduled(queue: QueueFile, pendingIds: Set<string>, opts: CliOptions): Promise<void> {
  const byId = new Map(queue.studies.map((study) => [study.id, study]));
  const inFlight = new Set<string>();

  async function worker(): Promise<void> {
    for (;;) {
      const ready = [...pendingIds]
        .filter((id) => !inFlight.has(id) && isReady(byId.get(id)!, byId))
        .sort((left, right) => (byId.get(right)!.priority ?? 0) - (byId.get(left)!.priority ?? 0));

      if (ready.length === 0) {
        if (inFlight.size === 0) return;
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }

      const id = ready[0];
      pendingIds.delete(id);
      inFlight.add(id);
      try {
        await runOne(byId.get(id)!, opts);
        saveQueue(queue);
      } finally {
        inFlight.delete(id);
      }
    }
  }

  const workerCount = Math.min(opts.concurrency, Math.max(1, pendingIds.size));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (pendingIds.size > 0) {
    console.warn(`[research-agent] ${pendingIds.size} queued studies remained blocked because one or more dependencies did not finish successfully: ${[...pendingIds].join(', ')}`);
  }
}

function selectPending(queue: QueueFile, opts: CliOptions): StudyEntry[] {
  let pending = queue.studies.filter((study) => study.status === 'queued');
  if (!opts.only) return pending;
  pending = pending.filter((study) => opts.only!.has(study.id));
  for (const id of opts.only) {
    if (!pending.some((study) => study.id === id)) {
      console.warn(`[research-agent] --only requested "${id}", but it is not currently queued.`);
    }
  }
  return pending;
}

async function runOnceOverQueue(opts: CliOptions): Promise<number> {
  const queue = loadQueue();
  const pending = selectPending(queue, opts);
  if (pending.length === 0) return 0;

  console.log(`[research-agent] ${pending.length} development stud${pending.length === 1 ? 'y' : 'ies'} queued (concurrency=${opts.concurrency}, timeout=${opts.timeoutMs / 1000}s, retries=${opts.retries}).`);
  if (opts.dryRun) {
    for (const entry of pending) {
      const abs = resolveResearchStudyPath(root, entry.script, true);
      console.log(`[dry-run] ${entry.id} -> ${entry.script} sha256=${sha256File(abs)}${entry.dependsOn?.length ? ` dependsOn=${entry.dependsOn.join(',')}` : ''}`);
    }
    console.log('[research-agent] --dry-run: no files were changed and no study process was started.');
    return pending.length;
  }

  await runScheduled(queue, new Set(pending.map((study) => study.id)), opts);
  console.log('[research-agent] Development queue pass complete. Review logs/run-records manually before any promotion-ledger change.');
  return pending.length;
}

async function main(): Promise<void> {
  const opts = parseArgs();
  if (!opts.watch) {
    const ran = await runOnceOverQueue(opts);
    if (ran === 0) console.log('[research-agent] Nothing queued.');
    return;
  }

  if (opts.dryRun) throw new Error('--watch and --dry-run cannot be combined');
  console.log(`[research-agent] --watch: development-only queue polling every ${opts.watchIntervalMs / 1000}s. Ctrl+C to stop.`);
  for (;;) {
    const ran = await runOnceOverQueue(opts);
    if (ran === 0) console.log('[research-agent] --watch: nothing queued.');
    await new Promise((resolve) => setTimeout(resolve, opts.watchIntervalMs));
  }
}

main().catch((error) => {
  console.error('[research-agent] runQueuedStudies failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
