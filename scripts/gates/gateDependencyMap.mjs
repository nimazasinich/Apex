#!/usr/bin/env node
/**
 * Static gate -> input-path dependency map for `npm run verify:fast`.
 *
 * SCOPE OF THIS FILE
 * This map exists only to let the DEV LOOP skip gates whose declared inputs did
 * not change. It has no authority over `npm run verify` or `npm run
 * release:package`, which remain full, unconditional, and are the only chains
 * that may certify a release. Nothing here relaxes, reorders or reinterprets any
 * gate's own assertions.
 *
 * HOW THIS MAP WAS DERIVED (not auto-inferred at runtime, deliberately)
 * Every entry was seeded by extracting the repo-relative path literals each gate
 * script actually references, then widened by hand. Auto-inference was rejected
 * because a gate that builds paths dynamically, or asserts on a module it merely
 * imports, would silently produce an under-inclusive map -- and under-inclusion
 * is the one failure mode that can hide a real regression.
 *
 * THE ONE RULE THAT MATTERS
 * Over-inclusion is safe (the gate merely runs when it did not have to).
 * Under-inclusion is a correctness bug (a real breakage gets skipped).
 * When in doubt, widen the pattern. Every gate whose script resolves its inputs
 * dynamically -- i.e. path-literal extraction found nothing to anchor on -- is
 * deliberately mapped to broad `src/**` + `server.ts` patterns rather than a
 * narrow guess.
 *
 * MAINTENANCE CONTRACT
 * Adding a gate to `verify`, or teaching an existing gate to read a new path,
 * requires updating this map in the same change. A gate present in `verify` but
 * absent from VERIFY_FAST_CHAIN is reported by verifyFast.mjs as UNMAPPED and
 * forces a no-skip run, so drift degrades toward running everything (safe)
 * rather than toward skipping something (unsafe).
 */

/**
 * Exactly the path set hashed into `sourceHash` by
 * scripts/utilities/generateBuildIdentity.mjs. Kept as its own export because it
 * creates a hard ordering dependency: `check:build-identity` compares
 * public/build-info.json against a hash of these paths, and only `npm run build`
 * refreshes that file. So if any of these paths changed, `build` MUST run before
 * `check:build-identity`, or the gate fails for a reason that has nothing to do
 * with the change under test. This is why `build` is not freely skippable.
 */
export const BUILD_IDENTITY_INPUTS = [
  'package.json',
  'package-lock.json',
  'server.ts',
  'index.html',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.ui02.json',
  'src/**',
  'public/**',
  'scripts/**',
  'openapi/**',
];

/**
 * Gates that run on every invocation regardless of scope. These are cheap,
 * structural and safety-critical: they assert repository-wide invariants whose
 * inputs cannot be enumerated as a narrow path list (the root listing, the
 * generated route index, the build identity, version identity, and the
 * release secret scan). Skipping any of them would be the exact "gate
 * weakening" this tool must not do.
 *
 * `release:gate` is the canonical script pairing checkVersionIdentity.mjs with
 * checkNoSecretsInRelease.mjs, which is how `verify` invokes them.
 */
export const ALWAYS_RUN = new Set([
  'check:test-inventory',
  'check:root-contract',
  'check:api-contract',
  'check:build-identity',
  'release:gate',
]);

