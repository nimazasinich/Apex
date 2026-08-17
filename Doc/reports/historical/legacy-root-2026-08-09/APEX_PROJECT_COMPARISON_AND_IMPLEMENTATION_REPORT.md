# APEX Project Comparison and Stage UI Continuation Report

**Date:** 6 August 2026  
**Target version:** APEX 1.0.47  
**Implementation authority:** `PLAN_v2_7(2).md`  
**Evidence policy:** source, executable checks, and runtime results are reported separately. No source-contract scan is presented as a unit, build, browser, or visual pass.

## 1. Inputs and source identity

| Input | SHA-256 |
| --- | --- |
| `APEX-complete-integrated-v1_0_47-fork-b-ui-continuation.zip` | `56f8e14f068973f76956623734ac20169b23cb6c4f22e68c17c5c36229cab5cc` |
| `APEX-complete-integrated-v1.0.47-merged-stage-sec-ui(1).zip` | `64fb3a88483951573a2912d21c55feeda42b9a8611364a8b69144eff4b44731a` |
| `PLAN_v2_7(2).md` | `486b30fb28da3e6cc0e4602686279bc4c50414368f823bc36b8bebcad8c4a6cd` |

Both archives were extracted independently and inspected in parallel. Their package manifests, active routes, Backtesting and Strategy Studio source, Stage SEC middleware, CI workflows, tests, QA scripts, and Trading components were compared directly.

## 2. Verdict: the merged Stage SEC/UI archive is more complete

The go-forward base is **`APEX-complete-integrated-v1.0.47-merged-stage-sec-ui(1).zip`**.

| Measure | Fork B UI continuation | Merged Stage SEC/UI | Verdict |
| --- | ---: | ---: | --- |
| Repository files, excluding dependencies | 630 | 648 | Merged has broader restored source/QA coverage. |
| Declared test files before this implementation | 51 | 48 | Fork B has more recent focused tests, but fewer architectural components. |
| Declared test cases before this implementation | 191 | 183 | Fork B contributed useful regression cases to port. |
| Active `BacktestingPage.tsx` | 1,106 lines | 687 lines | Merged has the approved coordinator/component decomposition. |
| `Backtest*.tsx` components | 2 | 11 | Merged satisfies the component split instead of retaining the monolith. |
| Active `StrategyPage.tsx` | 416 lines | 283 lines | Merged uses the split evidence-aware Strategy Studio. |
| Stage SEC middleware and CI | Present | Present | Both carry SEC, but merged also restores the stronger UI tree and QA taxonomy. |
| Strategy Studio Backtesting handoff | Present in continuation | Present and structurally stronger | Merged preserves `Open Details`, `Send to Backtesting`, `Compare`, `Bookmark Model`, and `Not comparable`. |

Fork B was **not discarded**. Its newer responsive-chart, request-ownership, evidence-identity, action-label, and regression-test work was reviewed and selectively integrated into the merged base. Whole-file copying was avoided where it would have regressed accessibility, shared contracts, or the split architecture.

## 3. Implemented changes

### 3.1 Backtesting request ownership and cancellation

Affected files:

- `src/pages/backtesting/BacktestingPage.tsx`
- `src/pages/backtesting/BacktestRunBuilder.tsx`
- `src/pages/backtesting/backtestRunControl.ts`

Implemented:

- Added a normalized, order-stable configuration identity covering strategy, symbol, direction, interval, bar count, hold limit, costs, and Strategy Studio parameters.
- Added `LatestRequestGate` ownership so only the latest request for the still-active configuration can commit a result.
- Kept transport abortion and state-ownership invalidation separate; a late response cannot overwrite newer state merely because `AbortController.abort()` raced with completion.
- Changing an active configuration cancels the in-flight replay and displays the exact cancellation reason.
- Preserved the last completed result while a new request is running, fails, or is cancelled.
- Preserved the visible `Cancel Run` action.
- Continued to avoid invented server progress percentages.

