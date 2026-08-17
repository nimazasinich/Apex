# APEX V29 — Strategy Library and 1368×753 UI Implementation Report

## Implemented

- Fixed Strategy Studio to the 1368×753 CSS-pixel base viewport.
- Preserved exact master geometry: 170px sidebar, 55px top bar, 222px collections, 667px strategy workspace, 309px insights.
- Implemented a typed strategy registry with the twelve research strategies plus the non-breaking production scanner baseline.
- Implemented six Wave-1 runnable strategies:
  - Crypto Multi-Alpha Long/Short Stack
  - Adaptive Long/Short Trend Portfolio
  - Funding-Basis Carry with Liquidity Filters
  - Opening-Range VWAP Relative-Volume Breakout
  - Volatility Squeeze Trend-Volume Expansion
  - Multi-Timeframe VWAP Pullback Reacceleration
- Preserved Wave 2–4 strategies as explicit blocked registry entries when their required data or rule sign-off is unavailable. They are not faked with candle proxies.
- Added deterministic bespoke replay engines, a scanner-preset adapter, validation gates, and conditional ranking.
- Added API routes for strategy listing, details, validation, and strategy-aware backtests.
- Added strategy selection to Backtesting and manual-only execution/stale-result behavior.
- Added Strategy Studio interactions: collection/filter selection, model selection, details, comparison, save, manual backtest, and validation.
- Tuned Backtesting for 1368×753 so setup and insights fit without side-panel scrolling. Backtest history is summarized to the two most recent runs; full history remains a separate action.

## QA automation

Run:

```bash
npm run qa:strategy-library
npm run qa:strategy-engines
npm run qa:ui-1368
```

The UI capture harness uses the project DOM fixtures and the current project CSS. It captures both Strategy Studio and Backtesting at exactly 1368×753 and fails when the page or side panels overflow.

## Passed checks

- 12 research strategy IDs are present and unique.
- All six Wave-1 strategy definitions are registered.
- Baseline strategy remains available.
- Strategy list/detail/validation routes exist.
- Backtesting sends the selected strategy ID.
- Strategy execution remains manual-only.
- Four bespoke strategy runners return the expected replay shape and are deterministic on identical input.
- Strategy Studio page: 1368×753, no document overflow.
- Backtesting page: 1368×753, no document overflow, setup panel fits, insights panel fits.

## Environment limitation

A complete npm dependency installation/build could not be run in the current execution environment because some packages are unavailable from its registry mirror. The modified TypeScript/TSX files passed TypeScript syntax transpilation, route/library static checks passed, bespoke engines were runtime-smoke-tested, and both target pages passed Playwright geometry and screenshot QA through the dependency-light project harness.
