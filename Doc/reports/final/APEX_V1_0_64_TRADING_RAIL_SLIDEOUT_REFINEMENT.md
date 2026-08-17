# APEX Unified Terminal v1.0.64 — Trading rail slideout refinement

## Purpose

This release fixes the Trading workspace issue where the right-side tool rail and always-mounted execution dock consumed chart and activity-panel space. The rail now starts closed, exposes a visible arrow handle, and slides in only when the user asks for Trading tools.

## User-visible changes

- Trading tools are closed by default to maximize chart and account-activity space.
- A right-edge arrow button opens and hides the Trading toolbox.
- The execution dock is no longer mounted until the user requests inline Ticket or Depth.
- External toolbox requests still open the rail and requested tool.
- Escape closes the open sliding rail when it is not pinned.
- Settings remains a real workspace navigation action.
- The right rail icons were replaced with scoped APEX-style SVG line icons instead of mismatched generic icon styling.
- Rail colors now follow the Trading theme tokens instead of per-icon unrelated accent colors.

## Files changed

- `src/components/workspace/TradingToolbox.tsx`
- `src/components/workspace/AccountViews.tsx`
- `src/components/trading/TradingWorkspace.css`
- `src/lib/tradingLayoutPreference.ts`
- `scripts/qa/verifyTradingRailSlideout.mjs`
- version, manifest, service-worker, build-info, README, and current-status metadata

## Verification

PASS:

- `node scripts/qa/verifyTradingRailSlideout.mjs` — 12/12
- `node scripts/qa/verifyTradingPageModernization.mjs` — 16/16
- `node scripts/qa/verifyTradingDrawerDocking.mjs` — 13/13
- `node scripts/qa/verifyTradingSubmenuRelocation.mjs` — 11/11
- `node scripts/qa/verifyFeaturePreservation.mjs`
- `node scripts/qa/verifyMaximalMergeSafety.mjs` — 30/30
- `node scripts/gates/checkRootContract.mjs`
- `node scripts/gates/checkVersionIdentity.mjs`
- `node scripts/gates/checkBuildIdentity.mjs`
- `node scripts/gates/checkNoSecretsInRelease.mjs --source-only`
- `node scripts/gates/checkTestInventory.mjs`
- focused TypeScript transpilation of the changed Trading files

BLOCKED:

- Browser visual verification was not executed in this sandbox because the dependency/browser runtime remains unavailable here.
- Live exchange and real execution checks were not part of this UI-only refinement.

## Safety note

No trading engine, account execution route, exchange credential handling, Strategy Studio logic, Backtesting logic, or global shell behavior was intentionally changed.
