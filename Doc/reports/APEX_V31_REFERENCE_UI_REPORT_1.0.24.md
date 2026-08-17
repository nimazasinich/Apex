# APEX V31 Reference UI Implementation Report — 1.0.24

**Input:** Four user-supplied interface references for Portfolio, Analytics, Positions, and Orders.  
**Baseline:** APEX V31 source `1.0.23`.  
**Result:** Source release `1.0.24`.

## Implemented routes

### Portfolio

- Added `src/pages/portfolio/PortfolioPage.tsx` and made it the active `portfolio` route.
- Implemented the six-account-metric strip, performance chart, asset-allocation panel, holdings table, open-position summary, recent activity, and account-health rail shown in the supplied reference.
- All values come from `WorkspaceInsights`, `AccountSnapshot`, and the active `ConnectionState`.
- Missing exchange fields display unavailable or an explicit empty state; no demo positions or performance rows are invented.

### Orders

- Rebuilt `src/pages/orders/OrdersPage.tsx` around the supplied status-card, tabbed table, filters, pagination, and Order Assistant composition.
- Retained current safe actions: explicit cancellation confirmation, `cancelLiveOrder`, and reviewed duplicate/replacement draft transfer.
- The assistant only exposes actions supported by the current order contract.

### Positions

- Rebuilt `src/pages/positions/PositionsPage.tsx` with the supplied metric cards, detailed open-position table, asset exposure donut, leverage distribution, and account-risk panels.
- Liquidation-distance and risk summaries are calculated only when the exchange provides the required mark and liquidation prices.

### Analytics

- Rebuilt `src/pages/analytics/AnalyticsPage.tsx` with two metric strips, scanner candidate ranking, cumulative P&L, asset P&L allocation, monthly performance, heatmap, strategy insights, performers, and risk decomposition.
- Preserved the real `/api/market/correlation?limit=8` integration through an accessible Correlation action and overlay.
- Scanner scores remain ranking values. The page states that no score is treated as probability.

## Shared interface system

- Added `src/pages/referenceUi.tsx` for shared formatting, soft metric cards, honest empty states, line plots, donuts, gauges, and pagination.
- Extended `src/index.css` with the Portfolio composition, modal overlay, six-card grid, responsive fallbacks, and dark-theme-compatible variables.
- Updated the global search copy to match the supplied shell: `Search markets, symbols or contracts...`.
- Preserved the existing APEX logo, navigation, Demo/Live status, current page IDs, and canonical 1368×753 desktop behavior.

## Reference attachments

The supplied images were used during the 1.0.24 implementation but were removed from the 1.0.25 lightweight source package after the layouts had been implemented and verified. No stylesheet or component depends on them as a background or rendered substitute for the interface.

## Verification completed

- TypeScript `transpileModule` syntax check: passed, zero syntax errors.
- V19 contract: 10/10 passed.
- V20 reference contract: 24/24 passed.
- Backtesting workspace: 21/21 passed.
- Strategy library: passed.
- Strategy integration: passed.
- Consolidation integration: 15/15 passed.
- Reference UI redesign QA: 15/15 passed.
- Source image/background scan: passed.

## Verification boundary

The sandbox package registry returned HTTP 404 for locked packages including Vitest and Vite, so a clean dependency install, full TypeScript semantic lint, unit-test run, production build, and browser screenshot capture could not be completed here. The archive therefore contains source and QA evidence, not a stale `dist/` bundle. On a machine with normal npm registry access, run:

```bash
npm ci
npm run verify
npm run verify:visual
```
