# APEX 1.0.21 Source Delivery Status

## Included

- Dedicated Backtesting Lab page and left-sidebar navigation item.
- Connected replay controls using the existing `/api/market/backtest` route.
- Strategy, risk/cost and data-quality tabs.
- Cost-adjusted KPI cards, equity curve, outcomes, drawdown, trade table, validation cards and JSON export.
- Markets layout repair to keep the toolbar inside the panel and eliminate page-level horizontal overflow.
- Settings grid repair so the center and context panels use their full width and scroll vertically without half-hidden content.
- Responsive behavior for desktop, compact desktop, tablet and mobile widths.
- UI preview, layout measurements and static QA reports.

## Validation completed

- Backtesting workspace contract: 11/11 passed.
- TypeScript/TSX syntax transpilation: 195 files checked, 0 syntax diagnostics.
- CSS structure validation: balanced braces and 0 parse errors.
- Browser-layout measurements: no page-level horizontal overflow in the tested Markets, Settings and Backtesting viewports.
- Secret scan: no credential-bearing `.env`, `.env.txt` or `.external-api-sources.config.json` files included.

## Build status

This package is the clean source delivery. The packaging environment's npm mirror is missing a locked test-toolchain artifact, so dependencies could not be restored and a new production `dist/` could not be generated here. The archive intentionally excludes `node_modules` and any stale `dist/`.
