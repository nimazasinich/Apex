# APEX Central Project Plan

Last updated: 2026-08-03

This is the single source of truth for project direction and progress. Every
implementation, validation result, blocker, accepted proposal, or scope change
must be reflected here. The source code remains authoritative when a document
and implementation disagree.

## How To Use This File

1. Read the progress table before starting work.
2. Update the relevant phase checkboxes and status immediately after a change.
3. Record validation commands and real blockers; do not mark a phase complete
   from a proposal alone.
4. Add new proposals as a scoped phase or task here, with explicit exclusions
   and acceptance criteria.
5. Update `Last updated` and append a short entry to the Progress Log.

No parallel roadmap should be created. Supporting documents explain a
subsystem; this file decides whether that subsystem is active, planned,
blocked, or rejected.

## Progress Overview

| Area | Status | Current position | Next evidence required |
|---|---|---|---|
| Phase A — Documentation/source cleanup | COMPLETE | Active docs and historical archive are separated | Keep this plan and indexes current |
| Phase B — Decision Memory durability | COMPLETE | Browser-local authority plus optional backend mirror | Production database/dashboard only if required |
| Phase C — Outcome labeling | CODE COMPLETE | Outcome attachment + rejected replay implemented; data gate open | Browser export → `decision_memory_export_v1.json` |
| Phase C2 — Direction-Divergence classifier | CODE COMPLETE | Classifier + analysis pipeline (shadow-only) | Same export; ≥300 resolved accepted rows |
| Phase D — Shadow ML | CODE COMPLETE | Training/comparison pipeline scaffolded (shadow-only) | Export passes Phase 0 gate → train/compare on real data |
| Phase E — Production hardening | E.1–E.4 COMPLETE | Ops schema v4 with load-matrix evidence; execution paper-only | Real Decision Memory export, separate safety review |
| Trading Logic Upgrade — Phase 1 inventory | COMPLETE | Module map, flow diagrams, audit verification | — |
| Trading Logic Upgrade — Phase 2 adapter + fixes | COMPLETE | Canonical adapter, shadow mode, PROXY_REPLAY, confluence/QStruct/SMC | — |
| Trading Logic Upgrade — Phase 3 Trade Plan (initial) | IN PROGRESS | Trade plan builder + symbol API; Risk Governor pending | Phase 4 Risk Governor |

Current next priority: export real Decision Memory from the browser so Phase C
and Phase C2 data gates can pass; keep all direction-divergence work shadow-only
until a separate safety review approves any behavior change.

The 2026-07-27 system deficiency audit also identified a separate hardening
backlog covering duplicated market-data polling, server-boundary security,
dependency vulnerabilities, health/lifecycle observability, and portable
browser verification. The implementation prompt and acceptance criteria are
recorded in [`CURSOR_SYSTEM_DEFICIENCY_REMEDIATION_PROMPT.md`](CURSOR_SYSTEM_DEFICIENCY_REMEDIATION_PROMPT.md).

## Current Verified Baseline

- Canonical root: `C:\project\APEX-Trading-Engine`
- Test baseline: `npm test` passes 29 files / 226 tests.
- Build baseline: `npm run build` passes.
- Conservative scanner defaults are still the safe baseline:
  - `thresholdMode: ADAPTIVE_GUARDRAILS`
  - `scorePreset: ATLAS_PLUS_V2`
  - `directionBias: SHORT_ONLY`
- Decision memory is local-first: browser IndexedDB with localStorage fallback.
- ML work is Phase 0 only: data export, labeling, and validation. No model is
  allowed to become a live decision gate yet.

## Direction To Keep

### 1. Keep the real-data boundary

The platform should continue to reject fake live-market success paths. Public
exchange data, supplemental intelligence, degraded states, and unavailable
states must be shown honestly.

Upgrade implication:

- Preserve explicit `live`, `degraded`, `unavailable`, or `not_configured`
  semantics in provider upgrades.