/**
 * Paths that are provably not gate inputs, and why it is safe to say so:
 * every one of them is either classified in Doc/repository/ROOT_CONTRACT.md as
 * working-copy-only agent tooling excluded from the clean source artifact, or is
 * generated output. None of them is inside the path set that
 * generateBuildIdentity.mjs hashes into sourceHash, so none can change what any
 * gate asserts.
 *
 * QA/** is listed for a second, load-bearing reason: verifyFast writes its own
 * scope report there, and a runner that treated its own output as a source
 * change would trigger itself on every invocation.
 *
 * public/build-info.json is the one entry that sits inside a hashed directory,
 * so it needs its own justification. generateBuildIdentity.mjs walks public/ but
 * skips this exact file (`if (absolute === output) continue;`) because it is the
 * file it writes -- hashing your own output is not a fixed point. It is tracked
 * in git yet regenerated on every build with `dirtyTree: true` and
 * `buildId = ${commit8}-${sourceHash8}`, so it is permanently present in
 * `git status` and would otherwise match `public/**` and force build,
 * test:browser and test:visual to run on literally every invocation. Treating it
 * as non-source here mirrors the authoritative generator's own exclusion; it is
 * still fully checked, because check:build-identity is in ALWAYS_RUN and the
 * build-identity probe independently forces `build` whenever it is stale.
 *
 * These paths are reported separately as `nonSourceIgnored` rather than dropped
 * silently -- a change that vanishes from a report is exactly the kind of thing
 * that makes an incremental gate untrustworthy.
 */
export const NON_SOURCE_PATHS = [
  'QA/**',
  '_qa/**',
  '_release/**',
  'dist/**',
  'test-results/**',
  'node_modules/**',
  '.playwright-browsers/**',
  '.serena/**',
  '.agent-index/**',
  'public/build-info.json',
];

const SRC_WIDE = ['src/**', 'server.ts', 'package.json', 'package-lock.json'];
const APP_SHELL = ['src/App.tsx', 'src/main.tsx', 'src/index.css'];
const LIQUIDITY_HUNTER = [
  'src/services/**',
  'src/contracts/**',
  'server.ts',
  'package.json',
  'public/ticker**',
  'scripts/utilities/**',
];

/**
 * Ordered mirror of the `verify` chain, expanded to the child level for
 * `test:runtime` and `check:source-contracts` because that is where the
 * skippable wall-clock actually sits.
 *
 * `run` is how the gate is executed:
 *   { npm: '<script>' }  -> npm run <script>            (canonical script)
 *   { node: '<path>' }   -> node <path>                 (used only for the two
 *                           children `check:source-contracts` itself invokes as
 *                           bare `node` commands, which have no npm script name;
 *                           the command is byte-identical to the chain's own)
 */
