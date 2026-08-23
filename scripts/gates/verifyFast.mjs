#!/usr/bin/env node
/**
 * verifyFast -- change-aware DEV LOOP filter over the canonical `verify` chain.
 *
 * ############################################################################
 * # THIS IS NOT A RELEASE GATE.                                              #
 * # `npm run verify` and `npm run release:package` are untouched and remain   #
 * # the only chains that may certify a release. verify:fast exists to shorten #
 * # the edit/check loop, nothing else.                                       #
 * ############################################################################
 *
 * WHAT IT MAY SKIP, AND WHAT IT MAY NEVER SKIP
 * Only gates marked `expensive: true` in gateDependencyMap.mjs are ever
 * skipped. Every cheap gate -- which is every source-contract gate, i.e. every
 * exact contract-string and allow-list assertion in the repo -- runs on every
 * single invocation. That is deliberate: those gates are the ones that encode
 * invariants, they cost ~1s each, and a "fast" mode that stopped checking them
 * would be a gate weakening dressed up as an optimisation.
 *
 * FOUR INDEPENDENT REASONS A GATE STILL RUNS EVEN IF NOTHING IT OWNS CHANGED
 *  1. no trusted baseline recorded  -> nothing at all is skipped
 *  2. gate is in ALWAYS_RUN          -> structural / safety-critical
 *  3. gate is absent from the map    -> map drift; degrade to running it
 *  4. build identity is stale        -> `build` is forced (probe below)
 *
 * WHY THE BUILD-IDENTITY PROBE EXISTS
 * `check:build-identity` compares public/build-info.json against a hash of
 * BUILD_IDENTITY_INPUTS *and* against the current commit, because buildId is
 * `${commit12}` on a clean tree and `${commit8}-${sourceHash8}` on a dirty one.
 * So merely committing -- with zero source change -- stales build-info.json, and
 * only `npm run build` refreshes it. Rather than infer that from git state, this
 * runner asks the authoritative source directly by running
 * generateBuildIdentity.mjs --check (read-only, ~1s) and forces `build` on a
 * non-zero exit. The probe's real exit code is printed in the reason column.
 *
 * FAILURE SEMANTICS
 * Mirrors the `&&` semantics of the real chain: the first failing gate stops the
 * run. Gates after that point are reported as NOT RUN, never as PASS. Use
 * --keep-going to continue past failures when triaging.
 *
 * USAGE
 *   npm run verify:fast                 -- decide, then run
 *   npm run verify:fast -- --dry-run    -- print decisions only, execute nothing
 *   npm run verify:fast -- --keep-going -- do not stop at the first failure
 *   npm run verify:fast -- --base=<ref> -- override the baseline ref
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALWAYS_RUN, VERIFY_FAST_CHAIN, matchesAny } from './gateDependencyMap.mjs';
import { computeChangedScope } from './computeChangedScope.mjs';

const root = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');
const KEEP_GOING = process.argv.includes('--keep-going');

const STATUS = { RAN: 'RAN', SKIPPED: 'SKIPPED', NOT_RUN: 'NOT RUN' };

function banner(lines) {
  const width = Math.max(...lines.map((line) => line.length)) + 2;
  console.log(`+${'-'.repeat(width)}+`);
  for (const line of lines) console.log(`| ${line.padEnd(width - 1)}|`);
  console.log(`+${'-'.repeat(width)}+`);
}

/**
 * Expands the canonical `verify` script into its leaf gates, expanding ONLY the
 * two aggregate children that VERIFY_FAST_CHAIN models at child level. Anything
 * else (qa:liquidity-hunter's own 15-child chain, for example) stays a single
 * leaf, exactly as the map treats it.
 */
function canonicalVerifyLeaves(scripts) {
  const EXPAND = new Set(['verify', 'test:runtime', 'check:source-contracts']);
  const leaves = [];
  const walk = (name) => {
    const body = scripts[name];
    if (!body) return;
    for (const part of body.split('&&').map((segment) => segment.trim()).filter(Boolean)) {
      const asNpm = /^npm run ([\w:.@/-]+)$/.exec(part);
      if (asNpm) {
        if (EXPAND.has(asNpm[1])) walk(asNpm[1]);
        else leaves.push(asNpm[1]);
        continue;
      }
      const asNode = /^node\s+(\S+\.(?:mjs|mts|js))$/.exec(part);
      if (asNode) {
        leaves.push(asNode[1].split('/').pop().replace(/\.(?:mjs|mts|js)$/, ''));
        continue;
      }
      leaves.push(part);
    }
  };
  walk('verify');
  return leaves;
}