- Missing data should reduce readiness or confidence, not be filled with
  optimistic defaults.
- UI verification must not claim live validation unless browser/runtime evidence
  was actually captured.

Primary docs:

- `Doc/SUPPLEMENTAL_INTELLIGENCE.md`
- `Doc/automation/DECISION_MEMORY_DATA_CONTRACT.md`
- `Refrence.md`

### 2. Grow learning from Decision Memory, not shortcuts

The main upgrade path is to make Decision Memory more useful: accepted signals,
rejected candidates, config snapshots, gates, market snapshots, and later
outcomes should become the durable evidence layer.

Upgrade implication:

- Strengthen outcome attachment so accepted signals resolve back into the same
  decision records.
- Keep rejected records for later counterfactual analysis, but do not mix them
  into supervised v1 labels until the labeling method is valid.
- Treat backend sync as a future production upgrade, not a requirement for the
  current local-first implementation.

Primary docs:

- `Doc/automation/DECISION_MEMORY_DATA_CONTRACT.md`
- `Doc/automation/AUTONOMOUS_THRESHOLD_LEARNING_ENGINE.md`
- `Doc/automation/ML_SIGNAL_MODEL_METHODOLOGY.md`

### 3. Keep adaptive tuning bounded

Adaptive learning is useful only while it stays inside hard guardrails. The
current project direction is controlled adjustment, not unrestricted optimizer
behavior.

Upgrade implication:

- Keep `ADAPTIVE_GUARDRAILS` as the production default.
- Preserve max-step limits, min/max bounds, normalized weights, and audit logs.
- Treat `MANUAL` mode as a full disable switch for automatic tuning.
- Do not loosen gates simply to increase signal count without outcome evidence.

Primary docs:

- `Doc/automation/AUTONOMOUS_THRESHOLD_LEARNING_ENGINE.md`
- `Doc/automation/FAST_MINUTE_SELF_ADAPTATION_ENGINE.md`
- `Doc/automation/LOAD_AND_AUTOMATION_STRESS_PLAN.md`

### 4. Advance ML only through gated phases

The ML signal model should remain separate from live gates until it passes data
quality, class balance, chronological validation, and shadow-mode approval.

Upgrade implication:

- Phase 0: export and validate Decision Memory rows.
- Phase 1: train only after at least 300 labeled feature-complete accepted rows
  and at least 30 rows in the minority class.
- Phase 2: evaluate chronologically, not with random splits.
- Phase 3: run in shadow mode only.
- Phase 4: use walk-forward retraining and auditable model version swaps.

Current blocker:

- `Doc/automation/ml_dataset/VALIDATION_REPORT_v1.md` reports insufficient data
  because no browser Decision Memory export is available. Do not proceed to
  training until that report passes.

Primary docs:

- `Doc/automation/ML_SIGNAL_MODEL_METHODOLOGY.md`
- `Doc/automation/ml_dataset/VALIDATION_REPORT_v1.md`

## Upgrade Phases

### Phase A - Documentation and source-of-truth cleanup

- Keep this file as the active upgrade roadmap.
- Keep `Doc/README.md` as the documentation index.
- Keep `Refrence.md` as the agent navigation map and update it with every code
  change.
- Treat old release manifests, historical sprint notes, visual mockups, and
  source proposals as reference-only material.

Acceptance:

- Active docs point to this plan.
- Stale implementation prompts and duplicate final reports are removed from the
  active documentation tree.
- Current verification numbers match the latest local checks.

### Phase B - Decision Memory durability

- [x] Add an optional backend mirror for `SignalDecisionLog` records.
- [x] Batch writes and index by timestamp, ticker, decision, reason code, and
  outcome.
- [x] Keep the browser store as a rolling local cache for UI responsiveness.
- [x] Add a migration path that never drops local records without export.

Acceptance:

