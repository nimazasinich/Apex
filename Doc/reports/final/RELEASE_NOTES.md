# APEX Soft Green V6 — Cross-page unification

- Unified all remaining workspace pages with the same soft-green visual hierarchy.
- Added page heroes, icon accents and compact page status cards.
- Standardized panels, tables, activity lists, empty states, settings forms and interaction feedback.
- Preserved the refined Overview layout and non-scrolling right-side order workflow.
- Verified TypeScript/TSX syntax and CSS parsing.

# APEX Corrected Release

This archive contains the corrected APEX cryptocurrency trading terminal source and the current production bundles.

## Included behavior

- Unified multi-page desktop interface for Overview, Markets, Portfolio, Trading, Orders, Positions, Alerts, History, Analytics, Settings, and System Health.
- Safe Demo mode with a server-side virtual wallet, orders, positions, history, and PnL marked against real market data.
- KuCoin Live mode gated by signed credential verification and explicit order preview/confirmation.
- Account state synchronized across the full application shell.
- No embedded TradingView component.

## Start locally

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env` and adjust only local runtime settings if needed.
3. Run `npm run dev` for development, or `npm run build` followed by `npm start` for production.
4. Enter KuCoin credentials only in the Settings connection form. Do not put exchange secrets in repository files.

## Release hygiene

- `node_modules` is intentionally excluded; dependencies are reproducible from `package-lock.json`.
- Machine-local `.env` and credential-bearing provider files are intentionally excluded.
- Supplemental API slots in the shipped source are blank; configure them through the application instead of hard-coding secrets.

## Verification

- Demo account test suite: 3 tests passed.
- Vite frontend production bundle: succeeded.
- Express server bundle: succeeded.
- The repository-wide TypeScript check still reports pre-existing legacy/archival issues, including the missing `TrackingObservatoryPanel` test dependency and incomplete historical utility modules. These are documented rather than hidden and are outside the corrected Demo/Live release path.