function probeBuildIdentity() {
  const result = spawnSync(process.execPath, ['scripts/utilities/generateBuildIdentity.mjs', '--check'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { code: result.status, output: `${result.stdout || ''}${result.stderr || ''}`.trim() };
}

function decide({ entry, scope, noSkip, buildProbe }) {
  if (ALWAYS_RUN.has(entry.gate)) {
    return { status: STATUS.RAN, reason: 'ALWAYS_RUN: structural / safety-critical gate' };
  }
  if (!entry.expensive) {
    return { status: STATUS.RAN, reason: 'cheap gate: contract-string gates are never skipped' };
  }
  if (noSkip) {
    return { status: STATUS.RAN, reason: noSkip };
  }
  if (entry.gate === 'build' && buildProbe.code !== 0) {
    return { status: STATUS.RAN, reason: `forced: generateBuildIdentity --check exit ${buildProbe.code} (build-info.json stale)` };
  }
  for (const file of scope.changedFiles) {
    const pattern = matchesAny(file, entry.inputs);
    if (pattern) return { status: STATUS.RAN, reason: `input changed: ${file} matches ${pattern}` };
  }
  return { status: STATUS.SKIPPED, reason: `no declared input changed since ${scope.baseline.resolvedSha?.slice(0, 12) ?? scope.baseline.ref}` };
}

function runGate(entry) {
  const useNpm = Boolean(entry.run.npm);
  const command = useNpm ? 'npm' : process.execPath;
  const args = useNpm ? ['run', entry.run.npm] : [entry.run.node];
  const printable = useNpm ? `npm run ${entry.run.npm}` : `node ${entry.run.node}`;
  console.log(`\n=== verify:fast RUN ${entry.gate} :: ${printable}`);
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    // npm on Windows resolves through npm.cmd, which needs a shell. process.execPath
    // must NOT go through a shell -- its path contains spaces on Windows.
    shell: useNpm && process.platform === 'win32',
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const code = result.status === null ? `signal:${result.signal}` : result.status;
  console.log(`=== verify:fast ${entry.gate} exit ${code} (${seconds}s)`);
  return { code: result.status, seconds };
}

function main() {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const scope = computeChangedScope({ root });

  const mapped = new Set(VERIFY_FAST_CHAIN.map((entry) => entry.gate));
  const canonicalLeaves = canonicalVerifyLeaves(pkg.scripts);
  const unmapped = canonicalLeaves.filter((leaf) => !mapped.has(leaf));

  let noSkip = null;
  if (!scope.baseline.trusted) {
    noSkip = 'no trusted baseline recorded -- nothing may be skipped';
  } else if (unmapped.length) {
    noSkip = `map drift: ${unmapped.length} gate(s) in verify are UNMAPPED (${unmapped.join(', ')})`;
  }

  const buildProbe = noSkip ? { code: null, output: 'not probed (nothing is being skipped)' } : probeBuildIdentity();

  banner([
    'verify:fast -- DEV LOOP ONLY. NOT a release gate.',
    'npm run verify / npm run release:package remain mandatory and unchanged.',
  ]);
  console.log(`head              : ${scope.head.short}`);
  console.log(`baseline          : ${scope.baseline.resolvedSha?.slice(0, 12) ?? '(unresolved)'} trusted=${scope.baseline.trusted}`);
  console.log(`baseline source   : ${scope.baseline.source}`);
  console.log(`changed files     : ${scope.changedFileCount} (staged=${scope.sources.staged} unstaged=${scope.sources.unstaged} untracked=${scope.sources.untracked} sinceBaseline=${scope.sources.committedSinceBaseline})`);
  for (const file of scope.changedFiles) console.log(`                    ${file}`);
  console.log(`scopes            : ${scope.scopeSummary.join(', ') || '(none)'}`);
  if (scope.nonSourceIgnored.length) {
    console.log(`non-source ignored: ${scope.nonSourceIgnored.length} (generated / working-copy-only, cannot be a gate input)`);
    for (const entry of scope.nonSourceIgnored) console.log(`                    ${entry.file}  [${entry.ignoredBy}]`);
  }
  if (scope.unclassified.length) console.log(`unclassified      : ${scope.unclassified.join(', ')}`);
  console.log(`canonical leaves  : ${canonicalLeaves.length} gate(s) parsed from the real package.json verify script`);
  console.log(`mapped            : ${canonicalLeaves.length - unmapped.length}/${canonicalLeaves.length}`);
  if (unmapped.length) console.log(`UNMAPPED          : ${unmapped.join(', ')} -> forcing a no-skip run`);
  console.log(`build identity    : ${buildProbe.code === null ? buildProbe.output : `generateBuildIdentity --check exit ${buildProbe.code}`}`);
  if (noSkip) console.log(`NO-SKIP MODE      : ${noSkip}`);
  if (DRY_RUN) console.log('MODE              : --dry-run, no gate will be executed');
  console.log('');

  const results = [];
  let stopped = false;
  let failures = 0;

  for (const entry of VERIFY_FAST_CHAIN) {
    if (stopped) {
      results.push({ gate: entry.gate, status: STATUS.NOT_RUN, reason: 'chain stopped at the first failing gate', code: '-' });
      continue;
    }
    const decision = decide({ entry, scope, noSkip, buildProbe });
    if (decision.status === STATUS.SKIPPED) {
      results.push({ gate: entry.gate, status: STATUS.SKIPPED, reason: decision.reason, code: '-' });
      continue;
    }
    if (DRY_RUN) {
      results.push({ gate: entry.gate, status: 'WOULD RUN', reason: decision.reason, code: '-' });
      continue;
    }
    const { code, seconds } = runGate(entry);
    results.push({ gate: entry.gate, status: STATUS.RAN, reason: decision.reason, code: code === null ? 'signal' : code, seconds });
    if (code !== 0) {
      failures += 1;
      if (!KEEP_GOING) stopped = true;
    }
  }

  const widths = {
    gate: Math.max(4, ...results.map((row) => row.gate.length)),
    status: Math.max(9, ...results.map((row) => String(row.status).length)),
    code: 4,
    reason: Math.min(96, Math.max(6, ...results.map((row) => row.reason.length))),
  };
  const line = `+-${'-'.repeat(widths.gate)}-+-${'-'.repeat(widths.status)}-+-${'-'.repeat(widths.code)}-+-${'-'.repeat(widths.reason)}-+`;
  console.log(`\n${line}`);
  console.log(`| ${'gate'.padEnd(widths.gate)} | ${'status'.padEnd(widths.status)} | ${'exit'.padEnd(widths.code)} | ${'reason'.padEnd(widths.reason)} |`);
  console.log(line);
  for (const row of results) {
    console.log(`| ${row.gate.padEnd(widths.gate)} | ${String(row.status).padEnd(widths.status)} | ${String(row.code).padEnd(widths.code)} | ${row.reason.slice(0, widths.reason).padEnd(widths.reason)} |`);
  }
  console.log(line);

  const ran = results.filter((row) => row.status === STATUS.RAN).length;
  const skipped = results.filter((row) => row.status === STATUS.SKIPPED).length;
  const notRun = results.filter((row) => row.status === STATUS.NOT_RUN).length;
  const wouldRun = results.filter((row) => row.status === 'WOULD RUN').length;
  console.log('');
  if (DRY_RUN) console.log(`WOULD RUN=${wouldRun}  SKIPPED=${skipped}  (dry run: no gate was executed, no gate PASSED)`);
  else console.log(`RAN=${ran}  FAILED=${failures}  SKIPPED=${skipped}  NOT RUN=${notRun}`);
  console.log('SKIPPED is not PASS. A skipped gate was not checked by this run.');
  banner([
    failures ? 'verify:fast FAILED -- see the failing gate above.' : 'verify:fast completed the gates it ran.',
    'This does NOT certify the tree. Run `npm run verify` before commit-to-main or release:package.',
  ]);

  process.exit(failures > 0 ? 1 : 0);
}

main();