- [x] Existing IndexedDB behavior still works.
- [x] Backend sync failures degrade without blocking scanning.
- [x] No secrets or private exchange credentials are exposed to the browser.
- [x] Built-server probe verified mirror write, indexed query, and status.

### Phase C - Outcome labeling and replay

- [x] Ensure accepted signal lifecycle resolution writes `laterOutcome` and
  `laterPnl` back to the original decision record.
- [x] Add a replay or delayed-outcome path for rejected candidates before using them
  in any counterfactual/uplift model.
- [x] Keep `UNKNOWN` unresolved rows out of supervised training.

Acceptance:

- [x] Outcome attachment is exact by `signalId` and covered by unit tests.
- [ ] A browser Decision Memory export produces non-zero resolved accepted rows.
- [ ] The ML validation report explicitly passes sample-size and class-balance
  gates before any training starts.

Current status: accepted lifecycle outcome attachment and the shadow rejected
replay path are implemented. This workspace still has no browser export, so the
data acceptance gate remains open.

### Phase C2 - Direction-Divergence shadow classification

The attached Direction-Divergence Position Detector proposal is compatible with
APEX as a classification and audit layer, not as a drop-in execution or
HermesFace-3/Python subsystem.

- [x] Add a pure TypeScript classifier that separates order direction from
  market-trend alignment.
- [x] Classify only from available, fresh candle layers and real futures
  context; missing inputs must produce `UNAVAILABLE`, not neutral defaults.
- [x] Start with the scanner's actual `1m`, `5m`, `15m`, and available `4h`
  inputs. Add `1h`/`1d` only after their providers and freshness contracts
  exist.
- [x] Persist classification fields in `SignalDecisionLog` for replay and
  Decision Memory analysis.
- [x] Run in shadow mode only; do not change scanner gates, `SHORT_ONLY`,
  lifecycle behavior, execution, position size, or stop placement.
- [x] Validate category-level outcomes chronologically before considering
  non-binding risk suggestions (analysis pipeline implemented via
  `npm run analyze:direction-divergence`).

Current status: the classifier, pure analysis module, script, unit tests, and
generated report artifacts are implemented. The latest run reports
`INSUFFICIENT_DATA` because no browser Decision Memory export is available in
this workspace. Category-level conclusions remain descriptive only until the
sample gate passes on real resolved accepted rows.

Primary documents:

- `Doc/automation/DIRECTION_DIVERGENCE_POSITION_DETECTOR.md`
- `Doc/automation/direction_divergence/DIRECTION_DIVERGENCE_ANALYSIS_v1.md`

Explicit exclusions:

- No HermesFace-3/Python imports.
- No automatic switch to `BOTH` direction.
- No automatic contrarian trade acceptance.
- No risk-sizing changes before a separate safety review.

### Phase D - Shadow ML model

- [x] Pure TypeScript dataset preparation for feature-complete accepted WIN/LOSS rows.
- [x] Chronological train/validation/test splits and walk-forward validation scaffold.
- [x] Pure TypeScript logistic-regression trainer and auditable shadow model version file.
- [x] Shadow comparison pipeline that logs rule-engine vs ML disagreements, confidence, and later outcomes.
- [ ] Train and evaluate on real exported Decision Memory once the Phase 0 data gate passes.

Acceptance:

- [x] Shadow model has an auditable version file format (`Doc/automation/ml_shadow/model_v1.json`).
- [x] No live gate uses the ML output.
- [ ] Walk-forward validation outperforms or clearly explains gaps against the rule
  baseline on real data.

Current status: shadow-only scaffolding is implemented via `npm run ml:train` and
`npm run ml:shadow-compare`. Training is skipped with `INSUFFICIENT_DATA` until a
browser Decision Memory export passes the Phase 0 sample gate. Generated reports
live under `Doc/automation/ml_shadow/`.

Primary documents:

- `Doc/automation/ML_SIGNAL_MODEL_METHODOLOGY.md`
- `Doc/automation/ml_shadow/SHADOW_ML_TRAINING_REPORT_v1.md`
- `Doc/automation/ml_shadow/SHADOW_ML_COMPARISON_REPORT_v1.md`

