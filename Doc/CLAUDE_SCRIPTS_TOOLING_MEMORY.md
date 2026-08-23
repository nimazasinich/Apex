# APEX Scripts Tooling Memory

Durable tool-selection memory for the APEX Unified Terminal. `scripts/` is the existing APEX
toolbelt. **Consult this file before creating any new QA, browser, capture, diagnostic, runtime,
build or release script.** Reuse the narrowest existing tool; prefer the `package.json` npm alias
when one exists.

This is a tooling index, not a claim that every script is currently wired to an npm alias. Before
invocation, prefer the matching npm script when present; otherwise inspect the file header/CLI
arguments and env contract.

Inventory: **167 script files** — .bat: 2, .cmd: 1, .mjs: 83, .mts: 66, .ps1: 10, .py: 5.

**Verification status:** all 26 high-value scripts listed below were confirmed present on the
canonical Windows path (`scripts/`) when this memory was written. `find scripts -type f` reports 169
files total, which equals the 167 script files plus one `.txt` and one `.md` that the extension
breakdown above deliberately excludes.

## Verified environment

Canonical project root (native Windows, the only tree to edit):

```
C:\project\APEX-frontend-phase31\APEX-unified-maximal-v1.0.56-r2-merged-source\APEX-Unified-Terminal-v1.0.68-LATEST-PATCHED-SOURCE-20260815
```

A Linux/VM path may appear as a **mount of this same folder** — a mount, not a copy.

**Native Windows Playwright is installed and works.** `npm run qa:ui-1368` has driven real Chromium
on Windows to a green result (failures 0, pageErrors 0, consoleErrors 0). Do not repeat
browser/environment debugging, and never read a session-tool gating error as a browser or project
failure.

Canonical 1368x753 QA path:

```
npm run build
npm run qa:ui-1368                # overflow/regression gate, starts its own server, 14 routes
npm start                         # node dist/server.cjs on port 3000 — required for capture
npm run qa:capture:1368           # real PNGs + console/network logs into _qa\diag\<timestamp>\
$env:ROUTE='/#/watchlist'; npm run qa:capture:1368
```

`qa:ui-1368` asserts **document-level overflow only** — text clipped inside a fixed-height
`overflow: hidden` box triggers nothing. A green gate proves no new layout regression; only capture
PNGs prove a clipping or logo fix actually renders.

Current UI state, pending visual verification and the cascade/geometry facts live in
`Doc/CLAUDE_UI_HANDOFF_20260816.md`.

## Mandatory pre-flight before writing any new script

1. Identify the goal.
2. Search this memory for an existing script that already covers it.
3. Pick the **narrowest** existing script, not the broadest.
4. Inspect that script's current CLI arguments and env vars — they drift.
5. Prefer the corresponding `package.json` npm alias if one exists.
6. Run it on the correct surface (native Windows for browser/release work).
7. Read the generated evidence.
8. Only then claim PASS, FAIL or "fixed".

Write a new script only after steps 1-3 come back empty, and say which existing scripts were ruled
out and why.

## Hard rules

- Use `verifyUi1368` for canonical 1368x753 UI verification.
- Use `capture-dashboard` for visual/browser diagnostics.
- Use targeted existing audit/probe scripts before ad-hoc scripts.
- Use `queryFunctionIndex` before broad source searching.
- Use `portTakeover` instead of killing all Node processes.
- Use native Windows release tools for Windows verification; never substitute a Linux build result
  for the authoritative Windows release path.
- Never treat synthetic QA data as production data.
- Never run destructive/mutating scripts blindly.
- Never kill Node processes blindly: `portTakeover.mts`, never `KILL-ALL-NODE-PROCESSES.bat`.
- Do not write a new script when an existing one covers the task; reuse the narrowest tool and say
  which candidates were ruled out.
- No custom preflight runners, helper orchestration scripts, curated gate subsets, or intermediate
  status/task Markdown files. Use the canonical `package.json` scripts directly.
- No redesign of APEX UI; minimal targeted edits only.
- No fake data, weaker fallbacks, or lowered gates to make a check pass. Missing data gets an
  intentional empty state.
- Never claim PASS from source reasoning alone: run the relevant verifier/capture and read its
  evidence.
- Do not confuse session-tool gating (SESSION_TOOL_GATED) with a browser or project failure.
- Do not label a network/provider failure a source regression without evidence.

## Recommended selection order

1. Visual/UI work: `qa:ui-1368` / `scripts/qa/verifyUi1368.mjs` first, then
   `scripts/capture/capture-dashboard.mts`; use the viewport matrix and contact sheets for broader
   visual review.
2. Layout-specific diagnosis: use the targeted Overview/Operations/Watchlist/metric/range probes
   before creating ad-hoc scripts.
3. Workspace/dock/accessibility regressions: `verifyWorkspaceRuntime.mts`,
   `workspaceGeometry.spec.mts`, `accessibilitySmoke.spec.mts`.
4. Subsystem correctness: the relevant `verify*` static gate, then the corresponding `run*Runtime`
   script when one exists.
5. Release: Windows verification/release gates only.
6. Busy port: `portTakeover.mts`. `KILL-ALL-NODE-PROCESSES.bat` is emergency-only.
7. Synthetic generators/audits are QA-only; never interpret their fixtures as real market or
   account data.

## High-value tools to remember

### UI / visual

- `scripts/qa/verifyUi1368.mjs` — canonical real-browser 1368x753 UI gate: route rendering,
  overflow, page errors, console errors, visual/runtime assertions. Spins up its own server.
  **[browser, runtime, network, writes, tests]**
