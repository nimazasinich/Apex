# Frontend Core

SPA entry: `src/main.tsx` → `src/App.tsx`. `App` (App.tsx) owns page state (`WORKSPACE_PAGES`, `initialPage`) and renders the shell + the active page. Page constants declared in App.tsx include StrategyPage, BacktestingPage, TradingView.

## Global App Shell / sidebar
- `src/components/workspace/WorkspaceShell.tsx` — shell frame. Exports `WorkspaceShell` (+ `WorkspaceClock`); nav model lives in `navGroups`, `navItems`, `pageLabels`.
- `src/components/NavBar.tsx` — left icon rail: `NavBar` + `RailButton`. Renders the `.apex-sidebar` / `.apex-nav` structure.

## Overview / Dashboard entry point
- `OverviewView` in `src/components/workspace/GeneralViews.tsx` IS the Overview page (not a standalone file in overview/).
- It composes panels from `src/components/overview/`: OverviewKpiStrip, OverviewSignalsPanel, OverviewActivityPanel, OverviewAttentionPanel, OverviewMarketSummary — plus locals in GeneralViews: OverviewStatusStrip, OverviewAutopilotPanel, OverviewDataHealthPanel, TickerStrip. Styles: components/overview/OverviewWorkspace.css.

## Overview page — CSS-contract history & pixel-QA shell crash
The Overview page went through a diagnose → prove → repair cycle 2026-08-23 after a reported "UI regression" turned out to be a stylesheet/markup contract mismatch, not missing features. Read in this order before touching `OverviewMarketSummary.tsx` / `OverviewWorkspace.css` or the outer app shell:
- Source-level diagnosis of 4 class-name/selector mismatches (icon grid-area collision, orphaned `-chart-wide` rule, invisible breadth bar, 4th stat wrapping) and which reported symptoms were NOT real defects: `mem:frontend/overview_market_summary_css_contract`
- Measured browser confirmation of the same four defects, plus a separate `neutralPct` data bug found while measuring: `mem:frontend/overview_css_contract_runtime_proof`
- The applied fix (all edits scoped to `OverviewWorkspace.css` only) and what is still open: `mem:frontend/overview_css_contract_repair_applied`
- Separate, unrelated crash: the outer `RouteErrorBoundary` swallowing the whole app shell (not just Overview) on 8 pixel-QA routes, root cause, the misdiagnosis that cost two passes, and the fix actually applied: `mem:frontend/pixel_qa_shell_crash`

## Strategy Studio entry point
- `src/pages/strategies/StrategyPage.tsx` (`StrategyPage`). Parts: StrategyModelWorkspace, StrategyDetailPage, StrategyLibraryRail, StrategyEvidenceRail, StrategyWorkflowStepper, StrategyCompareDialog, StrategyArtwork; presentation/policy helpers strategyPresentation.ts, directionPolicy.ts. Styles: StrategyPage.css, StrategyStudioReference.css, StrategyDetailPage.css. Gate: qa:strategy-studio-reference.

## Key source directories
- `src/components/` shared widgets; subdirs `overview/`, `trading/`, `ui/`, `workspace/`.
- `src/pages/<feature>/`: alerts, analytics, backtesting, help, history, orders, portfolio, positions, screener, settings, strategies, watchlist (+ pageTypes.ts, referenceUi.tsx).
- `src/services/`, `src/lib/`, `src/contracts/`, `src/config/`, `src/constants/`, `src/styles/`, `src/utils/`, `src/tests/`; roots App.tsx, main.tsx, types.ts, index.css.
