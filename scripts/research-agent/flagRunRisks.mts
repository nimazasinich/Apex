/**
 * APEX Research Agent — statistical red-flag scanner.
 *
 * Reads every run-record across every candidate and prints heuristic
 * warnings worth a human's attention before trusting a number. This is
 * NOT a pass/fail judgment — it never writes anything, never touches
 * promotion-ledger.json, and every flag is phrased as "worth checking",
 * never "this is broken" or "this is real". The actual call stays yours,
 * same as every other script in this toolkit.
 *
 * The specific heuristics below exist because this project has already
 * been burned by exactly these failure modes once (see project history:
 * the original TSM/Donchian "edges" were single-window artifacts that
 * only the sealed holdout caught) — the goal is to surface the same kind
 * of smell *before* you spend a holdout look on it, not to replace that
 * check.
 *
 * Run with:
 *   npx tsx scripts/research-agent/flagRunRisks.mts
 *   npx tsx scripts/research-agent/flagRunRisks.mts --id candidate-1-liquidation-squeeze
 */
import path from 'node:path';
import process from 'node:process';
import {
  loadAllRunRecords, loadLedger, loadHoldoutHistory, groupById,
  numericField, mean, stdev, type RunRecord,
} from './lib/researchAgentData.mts';

const root = path.resolve(import.meta.dirname, '../..');
const agentDir = path.join(root, 'scripts/research-agent');
const recordsDir = path.join(agentDir, 'run-records');
const ledgerPath = path.join(agentDir, 'promotion-ledger.json');
const holdoutHistoryPath = path.join(agentDir, 'holdout-open-history.json');

interface Flag {
  severity: 'info' | 'notice' | 'warning';
  text: string;
}

function flagsForCandidate(id: string, runs: RunRecord[]): Flag[] {
  const flags: Flag[] = [];
  const latest = runs[runs.length - 1];
  const crashCount = runs.filter((r) => r.exitCode !== 0).length;
  const crashRate = crashCount / runs.length;

  const sharpes = runs.map((r) => numericField(r.jsonExcerpt, 'sharpe')).filter((x): x is number => x !== null);
  const pfs = runs.map((r) => numericField(r.jsonExcerpt, 'pf', 'profitFactor')).filter((x): x is number => x !== null);
  const nets = runs.map((r) => numericField(r.jsonExcerpt, 'net', 'netReturn', 'netReturnPct')).filter((x): x is number => x !== null);
  const trades = numericField(latest.jsonExcerpt, 'trades', 'tradeCount');
  const maxDD = numericField(latest.jsonExcerpt, 'maxDD', 'maxDrawdown', 'maxDrawdownPct');

  const latestSharpe = numericField(latest.jsonExcerpt, 'sharpe');
  if (latestSharpe !== null && latestSharpe > 3) {
    flags.push({ severity: 'warning', text: `latest Sharpe (${latestSharpe}) is unusually high for an in-sample crypto-futures result — worth checking for lookahead bias or leakage before trusting it (this is exactly the shape the original TSM/Donchian false edges had).` });
  }
  const latestPf = numericField(latest.jsonExcerpt, 'pf', 'profitFactor');
  if (latestPf !== null && latestPf > 3) {
    flags.push({ severity: 'warning', text: `latest profit factor (${latestPf}) is unusually high — same lookahead/leakage check applies.` });
  }

  if (trades !== null && trades < 30) {
    flags.push({ severity: 'notice', text: `latest run reports only ${trades} trades — small-sample results are noisy; treat any PF/net figure here as low-confidence regardless of sign.` });
  }

  if (maxDD !== null && maxDD >= 12 && maxDD <= 15) {
    flags.push({ severity: 'notice', text: `latest max drawdown (${maxDD}%) is close to the 15% mission cap — thin margin, sensitive to small changes in the study or data window.` });
  }

  if (runs.length >= 3 && nets.length >= 3) {
    const m = mean(nets);
    const sd = stdev(nets);
    if (m !== 0 && Math.abs(sd / m) > 0.5) {
      flags.push({ severity: 'warning', text: `net-return across ${nets.length} runs varies a lot relative to its mean (mean=${m.toFixed(2)}, stdev=${sd.toFixed(2)}) — check for nondeterminism (unseeded randomness, live/shifting data) before treating any single run as representative.` });
    }
  }
  if (runs.length >= 3 && pfs.length >= 3) {
    const m = mean(pfs);
    const sd = stdev(pfs);
    if (m !== 0 && Math.abs(sd / m) > 0.3) {
      flags.push({ severity: 'notice', text: `profit factor across ${pfs.length} runs also varies noticeably (mean=${m.toFixed(2)}, stdev=${sd.toFixed(2)}) — consistent with the net-return variance flag above, if present.` });
    }
  }

  if (crashRate > 0.3 && runs.length >= 3) {
    flags.push({ severity: 'warning', text: `${crashCount}/${runs.length} runs crashed (exit != 0) — unstable; any passing run should be treated with suspicion until the crashes are root-caused.` });
  }

  if (runs.some((r) => r.timedOut)) {
    flags.push({ severity: 'notice', text: 'at least one run timed out and was killed — its metrics (if any) may be from a partial/interrupted run rather than a completed one; check the log before trusting it.' });
  }

  return flags;
}