- `scripts/capture/capture-dashboard.mts` — canonical configurable Playwright capture engine:
  route/viewport capture, console/page/request diagnostics, layout metrics, tool-state screenshots,
  optional full-page output. Does **not** start a server. **[browser, network, writes]**
- `scripts/capture/_run_viewport_matrix.ps1` — the canonical capture engine across 1368x753 plus
  five regression desktop viewports, outputs separated by viewport.
- `scripts/capture/buildContactSheet.mts` — visual contact sheets from screenshot sets, plus a
  manifest for side-by-side review.
- `scripts/utilities/apex_visual_diff.py` — image-based screenshot visual diff evidence.
- `scripts/utilities/auditOverviewLayout.mts` — targeted Overview layout/geometry browser audit.
- `scripts/qa/_qa_metric_audit.mts` — metric-card diagnostic.
- `scripts/qa/_qa_range_probe.mts` — market range diagnostic.
- `scripts/_audit_theme_watchlist.mts`, `scripts/_audit_watchlist2.mts` — Watchlist/theme
  diagnostics.
- `scripts/utilities/uiSyntheticAudit.mjs` — browser audit driven by synthetic QA data; exercises
  routes/drawers/states. **Not production-data validation.**

### Workspace / accessibility

- `scripts/qa/verifyWorkspaceRuntime.mts` — broad Playwright workspace runtime verifier with
  server/browser launch options, route/state checks, containment, strict mode.
- `scripts/qa/workspaceGeometry.spec.mts` — full geometry assertions across pages, states,
  viewports, dock layouts.
- `scripts/qa/accessibilitySmoke.spec.mts` — real-browser accessibility smoke: keyboard/focus flows
  plus axe checks and evidence capture.
- `scripts/capture/verifySplitDockHeaded.mts`, `scripts/capture/verifyStep1Chrome.mts` — headed
  split/dock geometry verification.

### Development / source navigation

- `scripts/utilities/queryFunctionIndex.mts` — **query the function index instead of broad source
  searching.**
- `scripts/utilities/generateFunctionIndex.mts` — rebuild symbol/function indexes; incremental
  watch mode.
- `scripts/utilities/devWithFunctionIndex.mts` — dev server plus live function-index watcher; safe
  APEX-specific port takeover.
- `scripts/utilities/portTakeover.mts` — diagnoses a busy Windows port and terminates it only when
  the process is confirmed as APEX (or force is explicit).

### Build / release

- `scripts/utilities/buildAndBundle.mts` — canonical production build pipeline: build identity,
  Vite build, service-worker stamp, server bundle, function index.
- `scripts/windows/VERIFY-WINDOWS.ps1` — canonical Windows verification sequence: lint, build,
  tests, major QA/gate scripts.
- `scripts/windows/RUN-REMAINING-GATES.ps1` — authoritative Windows P0/P1 release-gate runner with
  evidence logs. **DANGEROUS** (see cautions).
- `scripts/gates/checkBuildIdentity.mjs`, `checkVersionIdentity.mjs`, `checkRootContract.mjs`,
  `checkNoSecretsInRelease.mjs`, `checkReleaseArtifacts.mjs`.
- `scripts/utilities/createReleaseArchive.mts` — sanitized release archive, content/tree hashes,
  approved-file copy, release evidence.

### Change-aware dev loop (`verify:fast`) — never a release gate

- `scripts/gates/verifyFast.mjs` (`npm run verify:fast`) — DEV-LOOP-ONLY filter over the canonical
  `verify` chain. Runs the gates whose declared inputs changed since a recorded last-known-good
  baseline and reports the rest as **SKIPPED**, never as PASS. Mirrors the `&&` semantics of the
  real chain: the first failure stops the run and later gates are reported as NOT RUN.
  Flags: `-- --dry-run` prints the decision table and executes nothing, `-- --keep-going` continues
  past the first failure when triaging, `-- --base=<ref>` overrides the recorded baseline.
- `scripts/gates/gateDependencyMap.mjs` — hand-maintained gate → input-glob map. Adding a gate to
  `verify`, or teaching an existing gate to read a new path, requires updating this map in the same
  change. A gate present in `verify` but absent from the map is reported as UNMAPPED and forces a
  no-skip run, so drift degrades toward running everything rather than toward skipping something.
- `scripts/gates/computeChangedScope.mjs` (`npm run verify:fast:scope`) — git-diff scope report
  written to `QA/verify-fast-scope.json`. `--record-baseline --evidence="..."` records the
  last-known-good ref and refuses to record one without evidence.
- **`verify:fast` certifies nothing.** `npm run verify` and `npm run release:package` are unchanged,
  unconditional, and remain mandatory before any commit to `main` and before any release. Only gates
  marked expensive are ever skippable; every contract-string gate runs on every invocation, and with
  no recorded baseline nothing is skipped at all. Any doubt about a result means running the full
  `npm run verify`.

### Subsystem QA naming conventions

- `verify*` — named static/source or browser contract gate.
- `run*Runtime` — executable runtime contract validation.
- `benchmark*` — deterministic benchmark/evidence.
- `generate*Synthetic*` — QA-only fixture generation, **never real production data**.
- Liquidity Hunter, Strategy, Backtesting, Trading, Autopilot and Multi-Agent each already have
  dedicated QA scripts. Use those before any ad-hoc testing.

## Cautions and destructive scripts

- `scripts/utilities/KILL-ALL-NODE-PROCESSES.bat` force-terminates **every** `node.exe` and its
  children. Never the default port fix; emergency-only. Use `portTakeover.mts`.
