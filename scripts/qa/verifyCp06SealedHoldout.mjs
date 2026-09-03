import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const failures = [];
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failures.push(name);
};
const throwsMessage = (fn, expected) => {
  try { fn(); return false; } catch (error) { return String(error?.message || error).includes(expected); }
};

// Resolve this project's own pinned tsc binary rather than trusting whatever
// 'tsc' happens to be first on PATH: an unrelated globally-installed
// TypeScript version can behave differently (e.g. flag/tsconfig handling
// changed across major versions) and silently produce a false FAIL/PASS.
function resolveLocalTsc() {
  const localBin = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
  if (existsSync(localBin)) return localBin;
  const explicit = process.env.APEX_TSC_BIN;
  if (explicit && existsSync(explicit)) return explicit;
  return 'tsc'; // last-resort PATH fallback for constrained analysis environments
}

const buildDir = mkdtempSync(join(tmpdir(), 'apex-cp06-'));
try {
  const compile = spawnSync(resolveLocalTsc(), [
    'src/services/sealedHoldout.ts',
    '--outDir', buildDir,
    '--module', 'commonjs',
    '--target', 'ES2022',
    '--moduleResolution', 'node',
    '--noCheck',
    '--types', 'node',
  ], { cwd: process.cwd(), encoding: 'utf8' });
  check('sealed-holdout runtime transpiles independently', compile.status === 0);
  if (compile.status !== 0) {
    console.error(compile.stdout || '');
    console.error(compile.stderr || '');
    process.exit(1);
  }

  const require = createRequire(import.meta.url);
  const holdout = require(join(buildDir, 'services', 'sealedHoldout.js'));
  const rows = Array.from({ length: 1_000 }, (_, index) => ({
    time: new Date(Date.UTC(2020, 0, 1, index)).toISOString(),
    open: 100 + index / 100,
    high: 101 + index / 100,
    low: 99 + index / 100,
    close: 100.5 + index / 100,
    volume: 1_000 + index,
  }));
  const partition = holdout.partitionFiveWayWithSealedHoldout(rows, 12, 12, 40);
  check('partition exposes development windows but not raw final-holdout rows',
    Array.isArray(partition.train) && Array.isArray(partition.validation.candles) && !('candles' in partition.holdout));
  check('sealed holdout starts after every development observation',
    partition.holdout.metadata.from > Date.parse(partition.validation.candles.at(-1).time));
  check('unauthorized direct holdout read is rejected',
    throwsMessage(() => partition.holdout._consume(Symbol('not-authorized')), 'sealed_holdout_unauthorized_access'));
  check('sealed dataset direct construction is rejected',
    throwsMessage(() => new holdout.SealedHoldoutDataset(Symbol('fake'), rows.slice(-100)), 'sealed_holdout_direct_construction_blocked'));

  const manifest = {
    strategyId: 'cp06-fixture',
    strategyVersion: 1,
    parameters: { beta: 2, alpha: 1 },
    scannerConfig: { z: 1, nested: { b: 2, a: 1 } },
    transactionCostProfileFingerprint: 'cost:v1',
    validationPolicyFingerprint: 'policy:v1',
    searchObjectiveFingerprint: 'objective:v1',
    developmentDatasetFingerprint: partition.developmentDatasetFingerprint,
    featureVersions: ['feature-b', 'feature-a'],
    authorityConfiguration: { stage: 'RESEARCH', direction: 'LONG' },
  };
  const reorderedManifest = {
    ...manifest,
    parameters: { alpha: 1, beta: 2 },
    scannerConfig: { nested: { a: 1, b: 2 }, z: 1 },
    featureVersions: ['feature-a', 'feature-b'],
    authorityConfiguration: { direction: 'LONG', stage: 'RESEARCH' },
  };
  const fp = holdout.fingerprintFrozenCandidate(manifest);
  check('candidate fingerprint is deterministic across object-key ordering', fp === holdout.fingerprintFrozenCandidate(reorderedManifest));
  check('candidate fingerprint binds validation policy', fp !== holdout.fingerprintFrozenCandidate({ ...manifest, validationPolicyFingerprint: 'policy:v2' }));
  check('candidate fingerprint binds search objective', fp !== holdout.fingerprintFrozenCandidate({ ...manifest, searchObjectiveFingerprint: 'objective:v2' }));
  check('candidate fingerprint binds development dataset', fp !== holdout.fingerprintFrozenCandidate({ ...manifest, developmentDatasetFingerprint: 'dataset:other' }));

  const ledger = new holdout.HoldoutUseLedger();
  const access = holdout.authorizeFinalHoldoutAccess({ dataset: partition.holdout, candidate: manifest, ledger, now: 10 });
  const revealed = access.consumeForFinalGovernance();
  check('authorized final-governance access reveals a defensive copy once',
    revealed.length === partition.holdout.metadata.rowCount && revealed !== rows);
  check('second read through the same authorization is rejected',
    throwsMessage(() => access.consumeForFinalGovernance(), 'sealed_holdout_access_already_consumed'));
  check('failed final governance retires the frozen candidate', access.complete(false, 20).status === 'FAILED_RETIRED');
  check('same final dataset cannot be reopened for a tweaked candidate',
    throwsMessage(() => holdout.authorizeFinalHoldoutAccess({
      dataset: partition.holdout,
      candidate: { ...manifest, parameters: { alpha: 9, beta: 2 } },
      ledger,
      now: 30,
    }), 'sealed_holdout_dataset_already_consumed'));

  const otherRows = rows.map((row, index) => ({ ...row, close: row.close + (index === rows.length - 1 ? 0.01 : 0) }));
  const otherPartition = holdout.partitionFiveWayWithSealedHoldout(otherRows, 12, 12, 40);
  check('retired candidate cannot be reused on a different final dataset',
    throwsMessage(() => holdout.authorizeFinalHoldoutAccess({ dataset: otherPartition.holdout, candidate: manifest, ledger, now: 40 }),
      'sealed_holdout_retired_candidate_reuse_blocked'));

  const optimizer = readFileSync('src/services/strategyOptimization.ts', 'utf8');
  const routes = readFileSync('src/services/apexNextMarketRoutes.ts', 'utf8');
  const walkForward = readFileSync('scripts/research/lib/walkForward.ts', 'utf8');
  const evidence = readFileSync('src/services/strategyEvidence.ts', 'utf8');
  const types = readFileSync('src/types.ts', 'utf8');
  check('optimizer generic evaluator never receives final sealed-holdout rows',
    !optimizer.includes('split.holdout.candles') && !optimizer.includes('consumeForFinalGovernance()') && !optimizer.includes('authorizeFinalHoldoutAccess({'));
  check('optimizer leaves final holdout sealed for candidate-matched validation',
    optimizer.includes("finalHoldoutStatus: 'SEALED_NOT_OPENED_DURING_OPTIMIZATION'") && optimizer.includes('developmentBlockers.length'));
  check('validation route has no raw holdoutSlice escape hatch',
    !routes.includes('holdoutSlice') && routes.includes('authorizeFinalHoldoutAccess({'));
  check('fixed-candidate validation is truthfully labelled temporal robustness',
    routes.includes('Temporal robustness') && !routes.includes('label: `Walk-forward'));
  check('fixed-candidate evidence method no longer claims walk-forward optimization',
    evidence.includes('temporal-robustness-3-window-plus-sealed-holdout-v2') && !evidence.includes('walk-forward-3-window'));
  check('holdout protocol records development and policy fingerprints',
    types.includes('developmentDatasetFingerprint?: string') && routes.includes('validationPolicyFingerprint') && routes.includes('searchObjectiveFingerprint'));
  check('research walk-forward implementation remains a genuine rolling train→unseen-test process',
    walkForward.includes('const testStart = trainEnd;') && walkForward.includes('trainStart += stepBars;') && walkForward.includes('parameters are never chosen')); 
} finally {
  rmSync(buildDir, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`CP06 sealed-holdout acceptance: FAIL (${failures.length})`);
  process.exit(1);
}
console.log('CP06 sealed-holdout acceptance: PASS');
