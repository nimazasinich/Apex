# APEX V20 Integrated Upgrade Completion Report

Generated: 2026-08-03

## Scope

This upgrade closes the active broken-import and incomplete-contract gaps in the
APEX V20 archive while preserving the current V20 UI/backend architecture. The
three supplied TypeScript files were treated as evidence and partial starting
points; they were not copied blindly. Their contracts were reconciled against
all active call sites, historical feature schemas, operations reports, and
current safety boundaries.

## Restored and upgraded subsystems

### Appearance

- Added a centralized `light | dark | system` preference service.
- Kept persisted preference separate from resolved appearance.
- Applied the resolved theme before React starts to prevent an incorrect-theme
  flash.
- Added live operating-system theme change handling.
- Reused the existing V20 light design as the canonical light palette.
- Added a scoped dark semantic palette and hardened it against inherited
  `!important` light declarations.
- Kept browser `theme-color` metadata synchronized with the resolved theme.
- Preserved reduced-motion behavior.

### Decision and adaptive-learning contracts

- Expanded `SignalDecisionLog` with the decision-time price/ATR and complete SMC,
  replay, and audit metadata needed by existing scripts.
- Restored `AdaptiveMarketRegime`, including an explicit `UNKNOWN` state.
- Added deterministic, bounded adaptive-threshold learning with normalized score
  weights, manual-mode immutability, guardrails, and audit records.
- Added deterministic adaptive-learning stress evidence with strict input
  validation and 12 safety invariants.

### Direction and rejected-candidate analysis

- Added direction-aware LONG/SHORT divergence classification.
- Restored historical helper exports, deterministic chronological splits,
  exclusions, sample gates, and output fields.
- Added shadow-only rejected-candidate replay with honest eligibility checks,
  ATR-based geometry, time-horizon handling, and no use of post-horizon prices.

### Shadow ML

- Restored the exact frozen 100-feature `ml_features_v1` contract already present
  in the project artifacts.
- Added strict numeric, boolean, and categorical validation; missing data is
  excluded rather than silently imputed.
- Added leakage exclusions and deterministic chronological dataset preparation.
- Added a pure TypeScript standardized logistic-regression baseline.
- Added model metadata, schema validation, integrity checksum, scoring, training
  gates, split metrics, walk-forward metrics, and rule-vs-model shadow
  comparison.
- Training remains audit-only and cannot modify scanner or execution gates.

### Workspace and account integration

- Replaced watchlist “show more” behavior with real pagination, searchable
  category filters, and locally persisted favorites.
- Removed the fabricated market-cap fallback; the table now displays only the
  exchange-provided open-interest value or an honest unavailable marker.
- Added real Orders pagination, side/type/status/search filters, and a typed
  versioned order-draft transfer contract.
- Separated Duplicate from Prepare Replacement. Replacement drafts use only the
  remaining quantity and never imply that the original order was modified or
  cancelled automatically.
- Connected transferred drafts to the real Trading order ticket, including
  symbol selection and preservation of the source limit price.
- Replaced hard-coded leverage-distribution percentages with calculations based
  on current verified position notional.
- Added alert search/type/status filters, persistence-compatible builder fields,
  trigger-once behavior, a one-minute repeat guard, readiness-tier ordering,
  event counters, and portfolio margin/risk evaluation.
- Added event-level realized P&L to account activities. History and tax CSVs now
  use ISO timestamps, UTF-8 BOM/Excel-safe escaping, and never repeat the account
  aggregate P&L on every row.
- Added terminal-setting validation before persistence and demo/live use.
- Added focused tests for pagination, order draft migration, settings validation,
  CSV escaping, and event-level realized-P&L normalization.

### Provider routing and operations

- Added deterministic provider-routing stress coverage for direct success,
  timeout, geo restriction, rate limiting, upstream failure, malformed response,
  unsupported symbol, proxy unavailability, all routes unavailable, authentic
  last-known-good degradation, cooldown, and recovery.
- Preserved fail-closed semantics: unavailable data remains null and is never
  presented as a fabricated neutral value.
- Restored the package scripts required by the existing automation and operations
  status parsers.

## Source changes

Added:

