# APEX Unified Terminal v1.0.66 — UI Polish and Backtesting Space Refinement

## Scope

This release is a focused presentation pass over the already-modernized workspace pages. It does not change exchange execution, trading engines, strategy engines, API contracts, Smart Backtesting orchestration, Smart Autopilot, Strategy Studio handoff, or global shell navigation.

## Primary visual fixes

- Backtesting Studio now uses a cleaner command header so the mode switch, connected-workspace shortcuts, and manual-research warning no longer feel like floating or crowded cards.
- Backtesting Studio uses a more balanced three-column grid: setup, evidence/results, and right evidence rail. The center evidence area receives more usable width while the rail remains readable.
- Backtesting evidence cards, coverage cards, hero state, and Smart Mode cards have more consistent radius, shadows, focus rings, and calm APEX green/teal treatment.
- Trading rail icon styling is normalized again with a unified APEX teal/navy palette and less mismatched multicolor treatment.
- Trading Account Activity collapsed/open behavior from v1.0.65 is preserved.
- Strategy Studio gets a small polish alignment pass for card shadows, focus rings, and hover states so it visually matches Trading and Backtesting.

## Files changed

- `package.json`
- `package-lock.json`
- `VERSION`
- `README.txt`
- `public/manifest.json`
- `public/sw.js`
- `public/build-info.json`
- `src/pages/backtesting/BacktestingPage.tsx`
- `src/pages/backtesting/BacktestingPage.css`
- `src/components/trading/TradingWorkspace.css`
- `src/pages/strategies/StrategyStudioReference.css`
- `scripts/qa/verifyUiPolishV1066.mjs`
- `Doc/reports/CURRENT_STATUS.md`
- `Doc/reports/final/APEX_V1_0_66_UI_POLISH_AND_BACKTESTING_SPACE_REFINEMENT.md`
- `Doc/DOCUMENTATION_INDEX.md`
- `Doc/DOCUMENTATION_INDEX.json`

## Verification executed

PASS:

- `node scripts/qa/verifyUiPolishV1066.mjs` — 10/10
- `node scripts/qa/verifyBacktestingStudioModernization.mjs` — 17/17
- `node scripts/qa/verifyTradingActivitySlideout.mjs` — 12/12
- `node scripts/qa/verifyTradingRailSlideout.mjs` — 12/12
- `node scripts/qa/verifyTradingPageModernization.mjs` — 16/16
- `node scripts/qa/verifyTradingDrawerDocking.mjs` — 13/13
- `node scripts/qa/verifyStrategyPageModernization.mjs` — 22/22
- `node scripts/qa/verifyStrategyStudioReference.mjs` — 25/25
- `node scripts/qa/verifySmartAutopilot.mjs` — 21/21
- `node scripts/qa/verifyFeaturePreservation.mjs`
- `node scripts/qa/verifySystemIntegration.mjs` — 12/12
- `node scripts/qa/verifyMaximalMergeSafety.mjs` — 30/30
- `node scripts/gates/checkRootContract.mjs`
- `node scripts/gates/checkVersionIdentity.mjs`
- `node scripts/gates/checkBuildIdentity.mjs`
- `node scripts/gates/checkNoSecretsInRelease.mjs --source-only`
- `node scripts/gates/checkTestInventory.mjs` — 125 files / 688 tests
- ZIP integrity verification

Not executed in this sandbox:

- Browser/Vite/Playwright visual verification.
- Live exchange validation, authenticated order execution, long-running canary, and real ML calibration.

## Notes

The changes are scoped to presentation and page layout polish. They intentionally preserve local-first safety behavior, research-only boundaries, and the existing Windows/offline dependency restore workflow from v1.0.63.
