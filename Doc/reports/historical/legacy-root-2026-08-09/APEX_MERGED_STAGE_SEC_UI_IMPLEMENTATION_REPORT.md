# APEX v1.0.47 — Merged Stage SEC/UI Implementation Report

**Date:** 6 August 2026  
**Working source:** `APEX-complete-integrated-v1.0.47`  
**Scope:** PLAN v2.7 §0.8 reconciliation and immediately connected truthfulness/QA defects  
**Promotion status:** **IMPLEMENTED SOURCE DELIVERY — NOT FINAL STAGE CLOSURE**

## 1. Evidence-based outcome

The v2.7 reconciliation work has been implemented on the UI-forward source tree without copying Fork B wholesale.

The delivery now contains:

- Fork A's deeper Backtesting and Strategy Studio architecture;
- Fork B's Stage SEC security middleware, tests, CI workflows, and release-hash behavior;
- the restored QA script taxonomy omitted from Fork A's archive;
- an explicit Node/npm support contract shared by `package.json` and `package-lock.json`;
- the missing `Layers3` import repair;
- shared, testable Trading layout preference persistence;
- Strategy terminology/evidence corrections;
- replay-array type annotations for previously inferred empty arrays;
- a merge-specific semantic source contract while preserving branch-specific legacy scanners separately.

This completes the **source implementation** of the §0.8 reconciliation list to the extent executable in this environment. It does **not** close Stage SEC or Stage UI because dependency installation failed before full semantic TypeScript, Vitest, build, Express integration, browser, accessibility, and visual gates could run.

## 2. Input identity and integrity

| Input | SHA-256 | ZIP integrity |
| --- | --- | --- |
| `apex-unified-terminal-v1.0.47-ui-modernization-v2.3-source.zip` | `22b751e2a12689a7315c413ff37bfcdc91a013dd2eaaf768ad43223f4ec338b5` | PASS, 559 entries |
| `APEX-complete-integrated-v1_0_47-stage-ui-progress.zip` | `0d20739db0cc2f0ceb7043985cedd0c58c0d0c8e18eb3f8b1a0a4b4169b04195` | PASS, 701 entries |
| `APEX-complete-integrated-v1_0_47-stage-sec.zip` | `f33eaac62277aa53d6801e1f5134b426aff80e8d610962ce3b135507dc6068be` | PASS, 682 entries |
| Materialized `PLAN_v2_7.md` | `486b30fb28da3e6cc0e4602686279bc4c50414368f823bc36b8bebcad8c4a6cd` | N/A |

The latest named Library item `PLAN_v2_7(2).md` reported the same size and matching indexed content, but raw-byte materialization returned HTTP 403. The implementation used the materializable `PLAN_v2_7.md` copy and does not claim byte identity with the inaccessible Library object.

## 3. Implemented changes

### 3.1 Stage SEC port without regressions

**Affected files**

- `server.ts`
- `src/services/serverSecurity.ts`
- `src/tests/serverSecurity.test.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/nightly.yml`
- `scripts/utilities/createReleaseArchive.mts`

**Implementation**

- Added security-response headers and CSP generation.
- Added compute-heavy route classification and bounded rate limiting with `Retry-After` behavior.
- Preserved Fork A's stronger DNS-aware SSRF protection, graceful shutdown, request tracing/readiness behavior, and private secret/config file permissions.
- Added/retained security unit coverage for headers, SSRF classification, limiter behavior, and compute route detection.
- Added CI matrices for Node 22 and Node 24 and retained nightly documentation/dependency checks.
- Added SHA-256 sidecar generation to the release archive script.

**Not copied**

Fork B's entire `server.ts` was not copied wholesale because doing so would have removed protections already present in the UI-forward tree.

### 3.2 Node/npm contract resolution

**Affected files**

- `package.json`
- `package-lock.json`

The former Node 24-only hard failure was replaced with an explicit supported range:

- Node: `>=22 <25`
- npm: `>=10.9 <12`
- package manager identity: `npm@10.9.2`

The root package metadata in `package-lock.json` now matches `package.json` exactly for name, version, engines, dev engines, package manager, dependencies, and dev dependencies. A seven-check consistency script passed.

### 3.3 Missing QA infrastructure restored