export const VERIFY_FAST_CHAIN = [
  // ---- stage 1: typecheck -------------------------------------------------
  {
    gate: 'lint',
    run: { npm: 'lint' },
    expensive: true,
    inputs: ['src/**', 'tests/**', 'scripts/**', 'server.ts', 'tsconfig.json', 'tsconfig.ui02.json', 'vite.config.ts', 'package.json', 'package-lock.json'],
    note: 'tsc --noEmit over the whole TS project; package-lock included because ambient types come from dependencies',
  },

  // ---- stage 2: test inventory (always) -----------------------------------
  { gate: 'check:test-inventory', run: { npm: 'check:test-inventory' }, expensive: false, inputs: ['src/tests/**', 'tests/**', 'package.json'], note: 'always-run; checkTestInventory.mjs walks BOTH src/tests and tests, and enforces floors (>=125 files, >=701 tests) plus zero unresolved dynamic test definitions' },

  // ---- stage 3: unit tests ------------------------------------------------
  {
    gate: 'test:unit',
    run: { npm: 'test:unit' },
    expensive: true,
    inputs: ['src/**', 'tests/**', 'scripts/**', 'server.ts', 'vite.config.ts', 'tsconfig.json', 'package.json', 'package-lock.json'],
    note: 'vitest run, whole suite; scripts/** included because tests may import helpers from there',
  },

  // ---- stage 4: build -----------------------------------------------------
  {
    gate: 'build',
    run: { npm: 'build' },
    expensive: true,
    inputs: BUILD_IDENTITY_INPUTS,
    note: 'inputs are exactly BUILD_IDENTITY_INPUTS: build must run whenever check:build-identity would otherwise see a stale public/build-info.json',
  },

  // ---- stage 5: test:runtime children (14) --------------------------------
  { gate: 'qa:strategy-engines', run: { npm: 'qa:strategy-engines' }, expensive: true, inputs: ['src/services/**', 'scripts/qa/smokeStrategyEngines.mjs'] },
  { gate: 'qa:backtest-runtime', run: { npm: 'qa:backtest-runtime' }, expensive: true, inputs: ['src/**', 'server.ts', 'scripts/qa/verifyBacktestRuntime.mts'], note: 'resolves inputs dynamically via imports; mapped broadly on purpose' },
  { gate: 'qa:adaptive-governor', run: { npm: 'qa:adaptive-governor' }, expensive: true, inputs: ['src/services/**', 'scripts/qa/verifyAdaptiveGovernor.mjs'] },
  { gate: 'qa:trading-engine-utilities', run: { npm: 'qa:trading-engine-utilities' }, expensive: true, inputs: ['src/**', 'scripts/qa/verifyTradingEngineUtilities.mts'], note: 'no path literals to anchor on; mapped broadly on purpose' },
  { gate: 'qa:strategy-library', run: { npm: 'qa:strategy-library' }, expensive: true, inputs: ['src/**', 'vite.config.ts', 'package.json'], note: 'vitest run src/tests/strategyRegistryRuntime.test.ts' },
  { gate: 'qa:strategy-integration', run: { npm: 'qa:strategy-integration' }, expensive: true, inputs: ['src/**', 'vite.config.ts', 'package.json'], note: 'vitest run src/tests/strategyValidationRuntime.test.ts' },
  { gate: 'qa:strategy-backtest-production', run: { npm: 'qa:strategy-backtest-production' }, expensive: true, inputs: ['src/**', 'vite.config.ts', 'package.json'], note: 'vitest run src/tests/strategyBacktestProduction.test.ts' },
  { gate: 'qa:unified-safety-runtime', run: { npm: 'qa:unified-safety-runtime' }, expensive: true, inputs: ['src/services/**', 'src/contracts/**', 'scripts/qa/runUnifiedSafetyRuntime.mjs'] },
  {
    gate: 'qa:autopilot-lifecycle-runtime',
    run: { npm: 'qa:autopilot-lifecycle-runtime' },
    expensive: true,
    inputs: ['server.ts', 'src/**', 'package.json', 'scripts/qa/runAutopilotLifecycleRuntime.mjs'],
    note: 'boots the real server on the fixed port 4599 and waits out two 60s scheduler cycles; single most expensive child in the chain',
  },
  { gate: 'qa:comprehensive-simulation', run: { npm: 'qa:comprehensive-simulation' }, expensive: true, inputs: ['src/**', 'package.json', 'scripts/qa/generateComprehensiveSimulationData.mjs', 'scripts/qa/runComprehensiveSimulationRuntime.mjs'] },
  { gate: 'qa:supplemental-key-runtime', run: { npm: 'qa:supplemental-key-runtime' }, expensive: true, inputs: ['src/services/**', 'scripts/qa/runSupplementalKeyRuntime.mjs'] },
  { gate: 'qa:proxy-fetch-optional-deps', run: { npm: 'qa:proxy-fetch-optional-deps' }, expensive: true, inputs: ['src/services/**', 'package.json', 'package-lock.json', 'scripts/qa/runProxyFetchOptionalDependencyRuntime.mjs'] },
  { gate: 'qa:smart-backtesting-fixtures', run: { npm: 'qa:smart-backtesting-fixtures' }, expensive: true, inputs: ['src/**', 'scripts/qa/generateSmartBacktestingSyntheticFixtures.mjs'], note: 'fixture generator consumed by the hardening gate below; mapped broadly' },
  { gate: 'qa:smart-backtesting-runtime-hardening', run: { npm: 'qa:smart-backtesting-runtime-hardening' }, expensive: true, inputs: ['src/**', 'scripts/qa/verifySmartBacktestingRuntimeHardening.mjs'] },

  // ---- stage 6: check:source-contracts children (26) ----------------------
  { gate: 'qa:merged-stage-ui', run: { npm: 'qa:merged-stage-ui' }, expensive: false, inputs: ['src/**', 'server.ts', 'package.json', 'scripts/capture/**', 'scripts/utilities/**', 'Doc/qa/**', 'Doc/FUNCTION_INDEX_AUTOMATION.md', 'scripts/qa/verifyMergedStageUi.mjs'] },
  { gate: 'qa:agent-safe-merge', run: { npm: 'qa:agent-safe-merge' }, expensive: false, inputs: ['src/components/**', 'src/pages/**', 'src/services/**', 'src/lib/**', 'src/styles/**', ...APP_SHELL, 'public/sw.js', 'package.json', 'scripts/qa/verifyAgentSafeMerge.mjs'] },
  { gate: 'qa:design-tokens', run: { npm: 'qa:design-tokens' }, expensive: false, inputs: ['src/index.css', 'src/styles/**', 'scripts/qa/verifyDesignTokens.mjs'] },
  { gate: 'qa:reference-ui', run: { npm: 'qa:reference-ui' }, expensive: false, inputs: ['src/components/**', 'src/pages/**', 'src/services/**', 'src/styles/**', ...APP_SHELL, 'Doc/reference/**', 'scripts/qa/verifyReferenceUiRedesign.mjs'] },
  { gate: 'qa:ui-interaction-polish', run: { npm: 'qa:ui-interaction-polish' }, expensive: false, inputs: ['src/components/**', 'src/pages/**', 'src/styles/**', ...APP_SHELL, 'scripts/qa/verifyUiInteractionPolish.mjs'] },
  { gate: 'qa:ui-theme-merge', run: { npm: 'qa:ui-theme-merge' }, expensive: false, inputs: ['src/components/**', 'src/pages/**', 'src/styles/**', ...APP_SHELL, 'public/tutorial-thumbnails/**', 'scripts/qa/verifyUiThemeMerge.mjs'] },
  { gate: 'qa:light-theme', run: { npm: 'qa:light-theme' }, expensive: false, inputs: ['src/components/**', 'src/pages/**', 'src/styles/**', ...APP_SHELL, 'index.html', 'public/sw.js', 'public/theme-init.js', 'package.json', 'scripts/qa/verifyLightTheme.mjs'] },
  { gate: 'verifyV19Contract', run: { node: 'scripts/qa/verifyV19Contract.mjs' }, expensive: false, inputs: ['src/components/**', 'src/services/**', 'src/App.tsx', 'src/index.css', 'server.ts', 'vite.config.ts', 'scripts/capture/**', 'scripts/qa/verifyV19Contract.mjs'], note: 'check:source-contracts invokes this as a bare node command; there is no npm script alias' },
  { gate: 'qa:v20-contract', run: { npm: 'qa:v20-contract' }, expensive: false, inputs: ['src/components/**', 'src/pages/**', 'src/services/**', 'src/styles/**', ...APP_SHELL, 'server.ts', 'scripts/qa/verifyV20ReferenceContract.mjs'] },
  { gate: 'qa:workspace-light-polish', run: { npm: 'qa:workspace-light-polish' }, expensive: false, inputs: ['src/components/**', 'src/styles/**', 'src/main.tsx', 'package.json', 'package-lock.json', 'vendor/**', 'scripts/qa/verifyWorkspaceLightPolish.mjs'] },
  { gate: 'qa:strategy-optimization', run: { npm: 'qa:strategy-optimization' }, expensive: false, inputs: ['src/pages/**', 'src/services/**', 'src/tests/**', 'openapi/**', 'package.json', 'scripts/qa/verifyStrategyOptimizationIntegration.mjs'] },
  { gate: 'qa:core10-fusion', run: { npm: 'qa:core10-fusion' }, expensive: false, inputs: ['src/pages/**', 'src/services/**', 'openapi/**', 'package.json', 'Doc/strategy-library/**', 'scripts/qa/verifyCore10DynamicFusion.mjs'] },
  { gate: 'qa:feature-preservation', run: { npm: 'qa:feature-preservation' }, expensive: false, inputs: ['src/pages/**', 'src/services/**', 'scripts/qa/verifyFeaturePreservation.mjs'] },
  { gate: 'qa:liquidity-hunter', run: { npm: 'qa:liquidity-hunter' }, expensive: true, inputs: [...LIQUIDITY_HUNTER, 'scripts/qa/**'], note: '15-child chain of research/runtime gates; scripts/qa/** included because every child is one of those files' },
  { gate: 'verifyV1054CapabilityPreservation', run: { node: 'scripts/qa/verifyV1054CapabilityPreservation.mjs' }, expensive: false, inputs: ['src/App.tsx', 'src/services/**', 'server.ts', 'package.json', 'scripts/qa/**'], note: 'bare node command in check:source-contracts; it inspects the scripts/qa directory itself' },
  { gate: 'qa:ui-completeness-r2', run: { npm: 'qa:ui-completeness-r2' }, expensive: false, inputs: ['src/components/**', 'src/pages/**', 'src/lib/**', 'scripts/qa/verifyUiCompletenessR2.mjs'] },
  { gate: 'qa:research-workspace-layout', run: { npm: 'qa:research-workspace-layout' }, expensive: false, inputs: ['src/pages/**', 'scripts/qa/verifyResearchWorkspaceLayout.mjs'] },
  { gate: 'qa:multi-agent-multi-trading', run: { npm: 'qa:multi-agent-multi-trading' }, expensive: true, inputs: ['src/pages/**', 'src/services/**', 'openapi/**', 'scripts/qa/verifyMultiAgentMultiTrading.mjs', 'scripts/qa/runMultiAgentMultiTradingRuntime.mjs'], note: 'has a runtime child appended to the source check' },
  { gate: 'qa:maximal-merge-safety', run: { npm: 'qa:maximal-merge-safety' }, expensive: false, inputs: ['src/components/**', 'src/pages/**', 'src/services/**', 'server.ts', 'package.json', 'scripts/qa/verifyMaximalMergeSafety.mjs'] },
  { gate: 'qa:supplemental-key-wiring', run: { npm: 'qa:supplemental-key-wiring' }, expensive: false, inputs: ['src/services/**', 'src/tests/**', 'server.ts', 'scripts/qa/verifySupplementalKeyWiring.mjs'] },
  { gate: 'qa:smart-autopilot', run: { npm: 'qa:smart-autopilot' }, expensive: false, inputs: ['src/components/**', 'src/pages/**', 'src/services/**', 'src/lib/**', 'src/App.tsx', 'openapi/**', 'package.json', 'scripts/qa/verifySmartAutopilot.mjs'] },
  { gate: 'qa:strategy-studio-reference', run: { npm: 'qa:strategy-studio-reference' }, expensive: false, inputs: ['src/pages/**', 'public/assets/**', 'scripts/qa/verifyStrategyStudioReference.mjs'] },
  { gate: 'qa:strategy-page-modernization', run: { npm: 'qa:strategy-page-modernization' }, expensive: false, inputs: ['src/pages/**', 'scripts/qa/verifyStrategyPageModernization.mjs'] },
  { gate: 'check:root-contract', run: { npm: 'check:root-contract' }, expensive: false, inputs: ['*'], note: 'always-run: asserts the entire root listing is classified' },
  { gate: 'check:api-contract', run: { npm: 'check:api-contract' }, expensive: false, inputs: ['*'], note: 'always-run: regenerates the route index from server.ts and compares' },
  { gate: 'check:build-identity', run: { npm: 'check:build-identity' }, expensive: false, inputs: ['*'], note: 'always-run: hashes BUILD_IDENTITY_INPUTS against public/build-info.json' },

  // ---- stage 7-8: browser + visual ---------------------------------------
  {
    gate: 'test:browser',
    run: { npm: 'test:browser' },
    expensive: true,
    inputs: ['src/**', 'public/**', 'server.ts', 'index.html', 'vite.config.ts', 'package.json', 'scripts/qa/verifyWorkspaceRuntime.mts'],
    note: 'qa:workspace-runtime boots dev:server on 3210 and serves LIVE source through vite middleware, so every src path is an input',
  },
  {
    gate: 'test:visual',
    run: { npm: 'test:visual' },
    expensive: true,
    inputs: ['src/**', 'public/**', 'index.html', 'vite.config.ts', 'package.json', 'scripts/qa/verifyUi1368.mjs'],
    note: 'qa:ui-1368 builds an inline vite production bundle from source, so every src path is an input',
  },

  // ---- stage 9-11: docs + release gate -----------------------------------
  { gate: 'docs:visual', run: { npm: 'docs:visual' }, expensive: false, inputs: ['Doc/**', 'src/**', 'public/**', 'package.json', 'scripts/utilities/updateVisualProjectDocumentation.mjs'] },
  { gate: 'docs:check', run: { npm: 'docs:check' }, expensive: false, inputs: ['**/*.md', 'Doc/**', 'scripts/utilities/checkDocumentationLinks.mts'] },
  { gate: 'release:gate', run: { npm: 'release:gate' }, expensive: false, inputs: ['*'], note: 'always-run: checkVersionIdentity + checkNoSecretsInRelease' },
];