### Phase E - Production hardening

- Add operational dashboards for provider health, Decision Memory sync status,
  adaptive threshold audit events, and ML shadow performance.
- Keep live trading disabled unless a separate safety review explicitly adds a
  controlled execution layer.
- Continue using stress harnesses after changes to scanner, adaptive learning,
  lifecycle, or provider routing.

#### Phase E.1 - Contract-driven production observability

- [x] Define one shared operations-status contract in
  `src/services/operationsStatus.ts` used by backend and frontend.
- [x] Harden `GET /api/operations/status` to return the shared contract with
  explicit `READY`, `DEGRADED`, `UNAVAILABLE`, `INSUFFICIENT_DATA`, `NO_MODEL`,
  `LOCAL_ONLY`, and `SYNC_ENABLED` semantics.
- [x] Never count unconfigured providers as configured-and-healthy.
- [x] Safely handle missing/malformed shadow ML report files without fabricating
  metrics.
- [x] Update `OperationalHealthPanel.tsx` with bounded polling, stale detection
  (45s threshold), abort/sequence guards, and truthful degraded-state display.
- [x] Add contract unit tests and `npm run smoke:operations-status`.
- [x] Add browser Ops-tab audit script `npm run audit:operations-panel`.
- [x] Capture fresh browser screenshot evidence on every host where UI audit is
  required (environment-dependent; latest capture via IDE browser audit on
  2026-07-27).

Current status: backend and frontend now share one versioned operations contract.
Shadow ML remains `auditOnly: true`. Real Decision Memory export is still
required before ML training gates can pass. Live trading and execution paths
remain untouched.

Primary documents:

- `src/services/operationsStatus.ts`
- `Doc/automation/operations_status/OPERATIONS_STATUS_SMOKE_v1.md`
- `Doc/automation/operations_status/OPERATIONS_PANEL_AUDIT_v1.json`

#### Phase E.2 - Deterministic adaptive-stress evidence

- [x] Replace the nondeterministic adaptive-learning stress runner with a
  seed-controlled pure TypeScript harness.
- [x] Add explicit fail-closed guardrail checks for safe mode, `SHORT_ONLY`,
  threshold bounds, normalized weights, controlled acceptance, and finite
  metrics.
- [x] Write versioned JSON and Markdown evidence under
  `Doc/automation/adaptive_learning/`.
- [x] Extend the shared operations contract to schema v2 with adaptive-stress
  status and metrics.
- [x] Surface backend stress evidence in the frontend Ops dashboard.
- [x] Add deterministic unit tests and require the Ops browser audit to find the
  Adaptive Stress Evidence panel.

Current status: `npm run stress:adaptive-learning` passes with seed 42 across
5,400 synthetic candidates and 12/12 safety checks. This evidence is synthetic
guardrail stress only; it is never Decision Memory export or ML training data.

Primary documents:

- `Doc/automation/adaptive_learning/ADAPTIVE_LEARNING_STRESS_v1.md`
- `Doc/automation/adaptive_learning/ADAPTIVE_LEARNING_STRESS_v1.json`
- `Doc/automation/operations_status/OPERATIONS_STATUS_SMOKE_v1.md`
- `Doc/automation/operations_status/OPERATIONS_PANEL_AUDIT_v1.json`

#### Phase E.3 - Provider routing and degraded-mode hardening

- [x] Add pure TypeScript provider-routing failure-injection harness covering
  success, timeout, geo block, rate limit, 5xx, malformed response, unsupported
  symbol, proxy unavailable, all-routes-down, LKG degrade, cooldown, and recovery.
- [x] Confirm unavailable envelopes never fabricate market values.
- [x] Write versioned JSON/Markdown evidence under
  `Doc/automation/provider_routing/`.