**Added/restored**

- `scripts/qa/` — 29 existing QA files restored from the compatible SEC/UI line.
- `scripts/qa/cleanupQaArtifacts.mts` — resolves the dangling imports in capture scripts.

The scripts were restored rather than replaced with decorative stubs.

### 3.4 Trading layout persistence extracted and retained

**Affected files**

- `src/lib/tradingLayoutPreference.ts` — added shared parser/migration/storage boundary.
- `src/tests/tradingLayoutPreference.test.ts` — added three declared tests.
- `src/components/workspace/TradingToolbox.tsx` — wrapped existing richer behavior with the shared persistence module.

The existing Fork A toolbox modes, width handling, close requests, inline tools, pinning, and drawer behavior were preserved.

### 3.5 Confirmed UI/runtime defect fixed

**Affected file**

- `src/components/workspace/AccountViews.tsx`

The missing `Layers3` import used by the order-book empty state is now present, removing the confirmed undefined JSX symbol on that render path.

### 3.6 Strategy truthfulness corrections

**Affected file**

- `src/services/strategyRegistry.ts`

Changes include:

- `AI-Assisted` replaced with `AI Research` for the blocked ensemble.
- Blocked prerequisites explicitly require independently bound verification evidence.
- Research-only/blocked state remains visible; no production-readiness implication was added.

Verified existing behavior preserved:

- `Open Details`
- `Send to Backtesting`
- `Compare`
- `Bookmark Model`
- `Not comparable`
- no hidden inline backtest from Strategy Studio
- provenance-qualified `Verified`/`Evidence Pending` presentation

The known Fork B `statusLabel` render crash and inline `Run … Backtest` pattern were not introduced.

### 3.7 Replay type-risk fixes

**Affected files**

- `src/services/directionDivergence.ts`
- `src/services/strategyEngine/adaptiveTrendPortfolio.ts`
- `src/services/strategyEngine/orbVwapBreakout.ts`
- `src/services/strategyEngine/volatilitySqueezeExpansion.ts`
- `src/services/strategyEngine/vwapPullbackReacceleration.ts`

Empty arrays now carry explicit element types instead of relying on inference in later mutation paths.

This is a source correction. It is **not** presented as proof that full `tsc --noEmit` passes.

### 3.8 Source-contract gate reconciliation

**Added**

- `scripts/qa/verifyMergedStageUi.mjs`
- `qa:merged-stage-ui`

The merge-specific contract checks 23 requirements covering:

- SEC files and middleware wiring;
- CI/nightly workflows;
- engine and package-lock consistency;
- Layers3 repair;
- restored QA cleanup infrastructure;
- Backtesting component split;
- Strategy actions and transfer behavior;
- compare `Not comparable` state;
- evidence-qualified labels;
- absence of the Fork B crash pattern;
- absence of misleading active Strategy terminology;
- shared Trading preference module/tests;
- explicit replay array types.

`check:source-contracts` now combines that merge-specific contract with architecture-neutral design, reference UI, interaction, theme, V19, V20, and workspace-light gates.

The old branch-specific exact-string scanners were **not deleted**. They remain available as `check:source-contracts:legacy`. Several still fail because they encode Fork B's monolithic component ownership or exact source strings rather than the accepted Fork A split architecture. Their individual exit summary is included in `QA/merged-stage-sec-ui/logs/legacy-source-contract-summary.txt`.

## 4. Executed verification

Environment:

- Node `v22.16.0`
- npm `10.9.2`
- global TypeScript `5.8.3`

### 4.1 Passing gates

| Command/check | Result | Evidence classification |
| --- | --- | --- |
| `npm run check:source-contracts` | EXIT 0 | Executed source contracts |
| `npm run qa:merged-stage-ui` | 23/23 PASS | Merge-specific semantic source contract |
| `node scripts/gates/checkTestInventory.mjs` | 48 files / 183 declared tests; thresholds PASS | Source inventory only, not test execution |
| Direct server-security harness | 16/16 PASS | Pure-module runtime, not Express integration |
| Direct Trading preference harness | 10 assertions PASS | Pure-module runtime |
| `npm run qa:strategy-engines` | PASS | Deterministic synthetic smoke, not market validation |
| `npm run qa:adaptive-governor` | PASS | Direct service/runtime QA |
| TypeScript `transpileModule` sweep | 309 TS/TSX/MTS files, 0 syntax diagnostics | Syntax transpilation only |
| Package/lock consistency | 7/7 PASS | Parsed metadata comparison |
| `npm run release:gate:source` | EXIT 0 | Source-only secrets/release gate |
| `npm run check:version-identity` | EXIT 0 | Version source contract |
| Input archive `unzip -t` | PASS | Archive integrity |

