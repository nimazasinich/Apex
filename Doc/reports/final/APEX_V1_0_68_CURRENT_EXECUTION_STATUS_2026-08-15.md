# APEX v1.0.68 — Current Execution Status (2026-08-15)

## Scope and source of truth

- Development base: the supplied `APEX-Unified-Terminal-v1.0.68-LATEST-UI-FINE-663252adade8` archive only.
- Existing reports/screenshots were not treated as proof of current behavior.
- Internal package version remains `1.0.68` because the patched source could not be rebuilt in this Linux runner; the existing `dist/` therefore remains the previous build and is intentionally not relabeled as current.

## Implemented

1. **Production/QA Trading Lab data boundary**
   - Replaced the unconditional `TRADING_LAB_PREVIEW_ENABLED = true` production behavior.
   - Trading Lab fixtures now require both `import.meta.env.DEV` and explicit `VITE_APEX_TRADING_LAB_PREVIEW=true`.
   - Production builds hard-disable the lab fixture path.
   - Documented the opt-in flag in `.env.example`.
   - Added Trading modernization verifier assertions for both the development gate and the visible `LAB PREVIEW` label.

2. **Test inventory release-gate hardening**
   - Replaced literal-regex-only counting with TypeScript AST-based counting.
   - Static array-driven test-definition loops are expanded deterministically.
   - Current inventory resolves to 125 test files / 701 effective tests: 689 literal `it`/`test` calls + 12 statically expanded cases.
   - The release threshold is now 125 files / 701 tests instead of the obsolete 41 files / 161 tests.
   - Unresolved dynamic test-definition loops fail the inventory gate instead of being silently undercounted.

## Verified by execution

- `npm run lint` — **PASS**.
- 42 non-browser `scripts/qa/verify*.mjs` verifiers — **PASS** after the Trading Lab source patch.
- `npm run qa:trading-page-modernization` — **18/18 PASS** after final changes.
- `npm run check:test-inventory` — **PASS**, 125 files / 701 effective tests.
- `npm run release:gate:source` — **PASS** source-only secret/archive/template checks.
- `npm run check:version-identity` — **PASS** for the unchanged v1.0.68 version stamps.
- Source accessibility verifier — **10/10 source checks PASS**, but it also reports 374 legacy sub-10px CSS declarations in dense Strategy/Backtesting CSS; therefore this is not represented as a complete runtime accessibility pass.
- 16-thread archive integrity comparison — **PASS**: no supplied file is missing and the intended source delta is limited to four existing files before this report was added.

## Expected failures / environment blockers

### Full Vitest suite

`npm run test:unit` cannot initialize in this runner because the supplied offline dependency bundle does not contain the Linux Rollup native package required by the installed Rollup version:

- missing `@rollup/rollup-linux-x64-gnu`

This is a test-runner/toolchain startup failure, not a test assertion failure. No `701/701 PASS` claim is made for the patched source.

### Production build

`npm run build` cannot initialize because the supplied offline dependency set does not contain the Linux esbuild binary required by `tsx`/esbuild:

- missing `@esbuild/linux-x64`

No production build PASS claim is made.

### Build identity

`npm run check:build-identity` correctly fails after the source changes with stale `buildId` / `sourceHash`, because `dist/` is still the supplied pre-patch build. The old build identity was not rewritten without a real rebuild.

## Not verified on the patched source

- Full Vitest runtime suite.
- Production Vite build.
- 14-route browser QA.
- Current-source reference screenshot matrix at 1368×753 / 1672×941 / 1024×768 / wide desktop.
- Browser console/page-error/horizontal-overflow assertions.
- Runtime keyboard/focus/zoom/reduced-motion accessibility checks.
- Source/build hash alignment.
- Final production release artifact gate.

Existing pre-patch screenshots, reports, and `dist/` output were deliberately not reused as evidence for the patched source.

## Deferred by the supplied task contract

- TensorTrade remains unimplemented and was not mixed into the UI/release work.

## Remaining release sequence

On a platform with the matching native dependencies available:

1. Install the exact lockfile including platform optional dependencies.
2. Run `npm run check:test-inventory` and confirm 125+ files / 701+ tests.
3. Run the full Vitest suite.
4. Run the production build.
5. Re-run all static and runtime verifier gates.
6. Run 14-route browser QA and the reference screenshot matrix.
7. Execute runtime accessibility checks.
8. Regenerate/verify build identity only from the successful build.
9. Run secret scan and final release artifact verification.

## Risks

- The complete handoff ZIP contains the original `dist/`, but that compiled output predates the source patch and is **not** the current build.
- The supplied full/integration bundle contains reference/evidence/integration root artifacts that are outside the clean-source root allowlist; do not treat this full handoff ZIP as the sanitized production release package.
- Full runtime evidence remains blocked until Linux Rollup/esbuild native optional packages are available.

## Source files changed

- `.env.example`
- `scripts/gates/checkTestInventory.mjs`
- `scripts/qa/verifyTradingPageModernization.mjs`
- `src/components/workspace/AccountViews.tsx`

This report is an added handoff artifact under `Doc/reports/final/`.
