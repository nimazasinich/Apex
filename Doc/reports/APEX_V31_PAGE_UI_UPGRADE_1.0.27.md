# APEX V31 Page UI Upgrade — 1.0.27

## Scope
This release completes the page-level UI repair and upgrade requested after the lightweight cleanup regression. The implementation targets the canonical `1368 × 753` desktop viewport and keeps the existing runtime/data contracts unchanged.

## Upgraded pages
- Watchlist
- Alerts
- History
- Settings
- Help
- Analytics refinements and correlation access

## CSS architecture
The previous workspace CSS was split so page styling is no longer concentrated in one large file.

### Shared CSS
- `src/index.css` — global application/theme rules
- `src/styles/workspace-shell.css` — shell, shared page primitives, tables, cards, controls
- `src/styles/reference-ui.css` — Portfolio, Orders, Positions and Analytics reference-layout system

### Page CSS
- `src/pages/watchlist/WatchlistPage.css`
- `src/pages/alerts/AlertsPage.css`
- `src/pages/history/HistoryPage.css`
- `src/pages/settings/SettingsPage.css`
- `src/pages/help/HelpPage.css`

Each page imports its own stylesheet directly from its TSX module. The obsolete `src/styles/v3-workspace.css` file was removed.

## UI changes

### Watchlist
- Added a proper page heading and subtitle.
- Restored four summary cards, segmented filters, search/refresh toolbar, structured market table and Asset Assistant sidebar.
- Added fixed table column sizing and selected-row highlighting at the base viewport.

### Alerts
- Restored five summary cards and the complete alert-rule table.
- Styled rule toggles, status badges, builder, recent triggers and templates.
- Kept browser-persisted rule behavior unchanged.

### History
- Restored audit summary metrics, activity filters, search, ledger table, pagination and timeline sidebar.
- Added a dedicated filtered CSV export panel.
- Kept `WorkspaceInsights.activities` as the only data source.

### Settings
- Rebuilt the section selector as a compact horizontal workspace control at 1368×753.
- Preserved account mode, API verification, security, trading preference and device sections.
- Kept credential handling and account mutations unchanged.

### Help
- Rebuilt the page to match the supplied support-center reference:
  - headline and large search input;
  - five help-topic cards;
  - FAQ accordion;
  - four tutorial tiles;
  - Contact Support, System Status and Announcements sidebar.
- Preserved the real System Health drawer trigger.

### Analytics
- Refined wording and table labels to match the supplied reference.
- Preserved the real correlation matrix dialog.
- Added the explicit score/probability disclaimer required by the engineering plan.

## Size improvement
- `src/index.css`: reduced from 9,886 lines to 7,339 lines.
- Reference UI rules moved to `src/styles/reference-ui.css`.
- Workspace rules moved to `src/styles/workspace-shell.css`.
- Five damaged pages now have independent stylesheets.

## Verification
- TypeScript/TSX syntax parse: passed for all 158 source files.
- CSS brace validation: passed.
- Reference UI QA: 24/24 passed.
- Consolidation QA: 15/15 passed.
- Backtesting QA: 21/21 passed.
- Strategy Integration: passed.
- Strategy Library: passed.
- Strategy Engine smoke tests: passed.

## Verification boundary
A full browser screenshot capture and production build were not run because the environment does not contain the project's installed `node_modules`. Static parsing and the repository QA suites listed above were run successfully.