- `scripts/windows/RUN-REMAINING-GATES.ps1 -ReinstallDeps` deletes and recreates `node_modules`.
  Use only when the Windows dependency install is proven corrupted.
- `scripts/utilities/windows/fix-apex-fileops-install.ps1` contains an older hard-coded APEX
  project root. Do not run unchanged against the current canonical project.
- `scripts/utilities/windows/PATCH_RAIL_CLIPPING.ps1` is a mutating defect-specific patch, not a
  general QA tool.
- Scripts that fetch public/provider data are network-dependent; failed provider access is not
  automatically a source-code regression.
- Browser scripts may require the native Windows Playwright/Chrome/Edge surface.
- If a script is mutating or destructive, explain why it is necessary **before** running it.

## Claude memory policy

Use this index as a tool-selection map, not as a licence to execute scripts blindly. For each task:
identify goal, pick the narrowest existing script, inspect its current CLI/env contract, run it on
the correct Windows/VM surface, read the generated evidence, and only then claim PASS or a fix.

## Full scripts inventory

Complete per-file capability inventory, copied from the APEX scripts capability map.
Format: `path` — capability **[tags]**; env: relevant environment variables.

Entry counts: capture 21, gates 10, lib 2, qa 82, utilities 47, windows 4, root audits 4 = **170**.

### capture

- `capture/_run_viewport_matrix.ps1` — Runs the canonical capture engine across 1368×753 plus five regression desktop viewports and separates outputs by viewport. **[static/read]**; env: APP_READY_SELECTOR, CAPTURE_FULL_PAGE, SCREENSHOT_OUT_DIR, VIEWPORT_HEIGHT, VIEWPORT_WIDTH
- `capture/buildContactSheet.mts` — Builds visual contact sheets from screenshot sets and writes a manifest for side-by-side review. **[browser, writes, release]**
- `capture/capture-all-pages.mts` — Captures the main application pages across configured viewports, freezing motion and waiting for assets. **[browser, network, writes]**; env: BASE_URL
- `capture/capture-dashboard.mts` — Canonical configurable Playwright capture engine: route/viewport capture, console/page/request diagnostics, layout metrics, tool-state screenshots, and optional full-page output. **[browser, network, writes]**; env: APP_READY_SELECTOR, BASE_URL, BROWSER_CHANNEL, CAPTURE_FULL_PAGE, CAPTURE_TOOL_STATES, HEADLESS, ROUTE, SCREENSHOT_OUT_DIR
- `capture/captureAllPages.mts` — Playwright/browser capture or diagnostic for capture All Pages; writes screenshot/evidence artifacts for visual inspection. **[browser, network, writes]**
- `capture/captureAllPagesV2.mts` — Playwright/browser capture or diagnostic for capture All Pages V2; writes screenshot/evidence artifacts for visual inspection. **[browser, network, writes]**
- `capture/captureEmptyStates.mts` — Starts an isolated capture server, drives empty-state scenarios, measures them, and records screenshots/evidence. **[browser, writes, tests]**; env: APEX_EMPTY_CAPTURE_PORT
- `capture/captureLive3000.mts` — Playwright/browser capture or diagnostic for capture Live3000; writes screenshot/evidence artifacts for visual inspection. **[browser, network, writes]**
- `capture/captureSecondaryPages.mts` — Playwright/browser capture or diagnostic for capture Secondary Pages; writes screenshot/evidence artifacts for visual inspection. **[browser, runtime, network, writes]**
- `capture/captureV3FinalAcceptance.mts` — High-coverage final-acceptance browser capture across workspace pages/tool states with geometry/evidence output. **[browser, runtime, network, writes, release, tests]**; env: APEX_UX_CAPTURE_PORT
- `capture/captureV3PhaseGate.mts` — Browser phase-gate capture/measurement for V3 UI states; creates evidence for acceptance decisions. **[browser, runtime, network, writes, tests]**; env: APEX_UX_CAPTURE_PORT
- `capture/captureWorkspaceScreens.mts` — Captures workspace screen/state matrix, starting or attaching to a QA server and writing screenshots. **[browser, runtime, network, writes, release]**; env: APEX_UX_CAPTURE_PORT, APEX_UX_CAPTURE_URL
- `capture/capture_apex_1368.py` — Python browser capture helper specialized for APEX at the canonical 1368-wide viewport. **[browser, writes]**
- `capture/claudeCapture.mts` — Playwright/browser capture or diagnostic for claude Capture; writes screenshot/evidence artifacts for visual inspection. **[browser, network, writes]**
- `capture/claudeCaptureDrawer.mts` — Playwright/browser capture or diagnostic for claude Capture Drawer; writes screenshot/evidence artifacts for visual inspection. **[browser, network, writes]**
- `capture/claudeMetrics.mts` — Playwright/browser capture or diagnostic for claude Metrics; writes screenshot/evidence artifacts for visual inspection. **[browser, network, writes]**
- `capture/diagScreenshot.mts` — Playwright/browser capture or diagnostic for diag Screenshot; writes screenshot/evidence artifacts for visual inspection. **[browser, runtime, network, writes]**
- `capture/diagScreenshotDev.mts` — Playwright/browser capture or diagnostic for diag Screenshot Dev; writes screenshot/evidence artifacts for visual inspection. **[browser, runtime, network, writes]**
- `capture/recaptureIntel.mts` — Playwright/browser capture or diagnostic for recapture Intel; writes screenshot/evidence artifacts for visual inspection. **[browser, runtime, network]**
- `capture/verifySplitDockHeaded.mts` — Headed-browser verification of split/docked tool geometry and screenshots. **[browser, writes]**; env: APEX_VERIFY_PORT
- `capture/verifyStep1Chrome.mts` — Chrome/Playwright verification of initial workspace/dock interactions and geometry. **[browser, runtime, network, writes]**; env: APEX_VERIFY_PORT