- [x] Add `npm run stress:provider-routing`.
- [x] Extend shared operations contract to schema v3 with provider-routing stress
  evidence and observed ops states (`READY`, `DEGRADED`, `RATE_LIMITED`,
  `GEO_BLOCKED`, `UNSUPPORTED`, `UNAVAILABLE`, `STALE`).
- [x] Surface evidence in backend `GET /api/operations/status` and Ops panel.
- [x] Add focused unit tests for determinism, cooldown recovery, no secrets, and
  malformed/missing report handling.

Current status: `npm run stress:provider-routing` passes 16/16 checks across 12
failure-mode scenarios. Evidence is synthetic and fail-closed; it does not alter
scanner acceptance, direction bias, lifecycle, or execution.

Primary documents:

- `Doc/automation/provider_routing/PROVIDER_ROUTING_STRESS_v1.md`
- `Doc/automation/provider_routing/PROVIDER_ROUTING_STRESS_v1.json`

#### Phase E.4 - Load-matrix Ops integration

- [x] Parse `LOAD_MATRIX_100_SUMMARY.json` and `FAST_MINUTE_MATRIX_SUMMARY.json`
  into the shared operations contract (schema v4).
- [x] Surface 100-seed and fast-minute load matrix evidence in
  `OperationalHealthPanel.tsx` (`Load Matrix Evidence` panel).
- [x] Extend `deriveServiceStatus` with load-matrix FAILED / MALFORMED /
  UNAVAILABLE semantics.
- [x] Wire backend `GET /api/operations/status` with load-matrix report dirs.
- [x] Add unit tests and include load-matrix fields in
  `npm run smoke:operations-status`.
- [x] Require Ops browser audit to find the Load Matrix Evidence panel.

Current status: existing load-matrix artifacts under
`Doc/automation/load_matrix_100/` and `Doc/automation/load_matrix_fast_1m_5m/`
are ingested into the Ops dashboard. Evidence remains synthetic and
fail-closed; it does not alter scanner gates or execution.

Primary documents:

- `Doc/automation/load_matrix_100/LOAD_MATRIX_100_RESULT.md`
- `Doc/automation/load_matrix_fast_1m_5m/FAST_MINUTE_MATRIX_RESULT.md`

Acceptance:

- `npm run lint`, `npm test`, and `npm run build` pass.
- Relevant stress/audit scripts pass for the touched subsystem.
- Browser UI changes have screenshot evidence.

## System deficiency hardening backlog

Status: `IN PROGRESS` (Priorities 1–5 implemented; live visual layout remains network-sensitive)

The current audit found no P0 outage. The immediate runtime baseline is green
for build, unit tests, and KuCoin core connectivity, but Binance sentiment is
degraded and the proxy pool is empty. Work this backlog in the order defined
by [`CURSOR_SYSTEM_DEFICIENCY_REMEDIATION_PROMPT.md`](CURSOR_SYSTEM_DEFICIENCY_REMEDIATION_PROMPT.md):

1. [x] Consolidate duplicate market-data polling behind a shared cache/coordinator.
2. [x] Add CORS, authentication, CSRF, rate limits, and SSRF protection to the
   server boundary.
3. [x] Resolve the high `postcss` and low `body-parser` audit findings.
4. [x] Make health and stale-budget telemetry reflect actual provider/lifecycle
   state.
5. [x] Make browser audits portable and add current UI regression coverage.

### Priority 1 evidence (2026-07-27)

- Added `src/services/marketDataCoordinator.ts` with TTL, in-flight sharing,
  invalidate/clear, and diagnostics (hits/misses/fetches/age/stale).
- Wired KuCoin/Binance fetchers and `fetchFullMarketSnapshot` through the
  shared coordinator in `src/services/marketData.ts` (existing hook/UI call
  sites unchanged).
- Focused tests: `src/tests/marketDataCoordinator.test.ts` (8 cases).
- Validation: `npm run lint`, `npm test` (209/209 at P1 close), `npm run build`,
  `npm run docs:check` pass.