function main(): void {
  const args = process.argv.slice(2);
  let filterId: string | null = null;
  for (let i = 0; i < args.length; i++) if (args[i] === '--id') filterId = args[i + 1] ?? null;

  const records = loadAllRunRecords(recordsDir);
  const ledger = loadLedger(ledgerPath);
  const holdoutHistory = loadHoldoutHistory(holdoutHistoryPath);
  const byId = groupById(records);

  let ids = [...byId.keys()].sort();
  if (filterId) ids = ids.filter((id) => id === filterId);

  if (ids.length === 0) {
    console.log('[research-agent] No run-records found yet. Run runQueuedStudies.mts first.');
    return;
  }

  let totalFlags = 0;
  const perCandidate: Array<{ id: string; flags: Flag[] }> = [];

  for (const id of ids) {
    const runs = byId.get(id)!;
    const flags = flagsForCandidate(id, runs);

    // Informational nudge: looks promotable by its own numbers, no ledger entry yet.
    const ledgerEntry = ledger.find((l) => l.id === id);
    const latest = runs[runs.length - 1];
    const net = numericField(latest.jsonExcerpt, 'net', 'netReturn', 'netReturnPct');
    const pf = numericField(latest.jsonExcerpt, 'pf', 'profitFactor');
    const maxDD = numericField(latest.jsonExcerpt, 'maxDD', 'maxDrawdown', 'maxDrawdownPct');
    if (!ledgerEntry && latest.exitCode === 0 && net !== null && pf !== null && net > 0 && pf > 1 && (maxDD === null || maxDD <= 15)) {
      flags.push({ severity: 'info', text: 'by its own latest reported numbers this clears the mission gate and has no promotion-ledger.json entry yet — might be worth a closer read (this is a nudge to look, not a verdict).' });
    }

    // Informational nudge: ready in ledger but never opened, and it's been a while.
    const opens = holdoutHistory.filter((h) => h.id === id);
    if (ledgerEntry?.ready && opens.length === 0) {
      flags.push({ severity: 'info', text: 'marked ready:true in promotion-ledger.json but the holdout has never been opened for it — if this is intentional (e.g. waiting to batch several candidates), ignore; otherwise it may just be waiting on you.' });
    }

    perCandidate.push({ id, flags });
    totalFlags += flags.length;
  }

  console.log(`APEX Research Agent — risk scan across ${ids.length} candidate${ids.length === 1 ? '' : 's'} (${totalFlags} flag${totalFlags === 1 ? '' : 's'})\n`);

  for (const { id, flags } of perCandidate) {
    if (flags.length === 0) {
      console.log(`## ${id} — no flags`);
      console.log('');
      continue;
    }
    console.log(`## ${id} — ${flags.length} flag${flags.length === 1 ? '' : 's'}`);
    for (const f of flags) {
      console.log(`   [${f.severity.toUpperCase()}] ${f.text}`);
    }
    console.log('');
  }

  console.log('Reminder: every flag above is a heuristic nudge to go look at the log/report yourself, not a verdict. This script cannot and does not decide anything.');
}

main();