### gates

- `gates/checkBuildIdentity.mjs` — Checks that source/build identity and generated build metadata agree. **[runtime, build]**
- `gates/checkCssArbitraryColors.mjs` — Scans CSS for arbitrary/non-token color usage with an allowlist. **[static/read]**
- `gates/checkNoSecretsInRelease.mjs` — Scans source/release contents for forbidden paths/secrets and can inspect archive entries. **[build, release, tests]**
- `gates/checkReleaseArtifacts.mjs` — Validates release artifact structure and rejects forbidden/unwanted contents. **[release]**
- `gates/checkRootContract.mjs` — Verifies the repository/project-root contract and required root layout. **[runtime, release]**
- `gates/checkTestInventory.mjs` — Discovers test files/calls and validates the expected test inventory/count contract. **[tests]**
- `gates/checkVersionIdentity.mjs` — Checks version identity consistency across project metadata. **[release]**
- `gates/computeChangedScope.mjs` — Classifies git-changed files into scopes and writes the dev-loop scope report; records an evidence-backed last-known-good baseline. **[static/read, writes]**; env: APEX_VERIFY_FAST_BASE
- `gates/gateDependencyMap.mjs` — Hand-maintained gate → input-glob dependency map consumed by the dev-loop filter; no authority over `verify`. **[static/read]**
- `gates/verifyFast.mjs` — DEV-LOOP-ONLY change-aware filter over the canonical verify chain; skips only expensive gates whose inputs are unchanged and never reports SKIPPED as PASS. **[tests, build, runtime]**

### lib

- `lib/captureServer.mts` — Reusable QA server lifecycle helper: choose/free port, start/stop capture server, wait readiness, classify console errors. **[runtime, network, tests]**
- `lib/decisionMemoryLoader.mts` — Loads decision-memory exports/mirrors and handles backup naming for decision datasets. **[static/read]**; env: APEX_DECISION_MEMORY_EXPORT, APEX_DECISION_MEMORY_MIRROR_FILE

### qa

