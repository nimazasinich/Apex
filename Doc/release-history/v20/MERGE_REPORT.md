# APEX V20 — Reference Image Implementation

## Scope

V20 replaces the generic V19 versions of the remaining workspace routes with components derived from the supplied visual references and scaled to the `1368 × 753` desktop contract.

Redesigned routes:

- Watchlist
- Orders
- Positions
- Alerts
- History
- Analytics
- Settings
- Help

Overview, Markets, Portfolio and Trading remain on their established project implementations.

## Frontend changes

- Added `src/components/workspace/ReferenceViews.tsx`.
- Added page-specific contextual right sidebars.
- Added visual gauges, donuts, progress bars, heatmaps, timelines and sparklines.
- Added distinct metric card boundaries and accent identities.
- Added a functional Help route to the sidebar.
- Calibrated shell geometry to 184 px navigation, 56 px header and 280 px context sidebar at the canonical viewport.
- Added honest empty states instead of fabricated account numbers.

## Backend changes

- Added `GET /api/account/workspace`.
- Added `src/services/workspaceInsights.ts` to normalize Demo and Live account payloads.
- Updated `src/services/accountClient.ts` with `getWorkspaceData()`.
- App account polling now receives the snapshot and visual view model in one request.
- Order cancellation, API connection, mode switching and demo reset remain connected to existing protected endpoints.

## Reference scaling

The supplied images were `1672 × 941`. V20 uses:

- horizontal scale `0.8181818182`
- vertical density `0.8002125399`
- target `1368 × 753`

See [REFERENCE_SCALE_1368x753.md](../../repository/REFERENCE_SCALE_1368x753.md).

## Validation performed

- V20 contract: 23/23 checks passed.
- TypeScript syntax transpile: 149 files, zero syntax failures.
- Strict semantic check of the new view layer and App integration with module stubs: passed.
- Workspace normalizer runtime test: passed for symbol, position, order fill and risk normalization.
- CSS brace validation: balanced; 367 V20 selectors found.
- Full dependency installation/build could not run in this environment because the internal registry did not provide `why-is-node-running@2.3.0` and `@fontsource/inter`.

## Important limitation

Visual screenshots of the running V20 app were not captured in this environment because project dependencies could not be installed from the available registry. Run the project on the target machine, capture all eight routes at 1368 × 753, and use the acceptance checklist for final pixel tuning.