- Follow-on: Priority 2 completed in the same hardening stream.

### Priority 2 evidence (2026-07-27)

- Added `src/services/serverSecurity.ts` (CORS allowlist helpers, mutation
  auth/CSRF checks, rate limiter, SSRF URL/DNS guards).
- Wired `server.ts`: explicit CORS, `HOST`/`APEX_HOST`, JSON body limit,
  mutation middleware for all `/api` POST routes, SSRF on
  `/api/external-sources/test` (`redirect: 'error'`), bootstrap route
  `/api/security/bootstrap`.
- Browser callers use `src/services/apiMutate.ts` (`X-APEX-CSRF: 1` + optional
  operator token). Secrets remain write-only / sanitized.
- `.gitignore` now includes `.supplemental.config.json` and
  `.external-api-sources.config.json`; `.env.example` documents security env
  and clarifies IPv4 routing is implemented in `proxyFetch.ts` (no
  `APEX_CONNECT_FAMILY` switch).
- Focused tests: `src/tests/serverSecurity.test.ts` (8 cases).
- Validation: `npm run lint`, `npm test` (217/217), `npm run build`,
  `npm run docs:check` pass.
- Priority 3–5 were previously deferred and are now implemented below.

### Priority 3 evidence (2026-07-27)

- Removed the duplicate production `vite` declaration.
- Added a fixed `postcss` version and an `express`-compatible `body-parser`
  override in `package.json` / `package-lock.json`.
- Validation: `npm ci`, `npm run lint`, `npm test` (28 files / 221 tests),
  `npm run build`, `npm audit --omit=dev` (0 vulnerabilities), and
  `npm run docs:check` pass.

### Priority 4 evidence (2026-07-27)

- Added `src/services/healthStatus.ts` with explicit READY, DEGRADED,
  UNAVAILABLE, and NOT_CONFIGURED derivation for probes, supplemental
  providers, and proxy pools.
- `/api/health` now exposes structured server/provider/transport health and
  labels probes as proxy-aware.
- Added `BscScan` to provider health tracking.
- Replaced approximate Telegram stale budgets with
  `MAX_STALE_CONTEXT_TICKS`.
- Added focused health and stale-budget tests.
- Validation: `npx tsc --noEmit --strict`, `npm run lint`, `npm test`,
  `npm run build` pass. Live checks correctly report provider status according
  to current network reachability; supplemental is NOT_CONFIGURED when no keys
  are present.

### Priority 5 evidence (2026-07-27)

- `scripts/uiSyntheticAudit.mjs` now starts an isolated server when needed,
  uses Playwright Edge/default resolution, and writes all screenshots/reports
  under `_qa/ui_audit/`.
- `tests/visual-layout.mjs` now uses repository-relative `_qa/visual-layout/`,
  configurable URL/browser settings, and can self-start an isolated server.
- Added `npm run audit:visual-layout`.
- Synthetic browser smoke passed: all 10 left-rail pages, right-sidebar
  absence, settings flow, signal drawer, all four drawer tabs, and zero
  non-synthetic console/page errors.
- All generated screenshots are below 1 MB.
- Live visual-layout runs remain explicitly sensitive to exchange
  reachability; unavailable/degraded results are recorded rather than hidden.

No item in this backlog authorizes live trading or weakening fail-closed
behavior.

## Documents Kept As Active Inputs