- `qa/_qa_cdp_matched.mts` — Focused ad-hoc QA probe for cdp matched; intended for diagnosing rendered CSS/geometry/runtime state. **[browser, network]**
- `qa/_qa_metric_audit.mts` — Focused ad-hoc QA probe for metric audit; intended for diagnosing rendered CSS/geometry/runtime state. **[browser, network]**
- `qa/_qa_range_probe.mts` — Focused ad-hoc QA probe for range probe; intended for diagnosing rendered CSS/geometry/runtime state. **[browser, network]**
- `qa/accessibilitySmoke.spec.mts` — Real-browser accessibility smoke: keyboard/focus flows plus axe checks and evidence capture. **[browser, writes]**; env: APEX_A11Y_PORT
- `qa/benchmarkBacktestingLearning.mts` — Deterministic benchmark for Backtesting Learning; measures performance/quality characteristics and may emit benchmark reports. **[writes, tests]**; env: APEX_BACKTEST_BENCH_OUTPUT
- `qa/benchmarkCore10Fusion.mjs` — Deterministic benchmark for Core10 Fusion; measures performance/quality characteristics and may emit benchmark reports. **[static/read]**
- `qa/benchmarkLiquidityHunterMicrostructure.mjs` — Deterministic benchmark for Liquidity Hunter Microstructure; measures performance/quality characteristics and may emit benchmark reports. **[writes]**
- `qa/benchmarkMultiAgentMultiTrading.mts` — Deterministic benchmark for Multi Agent Multi Trading; measures performance/quality characteristics and may emit benchmark reports. **[static/read]**
- `qa/benchmarkStrategyOptimization.mts` — Deterministic benchmark for Strategy Optimization; measures performance/quality characteristics and may emit benchmark reports. **[writes]**; env: APEX_OPTIMIZER_BENCH_OUTPUT
- `qa/cleanupQaArtifacts.mts` — Retention/cleanup utility constrained to project _qa; classifies artifacts, size thresholds, and safe cleanup. **[writes, tests]**; env: QA_SIZE_CLEANUP_BYTES, QA_SIZE_WARN_BYTES
- `qa/compareStrategyFillBias.mjs` — Comparison analysis for Strategy Fill Bias; produces evidence for behavioral/bias differences. **[writes]**
- `qa/generateComprehensiveSimulationData.mjs` — Generates QA-only synthetic fixtures/data for Comprehensive Simulation Data; should not be treated as production market/account data. **[writes]**
- `qa/generateSmartBacktestingSyntheticFixtures.mjs` — Generates QA-only synthetic fixtures/data for Smart Backtesting Synthetic Fixtures; should not be treated as production market/account data. **[writes]**
- `qa/legacy/INSTALL_AND_TEST_APEX_UI01_SNAPSHOT_FRESHNESS.bat` — Legacy QA/install helper for INSTALL AND TEST APEX UI01 SNAPSHOT FRESHNESS; use only when the historical UI01 snapshot-freshness workflow is specifically needed. **[runtime, writes, tests]**; env: HELPER, TESTFILE
- `qa/lib/simulatedMarketData.mjs` — Reusable QA library for simulated Market Data; supports deterministic simulated market data/fixtures. **[static/read]**
- `qa/runAutopilotLifecycleRuntime.mjs` — Executable runtime contract test for Autopilot Lifecycle Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[runtime, network]**; env: APEX_RUNTIME_BASE_URL, APEX_RUNTIME_BOOT_TIMEOUT_MS, APEX_RUNTIME_CYCLE_TIMEOUT_MS, APEX_RUNTIME_PORT, APEX_RUNTIME_SYMBOL
- `qa/runComprehensiveSimulationRuntime.mjs` — Executable runtime contract test for Comprehensive Simulation Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[runtime, writes, tests]**
- `qa/runExecutionPositionStateMachineRuntime.mjs` — Executable runtime contract test for Execution Position State Machine Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[writes]**
- `qa/runLiquidityHunterCoreRuntime.mjs` — Executable runtime contract test for Liquidity Hunter Core Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[writes, tests]**; env: NODE_PATH
- `qa/runLiquidityHunterEventReplayRuntime.mjs` — Executable runtime contract test for Liquidity Hunter Event Replay Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[writes, tests]**
- `qa/runLiquidityHunterEvidenceSimulationRuntime.mjs` — Executable runtime contract test for Liquidity Hunter Evidence Simulation Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[network, writes, release]**
- `qa/runLiquidityHunterFoundationRuntime.mjs` — Executable runtime contract test for Liquidity Hunter Foundation Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[runtime, writes, release]**; env: USERDOMAIN, USERNAME
- `qa/runLiquidityHunterGapClosureRuntime.mjs` — Executable runtime contract test for Liquidity Hunter Gap Closure Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[runtime, network, build]**
- `qa/runLiquidityHunterPublicFeedsRuntime.mjs` — Executable runtime contract test for Liquidity Hunter Public Feeds Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[writes]**
- `qa/runLiquidityHunterReadPlaneRuntime.mjs` — Executable runtime contract test for Liquidity Hunter Read Plane Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[runtime, network, writes]**
- `qa/runLiquidityHunterResearchCompletionRuntime.mjs` — Executable runtime contract test for Liquidity Hunter Research Completion Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[writes]**
- `qa/runLiquidityHunterSafeCompletionRuntime.mjs` — Executable runtime contract test for Liquidity Hunter Safe Completion Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[writes, tests]**
- `qa/runLiquidityHunterValidationAndProvidersRuntime.mjs` — Executable runtime contract test for Liquidity Hunter Validation And Providers Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[network, writes]**
- `qa/runMultiAgentMultiTradingRuntime.mjs` — Executable runtime contract test for Multi Agent Multi Trading Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[writes, release, tests]**
- `qa/runProxyFetchOptionalDependencyRuntime.mjs` — Executable runtime contract test for Proxy Fetch Optional Dependency Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[runtime, network, writes]**; env: APEX_AUTO_LOCAL_PROXY, PROXY_MODE, PROXY_POOL_URLS
- `qa/runStrategyOptimizationSafetyRuntime.mjs` — Executable runtime contract test for Strategy Optimization Safety Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[writes]**
- `qa/runSupplementalKeyRuntime.mjs` — Executable runtime contract test for Supplemental Key Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[runtime, writes, tests]**
- `qa/runTwoTierReplayRuntime.mjs` — Executable runtime contract test for Two Tier Replay Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[writes]**
- `qa/runUnifiedSafetyRuntime.mjs` — Executable runtime contract test for Unified Safety Runtime; exercises real module/server behavior and reports PASS/FAIL evidence. **[writes]**
- `qa/smokeStrategyEngines.mjs` — Smoke test for Strategy Engines; quickly verifies engines can load/run expected contracts. **[writes]**
- `qa/verifyAdaptiveGovernor.mjs` — Browser/runtime verifier for Adaptive Governor; enforces the named subsystem/UI contract and exits nonzero on violation. **[network, writes]**
- `qa/verifyAgentSafeMerge.mjs` — Browser/runtime verifier for Agent Safe Merge; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, writes, release, tests]**
- `qa/verifyAttachedFeatureParity.mjs` — Browser/runtime verifier for Attached Feature Parity; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, writes, release]**
- `qa/verifyBacktestRuntime.mts` — Source/static verifier for Backtest Runtime; enforces the named subsystem/UI contract and exits nonzero on violation. **[writes, tests]**
- `qa/verifyBacktestingReferenceOptimization.mjs` — Browser/runtime verifier for Backtesting Reference Optimization; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser]**
- `qa/verifyBacktestingStudioModernization.mjs` — Browser/runtime verifier for Backtesting Studio Modernization; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, network, writes, tests]**
- `qa/verifyBacktestingWorkspace.mjs` — Browser/runtime verifier for Backtesting Workspace; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, network, writes, tests]**
- `qa/verifyConsolidationIntegration.mjs` — Browser/runtime verifier for Consolidation Integration; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, writes, tests]**
- `qa/verifyCore10DynamicFusion.mjs` — Source/static verifier for Core10 Dynamic Fusion; enforces the named subsystem/UI contract and exits nonzero on violation. **[static/read]**
- `qa/verifyDesignTokens.mjs` — Source/static verifier for Design Tokens; enforces the named subsystem/UI contract and exits nonzero on violation. **[tests]**
- `qa/verifyFeaturePreservation.mjs` — Browser/runtime verifier for Feature Preservation; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser]**
- `qa/verifyLightTheme.mjs` — Browser/runtime verifier for Light Theme; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, writes, release, tests]**
- `qa/verifyLiquidityHunterBaseline.mjs` — Source/static verifier for Liquidity Hunter Baseline; enforces the named subsystem/UI contract and exits nonzero on violation. **[tests]**
- `qa/verifyLiquidityHunterFoundation.mjs` — Source/static verifier for Liquidity Hunter Foundation; enforces the named subsystem/UI contract and exits nonzero on violation. **[release, tests]**
- `qa/verifyMaximalMergeSafety.mjs` — Browser/runtime verifier for Maximal Merge Safety; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, tests]**
- `qa/verifyMergedStageUi.mjs` — Browser/runtime verifier for Merged Stage Ui; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, writes, release, tests]**
- `qa/verifyMultiAgentMultiTrading.mjs` — Source/static verifier for Multi Agent Multi Trading; enforces the named subsystem/UI contract and exits nonzero on violation. **[tests]**
- `qa/verifyReferenceUiRedesign.mjs` — Browser/runtime verifier for Reference Ui Redesign; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, writes, tests]**; env: PROXY_MODE
- `qa/verifyResearchWorkspaceLayout.mjs` — Browser/runtime verifier for Research Workspace Layout; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, tests]**
- `qa/verifySmartAutopilot.mjs` — Browser/runtime verifier for Smart Autopilot; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser]**
- `qa/verifySmartBacktestingRuntimeHardening.mjs` — Browser/runtime verifier for Smart Backtesting Runtime Hardening; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, tests]**
- `qa/verifyStrategyBacktestProduction.mjs` — Browser/runtime verifier for Strategy Backtest Production; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, release, tests]**
- `qa/verifyStrategyIntegration.mjs` — Browser/runtime verifier for Strategy Integration; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, network]**
- `qa/verifyStrategyLibrary.mjs` — Browser/runtime verifier for Strategy Library; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, network]**
- `qa/verifyStrategyOptimizationIntegration.mjs` — Browser/runtime verifier for Strategy Optimization Integration; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, writes]**
- `qa/verifyStrategyPageModernization.mjs` — Browser/runtime verifier for Strategy Page Modernization; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, writes]**
- `qa/verifyStrategyStudioReference.mjs` — Browser/runtime verifier for Strategy Studio Reference; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, writes, tests]**
- `qa/verifySupplementalKeyWiring.mjs` — Source/static verifier for Supplemental Key Wiring; enforces the named subsystem/UI contract and exits nonzero on violation. **[runtime, tests]**; env: BSCSCAN_KEY
- `qa/verifySystemIntegration.mjs` — Browser/runtime verifier for System Integration; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, runtime]**
- `qa/verifyTradingActivitySlideout.mjs` — Browser/runtime verifier for Trading Activity Slideout; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser]**
- `qa/verifyTradingDrawerDocking.mjs` — Source/static verifier for Trading Drawer Docking; enforces the named subsystem/UI contract and exits nonzero on violation. **[writes, release]**
- `qa/verifyTradingEngineUtilities.mts` — Source/static verifier for Trading Engine Utilities; enforces the named subsystem/UI contract and exits nonzero on violation. **[static/read]**
- `qa/verifyTradingPageModernization.mjs` — Source/static verifier for Trading Page Modernization; enforces the named subsystem/UI contract and exits nonzero on violation. **[runtime]**
- `qa/verifyTradingRailSlideout.mjs` — Source/static verifier for Trading Rail Slideout; enforces the named subsystem/UI contract and exits nonzero on violation. **[static/read]**
- `qa/verifyTradingSubmenuRelocation.mjs` — Source/static verifier for Trading Submenu Relocation; enforces the named subsystem/UI contract and exits nonzero on violation. **[writes, release]**
- `qa/verifyUi1368.mjs` — Canonical real-browser 1368×753 UI gate: route rendering, overflow, page errors, console errors and visual/runtime assertions. **[browser, runtime, network, writes, tests]**; env: APEX_PLAYWRIGHT_EXECUTABLE, APEX_QA_INLINE_PORT, APEX_QA_OUT_DIR, APEX_QA_ROUTES, APEX_QA_VIEWPORT_HEIGHT, APEX_QA_VIEWPORT_WIDTH, C, NODE_ENV
- `qa/verifyUiAuditAndAccessibility.mjs` — Browser/runtime verifier for Ui Audit And Accessibility; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, tests]**
- `qa/verifyUiCompletenessR2.mjs` — Browser/runtime verifier for Ui Completeness R2; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, tests]**
- `qa/verifyUiInteractionPolish.mjs` — Browser/runtime verifier for Ui Interaction Polish; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, writes]**
- `qa/verifyUiPolishV1066.mjs` — Browser/runtime verifier for Ui Polish V1066; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser]**
- `qa/verifyUiThemeMerge.mjs` — Browser/runtime verifier for Ui Theme Merge; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser]**
- `qa/verifyV1054CapabilityPreservation.mjs` — Source/static verifier for V1054 Capability Preservation; enforces the named subsystem/UI contract and exits nonzero on violation. **[writes, tests]**
- `qa/verifyV19Contract.mjs` — Source/static verifier for V19 Contract; enforces the named subsystem/UI contract and exits nonzero on violation. **[runtime, tests]**
- `qa/verifyV20ReferenceContract.mjs` — Browser/runtime verifier for V20 Reference Contract; enforces the named subsystem/UI contract and exits nonzero on violation. **[browser, tests]**
- `qa/verifyWorkspaceLightPolish.mjs` — Source/static verifier for Workspace Light Polish; enforces the named subsystem/UI contract and exits nonzero on violation. **[static/read]**
- `qa/verifyWorkspaceRuntime.mts` — Broad Playwright workspace runtime verifier with server/browser launch options, route/state checks, containment and strict mode. **[browser, runtime, network, writes, tests]**; env: APEX_PLAYWRIGHT_EXECUTABLE, APEX_QA_BASE_URL, APEX_QA_LIGHT_ONLY, APEX_QA_OUT_DIR, APEX_QA_PORT, APEX_QA_START_SERVER, APEX_QA_STRICT, APEX_QA_TRANSPORT_BRIDGE, BROWSER_CHANNEL, HEADLESS
- `qa/workspaceGeometry.spec.mts` — Full Playwright geometry assertions across pages/states/viewports and dock layouts. **[browser, runtime, network, release]**; env: APEX_GEOMETRY_PORT