### 3.2 Canonical versus locally derived metric provenance

Affected files:

- `src/pages/backtesting/backtestMetrics.ts`
- `src/pages/backtesting/BacktestMetricStrip.tsx` (preserved existing source labels)
- `src/pages/backtesting/BacktestingPage.tsx`

Implemented:

- Extracted display-only risk-profile calculations into `deriveLocalBacktestSummary()`.
- Kept server-returned net return, drawdown, profit factor, win rate, Average R, and trade count authoritative.
- Kept UI capital/risk scaling visibly separate and explicitly non-canonical.
- Added a regression test proving local calculations do not mutate the server result.

### 3.3 Exact replay-evidence identity

Affected files:

- `src/lib/workspaceContext.ts`
- `src/pages/backtesting/BacktestingPage.tsx`
- `src/components/workspace/AccountViews.tsx`

Implemented:

- Completed replay evidence now stores strategy ID, symbol, direction, and interval with the metrics.
- Added `matchesBacktestEvidence()`.
- Trading displays prior replay evidence only when all four identity fields match the current context.
- Legacy session payloads without an explicit identity fail closed rather than following a different model or market.
- Preserved the existing broad, typed workspace navigation contract and `strategyParameters` field; the narrower Fork B contract was not copied.

### 3.4 Responsive `PriceChart` coordinates

Affected files:

- `src/components/PriceChart.tsx`
- `src/components/priceChartGeometry.ts`

Implemented:

- Removed the fixed `960 × 320` drawing constants from active chart calculations.
- The SVG coordinate width now follows the observed chart container width through `ResizeObserver`.
- Pointer conversion, zoom anchoring, crosshair, grid, overlays, volume, and RSI coordinates use the same responsive geometry.
- Preserved the merged tree's hidden screen-reader chart summary and existing chart interactions.
- Added bounded fallback geometry for initial, compact, and invalid measurements.

### 3.5 Truthful instrument facts

Affected files:

- `src/components/trading/InstrumentFacts.tsx`
- `src/components/trading/instrumentPresentation.ts`
- `src/components/workspace/AccountViews.tsx`

Implemented:

- Replaced the hard-coded `USDⓈ-M Perpetual` identity with a venue derived from the actual feed source.
- Unknown venue, open interest, funding quality, and spread states say `unreported`/`not reported` instead of inventing a value.
- Funding quality distinguishes unavailable, estimated, and stale states when metadata exists.
- Source, freshness, and feed state remain visible.
- Reused the existing Instrument Facts CSS ownership and eight-cell desktop layout.

### 3.6 BUY/SELL plus Demo/Live action labels

Affected files:

- `src/components/trading/orderActionLabels.ts`
- `src/components/workspace/AccountViews.tsx`

Implemented labels include:

- `Review BUY demo order`
- `Review SELL live order`
- `Execute demo BUY order`
- `Submit live SELL order`

The order side and execution environment are now explicit at review and final confirmation.

### 3.7 Regression coverage and source contract

Added tests:

- `src/tests/backtestMetricProvenance.test.ts`
- `src/tests/backtestRunControl.test.ts`
- `src/tests/backtestingPageRegression.test.ts`
- `src/tests/instrumentFacts.test.ts`
- `src/tests/orderActionLabels.test.ts`
- `src/tests/priceChartGeometry.test.ts`
- `src/tests/strategyPageRegression.test.ts`
- `src/tests/workspaceContextEvidence.test.ts`

Updated:

- `scripts/qa/verifyMergedStageUi.mjs`

The merged Stage SEC/UI source contract now includes the new request-ownership, metric-provenance, evidence-identity, responsive-chart, truthful-facts, and action-label requirements.

## 4. Verification actually executed

### Passed executable/source checks