- `Doc/SUPPLEMENTAL_INTELLIGENCE.md`
- `Doc/automation/DECISION_MEMORY_DATA_CONTRACT.md`
- `Doc/automation/AUTONOMOUS_THRESHOLD_LEARNING_ENGINE.md`
- `Doc/automation/FAST_MINUTE_SELF_ADAPTATION_ENGINE.md`
- `Doc/automation/LOAD_AND_AUTOMATION_STRESS_PLAN.md`
- `Doc/automation/ML_SIGNAL_MODEL_METHODOLOGY.md`
- `Doc/automation/DIRECTION_DIVERGENCE_POSITION_DETECTOR.md`
- `Doc/automation/direction_divergence/DIRECTION_DIVERGENCE_ANALYSIS_v1.md`
- `Doc/automation/ml_dataset/VALIDATION_REPORT_v1.md`
- `Doc/CURSOR_SYSTEM_DEFICIENCY_REMEDIATION_PROMPT.md`
- `Doc/plans/active/V20_VISUAL_PARITY_REMEDIATION_PLAN.md`
- `README.md`
- `Doc/README.md`
- `Refrence.md`

## Documents Treated As Historical Only

- `_archive_docs_historical_20260727.zip`
- `Doc/CONSOLIDATION_MANIFEST.json`
- `Doc/ARCHIVE_CHECKSUMS.json`

Historical documents are useful for provenance, but they must not override this
plan or the current code.

## Progress Log

### 2026-08-03

- **Trading Logic Upgrade — Phase 1 complete:** Full module inventory, current vs
  target flow diagrams, and source-verified audit findings documented in
  [`TRADING_LOGIC_UPGRADE_PHASE1_INVENTORY.md`](TRADING_LOGIC_UPGRADE_PHASE1_INVENTORY.md).
  Confirmed dual-engine split (`scoring.ts` live vs `scannerCore.ts` replay),
  disconnected SMC derivation, proxy replay inputs, false MTF confluence, and
  offline advanced modules. No code changes in this phase. Next: Phase 2
  Canonical Decision Adapter.
- **Trading Logic Upgrade — Phase 2 partial:** Canonical Decision Adapter,
  scanner config policy, SMC adapter, live shadow on candidates/symbol routes,
  structured MTF confluence, feature-quality metadata, PROXY_REPLAY labeling,
  direction asymmetry fixes. `npm test` and `npm run build` pass.
- **Trading Logic Upgrade — Phase 3 initial:** Trade Plan layer (`tradePlan.ts`)
  with geometry/cost validation; shadow comparison logs persisted to decision
  memory (browser + server mirror); symbol API returns `tradePlanLong`/`tradePlanShort`.

### 2026-07-27

- Phase A completed: active documentation consolidated and irrelevant historical
  documents archived.
- Phase B completed: optional Decision Memory mirror, batch sync, indexes, and
  status/query endpoints verified.
- Phase C partially completed: accepted lifecycle outcomes attach by `signalId`;
  real browser export gate remains open.
- Phase C2 started: pure direction/divergence classifier and shadow Decision
  Memory metadata wiring are implemented; outcome analysis remains pending.
- Phase C2 analysis pipeline added: `directionDivergenceAnalysis.ts`,
  `analyzeDirectionDivergence.mts`, nine unit tests, and generated reports under
  `Doc/automation/direction_divergence/`. Latest gate verdict: `INSUFFICIENT_DATA`
  (zero resolved accepted rows; no browser export).
- Phase C rejected replay path added: `rejectedCandidateReplay.ts`,
  `useRejectedCandidateReplay.ts`, `replayRejectedCandidates.mts`, and unit tests.
  Shadow-only delayed outcomes for rejected SHORT/LONG candidates; not mixed into ML v1.
- Phase D partially completed: pure TypeScript shadow ML dataset prep, logistic
  regression trainer, auditable model version file, walk-forward validation,
  and shadow comparison reports added. Latest gate verdict: `INSUFFICIENT_DATA`
  (no browser export; training skipped).
- Phase E partially completed: read-only Operations dashboard added for provider
  health, Decision Memory mirror state, adaptive audit events, and shadow ML
  status. The endpoint and UI do not alter scanner, lifecycle, sizing, stop,
  or execution behavior.
- Phase E.1 completed: shared operations-status contract (`operationsStatus.ts`),
  hardened `GET /api/operations/status`, frontend stale/degraded handling,
  contract tests, and operations smoke/panel audit scripts. Shadow ML remains
  audit-only; no live-trading path was enabled.
