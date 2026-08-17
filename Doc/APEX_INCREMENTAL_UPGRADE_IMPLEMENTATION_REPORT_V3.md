# APEX Incremental Trading Logic Upgrade — Implementation Report V3

## Completed

- Unified live, proxy replay and production-input replay behind Canonical Decision Adapter V2.
- Connected derived Smart Money Context to canonical live and replay evaluation with explicit availability states.
- Added production-input replay with per-bar critical input quality and separate aligned/downgraded metrics.
- Corrected independent 15m/1h live acquisition and the symbol-detail interval mapping.
- Preserved ROC behavior, renamed it honestly, and added a versioned real MACD shadow comparison.
- Added feature-quality-aware score normalization and feature-completeness guards.
- Added authoritative QStruct bounds and visible configured/effective replay overrides.
- Added symmetrical LONG/SHORT evaluation semantics.
- Added shared Trade Plan with integrity, expiry, geometry and net-cost validation.
- Added central Risk Governor across demo, connected live, manual testnet and replay paths.
- Added durable connected-live execution intents before exchange submission.
- Added reconciliation by client order ID after uncertain live and testnet submission results.
- Added individual fill persistence when REST fill history is available.
- Added protective-order request/verification state instead of claiming protection without evidence.
- Added adaptive-threshold proposal persistence, evidence gates, authenticated manual approval and rollback.
- Added ML governance report for calibration, reliability, drift and shadow promotion eligibility.
- Added explicit module classification registry and operations endpoint.
- Extended the existing order ticket and candidate card without creating a new page.

## Files added

- `src/services/riskGovernor.ts`
- `src/services/liveExecutionIntentStore.ts`
- `src/services/mlGovernance.ts`
- `src/services/adaptiveThresholdGovernance.ts`
- `src/services/tradingModuleRegistry.ts`
- `tests/riskGovernor.test.ts`
- `tests/canonicalReplayUpgrade.test.ts`
- `tests/adaptiveThresholdGovernance.test.ts`
- `Doc/APEX_TRADING_LOGIC_INVENTORY_V3.md`
- `Doc/APEX_INCREMENTAL_UPGRADE_IMPLEMENTATION_REPORT_V3.md`

## Principal files modified

- `server.ts`
- `.env.example`
- `.gitignore`
- `src/types.ts`
- `src/lib/scoring.ts`
- `src/services/canonicalDecisionAdapter.ts`
- `src/services/smartMoneyContextAdapter.ts`
- `src/services/scannerConfigPolicy.ts`
- `src/services/backtesting.ts`
- `src/services/apexNextMarketRoutes.ts`
- `src/services/tradePlan.ts`
- `src/services/demoAccount.ts`
- `src/services/connectedExchange.ts`
- `src/services/testnetExecution.ts`
- `src/services/decisionSnapshotLogger.ts`
- `src/services/shadowComparisonPersistence.ts`
- `src/services/mlFeatureExtractor.ts`
- `src/services/accountClient.ts`
- `src/App.tsx`
- `src/components/workspace/GeneralViews.tsx`
- `src/components/workspace/AccountViews.tsx`
- `src/components/CandidatesCard.tsx`

## Architectural decisions

1. The legacy baseline is preserved as live authority while the advanced engine is compared in shadow mode.
2. Replay enters the same canonical contract but remains explicitly separated by input fidelity.
3. Missing inputs never become apparently valid neutral evidence.
4. Trade Plan integrity is rechecked on the server; browser payloads are never trusted as approval.
5. Risk policy is centralized but exchange lot/tick/notional filters remain in their existing adapters.
6. Adaptive thresholds and ML cannot self-promote. Promotion is an auditable operator action.
7. Existing screens are reused. No new page or visual redesign was introduced.

## Operations endpoints added

- `GET /api/operations/trading-modules`
- `GET /api/operations/ml-governance`
- `GET /api/operations/adaptive-thresholds`
- `POST /api/operations/adaptive-thresholds/propose`
- `POST /api/operations/adaptive-thresholds/approve`
- `POST /api/operations/adaptive-thresholds/reject`
- `POST /api/operations/adaptive-thresholds/rollback`
- `POST /api/market/backtest/production-input`

Mutation endpoints remain behind the project’s existing operator-token, CSRF/origin and rate-limit middleware.

## Verification performed

- Strict TypeScript checking was run over the upgraded core decision, replay, planning, risk, execution, ML and adaptive-governance modules using local ambient stubs for unavailable third-party packages.
- All modified TypeScript and TSX files were syntax-transpiled with the installed TypeScript compiler.
- Focused Vitest test files were added for Risk Governor fail-closed behavior, canonical replay labelling/input rejection, and manual adaptive promotion/rollback.

## Verification limitation

A full `npm install`, Vite production build and Vitest run could not be completed in the isolated environment because the dependency registry did not provide required package versions. The source archive does not include `node_modules`. This report therefore does not claim a completed dependency-resolved browser build.

## Remaining exchange-specific hardening

A private KuCoin WebSocket order/fill stream is still required to make push updates the primary order-state source and to verify protective-order activation in real time. Current implementation uses durable intent persistence plus REST reconciliation and correctly labels protection as unverified until exchange evidence is available.
