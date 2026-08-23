#!/usr/bin/env node
/**
 * computeChangedScope -- git-diff-aware change scope for `npm run verify:fast`.
 *
 * Emits a JSON scope report describing exactly which files changed relative to a
 * baseline, and which coarse scopes those files fall into. It decides nothing on
 * its own: verifyFast.mjs makes the run/skip decisions, and it does so against
 * the `inputs` globs in gateDependencyMap.mjs, not against these scope labels.
 *
 * WHY THE BASELINE MATTERS
 * Skipping a gate because "its inputs did not change since X" is only sound if
 * the gate actually passed at X. So the baseline carries a `trusted` flag. If no
 * baseline has been explicitly recorded, `trusted` is false and verifyFast
 * refuses to skip anything -- it degrades to running the whole mapped chain
 * rather than silently trusting an unverified starting point.
 *
 * Record a baseline only after a real full `npm run verify` passed:
 *   node scripts/gates/computeChangedScope.mjs --record-baseline --evidence="npm run verify exit 0 at <time>"
 *
 * OUTPUT LOCATION
 * Written to QA/verify-fast-scope.json. QA/ is already classified in
 * Doc/repository/ROOT_CONTRACT.md as machine-readable QA output, is already
 * gitignored (/QA/), and -- unlike src/, public/, scripts/ and openapi/ -- is NOT
 * hashed into sourceHash by generateBuildIdentity.mjs. Writing here therefore
 * adds no root entry, needs no .gitignore change, and cannot disturb
 * check:build-identity. A root-level dotfile would have required all three.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NON_SOURCE_PATHS, SCOPE_RULES, matchesAny } from './gateDependencyMap.mjs';

const DEFAULT_OUT = 'QA/verify-fast-scope.json';
export const BASELINE_FILE = 'QA/verify-fast-baseline.json';

function git(args, { root = process.cwd(), allowFail = true } = {}) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (!allowFail) throw error;
    return null;
  }
}

function lines(value) {
  if (!value) return [];
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function readBaseline(root) {
  const explicit = process.argv.find((arg) => arg.startsWith('--base='));
  if (explicit) {
    const ref = explicit.slice('--base='.length);
    return { ref, trusted: true, source: `--base=${ref} (caller asserts this ref is last-known-good)` };
  }
  if (process.env.APEX_VERIFY_FAST_BASE) {
    const ref = process.env.APEX_VERIFY_FAST_BASE;
    return { ref, trusted: true, source: `APEX_VERIFY_FAST_BASE=${ref} (caller asserts this ref is last-known-good)` };
  }
  const file = resolve(root, BASELINE_FILE);
  if (existsSync(file)) {
    try {
      const recorded = JSON.parse(readFileSync(file, 'utf8'));
      if (recorded && typeof recorded.ref === 'string' && recorded.ref) {
        return {
          ref: recorded.ref,
          trusted: true,
          source: `${BASELINE_FILE} recorded ${recorded.recordedAt || 'unknown time'} :: ${recorded.evidence || 'no evidence recorded'}`,
        };
      }
    } catch {
      // fall through to untrusted
    }
  }
  return {
    ref: 'HEAD',
    trusted: false,
    source: 'no recorded baseline -- nothing will be skipped',
  };
}

export function computeChangedScope({ root = process.cwd() } = {}) {
  const headSha = git(['rev-parse', 'HEAD'], { root });
  const baseline = readBaseline(root);
  const baselineSha = baseline.ref === 'HEAD' ? headSha : git(['rev-parse', baseline.ref], { root });

  const staged = lines(git(['diff', '--cached', '--name-only', '--no-renames'], { root }));
  const unstaged = lines(git(['diff', '--name-only', '--no-renames'], { root }));
  const untracked = lines(git(['ls-files', '--others', '--exclude-standard'], { root }));
  const committedSinceBaseline = baselineSha && headSha && baselineSha !== headSha
    ? lines(git(['diff', '--name-only', '--no-renames', `${baselineSha}...${headSha}`], { root }))
    : [];

  const allChanged = [...new Set([...staged, ...unstaged, ...untracked, ...committedSinceBaseline])].sort();

  // Partition off paths that cannot be a gate input (generated output and
  // working-copy-only agent tooling). They are recorded, not discarded, so the
  // report never hides a change it decided to disregard.
  const nonSourceIgnored = [];
  const changedFiles = [];
  for (const file of allChanged) {
    const pattern = matchesAny(file, NON_SOURCE_PATHS);
    if (pattern) nonSourceIgnored.push({ file, ignoredBy: pattern });
    else changedFiles.push(file);
  }

  const scopes = {};
  const unclassified = [];
  for (const file of changedFiles) {
    let assigned = null;
    for (const [scope, patterns] of SCOPE_RULES) {
      if (matchesAny(file, patterns)) {
        assigned = scope;
        break;
      }
    }
    if (!assigned) {
      unclassified.push(file);
      continue;
    }
    (scopes[assigned] ||= []).push(file);
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    head: { sha: headSha, short: headSha ? headSha.slice(0, 12) : null },
    baseline: { ref: baseline.ref, resolvedSha: baselineSha, trusted: baseline.trusted, source: baseline.source },
    changedFileCount: changedFiles.length,
    changedFiles,
    nonSourceIgnored,
    sources: {
      staged: staged.length,
      unstaged: unstaged.length,
      untracked: untracked.length,
      committedSinceBaseline: committedSinceBaseline.length,
    },
    scopeSummary: Object.keys(scopes).sort(),
    scopes,
    unclassified,
  };
}

function recordBaseline(root) {
  const evidenceArg = process.argv.find((arg) => arg.startsWith('--evidence='));
  if (!evidenceArg || !evidenceArg.slice('--evidence='.length).trim()) {
    console.error('[verify-fast-scope] --record-baseline requires --evidence="<what proved this ref good>"');
    console.error('[verify-fast-scope] a baseline without evidence would let verify:fast skip gates on an unverified tree');
    process.exit(1);
  }
  const headSha = git(['rev-parse', 'HEAD'], { root });
  if (!headSha) {
    console.error('[verify-fast-scope] cannot record a baseline: git rev-parse HEAD failed');
    process.exit(1);
  }
  const dirty = lines(git(['status', '--porcelain'], { root }));
  const payload = {
    schemaVersion: 1,
    ref: headSha,
    recordedAt: new Date().toISOString(),
    evidence: evidenceArg.slice('--evidence='.length).trim(),
    dirtyAtRecord: dirty,
  };
  const out = resolve(root, BASELINE_FILE);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[verify-fast-scope] baseline recorded: ${headSha.slice(0, 12)}`);
  console.log(`[verify-fast-scope] evidence: ${payload.evidence}`);
  if (dirty.length) {
    console.log(`[verify-fast-scope] NOTE: ${dirty.length} working-tree entr${dirty.length === 1 ? 'y was' : 'ies were'} dirty when recorded:`);
    dirty.forEach((entry) => console.log(`  - ${entry}`));
  }
}

function main() {
  const root = process.cwd();
  if (process.argv.includes('--record-baseline')) {
    recordBaseline(root);
    return;
  }
  const report = computeChangedScope({ root });
  const outArg = process.argv.find((arg) => arg.startsWith('--out='));
  const outPath = resolve(root, outArg ? outArg.slice('--out='.length) : DEFAULT_OUT);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.error(`[verify-fast-scope] written to ${outArg ? outArg.slice('--out='.length) : DEFAULT_OUT}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
