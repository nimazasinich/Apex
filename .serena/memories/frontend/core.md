# Frontend Core

SPA entry: `src/main.tsx` → `src/App.tsx`. `App` (App.tsx) owns page state (`WORKSPACE_PAGES`, `initialPage`) and renders the shell + the active page. Page constants declared in App.tsx include StrategyPage, BacktestingPage, TradingView.

## Global App Shell / sidebar
- `src/components/workspace/WorkspaceShell.tsx` — shell frame. Exports `WorkspaceShell` (+ `WorkspaceClock`); nav model lives in `navGroups`, `navItems`, `pageLabels`.
- `src/components/NavBar.tsx` — left icon rail: `NavBar` + `RailButton`. Renders the `.apex-sidebar` / `.apex-nav` structure.

## Overview / Dashboard entry point
- `OverviewView` in `src/components/workspace/GeneralViews.tsx` IS the Overview page (not a standalone file in overview/).
- It composes panels from `src/components/overview/`: OverviewKpiStrip, OverviewSignalsPanel, OverviewActivityPanel, OverviewAttentionPanel, OverviewMarketSummary — plus locals in GeneralViews: OverviewStatusStrip, OverviewAutopilotPanel, OverviewDataHealthPanel, TickerStrip. Styles: components/overview/OverviewWorkspace.css.

## Strategy Studio entry point
- `src/pages/strategies/StrategyPage.tsx` (`StrategyPage`). Parts: StrategyModelWorkspace, StrategyDetailPage, StrategyLibraryRail, StrategyEvidenceRail, StrategyWorkflowStepper, StrategyCompareDialog, StrategyArtwork; presentation/policy helpers strategyPresentation.ts, directionPolicy.ts. Styles: StrategyPage.css, StrategyStudioReference.css, StrategyDetailPage.css. Gate: qa:strategy-studio-reference.

## Key source directories
- `src/components/` shared widgets; subdirs `overview/`, `trading/`, `ui/`, `workspace/`.
- `src/pages/<feature>/`: alerts, analytics, backtesting, help, history, orders, portfolio, positions, screener, settings, strategies, watchlist (+ pageTypes.ts, referenceUi.tsx).
- `src/services/`, `src/lib/`, `src/contracts/`, `src/config/`, `src/constants/`, `src/styles/`, `src/utils/`, `src/tests/`; roots App.tsx, main.tsx, types.ts, index.css.