### utilities

- `utilities/KILL-ALL-NODE-PROCESSES.bat` — Force-kills every node.exe process and its children. Broad/destructive; emergency-only, never the default port fix. **[runtime, DANGEROUS]**
- `utilities/_check_server.ps1` — Low-level diagnostic/helper script for check server; use as a targeted troubleshooting tool rather than a primary workflow. **[network]**
- `utilities/_diag_body.mjs` — Low-level diagnostic/helper script for diag body; use as a targeted troubleshooting tool rather than a primary workflow. **[browser, network]**
- `utilities/_find_port.ps1` — Low-level diagnostic/helper script for find port; use as a targeted troubleshooting tool rather than a primary workflow. **[static/read]**
- `utilities/_install_pw.ps1` — Low-level diagnostic/helper script for install pw; use as a targeted troubleshooting tool rather than a primary workflow. **[browser, network]**; env: HTTPS_PROXY, HTTP_PROXY
- `utilities/_write_insightpanel.ps1` — Low-level diagnostic/helper script for write insightpanel; use as a targeted troubleshooting tool rather than a primary workflow. **[static/read]**
- `utilities/analyzeDirectionDivergence.mts` — Analysis/report utility for Direction Divergence; consumes decision/export data and writes diagnostic reports. **[writes]**; env: APEX_DECISION_MEMORY_EXPORT
- `utilities/apex_visual_diff.py` — Image-based visual-diff utility for comparing APEX screenshots and producing visual difference evidence. **[writes]**
- `utilities/auditOperationsPanel.mts` — Browser/runtime audit of the Operations panel, with screenshots and report output. **[browser, runtime, network, writes, tests]**; env: APEX_OPS_AUDIT_PORT, APEX_PLAYWRIGHT_CHANNEL
- `utilities/auditOverviewLayout.mts` — Browser audit of Overview layout/geometry using controlled data and screenshots. **[browser, runtime, network, writes]**; env: APEX_OVERVIEW_AUDIT_PORT, APEX_PLAYWRIGHT_CHANNEL
- `utilities/buildAndBundle.mts` — Canonical production build pipeline: build identity, Vite build, service-worker stamp, server bundle and function index. **[runtime, build]**
- `utilities/checkDocumentationLinks.mts` — Utility check for Documentation Links; validates project/documentation consistency. **[tests]**
- `utilities/cleanBuild.mjs` — Cleanup utility for Build; removes generated/build artifacts and should be invoked intentionally. **[writes]**
- `utilities/cleanGeneratedArtifacts.mjs` — Cleanup utility for Generated Artifacts; removes generated/build artifacts and should be invoked intentionally. **[writes, release]**
- `utilities/createReleaseArchive.mts` — Creates the sanitized release archive, hashes content/tree, copies approved files and records release evidence. **[runtime, writes, release]**
- `utilities/cursor_auto_add_model.py` — Project script for cursor auto add model. **[network]**
- `utilities/devWithFunctionIndex.mts` — Starts APEX dev server plus live function-index watcher; supports safe APEX-specific port takeover. **[runtime, tests]**; env: APEX_FORCE_PORT_TAKEOVER, APEX_HOST
- `utilities/exportDecisionDataset.mts` — Exports Decision Dataset into structured datasets/reports for offline analysis. **[writes]**
- `utilities/generateApiRouteIndex.mts` — Generates/updates Api Route Index from the current source/runtime contracts. **[writes, tests]**; env: APEX_OPENAPI_MIN_COVERAGE
- `utilities/generateBuildIdentity.mjs` — Generates build identity metadata/hashes used to tie source and built artifacts together. **[runtime, writes, release]**
- `utilities/generateDocumentationIndex.mts` — Generates/updates Documentation Index from the current source/runtime contracts. **[writes, release, tests]**
- `utilities/generateFunctionIndex.mts` — Indexes functions/symbols across source, writes human/JSON/agent indexes, and supports incremental watch mode. **[runtime, writes, release, tests]**
- `utilities/generateRepositoryAudit.mts` — Generates/updates Repository Audit from the current source/runtime contracts. **[browser, runtime, writes, build, release]**
- `utilities/importDeribitOptionsHistory.mts` — Imports Deribit Options History into local research/QA data; may perform network/file I/O. **[writes]**; env: APEX_DERIBIT_PUBLIC_BASE_URL
- `utilities/manageLiquidityHunterEdgeThresholds.mts` — CLI management utility for Liquidity Hunter Edge Thresholds; reads/updates named research configuration/thresholds. **[static/read]**
- `utilities/portTakeover.mts` — Safely diagnoses a busy Windows port and only terminates it when the process is confirmed as APEX (or force is explicit). **[runtime, network, build, tests]**
- `utilities/probeIntelHosts.mts` — Connectivity/provider probe for Intel Hosts; performs network checks and reports availability. **[network]**; env: HUGGING_FACE_TOKEN, PROXY_POOL_URLS
- `utilities/queryFunctionIndex.mts` — Queries the generated function index for symbols/files instead of broad source searching. **[tests]**
- `utilities/replayRejectedCandidates.mts` — Offline replay utility for Rejected Candidates; uses recorded/exported observations to analyze rejected candidates. **[writes]**; env: APEX_DECISION_MEMORY_EXPORT, APEX_REPLAY_OBSERVATIONS
- `utilities/runAdaptiveLearningStress.mts` — Stress/matrix runner for Adaptive Learning Stress; generates repeatable performance/robustness evidence and reports. **[writes]**; env: APEX_STRESS_SEED, CANDIDATES_PER_CYCLE, CYCLES
- `utilities/runFastMinuteMatrix.mts` — Stress/matrix runner for Fast Minute Matrix; generates repeatable performance/robustness evidence and reports. **[writes]**; env: APEX_FAST_MATRIX_OUT, APEX_FAST_MATRIX_RUNS, APEX_FAST_MATRIX_SEED_BASE
- `utilities/runHundredSeedLoadMatrix.mts` — Stress/matrix runner for Hundred Seed Load Matrix; generates repeatable performance/robustness evidence and reports. **[writes]**; env: APEX_MATRIX_OUT, APEX_MATRIX_RUNS, APEX_MATRIX_SEED_BASE
- `utilities/runProviderRoutingStress.mts` — Stress/matrix runner for Provider Routing Stress; generates repeatable performance/robustness evidence and reports. **[writes]**; env: APEX_STRESS_SEED
- `utilities/runSyntheticDecisionAudit.mts` — Stress/matrix runner for Synthetic Decision Audit; generates repeatable performance/robustness evidence and reports. **[static/read]**; env: APEX_AUDIT_CYCLES, APEX_AUDIT_SEED
- `utilities/shadowMlCompare.mts` — Shadow-ML research utility for shadow Ml Compare; writes model/comparison reports and must remain non-authoritative for live execution. **[writes]**
- `utilities/smokeOperationsStatus.mts` — Smoke utility for Operations Status; checks operations/runtime status and emits evidence. **[runtime, network, writes, release]**; env: APEX_OPS_SMOKE_PORT
- `utilities/stampServiceWorker.mjs` — Build utility for Service Worker; stamps generated artifacts with current build identity. **[runtime, writes, build]**
- `utilities/subfinder/build_function_index.py` — Python helper for function-index build function index; supports building/querying symbol indexes. **[writes, release]**
- `utilities/subfinder/query_function.py` — Python helper for function-index query function; supports building/querying symbol indexes. **[static/read]**
- `utilities/syncDecisionMemoryExport.mts` — Synchronizes Decision Memory Export from runtime/export source into local files. **[network, writes]**; env: APEX_BASE_URL, APEX_OPS_AUDIT_PORT, PORT
- `utilities/trainShadowMl.mts` — Shadow-ML research utility for train Shadow Ml; writes model/comparison reports and must remain non-authoritative for live execution. **[writes]**
- `utilities/uiSyntheticAudit.mjs` — Browser audit with synthetic QA data to exercise UI routes/drawers/states and write screenshots/report; not production-data validation. **[browser, runtime, network, writes]**; env: APEX_PLAYWRIGHT_CHANNEL, APEX_PLAYWRIGHT_EXECUTABLE, APEX_UI_AUDIT_PORT, APEX_UI_AUDIT_URL
- `utilities/updateVisualProjectDocumentation.mjs` — Regenerates visual/project documentation from the current source tree and route/module metrics. **[browser, runtime, writes, build, release, tests]**
- `utilities/validateLiquidityHunterMicrostructure.mts` — Validation utility for Liquidity Hunter Microstructure; reads recorded research data and writes validation/readiness reports. **[writes]**; env: APEX_REALTIME_EVENT_LOG_PATH
- `utilities/validateLiquidityHunterRecording.mts` — Validation utility for Liquidity Hunter Recording; reads recorded research data and writes validation/readiness reports. **[writes]**; env: APEX_REALTIME_EVENT_LOG_PATH
- `utilities/windows/PATCH_RAIL_CLIPPING.ps1` — Targeted PowerShell patch/verification workflow for rail-clipping CSS/source; mutates project files and should only be used when that exact defect is confirmed. **[static/read]**
- `utilities/windows/fix-apex-fileops-install.ps1` — Installs/verifies a project-local apex-fileops Claude skill from candidate locations; contains a stale hard-coded older APEX root and must be reviewed before use. **[writes, DANGEROUS]**