- Phase E.2 completed: deterministic adaptive-learning stress harness,
  versioned PASS/FAIL evidence, operations schema v2 integration, and frontend
  Adaptive Stress Evidence panel. Seed 42 passed 12/12 safety checks over 5,400
  candidates; this synthetic evidence is excluded from Decision Memory/ML data.
- Phase E.3 completed: provider-routing failure-injection stress harness,
  versioned evidence, operations schema v3 integration, and Provider Routing
  Evidence panel. 16/16 checks passed across 12 failure-mode scenarios.
- Phase E.4 completed: load-matrix summary ingestion (schema v4),
  `Load Matrix Evidence` Ops panel, contract tests, smoke/audit updates.
  Existing artifacts under `load_matrix_100/` and `load_matrix_fast_1m_5m/` are
  surfaced; evidence remains synthetic.
- Documentation corrected: Phases C, C2, and D are **code complete**; remaining
  work is the shared browser Decision Memory export data gate plus a separate
  safety review before any live gate changes.
- UI session: component extraction (SignalCard, OverviewCommandDeck,
  DesktopHeader, MobileCommandStack) and Level HUD polish completed.
- Decision Memory export bridge: `GET /api/decision-memory/export`,
  `npm run export:decision-memory`, shared `buildDecisionMemoryExportPayload`,
  Resolved stat on Decision memory page, post-export banner guidance.
- System deficiency audit recorded: build, tests, and KuCoin core are healthy;
  duplicated provider polling, server-boundary hardening, dependency updates,
  health semantics, stale-budget telemetry, and portable browser verification
  are now tracked as the next hardening backlog.
- Hardening Priority 1 completed: shared `marketDataCoordinator` (TTL, in-flight
  dedupe, diagnostics) wired through `marketData.ts`; snapshot-level cache added;
  focused tests pass. Baseline now 26 files / 209 tests. Priorities 2–5 remain open.
- Hardening Priority 2 completed: CORS allowlist, optional operator token, CSRF
  header for browser POSTs, mutation rate limits, SSRF guards on external-source
  test, configurable bind host, secret config gitignore, and client `apiMutate`
  helper. Baseline 27 files / 217 tests. Priorities 3–5 remain open.

### 2026-08-03

- V20 visual parity review completed: ran the actual app (`npm install` +
  `npm run dev`) and captured all 8 v20 reference routes at the canonical
  1368×753 viewport, pixel-diffed against `Doc/reference/v20/*.png`, and
  cross-checked every discrepancy against `ReferenceViews.tsx` /
  `WorkspaceShell.tsx` source. This closes the gap left by the prior V20
  session, which could not install dependencies and therefore never
  visually verified its own output (see `Doc/release-history/v20/MERGE_REPORT.md`,
  "Important limitation").
- Findings and a phased fix plan recorded in
  `Doc/plans/active/V20_VISUAL_PARITY_REMEDIATION_PLAN.md`; evidence
  screenshots in `Doc/qa/v20-parity-review/`.
- Confirmed real, code-level gaps (Class A): header icon row is missing a
  Settings shortcut; trading-mode badge reads "DEMO TRADING" vs the
  reference's "PAPER TRADING"; clock format is reversed; Watchlist filter
  row is missing its "+" custom-tab button; Watchlist's default (no
  selection) Asset Assistant state omits Key Facts/Tags/timeframe tabs;
  Analytics' P&L Heatmap and Monthly Performance render as bare empty
  cards instead of a structured empty state; Help's tutorial cards use
  flat color fills instead of thumbnail imagery.
- Confirmed most remaining pixel diff (8-13% per page) is empty-state
  rendering caused by this sandbox having no outbound network access to
  KuCoin/Binance, not missing functionality — table/gauge markup is
  correctly wired to live data sources in every case checked. This needs
  re-verification on a machine with live market access before being
  considered closed.