- `src/lib/theme.ts`
- `src/lib/workspaceUi.ts`
- `src/services/adaptiveLearningStress.ts`
- `src/services/adaptiveThresholdEngine.ts`
- `src/services/directionDivergenceAnalysis.ts`
- `src/services/mlDatasetPreparation.ts`
- `src/services/mlFeatureExtractor.ts`
- `src/services/mlLogisticRegression.ts`
- `src/services/providerRoutingStress.ts`
- `src/services/rejectedCandidateReplay.ts`
- `src/services/shadowMlComparison.ts`
- `src/services/shadowMlModel.ts`
- `src/services/shadowMlTraining.ts`
- `src/tests/restoredDecisionSubsystems.test.ts`
- `src/tests/theme.test.ts`
- `src/tests/workspaceUi.test.ts`

Integrated/updated:

- `index.html`
- `package.json`
- `src/main.tsx`
- `src/index.css`
- `src/types.ts`
- `src/components/workspace/ReferenceViews.tsx`
- `src/components/workspace/AccountViews.tsx`
- `src/services/workspaceInsights.ts`
- `src/App.tsx`
- versioned automation reports under `Doc/automation/`

## Verification evidence

### Repository integrity

- Original archive files compared: 325
- Upgraded project files before packaging: 344
- Original files missing from upgraded copy: 0
- Added source/test/report files: 19
- Local import sites checked: 309
- Unresolved local imports: 0

### Static and type verification

- TypeScript/TSX/MTS/CTS files syntax-transpiled: 165
- Syntax errors: 0
- Strict targeted TypeScript check for all restored modules and their CLI call
  sites: PASS
- Focused TypeScript check for App, account workspace, reference workspace, and
  their resolved local dependencies: PASS
- Workspace helper and normalized-account strict TypeScript check: PASS

### Deterministic subsystem verification

A compiled runtime verification covered:

- exact 100-feature extraction and ordering
- missing and invalid categorical data rejection
- leakage exclusions
- chronological 70/15/15 dataset splits
- logistic training and prediction
- training-split class-support gate
- model checksum tamper detection
- shadow comparison
- LONG and SHORT divergence behavior
- replay WIN, LOSS, UNKNOWN, and EXPIRED behavior
- manual adaptive configuration preservation
- deterministic adaptive output and normalized weights
- invalid stress input rejection
- all provider-routing scenarios
- pagination boundaries and ranges
- legacy and versioned order-draft transfer parsing
- replacement remaining-quantity behavior
- terminal settings validation
- CSV escaping and UTF-8 output
- event-level realized-P&L normalization

Result: PASS.

### Product contracts

- V19 product contract: 10/10 PASS
- V20 reference contract: 23/23 PASS

### Automation evidence

- Adaptive learning stress: PASS, 12/12 safety checks, 5,400 candidates
- Provider routing stress: PASS, 16/16 checks, 12 scenarios
- Operations-status smoke contract: PASS (`ok: true`, schema v5)
- ML dataset validation: correctly reports `INSUFFICIENT_DATA` because no real
  Decision Memory browser export is present
- Direction analysis: correctly reports `INSUFFICIENT_DATA` for the same reason
- Shadow training: correctly remains blocked by the data gate
- Shadow comparison: correctly reports `NO_MODEL` while training is blocked

These data-dependent states are intentional safety behavior, not placeholder
successes.

## Environment limitation

A clean native dependency install could not complete in this execution
environment. The configured internal npm proxy does not provide all packages in
the lockfile, and direct access to the public npm registry timed out. The failed
install left a partial `node_modules`, which was removed before packaging.

Therefore the dependency-backed Vitest command and Vite production bundle could
not be honestly re-executed here. This is external to the source tree. In place
of a false success claim, verification used:

- 165-file TypeScript syntax transpilation
- strict targeted TypeScript checks for the restored subsystems
- focused UI TypeScript checks with external-library declaration shims
- deterministic compiled runtime assertions for the ML/decision and workspace
  subsystems
- local import graph analysis
- the repository's dependency-free V19 and V20 product contract suites

In an environment with a complete npm registry, run:

```bash
npm ci
npm run lint
npm test
npm run qa:v19-contract
npm run qa:v20-contract
npm run build
```

## Safety and upgrade guarantees

- No original file was removed.
- No random placeholder model output was introduced.
- No missing feature is converted to an invented zero.
- No shadow ML output is connected to live execution.
- No unavailable provider result is converted into fabricated market data.
- No rejected-candidate counterfactual is mixed into accepted-trade supervised
  training.
- No order draft is represented as a completed modification or automatic cancel.
- No account-level realized P&L total is repeated as a per-event tax value.
- Existing UI reference contracts remain intact.