/**
 * Path -> scope labels for the human-facing scope report. Purely descriptive:
 * gate skip decisions are made against the `inputs` globs above, never against
 * these labels, so a mislabelled scope cannot cause a gate to be skipped.
 */
export const SCOPE_RULES = [
  ['tests-only', ['src/tests/**', 'tests/**']],
  ['strategy-engine', ['src/services/strategyEngine/**', 'src/services/strategy**', 'src/services/technicalAnalysis**']],
  ['liquidity-hunter', ['src/services/liquidityHunter/**', 'src/services/liquidity**']],
  ['server-routes', ['server.ts', 'openapi/**']],
  ['frontend-src', ['src/components/**', 'src/pages/**', 'src/styles/**', 'src/lib/**', 'src/hooks/**', 'src/contracts/**', 'src/services/**', 'src/App.tsx', 'src/main.tsx', 'src/index.css', 'src/**', 'index.html', 'public/**']],
  ['qa-scripts', ['scripts/**']],
  ['docs-only', ['Doc/**', '**/*.md', 'README.txt']],
  ['config/root', ['package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.ui02.json', 'vite.config.ts', 'VERSION', '.gitignore', '.github/**', '.nvmrc', '.node-version', 'vendor/**', '.env.example', '.external-api-sources.config.example.json', 'RUN-APEX.bat', 'CLAUDE.md']],
];