| Check | Result | Evidence class |
| --- | --- | --- |
| TypeScript parser/transpile sweep | 317 TS/TSX/MTS files; 0 syntax-error files | Source syntax, not full type-check |
| `npm run check:test-inventory` | 56 discovered files / 200 declared tests; minimum 41 / 161 | Test inventory |
| `npm run check:source-contracts` | Passed all included source-contract suites | Source-contract |
| `node scripts/qa/verifyMergedStageUi.mjs` | 28/28 passed | Source-contract |
| `npm run release:gate:source` | Passed | Source secret/archive-template gate |
| `npm run check:version-identity` | Package, lock, manifest, service worker, archive script agree on 1.0.47 | Release identity |
| Runtime helper assertions | Responsive geometry, venue fallback, order labels, config identity, latest-request gate, evidence matching passed | Focused code runtime |
| `npm run qa:strategy-engines` | Passed; deterministic engine output/shape checks | Code runtime |
| `npm run qa:adaptive-governor` | Passed priority, backpressure, circuit, stale fallback, authorization, and mutation-cache checks | Code runtime |
| `git diff --check` | Passed | Patch hygiene |

The focused implementation added **8 test files and 17 declared test cases**, increasing the merged base from 48/183 to **56/200**.

### Not executed / not claimable

`npm ci` failed for both original archives because the configured package mirror returned `404` for `vitest-4.1.10.tgz`. A public-registry override did not complete in this environment and was terminated; no partially installed `node_modules` is included in the delivery.

Therefore the following are **not claimed as passed** in this implementation session:

- project `tsc --noEmit` with installed dependencies;
- `vitest run`;
- `npm run build`;
- complete `npm run verify`;
- browser runtime suites;
- Playwright accessibility/geometry suites;
- 1368×753 visual comparison.

The prior merged archive's historical reports do not substitute for rerunning these gates after the new changes.

## 5. Current plan status

### Implemented/preserved in this delivery

- Stage SEC source and CI files preserved.
- Stronger split Backtesting and evidence-aware Strategy Studio preserved.
- Active Strategy Studio handoff contract and `Not comparable` preserved.
- Backtesting cancellation, stale-request protection, and metric provenance strengthened.
- Trading responsive chart, truthful facts, and explicit action labels completed at source level.
- Existing Overview work preserved; no Overview implementation was replaced.

### Still gated before Stage UI acceptance

- Dependency-backed type-check, unit tests, build, and full verify on a working registry.
- Browser, keyboard, accessibility, compact/wide viewport, and pinned 1368×753 visual verification.
- Any defects found by those executable gates.

### Deliberately not implemented as part of this UI continuation

The following are later plan stages, not hidden omissions or fake-completion targets:

- Stage NET: server WebSocket relay and shadow comparison of the existing KuCoin sequence-validating client.
- Stage DB: SQLite repositories, migrations, backup/restore, and authoritative persistence.
- Stage ENG: deterministic replay kernel, fills, and ledger/accounting.
- Stage STRAT/VAL/DERIV/L2: later strategy, validation, derivatives, historical L2, and live-parity work.
- PWA install/offline decision, which remains an explicit product decision rather than an assumed implementation.

These stages must continue in the plan's dependency order after Stage UI acceptance. They were not simulated with local JSON, fake persistence, or decorative UI.

## 6. Rollback and integration notes

- The implementation is an incremental patch on the merged tree; existing routes, React/Vite/Express architecture, market adapters, risk governor, strategy registry, and shared components were not rebuilt.
- New helpers are isolated and removable without changing API contracts.
- Session evidence is additive and fails closed for old payloads.
- The Backtesting endpoint query contract is unchanged; query construction was centralized, not versioned.
- The chart preserves its existing data and interaction contracts while changing only coordinate derivation.
- No database schema, live order contract, financial engine, or security middleware behavior was changed.

## 7. Recommended next gate

On a machine/CI runner with a working npm registry, run in this order:

```bash
npm ci
npx tsc --noEmit
npx vitest run
npm run build
npm run verify
```

Then execute the pinned browser and visual suites at 1368×753 plus smaller and wider container widths. Stage UI should not be marked accepted until those results are stored against the final archive hash.
