# APEX V31 1.0.34 — Merged Full-Stack UI Implementation Report

## Objective

Produce one coherent project using the second archive as the visual and analytical baseline while integrating the stronger backend, request governance, QA and cross-module coordination from 1.0.33.

## Merge policy

The merge was additive and fidelity-preserving:

- preserve the richer Trading UI and its data-backed visualizations;
- import backend/governor improvements without replacing real visuals with decorative approximations;
- connect every visible preference and primary action to runtime behavior;
- replace false affordances with working controls or explicit disabled states;
- share state across pages rather than duplicating local persistence;
- keep API and execution behavior fail-closed.

## Backend and request governance

- Integrated the adaptive priority governor and provider routing changes.
- Preserved critical/interactive capacity under background pressure.
- Bounded queues, timeouts and circuit-breaker state.
- Corrected cache identity to account for semantic headers and authorization scope.
- Disabled shared cache/deduplication for POST, PUT, PATCH and DELETE by default.
- Preserved stale-if-error only where an explicit cache policy permits it.
- Restored full order-book levels to the symbol detail contract for the real UI depth curve.
- Added QA for cross-authorization isolation and mutation non-caching.

## UI and workflow integration

### Trading

The richer Trading implementation remains intact:

- real bid/ask depth curve;
- long/short score-factor breakdown;
- timeframe confluence;
- support/resistance and target/stop geometry;
- open-position context;
- order ticket and risk summary.

A system bridge adds selected strategy and latest Backtesting evidence without deleting these analytics. Default risk and leverage are loaded from Settings and trade-plan requests use the same values.

### Strategy Studio and Backtesting

A shared, versioned workspace context carries:

- strategy ID;
- market symbol;
- timeframe;
- LONG/SHORT direction;
- latest replay audit and metrics.

Strategy requests are abortable. Backtesting history persists locally with a bounded schema. Commission, slippage and funding values are sent to the backend engine and are not deducted a second time in the browser.

### Markets and Watchlist

- One favorites storage contract powers Markets and Watchlist.
- Table and grid modes are functional.
- Column customization is functional.
- Row menus navigate, favorite and open Watchlist/Trading.
- Keyboard row selection is supported.
- Unsupported chain/sector/product filters are visibly unavailable instead of producing fake filtering.

### Settings and notifications

- Light, Dark and System themes change the runtime theme.
- Risk and leverage defaults feed Trading and backend plan calculations.
- Alert sound is testable and used by alert delivery.
- Browser notification permission and delivery are implemented.
- Credentials remain server-session scoped rather than localStorage persisted.

### Remaining pages

- Portfolio 1D/Live/All controls filter real cumulative account points.
- Analytics range, candidate scope, sorting, correlation and performer controls are state-driven.
- Help tutorials open guided content; support actions generate/copy diagnostic templates; health is fetched live.
- Overview scanner and signal drawer actions navigate to the complete Markets/Analytics surfaces.
- History CSV export and account-derived filtering remain functional.
- Orders safely duplicate, prepare replacements and request cancellation through shared account mutations.

## Navigation and accessibility

- Heavy Trading, Strategy and Backtesting pages are lazy-loaded.
- Browser navigation uses history entries rather than replacing every route.
- Global search closes on Escape/outside interaction, handles empty results and exposes active-option semantics.
- Added skip navigation and route focus.
- Table/list actions reviewed for keyboard operation.
- Static scan found no likely enabled button without a handler.

## PWA behavior

- Registered the service worker only in production.
- Added 192×192 and 512×512 PNG icons and manifest scope/ID.
- Navigations use network-first with an offline shell fallback.
- Same-origin static assets use stale-while-revalidate behavior.
- `/api/*`, cross-origin traffic and all non-GET requests bypass the service worker completely.

## Validation summary

Passed in the delivery environment:

- Adaptive governor, including authorization isolation and mutation cache policy.
- Backtesting workspace: 25/25.
- Consolidation integration: 15/15.
- Reference UI redesign: 24/24.
- System integration: 12/12.
- Strategy route/library/integration checks.
- Deterministic strategy-engine smoke tests.
- Source-only secret/archive/template gate.
- 219 TypeScript/TSX/MTS files transpiled without syntax diagnostics.
- 22 CSS files parsed without syntax errors.
- 18 JSON files parsed successfully.

Not completed in the delivery environment:

- clean `npm ci` and full `npm run verify`, because package-registry access in the container was incomplete/unstable;
- fresh browser screenshots from a production Vite build for every modified route.

These are deployment gates, not silently reported as passed.