/**
 * Converts one glob pattern to a RegExp, single pass, no placeholder sentinels.
 *
 * Supported forms, which are the only ones this map uses:
 *   '*'          -> matches any path at all (used by the ALWAYS_RUN gates)
 *   'a/**' + '/' -> optional directory prefix, so 'a/**' + '/b' matches 'a/b'
 *   'a/**'       -> any depth below (and including) the 'a/' prefix
 *   'a/*.ts'     -> a single path segment
 * Every other regex metacharacter is escaped literally.
 */
export function globToRegExp(pattern) {
  if (pattern === '*') return /^.*$/;
  const SPECIAL = '.+^${}()|[]\\?';
  let out = '';
  let index = 0;
  while (index < pattern.length) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        if (pattern[index + 2] === '/') {
          out += '(?:.*/)?';
          index += 3;
          continue;
        }
        out += '.*';
        index += 2;
        continue;
      }
      out += '[^/]*';
      index += 1;
      continue;
    }
    out += SPECIAL.includes(char) ? `\\${char}` : char;
    index += 1;
  }
  return new RegExp(`^${out}$`);
}

/** Returns the first pattern that matches, or null. */
export function matchesAny(filePath, patterns) {
  for (const pattern of patterns) {
    if (globToRegExp(pattern).test(filePath)) return pattern;
  }
  return null;
}
