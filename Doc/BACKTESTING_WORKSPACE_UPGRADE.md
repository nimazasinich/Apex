# APEX Backtesting Workspace Upgrade

## Delivered

- Added a dedicated **Backtesting** destination to the primary left navigation.
- Added a full-resolution Backtesting Lab that follows the existing APEX light/dark visual system.
- Connected the page to the real `GET /api/market/backtest` replay endpoint.
- Added strategy, risk/cost, and data-quality controls.
- Added cost-adjusted metrics, equity and drawdown charts, outcome distribution, replay trades, validation checks, rejection reasons, and JSON report export.
- Expanded the shared `BacktestResult` contract so the UI can consume real replay details without fabricated readiness buckets.
- Changed insufficient historical data to a truthful HTTP 503 result instead of returning a successful synthetic-looking report.

## Layout repairs

### Markets

The market toolbar now remains inside its panel, uses the available horizontal space, and allows only the table body to scroll when the table is wider than its viewport. The page and panel themselves no longer create an unintended horizontal scrollbar.

### Settings

The three settings regions now use explicit grid areas. The center and right panels have protected minimum widths, hidden horizontal overflow, independent vertical scrolling where necessary, and responsive stacking at smaller widths. This prevents the Security Status panel and lower cards from being clipped into a half-visible column.

## Main files

- `src/pages/backtesting/BacktestingPage.tsx`
- `src/App.tsx`
- `src/components/workspace/WorkspaceShell.tsx`
- `src/app/shell/AppShell.tsx`
- `src/services/apexNextMarketRoutes.ts`
- `src/types.ts`
- `src/index.css`
- `scripts/qa/verifyBacktestingWorkspace.mjs`

## Verification

- Static workspace contract: 11/11 checks passed.
- TypeScript/TSX syntax transpilation: passed for all changed source files.
- CSS brace validation: passed.
- Browser layout checks at 1672 px, 1368 px, and 1200 px: no page-level horizontal overflow for the repaired Markets and Settings layouts.
- Backtesting preview at 1600 × 900: body, page, and right sidebar widths matched their scroll widths.

The dependency registry available during packaging did not contain a locked npm artifact required by the test toolchain, so a clean `npm ci`/production rebuild could not be executed in this environment. No `node_modules` or stale build output is included in this source delivery.
