# APEX Backtesting Lab — 1368×753 Completion Report

## Delivered scope

The Backtesting Lab and shared desktop shell were recalibrated against the supplied reference at the canonical **1368×753 CSS-pixel viewport**. The page uses the full available frame without document-level or side-panel scrollbars at that viewport.

The supplied `BacktestingPage.tsx` and `BacktestingPage.css` were used as implementation inputs and integrated into the existing APEX strategy-library project rather than replacing its architecture.

## Main implementation changes

- Three-column Backtesting Lab: Strategy Setup, Results, and Insights.
- Desktop shell geometry aligned to the reference, including sidebar, top bar, search field, content gutters, panel widths, and vertical section boundaries.
- Compact setup controls so all configuration, realistic costs, Run Backtest, and strategy details remain visible in one frame.
- Results workspace with cumulative selector, interactive equity/drawdown charts, metrics, recent trades, fullscreen mode, settings menu, and auditable JSON export.
- Real replay route preserved; no local synthetic performance generator was introduced.
- Commission, slippage, and funding assumptions are applied to displayed trade returns.
- Keyboard-accessible recent trade rows and focus states.
- Responsive single-column fallbacks remain available below the desktop contract.
- Original APEX SVG logo is rendered directly and remains byte-exact.

## QA evidence

- Strict 1368×753 geometry capture: **PASS**.
- Document/body dimensions: **1368×753**, with no document overflow.
- Backtesting setup/results/insights side panels: **fit without scrollbars**.
- Backtesting workspace contract verification: **18/18 checks passed**.
- Strategy library verification: **PASS** (12 research strategies, routes, selector, validation/ranking contracts).
- Strategy-engine deterministic smoke test: **PASS**.
- TypeScript syntax transpilation for the modified page and core integration files: **PASS**.

Generated evidence is stored under:

- `qa/screenshots/backtesting-1368x753.png`
- `qa/screenshots/apex-1368-geometry-report.json`
- `QA/backtesting-workspace-qa.json`
- `qa/screenshots/strategy-library-verification.json`
- `qa/screenshots/strategy-engine-smoke.json`
- `qa/reference/backtesting-reference-1368x753.png`

## Packaging note

The connected execution environment could not install the complete npm dependency graph because its package registry mirror did not provide required packages including Vite/Vitest. Therefore a production `dist` bundle was not generated here. Source-level syntax checks and all dependency-free QA suites listed above passed.

The local runtime file `.external-api-sources.config.json` is intentionally excluded from the delivery archive to avoid packaging credentials or machine-specific provider configuration. The safe `.external-api-sources.config.example.json` template remains included.