### windows

- `windows/RUN-REMAINING-GATES.ps1` — Authoritative Windows P0/P1 release-gate runner with evidence logs; optional dependency reinstall, continue-on-failure, browser/visual skip switches. **[writes, build, release, DANGEROUS]**; env: PROCESSOR_ARCHITECTURE
- `windows/Restore-OfflineDependencies.ps1` — Restores npm dependencies from an offline tarball bundle on Windows, seeds cache, runs npm ci and optional verification. **[release]**
- `windows/VERIFY-WINDOWS.cmd` — Thin CMD launcher for the Windows verification PowerShell script. **[static/read]**
- `windows/VERIFY-WINDOWS.ps1` — Canonical Windows verification sequence: lint, build, tests and major QA/gate scripts. **[release]**

### root audits

- `_audit_freshmount.mts` — Quick Playwright audit of freshly mounted routes, reporting root HTML size, body text and page errors. **[browser, network]**
- `_audit_theme_watchlist.mts` — Quick browser audit of theme attributes and Watchlist rendering with screenshots. **[browser, network]**
- `_audit_walkthrough.mts` — Quick browser walkthrough of major routes/states for diagnostic inspection. **[browser, network]**
- `_audit_watchlist2.mts` — Focused Watchlist browser diagnostic with screenshot/body/root inspection. **[browser, network]**