The complete current source-contract chain passed:

- merged Stage SEC/UI: 23/23
- design tokens: 5/5
- reference UI: 24/24
- UI interaction polish: 28/28
- UI theme merge: 11/11
- V19: 10/10
- V20: 33/33
- workspace light polish: 15/15

### 4.2 Failed or blocked gates

#### Clean install

Command:

```text
npm ci --ignore-scripts --no-audit --no-fund
```

Result: **EXIT 1**

Exact blocker:

```text
404 Not Found ... /vitest/-/vitest-4.1.10.tgz
```

The configured npm registry did not provide the locked Vitest tarball. The lockfile was not weakened, dependency versions were not silently changed, and no substitute test runner was presented as Vitest.

#### Full semantic TypeScript check

Command:

```text
tsc --noEmit -p tsconfig.json
```

Result: **EXIT 2**

Exact blocker after the failed install:

```text
TS2688: Cannot find type definition file for 'vite/client'.
```

This is recorded as blocked dependency evidence, not a passing or failing application type verdict.

### 4.3 Not executed

Because a clean dependency installation did not complete, the following were not executed on the final merged filesystem:

- project-local `tsc --noEmit` with all installed package types;
- full Vitest suite;
- Vite production build;
- `npm start` production boot and HTTP smoke;
- Express middleware integration tests;
- Playwright browser tests;
- exact 1368×753 browser geometry capture;
- accessibility scan;
- keyboard end-to-end workflow;
- visual regression suites;
- full `npm run verify`;
- actual GitHub Actions execution;
- release archive script runtime through `tsx`.

No passing claim is made for any item above.

## 5. Current acceptance position

### Verified

- The two source branches were reconciled in one source tree.
- The UI-forward Backtesting/Strategy implementation was preserved.
- Stage SEC source was selectively integrated without removing stronger existing backend protections.
- The explicit §0.8 source defects were addressed.
- Security and layout pure modules have fresh runtime evidence.
- Current semantic source-contract gates pass.
- Package/lock engine metadata is internally consistent.
- Input artifact hashes and integrity are recorded.

### Incomplete

- Stage SEC cannot be re-closed on this merged filesystem without dependency-backed integration/unit execution.
- Stage UI cannot be promoted without build, browser, accessibility, keyboard, exact viewport, and visual evidence.
- The one historical Fork A semantic type mismatch cannot be conclusively reclassified from a full compiler run in this environment; source-risk fixes were applied, but the proper package-backed compiler gate remains open.

### Deferred by plan sequencing

The following were not started or represented as implemented:

- Stage NET WebSocket relay/canary/soak work;
- SQLite repository/migration/persistence stage;
- deterministic replay/accounting engine;
- strategy/risk migration;
- validation governance extensions;
- derivatives/carry;
- historical L2 persistence/live-parity calibration.

These are separate staged migrations, not missing lines that can be safely bundled into the reconciliation patch without their own characterization, tests, rollback, and acceptance evidence.

## 6. Rollback

A reversible rollback can be performed by restoring the hashed Fork A archive and removing the following merge additions:

- Stage SEC middleware/workflows/tests/release hash changes;
- restored `scripts/qa/` directory;
- shared Trading preference module/test and toolbox wrapper changes;
- package engine/lock metadata resolution;
- merge-specific QA contract and package scripts;
- terminology/type-risk corrections.

No database migration, persistent data mutation, route-contract replacement, or framework migration was introduced, so rollback does not require data restoration.

## 7. Evidence location

See:

```text
QA/merged-stage-sec-ui/EVIDENCE_INDEX.md
QA/merged-stage-sec-ui/logs/
```

Those files distinguish source inspection, direct module runtime, inventory, syntax transpilation, failed dependency installation, and blocked semantic compilation.
