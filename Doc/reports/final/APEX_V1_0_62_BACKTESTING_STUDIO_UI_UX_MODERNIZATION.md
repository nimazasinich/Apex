# APEX Unified Terminal v1.0.62 — Backtesting Studio UI/UX Modernization

## Summary

v1.0.62 upgrades the existing Backtesting page in place into a clearer Backtesting Studio while preserving the real application shell, routing, server backtest contract, strategy handoff, optimization flow, export/history surfaces, and research-only safety boundary.

The default page mode is now Smart Mode. Manual / Expert mode remains available for exact controls. Smart Mode uses the same canonical `/api/market/backtest` route; it does not fabricate results, does not submit live orders, and stores a local resumable checkpoint after completed smart iterations.

## Files changed

- `package.json`
- `package-lock.json`
- `VERSION`
- `README.txt`
- `public/manifest.json`
- `public/sw.js`
- `public/build-info.json`
- `src/pages/backtesting/BacktestingPage.tsx`
- `src/pages/backtesting/BacktestRunBuilder.tsx`
- `src/pages/backtesting/BacktestingPage.css`
- `src/pages/backtesting/backtestingTypes.ts`
- `src/pages/backtesting/backtestCoverage.ts`
- `src/pages/backtesting/BacktestCoverageCredibilityPanel.tsx`
- `src/pages/backtesting/BacktestEvidenceRail.tsx`
- `scripts/qa/verifyBacktestingStudioModernization.mjs`
- `Doc/reports/CURRENT_STATUS.md`
- `Doc/reports/final/APEX_V1_0_62_BACKTESTING_STUDIO_UI_UX_MODERNIZATION.md`

## Preserved functionality

Preserved Backtesting page routing, manual run builder, strategy selection, market selection, timeframe selection, direction selection, history bars/horizon, max hold, display capital, risk profile, cost assumptions, parameter overrides, canonical backtest run, cancellation, run history, output overview, trades table, evidence notes, data quality, runtime evidence, export, fullscreen evidence area, Strategy Studio handoff, Smart Optimization, Smart Autopilot, Research Matrix, Liquidity Hunter Replay, and research-only safety copy.

## Smart Mode behavior

Smart Mode is the default. It displays:

- Smart Setup / Auto Configure summary
- one primary Start / Stop control
- Resume when a real local checkpoint exists
- current phase/status
- iteration count
- elapsed time
- best result and latest result separately
- no-improvement counter
- last change
- next planned action
- bounded stop conditions

Smart Mode uses local persistence key:

```text
apex:backtesting-smart-checkpoint:v1
```

A smart iteration calls the canonical backtest endpoint, scores the real result, stores best/latest checkpoint data, then invokes the existing robust optimization path for the next reviewed/promoted configuration. It remains bounded and user-stoppable.

## Manual / Expert mode

Manual / Expert mode keeps exact advanced controls reachable in the existing builder:

- strategy
- market
- timeframe
- requested history bars
- max hold
- direction
- display capital
- risk profile
- strategy parameters
- cost assumptions
- robust optimization panel
- presets
- manual Run Backtest / Reset / Cancel controls

## Coverage and credibility

Added a prominent Run Coverage & Credibility panel that clearly distinguishes:

- requested candles
- returned candles
- used candles
- executable candles
- coverage percentage
- missing candles
- actual first/last timestamp
- timeframe
- provider/source
- warm-up bars
- closed-candle policy
- full/partial/poor/unavailable history states

Partial provider history is explicitly labelled as partial and is not presented as a complete backtest.

## Evidence rail

Added a right-side Backtesting evidence rail inside the Backtesting page content with:

- Data Quality
- Execution Assumptions
- Warnings & Limitations
- Export / Save Report
- Run History

Rail actions use existing handlers only: export, evidence tab switching, runtime tab switching, data-quality tab switching, and local run-history view.

## Verification executed

PASS:

- `node scripts/qa/verifyBacktestingStudioModernization.mjs` — 17/17 PASS
- `node scripts/qa/verifyBacktestingWorkspace.mjs` — 25/25 PASS
- `node scripts/qa/verifyBacktestingReferenceOptimization.mjs` — 19/19 PASS
- `node scripts/qa/verifySmartAutopilot.mjs` — 21/21 PASS
- `node scripts/qa/verifyStrategyPageModernization.mjs` — 22/22 PASS
- `node scripts/qa/verifyTradingPageModernization.mjs` — 16/16 PASS
- `node scripts/qa/verifyTradingDrawerDocking.mjs` — 13/13 PASS
- `node scripts/qa/verifyFeaturePreservation.mjs` — PASS
- `node scripts/qa/verifyResearchWorkspaceLayout.mjs` — 15/15 PASS
- `node scripts/gates/checkRootContract.mjs` — PASS
- `node scripts/gates/checkVersionIdentity.mjs` — PASS
- `node scripts/gates/checkBuildIdentity.mjs` — PASS
- `node scripts/gates/checkNoSecretsInRelease.mjs --source-only` — PASS
- `node scripts/gates/checkTestInventory.mjs` — 125 files / 688 tests
- Dependency-light TS/TSX/MTS/CTS syntax scan — 562 files / 0 syntax errors
- Dependency-light JS/MJS/CJS syntax scan — 95 files / 0 syntax errors

BLOCKED:

- `npm run lint` was attempted and blocked before type-checking the project because this clean package has no installed locked dependencies and TypeScript first reports missing `vite/client`.
- Browser/Vite/Playwright visual verification was not executed in this sandbox because the dependency-complete runtime is unavailable.

## Not claimed

This release does not claim live-exchange validation, authenticated exchange execution, full Vite build, full Vitest, Playwright visual verification at 1368×753, long-running canary, or real ML calibration. Those remain target-machine tasks requiring installed dependencies, network access, credentials, and real runtime data.
