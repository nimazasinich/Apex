# APEX V22.2 Backtesting Lab Redesign

## What changed

- Rebuilt the backtesting page as a dedicated research workspace instead of a compressed card grid.
- Restored the original `public/apex-logo.svg` asset byte-for-byte and disabled CSS pseudo-element/logo substitutions.
- Added a clear setup rail for market, direction, timeframe, verified candle depth, hold period, capital, risk, fees, and slippage.
- Added smooth animated equity and drawdown curves, interactive hover tooltips, trade-return bars, a draggable Recharts navigator/brush, and range filters.
- Added real result summaries, cost-adjusted equity, trade inspection, return distribution, engine diagnostics, rejection reasons, and auditable JSON export.
- Added keyboard-accessible trade selection.
- Kept the replay honest: insufficient verified history returns an error; the UI does not fabricate trades or performance.
- Repaired market-page horizontal overflow by confining dense table scrolling to the table viewport.
- Repaired the settings desktop grid so the navigation, main settings, and context panel are fully placed and do not create a horizontal scrollbar.

## Logo integrity

`public/apex-logo.svg` SHA-256:

`14fade1463b27402f402028e84be5e6b7b3d8dfe5f35ed1fbbc104d3bfe7b540`

This matches the original Part 3 project asset exactly.

## Main implementation files

- `src/pages/backtesting/BacktestingPage.tsx`
- `src/pages/backtesting/BacktestingPage.css`
- `src/services/apexNextMarketRoutes.ts`
- `src/types.ts`
- `src/main.tsx`
- `src/index.css`
- `src/components/workspace/WorkspaceShell.tsx`
- `src/app/shell/AppShell.tsx`

## QA

- 18/18 focused workspace checks pass.
- 201 TypeScript/TSX/MTS files transpile without syntax diagnostics.
- Both CSS files parse without syntax errors.
- Visual QA previews are included at `QA/backtesting-ui-preview.png` and `QA/backtesting-ui-preview.html`.
